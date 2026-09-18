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
   CATEGORY 7 EXISTING WORKSPACE BOOTSTRAP
   ================================================================

   Safe/idempotent repair for workspaces created before Category 7.5
   was wired into provisioning.

   It:

   - finds active workspaces
   - finds the active internal owner
   - opens that workspace's tenant DB
   - creates an initial company only if none exists
   - grants owner company access
   - sets tenant-local compatibility default
   - sets tenant_users.default_company_id

   ================================================================ */


function useSsl(
  host:
    string,
) {
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
    'POSTGRES_HOST, POSTGRES_ADMIN_USER and POSTGRES_ADMIN_PASSWORD are required.',
  );
}


const port =
  Number.parseInt(
    process.env.POSTGRES_PORT ||
      '5432',
    10,
  );


const ssl =
  useSsl(
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
  });


async function main() {
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
          td.database_port,

          owner_membership.user_id
            AS owner_user_id

        FROM tenants t

        INNER JOIN tenant_databases td
          ON td.tenant_id =
             t.id

        LEFT JOIN LATERAL (
          SELECT
            tu.user_id

          FROM tenant_users tu

          INNER JOIN users u
            ON u.id =
               tu.user_id

          WHERE tu.tenant_id =
                t.id

            AND tu.is_owner =
                TRUE

            AND LOWER(
              COALESCE(
                tu.status,
                ''
              )
            ) = 'active'

            AND LOWER(
              COALESCE(
                tu.member_type,
                ''
              )
            ) = 'internal'

            AND tu.deleted_at
                IS NULL

            AND LOWER(
              COALESCE(
                u.status,
                ''
              )
            ) = 'active'

            AND u.deleted_at
                IS NULL

          LIMIT 1
        ) owner_membership
          ON TRUE

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


  if (
    result.rows.length ===
      0
  ) {
    console.log(
      '[Category 7] No active workspaces found.',
    );


    return;
  }


  for (
    const row
    of result.rows
  ) {
    const tenantId =
      String(
        row.tenant_id,
      );


    const tenantName =
      String(
        row.tenant_name ||
        'SaMi Workspace',
      );


    const ownerUserId =
      typeof row.owner_user_id ===
        'string'
        ? row.owner_user_id
        : null;


    const databaseName =
      String(
        row.database_name,
      );


    if (
      !ownerUserId
    ) {
      throw new Error(
        `Workspace ${tenantId} has no active internal owner.`,
      );
    }


    const tenantClient =
      new Client({
        host:
          row.database_host ||
          host,

        port:
          Number(
            row.database_port ||
            port,
          ),

        user,

        password,

        database:
          databaseName,

        ssl,
      });


    await tenantClient.connect();


    let companyId:
      string;


    try {
      await tenantClient.query(
        'BEGIN',
      );


      const companyResult =
        await tenantClient.query(
          `
            SELECT
              id,
              name

            FROM companies

            WHERE is_active =
                  TRUE

              AND archived_at
                  IS NULL

            ORDER BY
              created_at ASC,
              id ASC

            LIMIT 1

            FOR UPDATE
          `,
        );


      if (
        companyResult.rows.length >
        0
      ) {
        companyId =
          String(
            companyResult
              .rows[0]
              .id,
          );
      } else {
        const created =
          await tenantClient.query(
            `
              INSERT INTO companies (
                name,
                legal_name,
                is_active,
                created_at,
                updated_at
              )

              VALUES (
                $1,
                $1,
                TRUE,
                NOW(),
                NOW()
              )

              RETURNING id
            `,
            [
              tenantName,
            ],
          );


        companyId =
          String(
            created.rows[0]
              .id,
          );
      }


      await tenantClient.query(
        `
          UPDATE company_users

          SET
            is_default =
              FALSE,

            updated_at =
              NOW()

          WHERE user_id = $1
        `,
        [
          ownerUserId,
        ],
      );


      await tenantClient.query(
        `
          INSERT INTO company_users (
            company_id,
            user_id,
            is_default,
            status,
            created_at,
            updated_at
          )

          VALUES (
            $1,
            $2,
            TRUE,
            'active',
            NOW(),
            NOW()
          )

          ON CONFLICT (
            company_id,
            user_id
          )

          DO UPDATE

          SET
            is_default =
              TRUE,

            status =
              'active',

            updated_at =
              NOW()
        `,
        [
          companyId,
          ownerUserId,
        ],
      );


      await tenantClient.query(
        'COMMIT',
      );
    } catch (
      error
    ) {
      try {
        await tenantClient.query(
          'ROLLBACK',
        );
      } catch {
        // Preserve original failure.
      }


      throw error;
    } finally {
      await tenantClient.end();
    }


    await control.query(
      `
        UPDATE tenant_users

        SET
          default_company_id =
            $3,

          updated_at =
            NOW()

        WHERE tenant_id = $1
          AND user_id = $2

          AND is_owner =
              TRUE

          AND deleted_at
              IS NULL
      `,
      [
        tenantId,
        ownerUserId,
        companyId,
      ],
    );


    console.log(
      `[Category 7] ✅ ${tenantName}`,
    );

    console.log(
      `  Tenant:  ${tenantId}`,
    );

    console.log(
      `  Company: ${companyId}`,
    );

    console.log(
      `  Owner:   ${ownerUserId}`,
    );
  }
}


main()
  .then(
    async () => {
      await control.end();


      console.log(
        '\n[Category 7] Existing workspace bootstrap complete.',
      );
    },
  )
  .catch(
    async error => {
      console.error(
        '\n[Category 7] Bootstrap failed:',
        error,
      );


      await control.end();


      process.exitCode =
        1;
    },
  );