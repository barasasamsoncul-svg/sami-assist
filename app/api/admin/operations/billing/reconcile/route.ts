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
  reconcileWorkspaceBilling,
} from '@/lib/billing/reconcile';

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
        'subscriptions.manage',
      );

    const report =
      await runTrackedPlatformJob(
        {
          jobKey:
            'billing.reconcile_manual',
          triggerType:
            'admin',
          provider:
            process.env
              .SAMI_BILLING_PROVIDER
              ?.trim()
              .toLowerCase() ||
            'billing',
          source:
            'platform_admin',
          category:
            'billing_reconciliation_failed',
          route:
            '/api/admin/operations/billing/reconcile',
          operation:
            'reconcile_workspace_billing',
          metadata: {
            adminId:
              session.adminId,
          },
        },
        () =>
          reconcileWorkspaceBilling(
            500,
          ),
      );

    await recordAdminAuditEvent({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        'platform.billing.reconciled',
      action:
        'billing_reconcile',
      targetType:
        'subscription_registry',
      successful:
        true,
      metadata: {
        ...report,
      },
    });

    return NextResponse.json(
      {
        success:
          true,
        report,
      },
      {
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
      '[SaMi Admin] Manual billing reconciliation failed:',
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
          'platform.billing.reconcile_failed',
        action:
          'billing_reconcile',
        targetType:
          'subscription_registry',
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
              ? 'Your administrator role cannot reconcile subscriptions.'
              : 'SaMi could not reconcile subscriptions.',
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
