import dotenv from 'dotenv';

import {
  Pool,
} from 'pg';


dotenv.config({
  path:
    '.env.local',
});

dotenv.config();


/* ================================================================
   SaMi CATEGORY 9 — INVITATION DATA MODEL MIGRATION
   ================================================================

   Control DB owns workspace invitations because an invitation exists
   before the invited person necessarily becomes a workspace member.

   This migration creates:

   workspace_invitations
      → invitation identity / lifecycle

   workspace_invitation_roles
      → roles that will be assigned when accepted

   workspace_invitation_companies
      → companies the invited user will receive access to


   SECURITY MODEL

   - raw invitation tokens are NEVER stored
   - only SHA-256 token hashes are stored
   - invitations are workspace-scoped
   - roles remain Control DB records
   - company IDs reference tenant DB companies logically
   - company IDs therefore cannot use a cross-database FK
   - acceptance is email-bound
   - expired/revoked/accepted invitations cannot be reused

   ================================================================ */


/* ================================================================
   DATABASE CONFIG
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


if (
  !host ||
  !user ||
  !password
) {
  throw new Error(
    [
      'POSTGRES_HOST, POSTGRES_ADMIN_USER and',
      'POSTGRES_ADMIN_PASSWORD are required.',
    ].join(
      ' ',
    ),
  );
}


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


/* ================================================================
   MIGRATION
   ================================================================ */

