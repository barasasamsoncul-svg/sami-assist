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

const MAX_BODY_BYTES = 8 * 1024;

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
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
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
    request.headers.get('sec-fetch-site');

  if (
    site &&
    site !== 'same-origin' &&
    site !== 'same-site' &&
    site !== 'none'
  ) {
    return false;
  }

  const origin =
    request.headers.get('origin');

  if (!origin) {
    return true;
  }

  try {
    const source = new URL(origin);
    const target = new URL(request.url);

    return (
      source.protocol === target.protocol &&
      source.host === target.host
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
      : new Date(String(value));

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

function validSessionId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200
  );
}

async function auditSafely(
  input: Parameters<
    typeof recordAdminAuditEvent
  >[0]
) {
  try {
    await recordAdminAuditEvent(input);
  } catch (auditError) {
    console.error(
      '[Admin Account] Session audit failed:',
      auditError
    );
  }
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
      result.rows.map(row => ({
        id: row.id,

        current:
          row.id ===
          session.sessionId,

        ipAddress:
          row.ip_address ?? null,

        userAgent:
          row.user_agent ?? null,

        deviceType:
          row.device_type ?? null,

        browser:
          row.browser ?? null,

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
      }));

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
  if (!isSameOrigin(request)) {
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

  const contentLength =
    request.headers.get(
      'content-length'
    );

  if (
    contentLength &&
    Number(contentLength) >
      MAX_BODY_BYTES
  ) {
    return error(
      413,
      'REQUEST_TOO_LARGE',
      'This request is too large.'
    );
  }

  let body: {
    sessionId?: unknown;
    allOthers?: unknown;
  } = {};

  try {
    const text =
      await request.text();

    if (
      Buffer.byteLength(
        text,
        'utf8'
      ) > MAX_BODY_BYTES
    ) {
      return error(
        413,
        'REQUEST_TOO_LARGE',
        'This request is too large.'
      );
    }

    if (text.trim()) {
      const parsed =
        JSON.parse(text);

      if (
        !parsed ||
        typeof parsed !==
          'object' ||
        Array.isArray(parsed)
      ) {
        return error(
          400,
          'INVALID_REQUEST',
          'This session request is invalid.'
        );
      }

      const allowedKeys =
        new Set([
          'sessionId',
          'allOthers',
        ]);

      for (
        const key of Object.keys(
          parsed
        )
      ) {
        if (
          !allowedKeys.has(key)
        ) {
          return error(
            400,
            'UNSUPPORTED_FIELD',
            'This session request contains an unsupported field.'
          );
        }
      }

      body = parsed;
    }
  } catch {
    return error(
      400,
      'INVALID_JSON',
      'This session request is invalid.'
    );
  }

  const revokeAllOthers =
    body.allOthers === true ||
    (!body.sessionId &&
      body.allOthers ===
        undefined);

  if (
    body.allOthers !==
      undefined &&
    typeof body.allOthers !==
      'boolean'
  ) {
    return error(
      400,
      'INVALID_REQUEST',
      'This session request is invalid.'
    );
  }

  if (
    !revokeAllOthers &&
    !validSessionId(
      body.sessionId
    )
  ) {
    return error(
      400,
      'INVALID_SESSION',
      'Choose a valid session to sign out.'
    );
  }

  if (
    body.sessionId ===
    session.sessionId
  ) {
    return error(
      400,
      'CURRENT_SESSION_PROTECTED',
      'Your current session cannot be signed out from this screen.'
    );
  }

  if (revokeAllOthers) {
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
              AND expires_at > NOW()
            RETURNING id
          `,
          [
            session.adminId,
            session.sessionId,
          ]
        );

      const revokedCount =
        result.rows.length;

      await auditSafely({
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

      await auditSafely({
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

      return error(
        500,
        'ADMIN_SESSION_REVOCATION_FAILED',
        'SaMi could not sign out your other administrator sessions.'
      );
    }
  }

  const targetSessionId =
    body.sessionId as string;

  try {
    const result =
      await queryControl(
        `
          UPDATE platform_admin_sessions
          SET
            revoked_at = NOW(),
            revoked_by = $1,
            revocation_reason =
              'user_revoked_session'
          WHERE
            id = $2
            AND admin_id = $1
            AND id <> $3
            AND revoked_at IS NULL
            AND expires_at > NOW()
          RETURNING
            id,
            ip_address,
            device_type,
            browser,
            operating_system
        `,
        [
          session.adminId,
          targetSessionId,
          session.sessionId,
        ]
      );

    if (
      result.rows.length === 0
    ) {
      return error(
        404,
        'ADMIN_SESSION_NOT_FOUND',
        'This session is no longer active.'
      );
    }

    const revoked =
      result.rows[0];

    await auditSafely({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'admin.session.revoked',

      action:
        'revoke_session',

      targetType:
        'platform_admin_session',

      targetId:
        targetSessionId,

      successful: true,

      metadata: {
        revokedSessionId:
          targetSessionId,

        ipAddress:
          revoked.ip_address ??
          null,

        deviceType:
          revoked.device_type ??
          null,

        browser:
          revoked.browser ??
          null,

        operatingSystem:
          revoked.operating_system ??
          null,
      },
    });

    return json({
      success: true,

      code:
        'ADMIN_SESSION_REVOKED',

      revokedCount: 1,

      revokedSessionId:
        targetSessionId,

      message:
        'The selected administrator session was signed out.',
    });
  } catch (requestError) {
    console.error(
      '[Admin Account] Individual session revocation failed:',
      requestError
    );

    await auditSafely({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'admin.session.revoke_failed',

      action:
        'revoke_session',

      targetType:
        'platform_admin_session',

      targetId:
        targetSessionId,

      successful: false,

      failureReason:
        'internal_error',
    });

    return error(
      500,
      'ADMIN_SESSION_REVOCATION_FAILED',
      'SaMi could not sign out the selected administrator session.'
    );
  }
}