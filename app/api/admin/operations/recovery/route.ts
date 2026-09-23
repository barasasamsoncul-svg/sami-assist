import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  capturePlatformIncident,
} from '@/lib/observability/platform-incidents';

import {
  TenantRecoveryError,
  createTenantRecoveryPoint,
  deleteTenantRecoveryPoint,
  listTenantRecoveryPoints,
  restoreTenantRecoveryPoint,
  verifyTenantRecoveryPoint,
} from '@/lib/services/tenant-recovery';

import {
  TenantBackupProviderError,
} from '@/lib/services/tenant-backup-provider';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


type RecoveryAction =
  | 'create'
  | 'verify'
  | 'restore'
  | 'delete';


function json(
  body:
    Record<string, unknown>,
  status =
    200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, private',
        Pragma:
          'no-cache',
        'X-Content-Type-Options':
          'nosniff',
      },
    },
  );
}


function sameOrigin(
  request:
    NextRequest,
) {
  const site =
    request.headers
      .get('sec-fetch-site')
      ?.trim()
      .toLowerCase();

  if (
    site === 'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers
      .get('origin');

  if (!origin) {
    return true;
  }

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}


function text(
  value:
    unknown,
  maximum:
    number,
) {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maximum);
}


function validTargetDatabaseName(
  value:
    string,
) {
  return /^[A-Za-z_][A-Za-z0-9_]{2,62}$/.test(
    value,
  );
}


function recoveryErrorCode(
  error:
    unknown,
) {
  if (
    error instanceof
      TenantRecoveryError ||
    error instanceof
      TenantBackupProviderError
  ) {
    return error.code;
  }

  if (
    error instanceof
      Error
  ) {
    return error.message;
  }

  return 'RECOVERY_OPERATION_FAILED';
}


async function requirePointForTenant(
  tenantId:
    string,
  recoveryPointId:
    string,
) {
  const points =
    await listTenantRecoveryPoints(
      tenantId,
    );

  const point =
    points.find(
      item =>
        item.id ===
        recoveryPointId,
    );

  if (!point) {
    throw new TenantRecoveryError(
      'RECOVERY_POINT_NOT_FOUND',
      'The requested recovery point could not be found for this workspace.',
    );
  }

  return point;
}


