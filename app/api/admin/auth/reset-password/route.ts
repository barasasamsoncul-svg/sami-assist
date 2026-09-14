import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  completePasswordReset,
} from '@/lib/auth/password-reset';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type ResetAdminPasswordBody = {
  token?:
    unknown;

  newPassword?:
    unknown;

  confirmPassword?:
    unknown;
};

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body:
    Record<string, unknown>,

  status =
    200
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',
      },
    }
  );
}

/* ============================================================
   POST /api/admin/auth/reset-password
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  let body:
    ResetAdminPasswordBody;

  try {
    const parsed:
      unknown =
      await request.json();

    if (
      !parsed ||
      typeof parsed !==
        'object' ||
      Array.isArray(
        parsed
      )
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'INVALID_REQUEST',

          error:
            'Invalid request body.',
        },
        400
      );
    }

    body =
      parsed as
        ResetAdminPasswordBody;
  } catch {
    return jsonResponse(
      {
        success:
          false,

        code:
          'INVALID_REQUEST',

        error:
          'Invalid request body.',
      },
      400
    );
  }

  try {
    const result =
      await completePasswordReset({
        request,

        identityType:
          'platform_admin',

        token:
          body.token,

        newPassword:
          body.newPassword,

        confirmPassword:
          body.confirmPassword,
      });

    if (
      !result.success
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            result.code,

          error:
            result.message,
        },
        400
      );
    }

    return jsonResponse(
      {
        success:
          true,

        code:
          'ADMIN_PASSWORD_RESET_SUCCESS',

        message:
          'Administrator password reset successfully. Sign in using your new password.',

        next:
          result.next,
      }
    );
  } catch (
    error
  ) {
    console.error(
      '[Admin Auth] Password reset failed:',
      error
    );

    return jsonResponse(
      {
        success:
          false,

        code:
          'ADMIN_PASSWORD_RESET_ERROR',

        error:
          'The administrator password could not be reset.',
      },
      500
    );
  }
}