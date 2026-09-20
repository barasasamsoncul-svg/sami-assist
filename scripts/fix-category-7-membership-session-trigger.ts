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
   SaMi CATEGORY 7
   MEMBERSHIP LOSS → SESSION CONTEXT REPAIR

   Problem fixed:

   An existing PostgreSQL trigger:

     sami_clear_session_workspace_on_membership_loss()

   cleared:

     sessions.current_tenant_id

   but did NOT clear:

     sessions.current_company_id
     sessions.selected_company_ids

   This violated:

     sessions_company_context_requires_tenant

   because SaMi does not permit company context to remain attached
   to a session when that session has no active workspace.

   Correct invariant:

     current_tenant_id = NULL

   requires:

     current_company_id = NULL
     selected_company_ids = {}

   This migration replaces the trigger FUNCTION in-place.

   The existing trigger itself does not need to be recreated because
   CREATE OR REPLACE FUNCTION preserves its dependency.

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

    idleTimeoutMillis:
      30000,

    connectionTimeoutMillis:
      10000,
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
       VERIFY SESSIONS TABLE
       ============================================================ */

    const sessionColumns =
      await client.query(
        `
          SELECT
            column_name

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


    const existingColumns =
      new Set(
        sessionColumns.rows.map(
          row =>
            String(
              row.column_name,
            ),
        ),
      );


    const requiredColumns = [
      'current_tenant_id',
      'current_company_id',
      'selected_company_ids',
    ];


    for (
      const column
      of requiredColumns
    ) {
      if (
        !existingColumns.has(
          column,
        )
      ) {
        throw new Error(
          `Required sessions column "${column}" does not exist.`,
        );
      }
    }


    /* ============================================================
       VERIFY MEMBERSHIP TABLE
       ============================================================ */

    const membershipColumns =
      await client.query(
        `
          SELECT
            column_name

          FROM information_schema.columns

          WHERE table_schema =
                'public'

            AND table_name =
                'tenant_users'

            AND column_name IN (
              'user_id',
              'tenant_id',
              'status',
              'member_type',
              'deleted_at'
            )
        `,
      );


    const existingMembershipColumns =
      new Set(
        membershipColumns.rows.map(
          row =>
            String(
              row.column_name,
            ),
        ),
      );


    const requiredMembershipColumns = [
      'user_id',
      'tenant_id',
      'status',
      'member_type',
      'deleted_at',
    ];


    for (
      const column
      of requiredMembershipColumns
    ) {
      if (
        !existingMembershipColumns.has(
          column,
        )
      ) {
        throw new Error(
          `Required tenant_users column "${column}" does not exist.`,
        );
      }
    }


    /* ============================================================
       REPLACE MEMBERSHIP-LOSS TRIGGER FUNCTION

       The function deliberately clears all workspace-dependent
       session context in ONE UPDATE.

       PostgreSQL evaluates the final updated row against CHECK
       constraints, therefore these three values become consistent
       atomically:

         current_tenant_id      → NULL
         current_company_id     → NULL
         selected_company_ids   → {}

       ============================================================ */

    await client.query(
      `
        CREATE OR REPLACE FUNCTION
          public.sami_clear_session_workspace_on_membership_loss()

        RETURNS TRIGGER

        LANGUAGE plpgsql

        AS $$
        DECLARE
          target_user_id
            UUID;

          target_tenant_id
            UUID;

          old_had_workspace_access
            BOOLEAN :=
              FALSE;

          new_has_workspace_access
            BOOLEAN :=
              FALSE;

          membership_identity_changed
            BOOLEAN :=
              FALSE;

        BEGIN
          /* ======================================================
             DELETE

             The membership row is disappearing entirely.

             Any session still pointing at this workspace must lose
             its workspace-dependent company context.
             ====================================================== */

          IF TG_OP =
             'DELETE'
          THEN
            target_user_id :=
              OLD.user_id;

            target_tenant_id :=
              OLD.tenant_id;


            UPDATE public.sessions

            SET
              current_company_id =
                NULL,

              selected_company_ids =
                '{}'::UUID[],

              current_tenant_id =
                NULL,

              updated_at =
                NOW()

            WHERE user_id =
                  target_user_id

              AND current_tenant_id =
                  target_tenant_id

              AND revoked_at
                  IS NULL;


            RETURN OLD;
          END IF;


          /* ======================================================
             NON-UPDATE OPERATIONS

             This function currently has no membership-loss work for
             INSERT or other trigger operations.
             ====================================================== */

          IF TG_OP <>
             'UPDATE'
          THEN
            RETURN NEW;
          END IF;


          /* ======================================================
             ACCESS BEFORE UPDATE
             ====================================================== */

          old_had_workspace_access :=
            (
              LOWER(
                COALESCE(
                  OLD.status,
                  ''
                )
              ) =
              'active'

              AND LOWER(
                COALESCE(
                  OLD.member_type,
                  ''
                )
              ) =
              'internal'

              AND OLD.deleted_at
                  IS NULL
            );


          /* ======================================================
             ACCESS AFTER UPDATE
             ====================================================== */

          new_has_workspace_access :=
            (
              LOWER(
                COALESCE(
                  NEW.status,
                  ''
                )
              ) =
              'active'

              AND LOWER(
                COALESCE(
                  NEW.member_type,
                  ''
                )
              ) =
              'internal'

              AND NEW.deleted_at
                  IS NULL
            );


          /* ======================================================
             STRUCTURAL MEMBERSHIP IDENTITY CHANGE

             tenant_users identity normally must not move between
             users/workspaces.

             This protection ensures that if it ever does, session
             state attached to the OLD membership is still removed.
             ====================================================== */

          membership_identity_changed :=
            (
              NEW.user_id
                IS DISTINCT FROM
              OLD.user_id

              OR

              NEW.tenant_id
                IS DISTINCT FROM
              OLD.tenant_id
            );


          /* ======================================================
             NO MEMBERSHIP LOSS

             Examples:

             - active → active metadata update
             - changing default company
             - last_active_at update
             - ordinary membership metadata changes
             ====================================================== */

          IF NOT (
            (
              old_had_workspace_access
              AND
              NOT new_has_workspace_access
            )

            OR

            membership_identity_changed
          )
          THEN
            RETURN NEW;
          END IF;


          /* ======================================================
             CLEAR OLD SESSION WORKSPACE CONTEXT

             IMPORTANT:

             Use OLD identity because this is the membership whose
             access was lost.

             Do not revoke the whole SaMi account session.

             A user may still belong to another SaMi workspace.
             session.ts can resolve another accessible workspace on
             the next authenticated request.
             ====================================================== */

          target_user_id :=
            OLD.user_id;

          target_tenant_id :=
            OLD.tenant_id;


          UPDATE public.sessions

          SET
            /*
             * Clear dependent company state BEFORE/alongside tenant.
             *
             * PostgreSQL evaluates all SET expressions into the same
             * resulting row before the CHECK constraint runs.
             */
            current_company_id =
              NULL,

            selected_company_ids =
              '{}'::UUID[],

            current_tenant_id =
              NULL,

            updated_at =
              NOW()

          WHERE user_id =
                target_user_id

            AND current_tenant_id =
                target_tenant_id

            AND revoked_at
                IS NULL;


          RETURN NEW;
        END;
        $$;
      `,
    );


    /* ============================================================
       VERIFY FUNCTION
       ============================================================ */

    const functionResult =
      await client.query(
        `
          SELECT
            pg_get_functiondef(
              p.oid
            )
              AS definition

          FROM pg_proc p

          INNER JOIN pg_namespace n
            ON n.oid =
               p.pronamespace

          WHERE n.nspname =
                'public'

            AND p.proname =
                'sami_clear_session_workspace_on_membership_loss'

            AND pg_get_function_identity_arguments(
                  p.oid
                ) =
                ''

          LIMIT 1
        `,
      );


    if (
      functionResult.rows.length ===
      0
    ) {
      throw new Error(
        'Membership-loss session trigger function could not be verified.',
      );
    }


    const definition =
      String(
        functionResult.rows[0]
          .definition ||
        '',
      );


    if (
      !definition.includes(
        'current_company_id',
      ) ||
      !definition.includes(
        'selected_company_ids',
      ) ||
      !definition.includes(
        'current_tenant_id',
      )
    ) {
      throw new Error(
        'The repaired trigger function does not contain the complete session-context cleanup.',
      );
    }


    /* ============================================================
       VERIFY CHECK CONSTRAINT

       We intentionally KEEP the constraint.

       The constraint was protecting the correct SaMi invariant.
       The trigger was the broken component.
       ============================================================ */

    const constraintResult =
      await client.query(
        `
          SELECT
            conname,

            pg_get_constraintdef(
              oid
            )
              AS definition

          FROM pg_constraint

          WHERE conrelid =
                'public.sessions'::regclass

            AND conname =
                'sessions_company_context_requires_tenant'

          LIMIT 1
        `,
      );


    if (
      constraintResult.rows.length ===
      0
    ) {
      console.warn(
        [
          '[Category 7] Warning:',
          'sessions_company_context_requires_tenant was not found.',
          'The trigger has still been repaired.',
        ].join(
          ' ',
        ),
      );
    } else {
      console.log(
        '\nSession company-context constraint:',
      );


      console.log(
        constraintResult.rows[0]
          .definition,
      );
    }


    /* ============================================================
       VERIFY ATTACHED TRIGGER

       CREATE OR REPLACE FUNCTION does not require recreating the
       trigger, but we verify that something on tenant_users actually
       references this function.
       ============================================================ */

    const triggerResult =
      await client.query(
        `
          SELECT
            t.tgname
              AS trigger_name,

            pg_get_triggerdef(
              t.oid,
              TRUE
            )
              AS trigger_definition

          FROM pg_trigger t

          INNER JOIN pg_proc p
            ON p.oid =
               t.tgfoid

          INNER JOIN pg_class c
            ON c.oid =
               t.tgrelid

          INNER JOIN pg_namespace n
            ON n.oid =
               c.relnamespace

          WHERE n.nspname =
                'public'

            AND c.relname =
                'tenant_users'

            AND p.proname =
                'sami_clear_session_workspace_on_membership_loss'

            AND NOT t.tgisinternal
        `,
      );


    if (
      triggerResult.rows.length ===
      0
    ) {
      throw new Error(
        [
          'The repaired function exists, but no tenant_users trigger',
          'currently references it.',
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
      '\n[Category 7] ✅ Membership-loss session trigger repaired.',
    );


    console.log(
      '',
    );


    console.log(
      'Trigger attachment:',
    );


    for (
      const row
      of triggerResult.rows
    ) {
      console.log(
        `  ✓ ${row.trigger_name}`,
      );


      console.log(
        `    ${row.trigger_definition}`,
      );
    }


    console.log(
      '',
    );


    console.log(
      'Session cleanup invariant:',
    );


    console.log(
      '  ✓ current_tenant_id → NULL',
    );


    console.log(
      '  ✓ current_company_id → NULL',
    );


    console.log(
      '  ✓ selected_company_ids → {}',
    );


    console.log(
      '',
    );


    console.log(
      'The sessions_company_context_requires_tenant constraint remains enabled.',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve original migration error.
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
        '\n[Category 7] Done.',
      );
    },
  )
  .catch(
    async error => {
      console.error(
        '\n[Category 7] ❌ Trigger repair failed:',
        error,
      );


      await control.end();


      process.exitCode =
        1;
    },
  );