export async function POST(
  request:
    NextRequest,
) {
  let session:
    Awaited<
      ReturnType<
        typeof requireAdminCapability
      >
    > |
    null =
    null;

  let tenantId =
    '';

  let action:
    RecoveryAction |
    '' =
    '';

  let recoveryPointId =
    '';

  let targetDatabaseName =
    '';

  try {
    if (
      !sameOrigin(
        request,
      )
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_ORIGIN',
          error:
            'This administrator request could not be verified.',
        },
        403,
      );
    }

    session =
      await requireAdminCapability(
        'tenants.manage',
      );

    const contentType =
      request.headers
        .get('content-type')
        ?.toLowerCase() ||
      '';

    if (
      !contentType.includes(
        'application/json',
      )
    ) {
      return json(
        {
          success:
            false,
          code:
            'UNSUPPORTED_MEDIA_TYPE',
          error:
            'This endpoint requires JSON.',
        },
        415,
      );
    }

    const raw =
      await request.text();

    if (
      Buffer.byteLength(
        raw,
        'utf8',
      ) >
      12 *
      1024
    ) {
      return json(
        {
          success:
            false,
          code:
            'REQUEST_TOO_LARGE',
          error:
            'The request is too large.',
        },
        413,
      );
    }

    let body:
      Record<string, unknown>;

    try {
      body =
        JSON.parse(raw) as
          Record<string, unknown>;
    } catch {
      return json(
        {
          success:
            false,
          code:
            'INVALID_REQUEST',
          error:
            'Invalid request body.',
        },
        400,
      );
    }

    tenantId =
      text(
        body.tenantId,
        100,
      );

    action =
      text(
        body.action,
        40,
      ).toLowerCase() as
        RecoveryAction;

    recoveryPointId =
      text(
        body.recoveryPointId,
        100,
      );

    targetDatabaseName =
      text(
        body.targetDatabaseName,
        63,
      );

    const reason =
      text(
        body.reason,
        500,
      );

    const confirmation =
      text(
        body.confirmation,
        200,
      );

    if (!tenantId) {
      return json(
        {
          success:
            false,
          code:
            'TENANT_REQUIRED',
          error:
            'Select a workspace first.',
        },
        400,
      );
    }

    if (
      action !== 'create' &&
      action !== 'verify' &&
      action !== 'restore' &&
      action !== 'delete'
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_ACTION',
          error:
            'Select a valid recovery operation.',
        },
        400,
      );
    }

    let result:
      Record<string, unknown>;

    if (
      action === 'create'
    ) {
      const point =
        await createTenantRecoveryPoint({
          tenantId,
          recoveryType:
            'logical_export',
          reason:
            reason ||
            'Platform Administration recovery point',
        });

      recoveryPointId =
        point.id;

      result = {
        recoveryPoint:
          point,
      };
    } else {
      if (
        !recoveryPointId
      ) {
        return json(
          {
            success:
              false,
            code:
              'RECOVERY_POINT_REQUIRED',
            error:
              'Select a recovery point first.',
          },
          400,
        );
      }

      await requirePointForTenant(
        tenantId,
        recoveryPointId,
      );

      if (
        action === 'verify'
      ) {
        const point =
          await verifyTenantRecoveryPoint(
            recoveryPointId,
          );

        result = {
          recoveryPoint:
            point,
        };
      } else if (
        action === 'restore'
      ) {
        if (
          !validTargetDatabaseName(
            targetDatabaseName,
          )
        ) {
          return json(
            {
              success:
                false,
              code:
                'INVALID_TARGET_DATABASE',
              error:
                'Use a fresh PostgreSQL database name containing letters, numbers and underscores.',
            },
            400,
          );
        }

        const requiredConfirmation =
          'RESTORE ' +
          targetDatabaseName;

        if (
          confirmation !==
          requiredConfirmation
        ) {
          return json(
            {
              success:
                false,
              code:
                'RESTORE_CONFIRMATION_REQUIRED',
              error:
                'Type the exact restore confirmation before continuing.',
              requiredConfirmation,
            },
            400,
          );
        }

        const restored =
          await restoreTenantRecoveryPoint({
            recoveryPointId,
            targetDatabaseName,
          });

        result = {
          restore:
            restored,
          registryCutover:
            false,
        };
      } else {
        if (
          confirmation !==
          'DELETE BACKUP'
        ) {
          return json(
            {
              success:
                false,
              code:
                'DELETE_CONFIRMATION_REQUIRED',
              error:
                'Type DELETE BACKUP before deleting the recovery point.',
            },
            400,
          );
        }

        await deleteTenantRecoveryPoint(
          recoveryPointId,
        );

        result = {
          deleted:
            true,
          recoveryPointId,
        };
      }
    }

    await recordAdminAuditEvent({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        'platform.recovery.' +
        action,
      action:
        'recovery_' +
        action,
      targetType:
        'tenant_recovery_point',
      targetId:
        recoveryPointId ||
        tenantId,
      targetTenantId:
        tenantId,
      successful:
        true,
      metadata: {
        tenantId,
        recoveryPointId:
          recoveryPointId ||
          null,
        targetDatabaseName:
          targetDatabaseName ||
          null,
        restoreUsesFreshDatabase:
          action === 'restore'
            ? true
            : null,
        registryCutoverPerformed:
          action === 'restore'
            ? false
            : null,
      },
    });

    return json({
      success:
        true,
      action,
      ...result,
    });
  } catch (
    error
  ) {
    const code =
      recoveryErrorCode(
        error,
      );

    const status =
      code ===
        'ADMIN_UNAUTHENTICATED'
        ? 401
        : code ===
            'ADMIN_FORBIDDEN'
          ? 403
          : code ===
              'RECOVERY_POINT_NOT_FOUND' ||
            code ===
              'TENANT_DATABASE_NOT_FOUND'
            ? 404
            : (
                error instanceof
                  TenantRecoveryError ||
                error instanceof
                  TenantBackupProviderError
              )
              ? 400
              : 500;

    if (
      session
    ) {
      await recordAdminAuditEvent({
        request,
        adminId:
          session.adminId,
        sessionId:
          session.sessionId,
        eventType:
          'platform.recovery.operation_failed',
        action:
          action
            ? 'recovery_' +
              action
            : 'recovery_operation',
        targetType:
          'tenant_recovery_point',
        targetId:
          recoveryPointId ||
          null,
        targetTenantId:
          tenantId ||
          null,
        successful:
          false,
        failureReason:
          code.slice(
            0,
            255,
          ),
        metadata: {
          targetDatabaseName:
            targetDatabaseName ||
            null,
        },
      });

      await capturePlatformIncident({
        source:
          'platform_admin',
        category:
          'tenant_recovery_operation_failed',
        title:
          'Tenant recovery operation failed',
        severity:
          status >= 500
            ? 'error'
            : 'warning',
        operation:
          action ||
          'unknown',
        tenantId:
          tenantId ||
          null,
        adminId:
          session.adminId,
        error,
        metadata: {
          recoveryPointId:
            recoveryPointId ||
            null,
          targetDatabaseName:
            targetDatabaseName ||
            null,
          code,
        },
      });
    }

    return json(
      {
        success:
          false,
        code,
        error:
          status === 401
            ? 'Administrator authentication is required.'
            : status === 403
              ? 'Your administrator role cannot manage tenant recovery.'
              : error instanceof
                    TenantRecoveryError ||
                  error instanceof
                    TenantBackupProviderError
                ? error.message
                : 'SaMi could not complete the recovery operation.',
      },
      status,
    );
  }
}