async function migrate() {
  const client =
    await control.connect();


  try {
    await client.query(
      'BEGIN',
    );


    /* ============================================================
       UUID SUPPORT
       ============================================================ */

    await client.query(
      `
        CREATE EXTENSION IF NOT EXISTS pgcrypto
      `,
    );


    /* ============================================================
       WORKSPACE INVITATIONS
       ============================================================ */

    await client.query(
      `
        CREATE TABLE IF NOT EXISTS workspace_invitations (
          id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

          tenant_id UUID NOT NULL,

          email TEXT NOT NULL,

          member_type TEXT NOT NULL
            DEFAULT 'internal',

          status TEXT NOT NULL
            DEFAULT 'pending',

          token_hash TEXT NOT NULL,

          invited_by UUID NOT NULL,

          accepted_by UUID NULL,

          revoked_by UUID NULL,

          message TEXT NULL,

          expires_at TIMESTAMPTZ NOT NULL,

          last_sent_at TIMESTAMPTZ NULL,

          accepted_at TIMESTAMPTZ NULL,

          revoked_at TIMESTAMPTZ NULL,

          created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

          updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

          deleted_at TIMESTAMPTZ NULL,

          CONSTRAINT workspace_invitations_tenant_fk
            FOREIGN KEY (
              tenant_id
            )
            REFERENCES tenants(
              id
            )
            ON DELETE CASCADE,

          CONSTRAINT workspace_invitations_invited_by_fk
            FOREIGN KEY (
              invited_by
            )
            REFERENCES users(
              id
            )
            ON DELETE RESTRICT,

          CONSTRAINT workspace_invitations_accepted_by_fk
            FOREIGN KEY (
              accepted_by
            )
            REFERENCES users(
              id
            )
            ON DELETE SET NULL,

          CONSTRAINT workspace_invitations_revoked_by_fk
            FOREIGN KEY (
              revoked_by
            )
            REFERENCES users(
              id
            )
            ON DELETE SET NULL,

          CONSTRAINT workspace_invitations_email_check
            CHECK (
              email =
              LOWER(
                BTRIM(
                  email
                )
              )
            ),

          CONSTRAINT workspace_invitations_email_not_empty
            CHECK (
              LENGTH(
                BTRIM(
                  email
                )
              ) >
              3
            ),

          CONSTRAINT workspace_invitations_member_type_check
            CHECK (
              member_type IN (
                'internal',
                'portal'
              )
            ),

          CONSTRAINT workspace_invitations_status_check
            CHECK (
              status IN (
                'pending',
                'accepted',
                'revoked',
                'expired'
              )
            ),

          CONSTRAINT workspace_invitations_token_hash_check
            CHECK (
              LENGTH(
                BTRIM(
                  token_hash
                )
              ) >=
              32
            ),

          CONSTRAINT workspace_invitations_expiry_check
            CHECK (
              expires_at >
              created_at
            ),

          CONSTRAINT workspace_invitations_acceptance_state_check
            CHECK (
              (
                status =
                  'accepted'

                AND accepted_at
                    IS NOT NULL

                AND accepted_by
                    IS NOT NULL

                AND revoked_at
                    IS NULL
              )

              OR

              (
                status <>
                  'accepted'

                AND accepted_at
                    IS NULL
              )
            ),

          CONSTRAINT workspace_invitations_revocation_state_check
            CHECK (
              (
                status =
                  'revoked'

                AND revoked_at
                    IS NOT NULL

                AND revoked_by
                    IS NOT NULL

                AND accepted_at
                    IS NULL
              )

              OR

              (
                status <>
                  'revoked'

                AND revoked_at
                    IS NULL
              )
            )
        )
      `,
    );


    /* ============================================================
       COMPATIBILITY / IDEMPOTENT COLUMN REPAIR
       ============================================================

       These ALTER statements allow this migration to safely repair
       an earlier partial invitation table if one ever existed.

       ============================================================ */

    await client.query(
      `
        ALTER TABLE workspace_invitations
          ADD COLUMN IF NOT EXISTS member_type TEXT
            NOT NULL
            DEFAULT 'internal',

          ADD COLUMN IF NOT EXISTS status TEXT
            NOT NULL
            DEFAULT 'pending',

          ADD COLUMN IF NOT EXISTS token_hash TEXT,

          ADD COLUMN IF NOT EXISTS invited_by UUID,

          ADD COLUMN IF NOT EXISTS accepted_by UUID,

          ADD COLUMN IF NOT EXISTS revoked_by UUID,

          ADD COLUMN IF NOT EXISTS message TEXT,

          ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,

          ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,

          ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,

          ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,

          ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ
            NOT NULL
            DEFAULT NOW(),

          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
            NOT NULL
            DEFAULT NOW(),

          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
      `,
    );


    /* ============================================================
       INVITATION ROLES
       ============================================================ */

    await client.query(
      `
        CREATE TABLE IF NOT EXISTS workspace_invitation_roles (
          id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

          invitation_id UUID NOT NULL,

          role_id UUID NOT NULL,

          created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

          deleted_at TIMESTAMPTZ NULL,

          CONSTRAINT workspace_invitation_roles_invitation_fk
            FOREIGN KEY (
              invitation_id
            )
            REFERENCES workspace_invitations(
              id
            )
            ON DELETE CASCADE,

          CONSTRAINT workspace_invitation_roles_role_fk
            FOREIGN KEY (
              role_id
            )
            REFERENCES roles(
              id
            )
            ON DELETE RESTRICT
        )
      `,
    );


    /* ============================================================
       INVITATION COMPANY ACCESS
       ============================================================

       Company records live inside each tenant database.

       PostgreSQL cannot create a foreign key from the Control DB to
       a company table in another database.

       company_id is therefore validated by the Category 9 invitation
       service before invitation creation and again during acceptance.

       ============================================================ */

    await client.query(
      `
        CREATE TABLE IF NOT EXISTS workspace_invitation_companies (
          id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

          invitation_id UUID NOT NULL,

          company_id UUID NOT NULL,

          is_default BOOLEAN NOT NULL
            DEFAULT FALSE,

          created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

          deleted_at TIMESTAMPTZ NULL,

          CONSTRAINT workspace_invitation_companies_invitation_fk
            FOREIGN KEY (
              invitation_id
            )
            REFERENCES workspace_invitations(
              id
            )
            ON DELETE CASCADE
        )
      `,
    );


    /* ============================================================
       UNIQUE TOKEN HASH
       ============================================================ */

    await client.query(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_workspace_invitations_token_hash

        ON workspace_invitations (
          token_hash
        )

        WHERE deleted_at
              IS NULL
      `,
    );


    /* ============================================================
       ONE LIVE INVITATION PER EMAIL / WORKSPACE
       ============================================================

       An email cannot have two simultaneous pending invitations for
       the same workspace.

       Resending must update/rotate the existing pending invitation.

       ============================================================ */

    await client.query(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_workspace_invitations_pending_email

        ON workspace_invitations (
          tenant_id,
          email
        )

        WHERE status =
                'pending'

          AND deleted_at
              IS NULL
      `,
    );


    /* ============================================================
       INVITATION LOOKUP INDEX
       ============================================================ */

    await client.query(
      `
        CREATE INDEX IF NOT EXISTS
          idx_workspace_invitations_tenant_status

        ON workspace_invitations (
          tenant_id,
          status,
          created_at DESC
        )

        WHERE deleted_at
              IS NULL
      `,
    );


    /* ============================================================
       EMAIL LOOKUP INDEX
       ============================================================ */

    await client.query(
      `
        CREATE INDEX IF NOT EXISTS
          idx_workspace_invitations_email

        ON workspace_invitations (
          email
        )

        WHERE deleted_at
              IS NULL
      `,
    );


    /* ============================================================
       EXPIRY LOOKUP INDEX
       ============================================================ */

    await client.query(
      `
        CREATE INDEX IF NOT EXISTS
          idx_workspace_invitations_expiry

        ON workspace_invitations (
          expires_at
        )

        WHERE status =
                'pending'

          AND deleted_at
              IS NULL
      `,
    );


    /* ============================================================
       INVITATION ROLE UNIQUE RELATIONSHIP
       ============================================================ */

    await client.query(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_workspace_invitation_role

        ON workspace_invitation_roles (
          invitation_id,
          role_id
        )

        WHERE deleted_at
              IS NULL
      `,
    );


    /* ============================================================
       ROLE LOOKUP
       ============================================================ */

    await client.query(
      `
        CREATE INDEX IF NOT EXISTS
          idx_workspace_invitation_roles_role

        ON workspace_invitation_roles (
          role_id
        )

        WHERE deleted_at
              IS NULL
      `,
    );


    /* ============================================================
       INVITATION COMPANY UNIQUE RELATIONSHIP
       ============================================================ */

    await client.query(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_workspace_invitation_company

        ON workspace_invitation_companies (
          invitation_id,
          company_id
        )

        WHERE deleted_at
              IS NULL
      `,
    );


    /* ============================================================
       ONE DEFAULT COMPANY PER INVITATION
       ============================================================ */

    await client.query(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_workspace_invitation_default_company

        ON workspace_invitation_companies (
          invitation_id
        )

        WHERE is_default =
                TRUE

          AND deleted_at
              IS NULL
      `,
    );


    /* ============================================================
       INVITATION COMPANY LOOKUP
       ============================================================ */

    await client.query(
      `
        CREATE INDEX IF NOT EXISTS
          idx_workspace_invitation_companies_company

        ON workspace_invitation_companies (
          company_id
        )

        WHERE deleted_at
              IS NULL
      `,
    );


    /* ============================================================
       VALIDATE EXISTING RELATIONSHIPS
       ============================================================ */

    const invalidRoleScopes =
      await client.query(
        `
          SELECT
            wir.id,
            wi.tenant_id,
            r.id
              AS role_id,
            r.tenant_id
              AS role_tenant_id,
            r.is_system

          FROM workspace_invitation_roles wir

          INNER JOIN workspace_invitations wi
            ON wi.id =
               wir.invitation_id

          INNER JOIN roles r
            ON r.id =
               wir.role_id

          WHERE wir.deleted_at
                IS NULL

            AND wi.deleted_at
                IS NULL

            AND r.deleted_at
                IS NULL

            AND (
              (
                r.is_system =
                  TRUE

                AND r.tenant_id
                    IS NOT NULL
              )

              OR

              (
                r.is_system =
                  FALSE

                AND r.tenant_id <>
                    wi.tenant_id
              )
            )
        `,
      );


    if (
      invalidRoleScopes.rows.length >
      0
    ) {
      throw new Error(
        [
          'Cross-workspace invitation role relationships exist.',
          JSON.stringify(
            invalidRoleScopes.rows,
          ),
        ].join(
          ' ',
        ),
      );
    }


    /* ============================================================
       COMMIT
       ============================================================ */

    await client.query(
      'COMMIT',
    );


    console.log(
      '\n[Category 9.1] ✅ Invitation schema migration complete.',
    );


    console.log(
      '',
    );


    console.log(
      'Created/verified:',
    );


    console.log(
      '  workspace_invitations',
    );


    console.log(
      '  workspace_invitation_roles',
    );


    console.log(
      '  workspace_invitation_companies',
    );


    console.log(
      '',
    );


    console.log(
      'Security:',
    );


    console.log(
      '  ✓ hashed invitation tokens',
    );


    console.log(
      '  ✓ workspace-scoped invitations',
    );


    console.log(
      '  ✓ role assignment relationships',
    );


    console.log(
      '  ✓ multi-company invitation access',
    );


    console.log(
      '  ✓ one default invitation company',
    );


    console.log(
      '  ✓ one pending invitation per workspace/email',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve the original migration error.
    }


    throw error;
  } finally {
    client.release();
  }
}


/* ================================================================
   RUN
   ================================================================ */

migrate()
  .then(
    async () => {
      await control.end();


      console.log(
        '\n[Category 9.1] Done.',
      );
    },
  )
  .catch(
    async error => {
      console.error(
        '\n[Category 9.1] ❌ Migration failed:',
        error,
      );


      await control.end();


      process.exitCode =
        1;
    },
  );