import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  updatePlatformServiceSubscription,
} from '@/lib/admin/platform-services';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


type Context = {
  params:
    Promise<{
      serviceKey:
        string;
    }>;
};


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


export async function PATCH(
  request:
    NextRequest,
  context:
    Context,
) {
  let session:
    Awaited<
      ReturnType<
        typeof requireAdminCapability
      >
    > |
    null =
    null;

  let serviceKey =
    '';

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

    const params =
      await context.params;

    serviceKey =
      params.serviceKey
        .trim()
        .toLowerCase();

    const raw =
      await request.text();

    if (
      Buffer.byteLength(
        raw,
        'utf8',
      ) >
        24 *
        1024
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            'The request is too large.',
        },
        {
          status:
            413,
        },
      );
    }

    let body:
      Record<
        string,
        unknown
      >;

    try {
      const parsed =
        JSON.parse(
          raw,
        );

      body =
        parsed &&
        typeof parsed ===
          'object' &&
        !Array.isArray(
          parsed,
        )
          ? parsed as
              Record<
                string,
                unknown
              >
          : {};
    } catch {
      return NextResponse.json(
        {
          success:
            false,
          error:
            'Invalid request body.',
        },
        {
          status:
            400,
        },
      );
    }

    const result =
      await updatePlatformServiceSubscription({
        serviceKey,
        planName:
          body.planName,
        billingCycle:
          body.billingCycle,
        amount:
          body.amount,
        currency:
          body.currency,
        renewalAt:
          body.renewalAt,
        expiresAt:
          body.expiresAt,
        autoRenew:
          body.autoRenew,
        quotaLimit:
          body.quotaLimit,
        quotaUnit:
          body.quotaUnit,
        warningThresholdPercent:
          body.warningThresholdPercent,
        managementUrl:
          body.managementUrl,
      });

    await recordAdminAuditEvent({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        'platform.service.updated',
      action:
        'platform_service_update',
      targetType:
        'platform_service_subscription',
      targetId:
        serviceKey,
      successful:
        true,
      metadata: {
        status:
          result.status,
      },
    });

    return NextResponse.json(
      {
        success:
          true,
        service:
          result,
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
      '[SaMi Admin] Platform service update failed:',
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
          'platform.service.update_failed',
        action:
          'platform_service_update',
        targetType:
          'platform_service_subscription',
        targetId:
          serviceKey ||
          null,
        successful:
          false,
        failureReason:
          error instanceof
            Error
            ? error.message
            : 'unknown_error',
      });
    }

    const message =
      error instanceof
        Error
        ? error.message
        : 'PLATFORM_SERVICE_UPDATE_FAILED';

    const status =
      message ===
        'ADMIN_UNAUTHENTICATED'
        ? 401
        : message ===
            'ADMIN_FORBIDDEN'
          ? 403
          : message ===
              'SERVICE_NOT_FOUND'
            ? 404
            : message.startsWith(
                'INVALID_',
              )
              ? 400
              : 500;

    return NextResponse.json(
      {
        success:
          false,
        error:
          status ===
            500
            ? 'SaMi could not update this platform service.'
            : message
                .replace(
                  /_/g,
                  ' ',
                )
                .toLowerCase(),
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
