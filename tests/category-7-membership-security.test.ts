import {
  after,
  test,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  readFile,
} from 'node:fs/promises';

import path from 'node:path';

import dotenv from 'dotenv';

import {
  Client,
  Pool,
} from 'pg';


dotenv.config({
  path:
    '.env.local',
});

dotenv.config();


/* ================================================================
   CATEGORY 7 SECURITY / ISOLATION TESTS
   ================================================================

   These tests are intentionally READ-ONLY.

   They verify:

   - membership schema integrity
   - owner protection
   - internal/portal separation
   - session/workspace isolation
   - session/company state integrity
   - company access isolation
   - primary owner company bootstrap
   - trusted source wiring

   No user, membership, workspace or company is created/deleted.

   ================================================================ */


/* ================================================================
   DB CONFIG
   ================================================================ */

function shouldUseSsl(
  host:
    string,
): boolean {
  const explicit =
    process.env.POSTGRES_SSL
      ?.trim()
      .toLowerCase();


  if (
    explicit ===
      'true'
  ) {
    return true;
  }


  if (
    explicit ===
      'false'
  ) {
    return false;
  }


  const normalized =
    host
      .trim()
      .toLowerCase();


  return (
    normalized.includes(
      'neon.tech',
    ) ||
    normalized.includes(
      'neon.build',
    ) ||
    normalized.includes(
      'amazonaws.com',
    ) ||
    normalized.includes(
      'render.com',
    ) ||
    normalized.includes(
      'railway.app',
    )
  );
}


const host =
  process.env.POSTGRES_HOST;


const user =
  process.env.POSTGRES_ADMIN_USER;


const password =
  process.env.POSTGRES_ADMIN_PASSWORD;


assert.ok(
  host,
  'POSTGRES_HOST must be configured.',
);


assert.ok(
  user,
  'POSTGRES_ADMIN_USER must be configured.',
);


assert.ok(
  password,
  'POSTGRES_ADMIN_PASSWORD must be configured.',
);


const port =
  Number.parseInt(
    process.env.POSTGRES_PORT ||
      '5432',
    10,
  );


const ssl =
  shouldUseSsl(
    host,
  )
    ? {
        rejectUnauthorized:
          false,
      }
    : undefined;


const control =
  new Pool({
    host,
    port,
    user,
    password,

    database:
      process.env.POSTGRES_DB ||
      'sami_control',

    ssl,

    max:
      5,
  });


const tenantClients:
  Client[] =
  [];


after(
  async () => {
    for (
      const client
      of tenantClients
    ) {
      try {
        await client.end();
      } catch {
        // Ignore shutdown errors.
      }
    }


    await control.end();
  },
);


/* ================================================================
   SOURCE HELPERS
   ================================================================ */

async function source(
  relativePath:
    string,
): Promise<string> {
  return readFile(
    path.join(
      process.cwd(),
      relativePath,
    ),
    'utf8',
  );
}


function compact(
  value:
    string,
): string {
  return value.replace(
    /\s+/g,
    ' ',
  );
}


/* ================================================================
   TENANT DATABASES
   ================================================================ */

async function getActiveTenantDatabases() {
  const result =
    await control.query(
      `
        SELECT
          t.id
            AS tenant_id,

          t.name
            AS tenant_name,

          td.database_name,
          td.database_host,
          td.database_port

        FROM tenants t

        INNER JOIN tenant_databases td
          ON td.tenant_id =
             t.id

        WHERE LOWER(
          COALESCE(
            t.status,
            ''
          )
        ) = 'active'

          AND t.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              td.status,
              ''
            )
          ) = 'active'

          AND td.deleted_at
              IS NULL

        ORDER BY
          t.created_at ASC
      `,
    );


  return result.rows;
}


async function tenantClient(
  row:
    Record<string, unknown>,
): Promise<Client> {
  const client =
    new Client({
      host:
        typeof row.database_host ===
          'string'
          ? row.database_host
          : host,

      port:
        Number(
          row.database_port ||
          port,
        ),

      user,

      password,

      database:
        String(
          row.database_name,
        ),

      ssl,
    });


  await client.connect();


  tenantClients.push(
    client,
  );


  return client;
}


/* ================================================================
   1. SOURCE SECURITY WIRING
   ================================================================ */

