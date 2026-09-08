import {
  NextRequest,
  NextResponse,
} from 'next/server';

import fs from 'fs/promises';
import path from 'path';

import {
  getControlPool,
  queryControl,
} from '@/lib/db/control';

import { getSession } from '@/lib/auth/session';

import { getTenantDatabaseName } from '@/lib/db/registry';

import { getTenantPool } from '@/lib/db/tenant';

import { provisionTenantDatabase } from '@/lib/services/tenant-provisioning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_APP_KEY_LENGTH = 100;

/* ============================================================
   TYPES
   ============================================================ */

type InstallAppBody = {
  tenantId?: unknown;
  appKey?: unknown;
};

type WorkspaceAccess = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;

  membershipStatus: string | null;

  isOwner: boolean;
  isAdmin: boolean;
};

type ModuleRecord = {
  id: string;
  key: string;
  name: string;
  version: string | null;
  status: string;
};

type TenantModuleRecord = {
  id: string;
  status: string;
  version: string | null;
  installed_at: Date | string | null;
};

type SubscriptionRecord = {
  id: string;
  status: string;
  plan_key: string;
  plan_name: string;
  included_apps: number | string | null;
};

/* ============================================================
   INPUT HELPERS
   ============================================================ */

function normalizeAppKey(
  value: unknown
): string {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value
    .trim()
    .toLowerCase();
}

function normalizeTenantId(
  value: unknown
): string {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value.trim();
}

function isSafeAppKey(
  appKey: string
): boolean {
  return (
    appKey.length > 0 &&
    appKey.length <=
      MAX_APP_KEY_LENGTH &&
    /^[a-z0-9_-]+$/.test(
      appKey
    )
  );
}

/* ============================================================
   RESPONSE HELPERS
   ============================================================ */

function errorResponse(
  status: number,
  code: string,
  message: string,
  extra: Record<
    string,
    unknown
  > = {}
) {
  return NextResponse.json(
    {
      success: false,
      code,
      error: message,
      ...extra,
    },
    {
      status,
      headers: {
        'Cache-Control':
          'no-store',
      },
    }
  );
}

function successResponse(
  body: Record<
    string,
    unknown
  >
) {
  return NextResponse.json(
    {
      success: true,
      ...body,
    },
    {
      status: 200,
      headers: {
        'Cache-Control':
          'no-store',
      },
    }
  );
}

/* ============================================================
   ERROR HELPER
   ============================================================ */

function getErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  if (
    typeof error === 'string'
  ) {
    return error;
  }

  return 'Unknown error';
}

/* ============================================================
   CLIENT INFORMATION
   ============================================================ */

function getClientIp(
  request: NextRequest
): string | null {
  return (
    request.headers
      .get('x-forwarded-for')
      ?.split(',')[0]
      ?.trim() ||
    request.headers.get(
      'x-real-ip'
    ) ||
    null
  );
}

/* ============================================================
   AUDIT
   ============================================================ */

async function recordAudit({
  request,
  tenantId,
  userId,
  eventType,
  entityId,
  metadata = {},
}: {
  request: NextRequest;
  tenantId: string;
  userId: string;
  eventType: string;
  entityId?: string | null;
  metadata?: Record<
    string,
    unknown
  >;
}) {
  try {
    await queryControl(
      `
        INSERT INTO audit_logs (
          tenant_id,
          user_id,
          event_type,
          entity_type,
          entity_id,
          ip_address,
          user_agent,
          metadata,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'module',
          $4,
          $5,
          $6,
          $7,
          NOW()
        )
      `,
      [
        tenantId,
        userId,
        eventType,
        entityId || null,
        getClientIp(request),
        request.headers.get(
          'user-agent'
        ) || null,
        JSON.stringify(
          metadata
        ),
      ]
    );
  } catch (error) {
    /*
     * Audit failure must not make an otherwise valid
     * installation fail.
     */
    console.error(
      '[Apps] Failed to write audit event:',
      error
    );
  }
}

/* ============================================================
   WORKSPACE ACCESS
   ============================================================ */

