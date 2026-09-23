import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getPlatformAdminAlertPreferences,
} from '@/lib/admin/alert-preferences';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  sendWorkspaceNotificationEmail,
} from '@/lib/services/email';

import {
  sendWorkspaceNotificationSms,
} from '@/lib/services/sms';


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
      await requireAdminSession();

    const preferences =
      await getPlatformAdminAlertPreferences(
        session.adminId,
      );

    const channels:
      Array<{
        channel:
          'email' |
          'sms';
        success:
          boolean;
        provider:
          string;
        errorCode?:
          string | null;
      }> =
    [];

    if (
      preferences.emailEnabled
    ) {
      const result =
        await sendWorkspaceNotificationEmail(
          session.email,
          session.fullName ||
          'Platform Administrator',
          {
            title:
              'SaMi Platform Admin test alert',
            message:
              'Your Platform Administration email alerts are configured and can reach you when a monitored SaMi dependency needs attention.',
            actionHref:
              '/admin/operations/services',
            audience:
              'platform_admin',
          },
        );

      channels.push({
        channel:
          'email',
        success:
          result.success,
        provider:
          'smtp',
        errorCode:
          result.success
            ? null
            : 'EMAIL_NOT_DELIVERED',
      });
    }

    if (
      preferences.smsEnabled &&
      preferences.smsPhoneE164
    ) {
      const result =
        await sendWorkspaceNotificationSms(
          preferences
            .smsPhoneE164,
          {
            title:
              'Platform Admin test',
            message:
              'SaMi infrastructure alerts can reach this phone.',
          },
        );

      channels.push({
        channel:
          'sms',
        success:
          result.success,
        provider:
          result.provider,
        errorCode:
          result.errorCode ||
          null,
      });
    }

    if (
      channels.length ===
        0
    ) {
      return NextResponse.json(
        {
          success:
            false,
          code:
            'NO_ALERT_CHANNEL_ENABLED',
          error:
            'Enable email or SMS alerts before sending a test.',
        },
        {
          status:
            400,
        },
      );
    }

    const success =
      channels.some(
        channel =>
          channel.success,
      );

    await recordAdminAuditEvent({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        'platform_admin.test_alert_sent',
      action:
        'test_operational_alert',
      targetType:
        'platform_admin_alert_preferences',
      targetId:
        session.adminId,
      successful:
        success,
      failureReason:
        success
          ? null
          : 'all_enabled_channels_failed',
      metadata: {
        channels:
          channels.map(
            channel => ({
              channel:
                channel.channel,
              success:
                channel.success,
              provider:
                channel.provider,
              errorCode:
                channel.errorCode ||
                null,
            }),
          ),
      },
    });

    return NextResponse.json(
      {
        success,
        channels,
        message:
          success
            ? 'SaMi sent the test through at least one enabled channel.'
            : 'All enabled alert channels failed. Review provider configuration in Platform Administration.',
      },
      {
        status:
          success
            ? 200
            : 502,
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
      '[SaMi Admin] Test operational alert failed:',
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
          'platform_admin.test_alert_failed',
        action:
          'test_operational_alert',
        targetType:
          'platform_admin_alert_preferences',
        targetId:
          session.adminId,
        successful:
          false,
        failureReason:
          error instanceof
            Error
            ? error.message
            : 'unknown_error',
      });
    }

    return NextResponse.json(
      {
        success:
          false,
        error:
          error instanceof
              Error &&
            error.message ===
              'ADMIN_UNAUTHENTICATED'
            ? 'Administrator authentication is required.'
            : 'SaMi could not send the test alert.',
      },
      {
        status:
          error instanceof
              Error &&
            error.message ===
              'ADMIN_UNAUTHENTICATED'
            ? 401
            : 500,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
}