test(
  'Category 7 trusted access paths are wired',
  async () => {
    const [
      session,
      tenantContext,
      companyContext,
      lifecycle,
      guards,
      provisioning,
    ] =
      await Promise.all([
        source(
          'lib/auth/session.ts',
        ),

        source(
          'lib/auth/tenant-context.ts',
        ),

        source(
          'lib/auth/company-context.ts',
        ),

        source(
          'lib/services/membership-lifecycle.ts',
        ),

        source(
          'lib/auth/workspace-guards.ts',
        ),

        source(
          'lib/services/tenant-provisioning.ts',
        ),
      ]);


    const sessionSource =
      compact(
        session,
      );


    const tenantSource =
      compact(
        tenantContext,
      );


    const companySource =
      compact(
        companyContext,
      );


    const lifecycleSource =
      compact(
        lifecycle,
      );


    const guardSource =
      compact(
        guards,
      );


    const provisioningSource =
      compact(
        provisioning,
      );


    assert.match(
      sessionSource,
      /tu\.member_type/,
      'Session selection must check member_type.',
    );


    assert.match(
      sessionSource,
      /'internal'/,
      'Normal sessions must require internal membership.',
    );


    assert.match(
      sessionSource,
      /touchMembershipActivity/,
      'Session activity must synchronize membership activity.',
    );


    assert.match(
      tenantSource,
      /tu\.member_type/,
      'Trusted tenant context must validate member type.',
    );


    assert.match(
      tenantSource,
      /'internal'/,
      'Trusted tenant context must reject portal membership.',
    );


    assert.match(
      lifecycleSource,
      /current_tenant_id = NULL/,
      'Membership invalidation must clear workspace context.',
    );


    assert.match(
      lifecycleSource,
      /current_company_id = NULL/,
      'Membership invalidation must clear current company.',
    );


    assert.match(
      lifecycleSource,
      /selected_company_ids = '\{\}'::UUID\[\]/,
      'Membership invalidation must clear selected companies.',
    );


    assert.match(
      companySource,
      /allowedSet\.has/,
      'Company selection must validate the allowed-company set.',
    );


    assert.match(
      companySource,
      /current_tenant_id = \$3/,
      'Session company state must remain bound to the current workspace.',
    );


    assert.match(
      guardSource,
      /requireTenantContext/,
      'Workspace guards must build on trusted tenant context.',
    );


    assert.match(
      provisioningSource,
      /bootstrapPrimaryCompanyAccess/,
      'Tenant provisioning must bootstrap initial company access.',
    );
  },
);


/* ================================================================
   2. MEMBERSHIP COLUMNS
   ================================================================ */

test(
  'tenant_users has the complete Category 7 membership model',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            column_name

          FROM information_schema.columns

          WHERE table_schema =
                'public'

            AND table_name =
                'tenant_users'
        `,
      );


    const columns =
      new Set(
        result.rows.map(
          row =>
            String(
              row.column_name,
            ),
        ),
      );


    const required =
      [
        'id',
        'tenant_id',
        'user_id',
        'status',
        'member_type',
        'is_owner',
        'default_company_id',
        'invited_at',
        'joined_at',
        'last_active_at',
        'suspended_at',
        'suspended_by',
        'suspension_reason',
        'removed_by',
        'removal_reason',
        'created_at',
        'updated_at',
        'deleted_at',
      ];


    for (
      const column
      of required
    ) {
      assert.ok(
        columns.has(
          column,
        ),

        `tenant_users is missing ${column}`,
      );
    }
  },
);


/* ================================================================
   3. MEMBERSHIP CHECK CONSTRAINTS
   ================================================================ */

test(
  'tenant_users enforces Category 7 state constraints',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            conname,

            pg_get_constraintdef(
              oid
            )
              AS definition

          FROM pg_constraint

          WHERE conrelid =
                'public.tenant_users'::regclass

            AND contype =
                'c'
        `,
      );


    const definitions =
      result.rows
        .map(
          row =>
            String(
              row.definition,
            )
              .toLowerCase()
              .replace(
                /\s+/g,
                ' ',
              ),
        )
        .join(
          '\n',
        );


    assert.match(
      definitions,
      /member_type/,
    );


    assert.match(
      definitions,
      /internal/,
    );


    assert.match(
      definitions,
      /portal/,
    );


    assert.match(
      definitions,
      /status/,
    );


    assert.match(
      definitions,
      /active/,
    );


    assert.match(
      definitions,
      /suspended/,
    );


    assert.match(
      definitions,
      /is_owner/,
      'Owner-state protection constraint is missing.',
    );


    assert.match(
      definitions,
      /suspended_at/,
      'Suspension-state constraint is missing.',
    );
  },
);


/* ================================================================
   4. ONE OWNER MAXIMUM
   ================================================================ */