async function getWorkspaceAccess(
  tenantId: string,
  userId: string
): Promise<
  WorkspaceAccess | null
> {
  const result =
    await queryControl(
      `
        SELECT
          t.id AS tenant_id,
          t.name AS tenant_name,
          t.slug AS tenant_slug,
          t.status AS tenant_status,

          tu.status AS membership_status,

          COALESCE(
            tu.is_owner,
            FALSE
          ) AS is_owner,

          EXISTS (
            SELECT 1
            FROM user_roles ur

            INNER JOIN roles r
              ON r.id = ur.role_id

            WHERE ur.tenant_id = t.id
              AND ur.user_id = $2
              AND r.deleted_at IS NULL
              AND (
                LOWER(
                  COALESCE(
                    r.key,
                    ''
                  )
                ) IN (
                  'admin',
                  'administrator',
                  'workspace_admin',
                  'owner'
                )
                OR
                LOWER(
                  COALESCE(
                    r.name,
                    ''
                  )
                ) IN (
                  'admin',
                  'administrator',
                  'workspace admin',
                  'owner'
                )
              )
          ) AS is_admin

        FROM tenants t

        LEFT JOIN tenant_users tu
          ON tu.tenant_id = t.id
          AND tu.user_id = $2

        WHERE t.id = $1
          AND t.deleted_at IS NULL

        LIMIT 1
      `,
      [
        tenantId,
        userId,
      ]
    );

  if (
    result.rows.length === 0
  ) {
    return null;
  }

  const row =
    result.rows[0];

  return {
    tenantId:
      row.tenant_id,

    tenantName:
      row.tenant_name,

    tenantSlug:
      row.tenant_slug,

    tenantStatus:
      String(
        row.tenant_status ||
          ''
      ).toLowerCase(),

    membershipStatus:
      row.membership_status
        ? String(
            row.membership_status
          ).toLowerCase()
        : null,

    isOwner:
      row.is_owner === true,

    isAdmin:
      row.is_admin === true,
  };
}

/* ============================================================
   OPTIONAL APP SCHEMA
   ============================================================ */

async function readAppSchema(
  appKey: string
): Promise<
  string | null
> {
  /*
   * appKey has already passed isSafeAppKey(),
   * preventing traversal outside lib/apps.
   */
  const schemaPath =
    path.join(
      process.cwd(),
      'lib',
      'apps',
      appKey,
      'schema.sql'
    );

  try {
    const schema =
      await fs.readFile(
        schemaPath,
        'utf8'
      );

    if (!schema.trim()) {
      throw new Error(
        `Schema file for "${appKey}" is empty.`
      );
    }

    return schema;
  } catch (error) {
    const nodeError =
      error as NodeJS.ErrnoException;

    /*
     * Some SaMi apps may use only the core tenant
     * schema and therefore intentionally have no
     * dedicated schema.sql.
     */
    if (
      nodeError.code ===
      'ENOENT'
    ) {
      return null;
    }

    throw error;
  }
}

/* ============================================================
   INSTALL SCHEMA INTO EXISTING DATABASE
   ============================================================ */

async function installAppSchema(
  databaseName: string,
  appKey: string
) {
  const schema =
    await readAppSchema(
      appKey
    );

  if (!schema) {
    /*
     * Core-only module.
     */
    return;
  }

  const tenantPool =
    getTenantPool(
      databaseName
    );

  await tenantPool.query(
    schema
  );
}

