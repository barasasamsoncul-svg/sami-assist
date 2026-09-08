import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { requireSession } from '@/lib/auth/session';
import {
  hashPassword,
  verifyPassword,
} from '@/lib/auth/password';
import { queryControl } from '@/lib/db/control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type ChangePasswordBody = {
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

/* ============================================================
   PASSWORD VALIDATION
   ============================================================ */

function validatePassword(
  password: string
):
  | {
      code: 'PASSWORD_WEAK';
      message: string;
    }
  | null {
  if (
    !password ||
    password.length < 8
  ) {
    return {
      code: 'PASSWORD_WEAK',
      message:
        'Password must be at least 8 characters.',
    };
  }

  if (
    password.length > 128
  ) {
    return {
      code: 'PASSWORD_WEAK',
      message:
        'Password must not exceed 128 characters.',
    };
  }

  if (
    !/[A-Z]/.test(
      password
    )
  ) {
    return {
      code: 'PASSWORD_WEAK',
      message:
        'Password must include at least one uppercase letter.',
    };
  }

  if (
    !/[a-z]/.test(
      password
    )
  ) {
    return {
      code: 'PASSWORD_WEAK',
      message:
        'Password must include at least one lowercase letter.',
    };
  }

  if (
    !/[0-9]/.test(
      password
    )
  ) {
    return {
      code: 'PASSWORD_WEAK',
      message:
        'Password must include at least one number.',
    };
  }

  return null;
}

/* ============================================================
   REQUEST HELPERS
   ============================================================ */

function getClientIp(
  request: NextRequest
): string | null {
  const forwarded =
    request.headers.get(
      'x-forwarded-for'
    );

  if (forwarded) {
    const first =
      forwarded
        .split(',')[0]
        ?.trim();

    if (first) {
      return first;
    }
  }

  return (
    request.headers.get(
      'x-real-ip'
    ) || null
  );
}

function getUserAgent(
  request: NextRequest
) {
  return (
    request.headers.get(
      'user-agent'
    ) || null
  );
}

/* ============================================================
   RESPONSE HELPERS
   ============================================================ */

function errorResponse(
  code: string,
  error: string,
  status: number
) {
  return NextResponse.json(
    {
      success: false,
      code,
      error,
    },
    {
      status,
    }
  );
}

