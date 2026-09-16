import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  queryControl,
} from '@/lib/db/control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control':
        'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options':
        'nosniff',
      'Referrer-Policy':
        'no-referrer',
    },
  });
}

function error(
  status: number,
  code: string,
  message: string
) {
  return json(
    {
      success: false,
      code,
      error: message,
    },
    status
  );
}

function isSameOrigin(
  request: NextRequest
) {
  const site =
    request.headers.get(
      'sec-fetch-site'
    );

  if (
    site &&
    site !== 'same-origin' &&
    site !== 'same-site' &&
    site !== 'none'
  ) {
    return false;
  }

  const origin =
    request.headers.get(
      'origin'
    );

  if (!origin) {
    return true;
  }

  try {
    const source =
      new URL(origin);

    const target =
      new URL(request.url);

    return (
      source.protocol ===
        target.protocol &&
      source.host ===
        target.host
    );
  } catch {
    return false;
  }
}

function serializeDate(
  value: unknown
) {
  if (!value) {
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

export async function GET() {
  let session;

  try {
    session =
      await requireAdminSession();
  } catch {
    return error(
      401,
      'ADMIN_UNAUTHENTICATED',
      'Your administrator session has expired. Sign in again.'
    );
  }

  try {
    const result =
      await queryControl(
        `
          SELECT
            id,
            ip_address,
            user_agent,
            device_type,
            browser,
            operating_system,
            created_at,
            last_activity_at,
            expires_at
          FROM platform_admin_sessions
          WHERE
            admin_id = $1
            AND revoked_at IS NULL
            AND expires_at > NOW()
          ORDER BY
            CASE
              WHEN id = $2
              THEN 0
              ELSE 1
            END,
            last_activity_at DESC,
            created_at DESC
        `,
        [
          session.adminId,
          session.sessionId,
        ]
      );

    const sessions =
      result.rows.map(
        row => ({
          id: row.id,

          current:
            row.id ===
            session.sessionId,

          ipAddress:
            row.ip_address ??
            null,

          userAgent:
            row.user_agent ??
            null,

          deviceType:
            row.device_type ??
            null,

          browser:
            row.browser ??
            null,

          operatingSystem:
            row.operating_system ??
            null,

          createdAt:
            serializeDate(
              row.created_at
            ),

          lastActivityAt:
            serializeDate(
              row.last_activity_at
            ),

          expiresAt:
            serializeDate(
              row.expires_at
            ),
        })
      );

    return json({
      success: true,
      sessions,
    });
  } catch (requestError) {
    console.error(
      '[Admin Account] Session list failed:',
      requestError
    );

    return error(
      500,
      'ADMIN_SESSIONS_LOAD_FAILED',
      'SaMi could not load your administrator sessions.'
    );
  }
}

export async function DELETE(
  request: NextRequest
) {
  if (
    !isSameOrigin(request)
  ) {
    return error(
      403,
      'CROSS_ORIGIN_REQUEST_REJECTED',
      'This request could not be accepted.'
    );
  }

  let session;

  try {
    session =
      await requireAdminSession();
  } catch {
    return error(
      401,
      'ADMIN_UNAUTHENTICATED',
      'Your administrator session has expired. Sign in again.'
    );
  }

  try {
    const result =
      await queryControl(
        `
          UPDATE platform_admin_sessions
          SET
            revoked_at = NOW(),
            revoked_by = $1,
            revocation_reason =
              'user_revoked_other_sessions'
          WHERE
            admin_id = $1
            AND id <> $2
            AND revoked_at IS NULL
          RETURNING id
        `,
        [
          session.adminId,
          session.sessionId,
        ]
      );

    const revokedCount =
      result.rows.length;

    try {
      await recordAdminAuditEvent({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.sessions.others_revoked',

        action:
          'revoke_other_sessions',

        targetType:
          'platform_admin',

        targetId:
          session.adminId,

        successful: true,

        metadata: {
          revokedCount,
        },
      });
    } catch (
      auditError
    ) {
      console.error(
        '[Admin Account] Session audit failed:',
        auditError
      );
    }

    return json({
      success: true,

      code:
        'OTHER_ADMIN_SESSIONS_REVOKED',

      revokedCount,

      message:
        revokedCount === 1
          ? '1 other administrator session was signed out.'
          : `${revokedCount} other administrator sessions were signed out.`,
    });
  } catch (requestError) {
    console.error(
      '[Admin Account] Session revocation failed:',
      requestError
    );

    try {
      await recordAdminAuditEvent({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.sessions.others_revoke_failed',

        action:
          'revoke_other_sessions',

        targetType:
          'platform_admin',

        targetId:
          session.adminId,

        successful: false,

        failureReason:
          'internal_error',
      });
    } catch {
      // Preserve primary response.
    }

    return error(
      500,
      'ADMIN_SESSION_REVOCATION_FAILED',
      'SaMi could not sign out your other administrator sessions.'
    );
  }
}