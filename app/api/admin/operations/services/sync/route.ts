import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  syncPlatformServiceSubscriptions,
} from '@/lib/admin/platform-services';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  runTrackedPlatformJob,
} from '@/lib/observability/platform-jobs';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function sameOrigin(
  request:
    NextRequest,
) {
  const site =
    request.headers
      .get(
        'sec-fetch-site',
      )
      ?.trim()
      .toLowerCase();

  if (
    site ===
      'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers
      .get(
        'origin',
      );

  if (
    !origin
  ) {
    return true;
  }

  try {
    return (
      new URL(
        origin,
      ).origin ===
      request.nextUrl
        .origin
    );
  } catch {
    return false;
  }
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

  try {
    if (
      !sameOrigin(
        request,
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            'This administrator request could not be verified.',
        },
        {
          status:
            403,
        },
      );
    }

    session =
      await requireAdminCapability(
        'providers.manage',
      );

    const report =
      await runTrackedPlatformJob(
        {
          jobKey:
            'platform.services.sync_manual',
          triggerType:
            'admin',
          provider:
            'platform',
          source:
            'platform_admin',
          category:
            'platform_service_sync_failed',
          route:
            '/api/admin/operations/services/sync',
          operation:
            'sync_platform_service_subscriptions',
          metadata: {
            adminId:
              session.adminId,
          },
        },
        () =>
          syncPlatformServiceSubscriptions(),
      );

    await recordAdminAuditEvent({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        'platform.services.synced',
      action:
        'platform_services_sync',
      targetType:
        'platform_service_registry',
      successful:
        true,
      metadata: {
        services:
          report.services.length,
      },
    });

    return NextResponse.json(
      {
        success:
          true,
        report,
      },
      {
        status:
          200,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Admin] Platform services sync failed:',
      error,
    );

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
          'platform.services.sync_failed',
        action:
          'platform_services_sync',
        targetType:
          'platform_service_registry',
        successful:
          false,
        failureReason:
          error instanceof
            Error
            ? error.message
            : 'unknown_error',
      });
    }

    const status =
      error instanceof
          Error &&
        error.message ===
          'ADMIN_UNAUTHENTICATED'
        ? 401
        : error instanceof
              Error &&
            error.message ===
              'ADMIN_FORBIDDEN'
          ? 403
          : 500;

    return NextResponse.json(
      {
        success:
          false,
        error:
          status ===
            401
            ? 'Administrator authentication is required.'
            : status ===
                403
              ? 'Your administrator role cannot manage platform providers.'
              : 'SaMi could not sync platform services.',
      },
      {
        status,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
}
