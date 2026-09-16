import {
  NextResponse,
} from 'next/server';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  queryControl,
} from '@/lib/db/control';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

const MAX_ACTIVITY =
  50;

function jsonResponse(
  body:
    Record<string, unknown>,
  status = 200
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

        Expires:
          '0',

        'Referrer-Policy':
          'no-referrer',

        'X-Content-Type-Options':
          'nosniff',
      },
    }
  );
}

function errorResponse(
  status: number,
  code: string,
  error: string
) {
  return jsonResponse(
    {
      success:
        false,

      code,

      error,
    },
    status
  );
}

function safeString(
  value:
    unknown
) {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const clean =
    value.trim();

  return clean ||
    null;
}

function safeDate(
  value:
    unknown
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
          String(value)
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

function friendlyEventType(
  eventType:
    unknown
) {
  const value =
    safeString(
      eventType
    );

  return (
    value ||
    'security.activity'
  );
}

export async function GET() {
  let session;

  try {
    session =
      await requireAdminSession();
  } catch (error) {
    if (
      error instanceof
        Error &&
      error.message ===
        'ADMIN_UNAUTHENTICATED'
    ) {
      return errorResponse(
        401,
        'ADMIN_UNAUTHENTICATED',
        'Your administrator session has expired. Sign in again.'
      );
    }

    console.error(
      '[Admin Security Activity] Session error:',
      error
    );

    return errorResponse(
      500,
      'ADMIN_SESSION_ERROR',
      'SaMi could not verify your administrator session.'
    );
  }

  try {
    const [
      auditResult,
      loginResult,
    ] =
      await Promise.all([
        queryControl(
          `
            SELECT
              id,
              event_type,
              action,
              successful,
              failure_reason,
              ip_address,
              user_agent,
              created_at
            FROM
              platform_admin_audit_logs
            WHERE
              admin_id = $1
            ORDER BY
              created_at DESC
            LIMIT $2
          `,
          [
            session.adminId,
            MAX_ACTIVITY,
          ]
        ),

        queryControl(
          `
            SELECT
              id,
              successful,
              failure_reason,
              ip_address,
              user_agent,
              device_type,
              browser,
              operating_system,
              created_at
            FROM
              platform_admin_login_history
            WHERE
              admin_id = $1
            ORDER BY
              created_at DESC
            LIMIT $2
          `,
          [
            session.adminId,
            MAX_ACTIVITY,
          ]
        ),
      ]);

    const auditActivity =
      auditResult.rows.map(
        row => ({
          id:
            String(
              row.id
            ),

          source:
            'audit' as const,

          eventType:
            friendlyEventType(
              row.event_type
            ),

          action:
            safeString(
              row.action
            ),

          successful:
            row.successful !==
            false,

          failureReason:
            safeString(
              row.failure_reason
            ),

          ipAddress:
            safeString(
              row.ip_address
            ),

          userAgent:
            safeString(
              row.user_agent
            ),

          deviceType:
            null,

          browser:
            null,

          operatingSystem:
            null,

          createdAt:
            safeDate(
              row.created_at
            ),
        })
      );

    const loginActivity =
      loginResult.rows.map(
        row => ({
          id:
            String(
              row.id
            ),

          source:
            'login' as const,

          eventType:
            row.successful
              ? 'admin.login.success'
              : 'admin.login.failed',

          action:
            'login',

          successful:
            row.successful ===
            true,

          failureReason:
            safeString(
              row.failure_reason
            ),

          ipAddress:
            safeString(
              row.ip_address
            ),

          userAgent:
            safeString(
              row.user_agent
            ),

          deviceType:
            safeString(
              row.device_type
            ),

          browser:
            safeString(
              row.browser
            ),

          operatingSystem:
            safeString(
              row.operating_system
            ),

          createdAt:
            safeDate(
              row.created_at
            ),
        })
      );

    const activity =
      [
        ...auditActivity,
        ...loginActivity,
      ]
        .filter(
          item =>
            item.createdAt !==
            null
        )
        .sort(
          (
            first,
            second
          ) =>
            new Date(
              second.createdAt!
            ).getTime() -
            new Date(
              first.createdAt!
            ).getTime()
        )
        .slice(
          0,
          MAX_ACTIVITY
        );

    return jsonResponse({
      success:
        true,

      code:
        'ADMIN_SECURITY_ACTIVITY_LOADED',

      activity,
    });
  } catch (error) {
    console.error(
      '[Admin Security Activity] Load error:',
      error
    );

    return errorResponse(
      500,
      'ADMIN_SECURITY_ACTIVITY_LOAD_FAILED',
      'SaMi could not load your security activity.'
    );
  }
}