test(
  'workspace owner partial unique index exists',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            indexname,
            indexdef

          FROM pg_indexes

          WHERE schemaname =
                'public'

            AND tablename =
                'tenant_users'
        `,
      );


    const matching =
      result.rows.find(
        row => {
          const value =
            String(
              row.indexdef,
            )
              .toLowerCase()
              .replace(
                /\s+/g,
                ' ',
              );


          return (
            value.includes(
              'unique',
            ) &&
            value.includes(
              'is_owner',
            ) &&
            value.includes(
              'deleted_at is null',
            )
          );
        },
      );


    assert.ok(
      matching,
      'Missing partial unique owner index.',
    );
  },
);


/* ================================================================
   5. LIVE MEMBERSHIP STATE
   ================================================================ */

test(
  'live membership rows contain no invalid Category 7 states',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE status
                    NOT IN (
                      'active',
                      'suspended'
                    )
            )::integer
              AS invalid_status,

            COUNT(*) FILTER (
              WHERE member_type
                    NOT IN (
                      'internal',
                      'portal'
                    )
            )::integer
              AS invalid_type,

            COUNT(*) FILTER (
              WHERE is_owner =
                    TRUE

                AND (
                  status <>
                    'active'

                  OR member_type <>
                    'internal'

                  OR deleted_at
                     IS NOT NULL
                )
            )::integer
              AS invalid_owner,

            COUNT(*) FILTER (
              WHERE status =
                    'suspended'

                AND suspended_at
                    IS NULL

                AND deleted_at
                    IS NULL
            )::integer
              AS invalid_suspension

          FROM tenant_users
        `,
      );


    const row =
      result.rows[0];


    assert.equal(
      Number(
        row.invalid_status,
      ),
      0,
      'Unsupported membership status exists.',
    );


    assert.equal(
      Number(
        row.invalid_type,
      ),
      0,
      'Unsupported member type exists.',
    );


    assert.equal(
      Number(
        row.invalid_owner,
      ),
      0,
      'Invalid workspace owner membership exists.',
    );


    assert.equal(
      Number(
        row.invalid_suspension,
      ),
      0,
      'Suspended membership exists without suspended_at.',
    );
  },
);


/* ================================================================
   6. SESSION COMPANY MODEL
   ================================================================ */

test(
  'sessions has workspace-bound company context',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            column_name,
            data_type,
            is_nullable

          FROM information_schema.columns

          WHERE table_schema =
                'public'

            AND table_name =
                'sessions'

            AND column_name IN (
              'current_tenant_id',
              'current_company_id',
              'selected_company_ids'
            )
        `,
      );


    const columns =
      new Set(
        result.rows.map(
          row =>
            String(
              row.column_name,
            ),
        ),
      );


    assert.ok(
      columns.has(
        'current_tenant_id',
      ),
    );


    assert.ok(
      columns.has(
        'current_company_id',
      ),
    );


    assert.ok(
      columns.has(
        'selected_company_ids',
      ),
    );


    const invalid =
      await control.query(
        `
          SELECT
            COUNT(*)::integer
              AS count

          FROM sessions

          WHERE current_tenant_id
                IS NULL

            AND (
              current_company_id
                IS NOT NULL

              OR cardinality(
                selected_company_ids
              ) > 0
            )
        `,
      );


    assert.equal(
      Number(
        invalid.rows[0]
          .count,
      ),
      0,
      'A session has company context without a workspace.',
    );
  },
);


/* ================================================================
   7. PORTAL / SUSPENDED SESSION ISOLATION
   ================================================================ */

test(
  'active sessions never point at invalid internal memberships',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            COUNT(*)::integer
              AS count

          FROM sessions s

          WHERE s.current_tenant_id
                IS NOT NULL

            AND s.is_current =
                TRUE

            AND s.revoked_at
                IS NULL

            AND s.expires_at >
                NOW()

            AND NOT EXISTS (
              SELECT 1

              FROM tenant_users tu

              INNER JOIN tenants t
                ON t.id =
                   tu.tenant_id

              WHERE tu.user_id =
                    s.user_id

                AND tu.tenant_id =
                    s.current_tenant_id

                AND tu.status =
                    'active'

                AND tu.member_type =
                    'internal'

                AND tu.deleted_at
                    IS NULL

                AND t.status =
                    'active'

                AND t.deleted_at
                    IS NULL
            )
        `,
      );


    assert.equal(
      Number(
        result.rows[0]
          .count,
      ),
      0,
      [
        'An active session still points to an invalid workspace.',
        'Suspended, removed or portal memberships must never remain current.',
      ].join(
        ' ',
      ),
    );
  },
);


/* ================================================================
   8. TENANT DATABASE STRUCTURE
   ================================================================ */

