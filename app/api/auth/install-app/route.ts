
import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { getTenantPool } from '@/lib/db/tenant';
import { provisionTenantDatabase } from '@/lib/services/tenant-provisioning';

import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const MAX_APP_KEY_LENGTH = 100;

/**
 * Normalize an app key supplied by the client.
 */
function normalizeAppKey(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

/**
 * Prevent path traversal when resolving an app schema.
 */
function isSafeAppKey(appKey: string): boolean {
  return (
    appKey.length > 0 &&
    appKey.length <= MAX_APP_KEY_LENGTH &&
    /^[a-z0-9_-]+$/.test(appKey)
  );
}

/**
 * Safely extract a useful error message.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

export async function POST(request: NextRequest) {
  try {
    // ============================================================
    // 1. Parse request
    // ============================================================

    let body: {
      tenantId?: unknown;
      appKey?: unknown;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body.',
        },
        { status: 400 }
      );
    }

    const tenantId =
      typeof body.tenantId === 'string'
        ? body.tenantId.trim()
        : '';

    const appKey = normalizeAppKey(body.appKey);

    // ============================================================
    // 2. Validate request
    // ============================================================

    if (!tenantId || !appKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tenant ID and app key are required.',
        },
        { status: 400 }
      );
    }

    if (!isSafeAppKey(appKey)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid app key.',
        },
        { status: 400 }
      );
    }

    // ============================================================
    // 3. Verify tenant exists
    // ============================================================

    const tenantResult = await queryControl(
      `
        SELECT
          id,
          name,
          slug,
          status,
          deleted_at
        FROM tenants
        WHERE id = $1
        LIMIT 1
      `,
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Workspace not found.',
        },
        { status: 404 }
      );
    }

    const tenant = tenantResult.rows[0];

    if (tenant.deleted_at) {
      return NextResponse.json(
        {
          success: false,
          error: 'This workspace is no longer available.',
        },
        { status: 410 }
      );
    }

    // ============================================================
    // 4. Validate tenant status
    // ============================================================

    const blockedTenantStatuses = new Set([
      'pending_verification',
      'pending_payment',
      'suspended',
      'deleted',
      'cancelled',
    ]);

    if (blockedTenantStatuses.has(tenant.status)) {
      return NextResponse.json(
        {
          success: false,
          code:
            tenant.status === 'pending_payment'
              ? 'PAYMENT_REQUIRED'
              : 'WORKSPACE_NOT_ACTIVE',
          error:
            tenant.status === 'pending_payment'
              ? 'Complete payment before installing apps.'
              : 'Verify and activate your workspace before installing apps.',
        },
        { status: 403 }
      );
    }

    // ============================================================
    // 5. Verify module exists and is active
    // ============================================================

    const moduleResult = await queryControl(
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
      [appKey]
    );

    if (moduleResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'App not found.',
        },
        { status: 404 }
      );
    }

    const module = moduleResult.rows[0];

    if (module.status !== 'active') {
      return NextResponse.json(
        {
          success: false,
          error: 'This app is currently unavailable.',
        },
        { status: 403 }
      );
    }

    // ============================================================
    // 6. Check whether app is already installed
    // ============================================================

    const existingModuleResult = await queryControl(
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
      [tenantId, module.id]
    );

    if (existingModuleResult.rows.length > 0) {
      const existingModule = existingModuleResult.rows[0];

      if (existingModule.status === 'installed') {
        return NextResponse.json(
          {
            success: true,
            alreadyInstalled: true,
            message: `${module.name} is already installed.`,
            app: {
              id: module.id,
              key: module.key,
              name: module.name,
              version:
                existingModule.version || module.version,
              status: 'installed',
              installedAt: existingModule.installed_at,
            },
          },
          { status: 200 }
        );
      }
    }

    // ============================================================
    // 7. Get current subscription
    // ============================================================

    const subscriptionResult = await queryControl(
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
      [tenantId]
    );

    if (subscriptionResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          code: 'NO_ACTIVE_SUBSCRIPTION',
          error:
            'No active subscription is available for this workspace.',
        },
        { status: 403 }
      );
    }

    const subscription = subscriptionResult.rows[0];

    // ============================================================
    // 8. Count installed apps
    // ============================================================

    const countResult = await queryControl(
      `
        SELECT COUNT(*)::int AS count
        FROM tenant_modules
        WHERE tenant_id = $1
          AND status = 'installed'
      `,
      [tenantId]
    );

    const installedCount = Number(
      countResult.rows[0]?.count || 0
    );

    const includedApps = Number(
      subscription.included_apps
    );

    const existingModule =
      existingModuleResult.rows[0] || null;

    const isPendingReservation =
      existingModule?.status === 'pending';

    const appAlreadyInstalled =
      existingModule?.status === 'installed';

    // ============================================================
    // 9. Enforce app limit
    // ============================================================

    if (
      !appAlreadyInstalled &&
      !isPendingReservation &&
      includedApps !== -1 &&
      installedCount >= includedApps
    ) {
      return NextResponse.json(
        {
          success: false,
          code: 'UPGRADE_REQUIRED',
          error:
            'Your current plan does not include another app.',
          currentPlan: subscription.plan_key,
          includedApps,
          installedApps: installedCount,
        },
        { status: 403 }
      );
    }

    // ============================================================
    // 10. Resolve existing tenant database
    // ============================================================

    let databaseName =
      await getTenantDatabaseName(tenantId);

    // ============================================================
    // 11. Provision tenant database if missing
    // ============================================================

    if (!databaseName) {
      /*
       * IMPORTANT:
       *
       * Current tenant-provisioning.ts expects:
       *
       * provisionTenantDatabase(
       *   tenantId,
       *   businessName,
       *   appKeys
       * )
       *
       * It returns TenantDatabaseProvisionResult.
       *
       * It does NOT return:
       * {
       *   success: boolean;
       *   error: string;
       * }
       *
       * Therefore we rely on exceptions to detect failure.
       */

      let provisioningResult;

      try {
        provisioningResult =
          await provisionTenantDatabase(
            tenantId,
            tenant.name,
            [appKey]
          );
      } catch (provisioningError) {
        console.error(
          'Tenant database provisioning failed:',
          {
            tenantId,
            appKey,
            error: getErrorMessage(
              provisioningError
            ),
          }
        );

        return NextResponse.json(
          {
            success: false,
            code: 'PROVISIONING_FAILED',
            error:
              'The workspace database could not be provisioned.',
          },
          { status: 500 }
        );
      }

      /*
       * The provisioning service completed without throwing.
       * Resolve the registered database again from the control DB.
       */

      databaseName =
        await getTenantDatabaseName(
          tenantId
        );

      if (!databaseName) {
        console.error(
          'Tenant database was provisioned but could not be resolved:',
          {
            tenantId,
            appKey,
            provisioningResult,
          }
        );

        return NextResponse.json(
          {
            success: false,
            code: 'DATABASE_NOT_REGISTERED',
            error:
              'Workspace database could not be located after provisioning.',
          },
          { status: 500 }
        );
      }
    }

    // ============================================================
    // 12. Existing tenant database
    // ============================================================

    else {
      const appSchemaPath = path.join(
        process.cwd(),
        'lib',
        'apps',
        appKey,
        'schema.sql'
      );

      /*
       * If the app has its own schema, install it.
       *
       * Some apps may intentionally use only the core tenant
       * schema, so absence of a dedicated schema is allowed.
       */

      if (fs.existsSync(appSchemaPath)) {
        const schema = fs.readFileSync(
          appSchemaPath,
          'utf8'
        );

        if (!schema.trim()) {
          throw new Error(
            `Schema file for ${appKey} is empty.`
          );
        }

        const tenantPool =
          getTenantPool(databaseName);

        await tenantPool.query(schema);
      } else {
        console.info(
          `No dedicated schema found for app "${appKey}". Continuing with core tenant schema.`
        );
      }
    }

    // ============================================================
    // 13. Record installation in control database
    // ============================================================

    await queryControl(
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
          'installed',
          NOW()
        )
        ON CONFLICT (
          tenant_id,
          module_id
        )
        DO UPDATE SET
          version = EXCLUDED.version,
          status = 'installed',
          installed_at = NOW()
      `,
      [
        tenantId,
        module.id,
        module.version,
      ]
    );

    // ============================================================
    // 14. Activate tenant when appropriate
    // ============================================================

    if (tenant.status === 'provisioning') {
      await queryControl(
        `
          UPDATE tenants
          SET
            status = 'active',
            updated_at = NOW()
          WHERE id = $1
            AND status = 'provisioning'
        `,
        [tenantId]
      );
    }

    // ============================================================
    // 15. Return success
    // ============================================================

    return NextResponse.json(
      {
        success: true,
        alreadyInstalled: false,

        message:
          `${module.name} installed successfully.`,

        app: {
          id: module.id,
          key: module.key,
          name: module.name,
          version: module.version,
          status: 'installed',
        },

        tenant: {
          id: tenantId,
          name: tenant.name,
          slug: tenant.slug,
          databaseReady: true,
        },

        subscription: {
          plan: subscription.plan_key,
          planName: subscription.plan_name,
          includedApps,
          installedApps: installedCount + 1,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      'Install app error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          'Failed to install the app. Please try again.',
      },
      { status: 500 }
    );
  }
}