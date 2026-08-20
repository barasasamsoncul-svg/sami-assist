import { postgresAdmin } from "./postgres-admin";
import {
  createBusinessSlug,
  normalizeName,
} from "./auth-helpers";
import {
  normalizeAppKeys,
} from "./sami-apps";
import {
  saveEnabledApps,
} from "./enabled-apps";
import {
  provisionTenantDatabase,
} from "./database-provisioning";

export type ProvisionBusinessInput = {
  businessName: string;
  businessSlug?: string;
  ownerUserId: string;
  email: string;
  phone?: string;
  appKeys: unknown;
};

export type ProvisionBusinessResult = {
  businessId: string;
  businessName: string;
  businessSlug: string;
  databaseId: string;
  databaseName: string;
  appKeys: string[];
};

async function ensureBusinessTables(): Promise<void> {
  await postgresAdmin.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      email VARCHAR(320),
      phone VARCHAR(100),
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await postgresAdmin.query(`
    CREATE TABLE IF NOT EXISTS business_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id UUID NOT NULL
        REFERENCES businesses(id)
        ON DELETE CASCADE,
      user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL DEFAULT 'owner',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id, user_id)
    )
  `);

  await postgresAdmin.query(`
    CREATE INDEX IF NOT EXISTS
    idx_business_users_user_id
    ON business_users(user_id)
  `);

  await postgresAdmin.query(`
    CREATE INDEX IF NOT EXISTS
    idx_business_users_business_id
    ON business_users(business_id)
  `);
}

async function createUniqueSlug(
  requestedSlug: string
): Promise<string> {
  const base = createBusinessSlug(
    requestedSlug
  );

  let slug = base;

  for (let attempt = 0; attempt < 100; attempt++) {
    const existing =
      await postgresAdmin.query(
        `
          SELECT id
          FROM businesses
          WHERE slug = $1
          LIMIT 1
        `,
        [slug]
      );

    if (existing.rowCount === 0) {
      return slug;
    }

    slug = `${base}-${attempt + 2}`;
  }

  throw new Error(
    "Unable to create a unique business slug."
  );
}

export async function provisionBusiness(
  input: ProvisionBusinessInput
): Promise<ProvisionBusinessResult> {
  await ensureBusinessTables();

  const businessName =
    normalizeName(input.businessName);

  if (!businessName) {
    throw new Error(
      "Business name is required."
    );
  }

  if (!input.ownerUserId) {
    throw new Error(
      "Business owner is required."
    );
  }

  const selectedApps = normalizeAppKeys(
    input.appKeys
  );

  if (selectedApps.length === 0) {
    throw new Error(
      "At least one business app must be selected."
    );
  }

  const requestedSlug =
    input.businessSlug?.trim() ||
    businessName;

  const businessSlug =
    await createUniqueSlug(
      requestedSlug
    );

  const client =
    await postgresAdmin.connect();

  try {
    await client.query("BEGIN");

    const businessResult =
      await client.query(
        `
          INSERT INTO businesses (
            name,
            slug,
            email,
            phone,
            status
          )
          VALUES ($1, $2, $3, $4, 'active')
          RETURNING id, name, slug
        `,
        [
          businessName,
          businessSlug,
          input.email?.trim().toLowerCase() ||
            null,
          input.phone?.trim() || null,
        ]
      );

    const business =
      businessResult.rows[0];

    const businessId =
      business.id as string;

    await client.query(
      `
        INSERT INTO business_users (
          business_id,
          user_id,
          role
        )
        VALUES ($1, $2, 'owner')
        ON CONFLICT (business_id, user_id)
        DO UPDATE SET role = 'owner'
      `,
      [
        businessId,
        input.ownerUserId,
      ]
    );

    await client.query("COMMIT");

    const database =
      await provisionTenantDatabase(
        businessId,
        businessSlug
      );

    const savedApps =
      await saveEnabledApps(
        businessId,
        selectedApps
      );

    return {
      businessId,
      businessName:
        business.name as string,
      businessSlug:
        business.slug as string,
      databaseId:
        database.databaseId,
      databaseName:
        database.databaseName,
      appKeys: savedApps,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failure.
    }

    throw error;
  } finally {
    client.release();
  }
}