/* ============================================================
   POST
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  try {
    /* ========================================================
       AUTHENTICATION
       ======================================================== */

    const session =
      await requireSession();

    /* ========================================================
       BODY
       ======================================================== */

    const body =
      (await request
        .json()
        .catch(
          () => ({})
        )) as ChangePasswordBody;

    const currentPassword =
      typeof body.currentPassword ===
      'string'
        ? body.currentPassword
        : '';

    const newPassword =
      typeof body.newPassword ===
      'string'
        ? body.newPassword
        : '';

    const confirmPassword =
      typeof body.confirmPassword ===
      'string'
        ? body.confirmPassword
        : '';

    /* ========================================================
       VALIDATION
       ======================================================== */

    if (!currentPassword) {
      return errorResponse(
        'CURRENT_PASSWORD_REQUIRED',
        'Current password is required.',
        400
      );
    }

    const passwordIssue =
      validatePassword(
        newPassword
      );

    if (passwordIssue) {
      return errorResponse(
        passwordIssue.code,
        passwordIssue.message,
        400
      );
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      return errorResponse(
        'PASSWORDS_DO_NOT_MATCH',
        'New passwords do not match.',
        400
      );
    }

    /* ========================================================
       USER
       ======================================================== */

    const userResult =
      await queryControl(
        `
          SELECT
            id,
            email,
            password_hash,
            status
          FROM users
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          session.user.id,
        ]
      );

    if (
      userResult.rows.length ===
      0
    ) {
      return errorResponse(
        'ACCOUNT_NOT_FOUND',
        'Account not found.',
        404
      );
    }

    const user =
      userResult.rows[0];

    /* ========================================================
       PASSWORD-BASED ACCOUNT
       ======================================================== */

    if (
      !user.password_hash
    ) {
      return errorResponse(
        'PASSWORD_NOT_SET',
        'This account does not have a password yet. Use password recovery to create one.',
        400
      );
    }

    /* ========================================================
       VERIFY CURRENT PASSWORD
       ======================================================== */

    const currentPasswordMatches =
      await verifyPassword(
        currentPassword,
        user.password_hash
      );

    if (
      !currentPasswordMatches
    ) {
      /* ------------------------------------------------------
         Audit failure
         ------------------------------------------------------ */

      await queryControl(
        `
          INSERT INTO audit_logs (
            user_id,
            event_type,
            entity_type,
            entity_id,
            ip_address,
            user_agent,
            metadata
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )
        `,
        [
          user.id,
          'PASSWORD_CHANGE_FAILED',
          'user',
          user.id,
          getClientIp(
            request
          ),
          getUserAgent(
            request
          ),
          JSON.stringify({
            reason:
              'invalid_current_password',
          }),
        ]
      ).catch(
        (error) => {
          console.error(
            '[Auth] Failed to write password change failure audit log:',
            error
          );
        }
      );

      return errorResponse(
        'CURRENT_PASSWORD_INCORRECT',
        'Current password is incorrect.',
        400
      );
    }

    /* ========================================================
       PREVENT CURRENT PASSWORD REUSE
       ======================================================== */

    const newPasswordMatchesCurrent =
      await verifyPassword(
        newPassword,
        user.password_hash
      );

    if (
      newPasswordMatchesCurrent
    ) {
      return errorResponse(
        'PASSWORD_REUSED',
        'New password must be different from your current password.',
        400
      );
    }

    /* ========================================================
       HASH NEW PASSWORD
       ======================================================== */

    const newPasswordHash =
      await hashPassword(
        newPassword
      );

    /* ========================================================
       UPDATE USER PASSWORD
       ======================================================== */

    await queryControl(
      `
        UPDATE users
        SET
          password_hash = $2,
          password_changed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
      `,
      [
        user.id,
        newPasswordHash,
      ]
    );

    /* ========================================================
       REVOKE OTHER SESSIONS

       Keep the current session alive so the user is not
       unexpectedly logged out from the Settings page.
       ======================================================== */

    await queryControl(
      `
        UPDATE sessions
        SET
          revoked_at = NOW(),
          is_current = FALSE,
          updated_at = NOW()
        WHERE user_id = $1
          AND id <> $2
          AND revoked_at IS NULL
          AND deleted_at IS NULL
      `,
      [
        user.id,
        session.sessionId,
      ]
    ).catch(
      (error) => {
        console.error(
          '[Auth] Failed to revoke other sessions after password change:',
          error
        );
      }
    );

    /* ========================================================
       AUDIT SUCCESS
       ======================================================== */

    await queryControl(
      `
        INSERT INTO audit_logs (
          user_id,
          event_type,
          entity_type,
          entity_id,
          ip_address,
          user_agent,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
      `,
      [
        user.id,
        'PASSWORD_CHANGED',
        'user',
        user.id,
        getClientIp(
          request
        ),
        getUserAgent(
          request
        ),
        JSON.stringify({
          revokedOtherSessions:
            true,
        }),
      ]
    ).catch(
      (error) => {
        console.error(
          '[Auth] Failed to write password changed audit log:',
          error
        );
      }
    );

    /* ========================================================
       SUCCESS
       ======================================================== */

    return NextResponse.json(
      {
        success: true,
        code:
          'PASSWORD_CHANGED',
        message:
          'Password changed successfully.',
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      '[Auth] Change password failed:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        code:
          'CHANGE_PASSWORD_ERROR',
        error:
          'Could not change password.',
      },
      {
        status: 500,
      }
    );
  }
}