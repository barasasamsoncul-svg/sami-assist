import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createPlatformServiceSubscription,
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

      if (
        !parsed ||
        typeof parsed !==
          'object' ||
        Array.isArray(
          parsed,
        )
      ) {
        throw new Error(
          'invalid',
        );
      }

      body =
        parsed as
          Record<
            string,
            unknown
          >;
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

    const service =
      await createPlatformServiceSubscription({
        serviceKey:
          body.serviceKey,
        provider:
          body.provider,
        serviceName:
          body.serviceName,
        category:
          body.category,
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
        'platform.service.created',
      action:
        'platform_service_create',
      targetType:
        'platform_service_subscription',
      targetId:
        service.serviceKey,
      successful:
        true,
      metadata: {
        status:
          service.status,
      },
    });

    return NextResponse.json(
      {
        success:
          true,
        service,
      },
      {
        status:
          201,
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
      '[SaMi Admin] Platform service creation failed:',
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
          'platform.service.create_failed',
        action:
          'platform_service_create',
        targetType:
          'platform_service_subscription',
        successful:
          false,
        failureReason:
          error instanceof
            Error
            ? error.message
            : 'unknown_error',
      });
    }

    const code =
      error instanceof
        Error
        ? error.message
        : 'PLATFORM_SERVICE_CREATE_FAILED';

    const status =
      code ===
        'ADMIN_UNAUTHENTICATED'
        ? 401
        : code ===
            'ADMIN_FORBIDDEN'
          ? 403
          : code.startsWith(
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
            ? 'SaMi could not add this platform service.'
            : code
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