test(
  'every active tenant database contains companies and company_users',
  async () => {
    const tenants =
      await getActiveTenantDatabases();


    assert.ok(
      tenants.length >
      0,
      'No active tenant databases were found.',
    );


    for (
      const tenant
      of tenants
    ) {
      const client =
        await tenantClient(
          tenant,
        );


      const result =
        await client.query(
          `
            SELECT
              to_regclass(
                'public.companies'
              )
                AS companies,

              to_regclass(
                'public.company_users'
              )
                AS company_users
          `,
        );


      assert.ok(
        result.rows[0]
          .companies,
        `Tenant ${tenant.tenant_id} has no companies table.`,
      );


      assert.ok(
        result.rows[0]
          .company_users,
        `Tenant ${tenant.tenant_id} has no company_users table.`,
      );
    }
  },
);


/* ================================================================
   9. OWNER COMPANY ACCESS
   ================================================================ */

test(
  'every active workspace owner has active company access',
  async () => {
    const tenants =
      await getActiveTenantDatabases();


    for (
      const tenant
      of tenants
    ) {
      const ownerResult =
        await control.query(
          `
            SELECT
              user_id,
              default_company_id

            FROM tenant_users

            WHERE tenant_id = $1

              AND is_owner =
                  TRUE

              AND status =
                  'active'

              AND member_type =
                  'internal'

              AND deleted_at
                  IS NULL

            LIMIT 1
          `,
          [
            tenant.tenant_id,
          ],
        );


      assert.equal(
        ownerResult.rows.length,
        1,
        `Tenant ${tenant.tenant_id} does not have exactly one active owner row.`,
      );


      const owner =
        ownerResult.rows[0];


      const client =
        await tenantClient(
          tenant,
        );


      const accessResult =
        await client.query(
          `
            SELECT
              c.id,
              c.name,

              cu.is_default

            FROM company_users cu

            INNER JOIN companies c
              ON c.id =
                 cu.company_id

            WHERE cu.user_id = $1

              AND cu.status =
                  'active'

              AND c.is_active =
                  TRUE

              AND c.archived_at
                  IS NULL
          `,
          [
            owner.user_id,
          ],
        );


      assert.ok(
        accessResult.rows.length >
        0,
        `Workspace owner ${owner.user_id} has no active company access in tenant ${tenant.tenant_id}.`,
      );


      assert.ok(
        owner.default_company_id,
        `Workspace owner ${owner.user_id} has no default_company_id.`,
      );


      assert.ok(
        accessResult.rows.some(
          row =>
            String(
              row.id,
            ) ===
            String(
              owner.default_company_id,
            ),
        ),
        `Owner default_company_id is not in the owner's allowed companies for tenant ${tenant.tenant_id}.`,
      );
    }
  },
);


/* ================================================================
   10. SESSION COMPANY ACCESS ISOLATION
   ================================================================ */

test(
  'session company IDs never exceed the user allowed-company set',
  async () => {
    const tenants =
      await getActiveTenantDatabases();


    for (
      const tenant
      of tenants
    ) {
      const sessions =
        await control.query(
          `
            SELECT
              id,
              user_id,
              current_company_id,
              selected_company_ids

            FROM sessions

            WHERE current_tenant_id = $1

              AND is_current =
                  TRUE

              AND revoked_at
                  IS NULL

              AND expires_at >
                  NOW()
          `,
          [
            tenant.tenant_id,
          ],
        );


      if (
        sessions.rows.length ===
        0
      ) {
        continue;
      }


      const client =
        await tenantClient(
          tenant,
        );


      for (
        const session
        of sessions.rows
      ) {
        const access =
          await client.query(
            `
              SELECT
                c.id

              FROM company_users cu

              INNER JOIN companies c
                ON c.id =
                   cu.company_id

              WHERE cu.user_id = $1

                AND cu.status =
                    'active'

                AND c.is_active =
                    TRUE

                AND c.archived_at
                    IS NULL
            `,
            [
              session.user_id,
            ],
          );


        const allowed =
          new Set(
            access.rows.map(
              row =>
                String(
                  row.id,
                ),
            ),
          );


        const currentCompanyId =
          typeof session.current_company_id ===
            'string'
            ? session.current_company_id
            : null;


        const selectedCompanyIds =
          Array.isArray(
            session.selected_company_ids,
          )
            ? session.selected_company_ids.map(
                (
                  id:
                    unknown,
                ) =>
                  String(
                    id,
                  ),
              )
            : [];


        if (
          currentCompanyId
        ) {
          assert.ok(
            allowed.has(
              currentCompanyId,
            ),
            `Session ${session.id} current company is outside allowed-company access.`,
          );


          assert.ok(
            selectedCompanyIds.includes(
              currentCompanyId,
            ),
            `Session ${session.id} current company is not part of selected_company_ids.`,
          );
        }


        for (
          const companyId
          of selectedCompanyIds
        ) {
          assert.ok(
            allowed.has(
              companyId,
            ),
            `Session ${session.id} contains unauthorized selected company ${companyId}.`,
          );
        }
      }
    }
  },
);