/* ============================================================
   POST /api/auth/install-app
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  /* ==========================================================
     1. AUTHENTICATION
     ========================================================== */

  const session =
    await getSession();

  if (!session) {
    return errorResponse(
      401,
      'UNAUTHENTICATED',
      'Please sign in to continue.'
    );
  }

  /* ==========================================================
     2. PARSE BODY
     ========================================================== */

  let body:
    InstallAppBody;

  try {
    body =
      (await request.json()) as InstallAppBody;
  } catch {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'Invalid request body.'
    );
  }

  const tenantId =
    normalizeTenantId(
      body.tenantId
    );

  const appKey =
    normalizeAppKey(
      body.appKey
    );

  /* ==========================================================
     3. VALIDATION
     ========================================================== */

  if (!tenantId) {
    return errorResponse(
      400,
      'TENANT_REQUIRED',
      'Workspace is required.'
    );
  }

  if (!appKey) {
    return errorResponse(
      400,
      'APP_REQUIRED',
      'App is required.'
    );
  }

  if (
    !isSafeAppKey(
      appKey
    )
  ) {
    return errorResponse(
      400,
      'INVALID_APP',
      'Invalid app.'
    );
  }

  /* ==========================================================
     4. AUTHORIZATION

     tenantId comes from the browser, therefore SaMi must prove
     that the authenticated user actually belongs to it.
     ========================================================== */

  const initialAccess =
    await getWorkspaceAccess(
      tenantId,
      session.user.id
    );

  if (!initialAccess) {
    return errorResponse(
      404,
      'WORKSPACE_NOT_FOUND',
      'Workspace not found.'
    );
  }

  if (
    initialAccess
      .membershipStatus !==
    'active'
  ) {
    return errorResponse(
      403,
      'WORKSPACE_ACCESS_DENIED',
      'You do not have access to this workspace.'
    );
  }

  if (
    !initialAccess.isOwner &&
    !initialAccess.isAdmin
  ) {
    return errorResponse(
      403,
      'APP_MANAGEMENT_FORBIDDEN',
      'You do not have permission to manage apps for this workspace.'
    );
  }

  /* ==========================================================
     5. SERIALIZE INSTALLATIONS

     App limits must not be defeated by two concurrent install
     requests.

     We hold a PostgreSQL advisory lock for this workspace until
     installation completes.
     ========================================================== */

  const controlClient =
    await getControlPool()
      .connect();

  const lockKey =
    `sami:install-app:${tenantId}`;

  let lockAcquired =
    false;

  try {
    await controlClient.query(
      `
        SELECT pg_advisory_lock(
          hashtext($1)
        )
      `,
      [
        lockKey,
      ]
    );

    lockAcquired =
      true;

    /* ========================================================
       6. RE-CHECK WORKSPACE + MEMBERSHIP AFTER LOCK
       ======================================================== */

    const accessResult =
      await controlClient.query(
        `
          SELECT
            t.id AS tenant_id,
            t.name AS tenant_name,
            t.slug AS tenant_slug,
            t.status AS tenant_status,

            tu.status AS membership_status,

            COALESCE(
              tu.is_owner,
              FALSE
            ) AS is_owner,

            EXISTS (
              SELECT 1
              FROM user_roles ur

              INNER JOIN roles r
                ON r.id = ur.role_id

              WHERE ur.tenant_id = t.id
                AND ur.user_id = $2
                AND r.deleted_at IS NULL
                AND (
                  LOWER(
                    COALESCE(
                      r.key,
                      ''
                    )
                  ) IN (
                    'admin',
                    'administrator',
                    'workspace_admin',
                    'owner'
                  )
                  OR
                  LOWER(
                    COALESCE(
                      r.name,
                      ''
                    )
                  ) IN (
                    'admin',
                    'administrator',
                    'workspace admin',
                    'owner'
                  )
                )
            ) AS is_admin

          FROM tenants t

          LEFT JOIN tenant_users tu
            ON tu.tenant_id = t.id
            AND tu.user_id = $2

          WHERE t.id = $1
            AND t.deleted_at IS NULL

          LIMIT 1
        `,
        [
          tenantId,
          session.user.id,
        ]
      );

    if (
      accessResult.rows.length ===
      0
    ) {
      return errorResponse(
        404,
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.'
      );
    }

    const workspace =
      accessResult.rows[0];

    const tenantStatus =
      String(
        workspace.tenant_status ||
          ''
      ).toLowerCase();

    const membershipStatus =
      workspace.membership_status
        ? String(
            workspace.membership_status
          ).toLowerCase()
        : null;

    const isOwner =
      workspace.is_owner ===
      true;

    const isAdmin =
      workspace.is_admin ===
      true;

    if (
      membershipStatus !==
      'active'
    ) {
      return errorResponse(
        403,
        'WORKSPACE_ACCESS_DENIED',
        'You do not have access to this workspace.'
      );
    }

    if (
      !isOwner &&
      !isAdmin
    ) {
      return errorResponse(
        403,
        'APP_MANAGEMENT_FORBIDDEN',
        'You do not have permission to manage apps for this workspace.'
      );
    }

    /* ========================================================
       7. WORKSPACE STATUS
       ======================================================== */

    if (
      tenantStatus ===
      'pending_payment'
    ) {
      return errorResponse(
        403,
        'PAYMENT_REQUIRED',
        'Complete payment before installing apps.'
      );
    }

    const blockedStatuses =
      new Set([
        'pending_verification',
        'suspended',
        'deleted',
        'cancelled',
        'archived',
      ]);

    if (
      blockedStatuses.has(
        tenantStatus
      )
    ) {
      return errorResponse(
        403,
        'WORKSPACE_NOT_ACTIVE',
        'This workspace is not currently available for app installation.'
      );
    }

    /*
     * "active" and "provisioning" are valid here.
     *
     * provisioning is needed while the initial physical
     * tenant database is being prepared.
     */

    if (
      tenantStatus !==
        'active' &&
      tenantStatus !==
        'provisioning'
    ) {
      return errorResponse(
        403,
        'WORKSPACE_NOT_ACTIVE',
        'This workspace is not ready for app installation.'
      );
    }

    /* ========================================================
       8. MODULE
       ======================================================== */

    const moduleResult =
      await controlClient.query(
        `
          SELECT
            id,
            key,
            name,
            version,
            status

          FROM modules

          WHERE key = $1
            AND deleted_at IS NULL

          LIMIT 1
        `,
        [
          appKey,
        ]
      );

    if (
      moduleResult.rows.length ===
      0
    ) {
      return errorResponse(
        404,
        'APP_NOT_FOUND',
        'App not found.'
      );
    }

    const module =
      moduleResult
        .rows[0] as ModuleRecord;

    if (
      String(
        module.status
      ).toLowerCase() !==
      'active'
    ) {
      return errorResponse(
        403,
        'APP_UNAVAILABLE',
        'This app is currently unavailable.'
      );
    }

    /* ========================================================
       9. EXISTING INSTALLATION
       ======================================================== */

    const existingResult =
      await controlClient.query(
        `
          SELECT
            id,
            status,
            version,
            installed_at

          FROM tenant_modules

          WHERE tenant_id = $1
            AND module_id = $2

          LIMIT 1
        `,
        [
          tenantId,
          module.id,
        ]
      );

    const existingModule =
      existingResult.rows[0]
        ? (existingResult
            .rows[0] as TenantModuleRecord)
        : null;

    const existingStatus =
      existingModule
        ? String(
            existingModule.status ||
              ''
          ).toLowerCase()
        : '';

    /* ========================================================
       10. ACTIVE SUBSCRIPTION
       ======================================================== */

    const subscriptionResult =
      await controlClient.query(
        `
          SELECT
            s.id,
            s.status,

            p.key AS plan_key,
            p.name AS plan_name,
            p.included_apps

          FROM subscriptions s

          INNER JOIN plans p
            ON p.id = s.plan_id

          WHERE s.tenant_id = $1
            AND p.deleted_at IS NULL
            AND s.status IN (
              'trialing',
              'active'
            )

          ORDER BY
            s.created_at DESC

          LIMIT 1
        `,
        [
          tenantId,
        ]
      );

    if (
      subscriptionResult.rows
        .length === 0
    ) {
      return errorResponse(
        403,
        'NO_ACTIVE_SUBSCRIPTION',
        'An active subscription is required to manage apps.'
      );
    }

    const subscription =
      subscriptionResult
        .rows[0] as SubscriptionRecord;

    const rawIncludedApps =
      subscription.included_apps;

    const includedApps =
      Number(
        rawIncludedApps
      );

    if (
      !Number.isFinite(
        includedApps
      ) ||
      includedApps < -1
    ) {
      console.error(
        '[Apps] Invalid plan included_apps configuration:',
        {
          tenantId,
          plan:
            subscription.plan_key,
          includedApps:
            rawIncludedApps,
        }
      );

      return errorResponse(
        500,
        'PLAN_CONFIGURATION_ERROR',
        'This subscription plan is not configured correctly.'
      );
    }

    /* ========================================================
       11. IDEMPOTENT ALREADY INSTALLED RESPONSE
       ======================================================== */

    if (
      existingStatus ===
      'installed'
    ) {
      const countResult =
        await controlClient.query(
          `
            SELECT
              COUNT(*)::int AS count

            FROM tenant_modules

            WHERE tenant_id = $1
              AND status = 'installed'
          `,
          [
            tenantId,
          ]
        );

      const installedApps =
        Number(
          countResult.rows[0]
            ?.count || 0
        );

      return successResponse({
        alreadyInstalled:
          true,

        message:
          `${module.name} is already installed.`,

        app: {
          id:
            module.id,

          key:
            module.key,

          name:
            module.name,

          version:
            existingModule
              ?.version ||
            module.version,

          status:
            'installed',

          installedAt:
            existingModule
              ?.installed_at ||
            null,
        },

        tenant: {
          id:
            tenantId,

          name:
            workspace.tenant_name,

          slug:
            workspace.tenant_slug,

          databaseReady:
            true,
        },

        subscription: {
          plan:
            subscription.plan_key,

          planName:
            subscription.plan_name,

          includedApps,

          installedApps,
        },
      });
    }

    /* ========================================================
       12. APP ENTITLEMENT COUNT

       Count installed apps plus pending reservations.

       This prevents multiple pending installs from bypassing
       the plan's app allowance.
       ======================================================== */

    const usageResult =
      await controlClient.query(
        `
          SELECT
            COUNT(*)::int AS count

          FROM tenant_modules

          WHERE tenant_id = $1
            AND status IN (
              'installed',
              'pending'
            )
        `,
        [
          tenantId,
        ]
      );

    const reservedAppCount =
      Number(
        usageResult.rows[0]
          ?.count || 0
      );

    const targetAlreadyReserved =
      existingStatus ===
      'pending';

    if (
      !targetAlreadyReserved &&
      includedApps !== -1 &&
      reservedAppCount >=
        includedApps
    ) {
      return errorResponse(
        403,
        'UPGRADE_REQUIRED',
        'Your current plan does not include another app.',
        {
          currentPlan:
            subscription.plan_key,

          includedApps,

          installedApps:
            reservedAppCount,
        }
      );
    }

    /* ========================================================
       13. RESERVE INSTALLATION

       Reserve before touching the physical tenant DB.

       Failed installations can safely be retried.
       ======================================================== */

    await controlClient.query(
      `
        INSERT INTO tenant_modules (
          tenant_id,
          module_id,
          version,
          status,
          installed_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'pending',
          NULL
        )

        ON CONFLICT (
          tenant_id,
          module_id
        )

        DO UPDATE SET
          version =
            EXCLUDED.version,

          status =
            CASE
              WHEN tenant_modules.status =
                'installed'
              THEN 'installed'
              ELSE 'pending'
            END,

          installed_at =
            CASE
              WHEN tenant_modules.status =
                'installed'
              THEN tenant_modules.installed_at
              ELSE NULL
            END
      `,
      [
        tenantId,
        module.id,
        module.version,
      ]
    );

    /* ========================================================
       14. PHYSICAL TENANT DATABASE
       ======================================================== */

    try {
      let databaseName =
        await getTenantDatabaseName(
          tenantId
        );

      /* ------------------------------------------------------
         Database does not exist yet
         ------------------------------------------------------ */

      if (!databaseName) {
        await provisionTenantDatabase(
          tenantId,
          workspace.tenant_name,
          [
            appKey,
          ]
        );

        databaseName =
          await getTenantDatabaseName(
            tenantId
          );

        if (!databaseName) {
          throw new Error(
            'Tenant database was provisioned but was not registered.'
          );
        }
      } else {
        /* ----------------------------------------------------
           Existing tenant database:
           install only this app's schema.
           ---------------------------------------------------- */

        await installAppSchema(
          databaseName,
          appKey
        );
      }
    } catch (
      provisioningError
    ) {
      console.error(
        '[Apps] App installation failed:',
        {
          tenantId,
          appKey,
          error:
            getErrorMessage(
              provisioningError
            ),
        }
      );

      /*
       * Keep the control database consistent with the
       * physical installation attempt.
       */
      await controlClient
        .query(
          `
            UPDATE tenant_modules

            SET
              status = 'failed',
              installed_at = NULL

            WHERE tenant_id = $1
              AND module_id = $2
              AND status <> 'installed'
          `,
          [
            tenantId,
            module.id,
          ]
        )
        .catch(
          (updateError) => {
            console.error(
              '[Apps] Failed to mark installation as failed:',
              updateError
            );
          }
        );

      await recordAudit({
        request,

        tenantId,

        userId:
          session.user.id,

        eventType:
          'APP_INSTALL_FAILED',

        entityId:
          module.id,

        metadata: {
          appKey:
            module.key,

          reason:
            'provisioning_failed',
        },
      });

      return errorResponse(
        500,
        'APP_INSTALLATION_FAILED',
        'The app could not be installed. Please try again.'
      );
    }

    /* ========================================================
       15. MARK INSTALLED
       ======================================================== */

    await controlClient.query(
      `
        UPDATE tenant_modules

        SET
          version = $3,
          status = 'installed',
          installed_at = NOW()

        WHERE tenant_id = $1
          AND module_id = $2
      `,
      [
        tenantId,
        module.id,
        module.version,
      ]
    );

    /* ========================================================
       16. ACTIVATE PROVISIONING WORKSPACE
       ======================================================== */

    if (
      tenantStatus ===
      'provisioning'
    ) {
      await controlClient.query(
        `
          UPDATE tenants

          SET
            status = 'active',
            updated_at = NOW()

          WHERE id = $1
            AND status = 'provisioning'
        `,
        [
          tenantId,
        ]
      );
    }

    /* ========================================================
       17. FINAL INSTALLED COUNT
       ======================================================== */

    const finalCountResult =
      await controlClient.query(
        `
          SELECT
            COUNT(*)::int AS count

          FROM tenant_modules

          WHERE tenant_id = $1
            AND status = 'installed'
        `,
        [
          tenantId,
        ]
      );

    const installedApps =
      Number(
        finalCountResult
          .rows[0]?.count || 0
      );

    /* ========================================================
       18. AUDIT SUCCESS
       ======================================================== */

    await recordAudit({
      request,

      tenantId,

      userId:
        session.user.id,

      eventType:
        'APP_INSTALLED',

      entityId:
        module.id,

      metadata: {
        appKey:
          module.key,

        version:
          module.version,

        plan:
          subscription.plan_key,
      },
    });

    /* ========================================================
       19. RESPONSE
       ======================================================== */

    return successResponse({
      alreadyInstalled:
        false,

      message:
        `${module.name} installed successfully.`,

      app: {
        id:
          module.id,

        key:
          module.key,

        name:
          module.name,

        version:
          module.version,

        status:
          'installed',
      },

      tenant: {
        id:
          tenantId,

        name:
          workspace.tenant_name,

        slug:
          workspace.tenant_slug,

        databaseReady:
          true,
      },

      subscription: {
        plan:
          subscription.plan_key,

        planName:
          subscription.plan_name,

        includedApps,

        installedApps,
      },
    });
  } catch (error) {
    console.error(
      '[Apps] Install app failed:',
      error
    );

    return errorResponse(
      500,
      'APP_INSTALLATION_ERROR',
      'Failed to install the app. Please try again.'
    );
  } finally {
    /* ========================================================
       20. RELEASE WORKSPACE INSTALLATION LOCK
       ======================================================== */

    if (lockAcquired) {
      try {
        await controlClient.query(
          `
            SELECT pg_advisory_unlock(
              hashtext($1)
            )
          `,
          [
            lockKey,
          ]
        );
      } catch (unlockError) {
        console.error(
          '[Apps] Failed to release installation lock:',
          unlockError
        );
      }
    }

    controlClient.release();
  }
}