import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  isValidPasswordResetEmail,
  normalizePasswordResetEmail,
  PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
  requestPasswordReset,
} from '@/lib/auth/password-reset-request';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type AdminForgotPasswordBody = {
  email?:
    unknown;
};

/* ============================================================
   GENERIC RESPONSE

   Never reveal whether a Platform Admin identity exists.
   ============================================================ */

function successResponse() {
  return NextResponse.json(
    {
      success:
        true,

      code:
        'ADMIN_RESET_LINK_SENT',

      message:
        'If the administrator account exists and is eligible for recovery, a password reset link has been sent.',

      retryAfterSeconds:
        PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
    },
    {
      status:
        200,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',
      },
    }
  );
}

function errorResponse(
  status:
    number,

  code:
    string,

  message:
    string
) {
  return NextResponse.json(
    {
      success:
        false,

      code,

      error:
        message,

      message,
    },
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
   POST
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  let body:
    AdminForgotPasswordBody;

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
      return errorResponse(
        400,
        'INVALID_REQUEST',
        'Invalid request body.'
      );
    }

    body =
      parsed as
        AdminForgotPasswordBody;
  } catch {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'Invalid request body.'
    );
  }

  const email =
    normalizePasswordResetEmail(
      body.email
    );

  if (
    !isValidPasswordResetEmail(
      email
    )
  ) {
    return errorResponse(
      400,
      'INVALID_EMAIL',
      'Enter a valid administrator email address.'
    );
  }

  try {
    await requestPasswordReset({
      request,

      identityType:
        'platform_admin',

      email,
    });

    /*
     * Generic response regardless of:
     * - administrator exists
     * - status
     * - throttling
     * - delivery
     */
    return successResponse();
  } catch (
    error
  ) {
    console.error(
      '[Admin Auth] Forgot password failed:',
      error
    );

    return errorResponse(
      500,
      'ADMIN_PASSWORD_RECOVERY_ERROR',
      'The password recovery request could not be processed.'
    );
  }
}