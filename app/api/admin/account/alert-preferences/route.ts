import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getPlatformAdminAlertPreferences,
  updatePlatformAdminAlertPreferences,
} from '@/lib/admin/alert-preferences';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  getSamiSmsProvider,
} from '@/lib/services/sms';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function json(
  body:
    Record<
      string,
      unknown
    >,
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


export async function GET() {
  try {
    const session =
      await requireAdminSession();

    const preferences =
      await getPlatformAdminAlertPreferences(
        session.adminId,
      );

    return json({
      success:
        true,
      preferences,
      smsProvider:
        getSamiSmsProvider(),
    });
  } catch (
    error
  ) {
    const code =
      error instanceof
          Error &&
        error.message ===
          'ADMIN_UNAUTHENTICATED'
        ? 'ADMIN_UNAUTHENTICATED'
        : 'ALERT_PREFERENCES_LOAD_FAILED';

    return json(
      {
        success:
          false,
        code,
        error:
          code ===
            'ADMIN_UNAUTHENTICATED'
            ? 'Administrator authentication is required.'
            : 'SaMi could not load your alert preferences.',
      },
      code ===
        'ADMIN_UNAUTHENTICATED'
        ? 401
        : 500,
    );
  }
}


export async function PATCH(
  request:
    NextRequest,
) {
  let session:
    Awaited<
      ReturnType<
        typeof requireAdminSession
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
      await requireAdminSession();

    const contentType =
      request.headers
        .get(
          'content-type',
        )
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
        16 *
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

    const preferences =
      await updatePlatformAdminAlertPreferences({
        adminId:
          session.adminId,
        emailEnabled:
          body.emailEnabled,
        smsEnabled:
          body.smsEnabled,
        smsPhone:
          body.smsPhone,
        warningEmail:
          body.warningEmail,
        criticalEmail:
          body.criticalEmail,
        warningSms:
          body.warningSms,
        criticalSms:
          body.criticalSms,
        serviceAlertsEnabled:
          body.serviceAlertsEnabled,
        incidentAlertsEnabled:
          body.incidentAlertsEnabled,
        timezone:
          body.timezone,
      });

    await recordAdminAuditEvent({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        'platform_admin.alert_preferences_updated',
      action:
        'alert_preferences_update',
      targetType:
        'platform_admin_alert_preferences',
      targetId:
        session.adminId,
      successful:
        true,
      metadata: {
        emailEnabled:
          preferences.emailEnabled,
        smsEnabled:
          preferences.smsEnabled,
        warningEmail:
          preferences.warningEmail,
        criticalEmail:
          preferences.criticalEmail,
        warningSms:
          preferences.warningSms,
        criticalSms:
          preferences.criticalSms,
        serviceAlertsEnabled:
          preferences.serviceAlertsEnabled,
        incidentAlertsEnabled:
          preferences.incidentAlertsEnabled,
        timezone:
          preferences.timezone,
        hasSmsPhone:
          Boolean(
            preferences.smsPhoneE164,
          ),
      },
    });

    return json({
      success:
        true,
      preferences,
      smsProvider:
        getSamiSmsProvider(),
    });
  } catch (
    error
  ) {
    const code =
      error instanceof
        Error
        ? error.message
        : 'ALERT_PREFERENCES_UPDATE_FAILED';

    const status =
      code ===
        'ADMIN_UNAUTHENTICATED'
        ? 401
        : code ===
              'INVALID_SMS_PHONE' ||
            code ===
              'SMS_PHONE_REQUIRED' ||
            code ===
              'INVALID_TIMEZONE'
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
          'platform_admin.alert_preferences_update_failed',
        action:
          'alert_preferences_update',
        targetType:
          'platform_admin_alert_preferences',
        targetId:
          session.adminId,
        successful:
          false,
        failureReason:
          code,
      });
    }

    return json(
      {
        success:
          false,
        code,
        error:
          code ===
            'INVALID_SMS_PHONE'
            ? 'Enter a valid mobile number, for example +2547XXXXXXXX.'
            : code ===
                'SMS_PHONE_REQUIRED'
              ? 'Add a valid SMS phone number before enabling SMS alerts.'
              : code ===
                  'INVALID_TIMEZONE'
                ? 'Select a valid timezone.'
                : code ===
                    'ADMIN_UNAUTHENTICATED'
                  ? 'Administrator authentication is required.'
                  : 'SaMi could not update your alert preferences.',
      },
      status,
    );
  }
}
