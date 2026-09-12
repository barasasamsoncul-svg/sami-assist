import {
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  cancelEmailChange,
  getPendingEmailChange,
  EmailChangeError,
} from '@/lib/account/email-change';

import {
  UserAccountNotFoundError,
} from '@/lib/account/user-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   RESPONSE
   ============================================================ */

function json(
  body: Record<
    string,
    unknown
  >,
  status = 200
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
   GET
   /api/account/email-change

   Returns the currently signed-in user's pending email-change
   request, if one exists.

   IMPORTANT:
   - never returns code_hash
   - never returns raw verification code
   - never returns another user's request
   ============================================================ */

export async function GET() {
  try {
    /* ========================================================
       SESSION
       ======================================================== */

    const session =
      await getSession();

    if (!session) {
      return json(
        {
          success: false,

          code:
            'UNAUTHENTICATED',

          error:
            'You must sign in to manage your email address.',
        },
        401
      );
    }

    /* ========================================================
       PENDING REQUEST
       ======================================================== */

    const pending =
      await getPendingEmailChange(
        session.user.id
      );

    /* ========================================================
       RESPONSE
       ======================================================== */

    return json({
      success: true,

      code:
        'EMAIL_CHANGE_STATUS_LOADED',

      pending,
    });
  } catch (error) {
    /* ========================================================
       ACCOUNT NOT FOUND
       ======================================================== */

    if (
      error instanceof
      UserAccountNotFoundError
    ) {
      return json(
        {
          success: false,

          code:
            'ACCOUNT_NOT_FOUND',

          error:
            'Your SaMi account could not be found.',
        },
        404
      );
    }

    /* ========================================================
       EMAIL CHANGE ERROR
       ======================================================== */

    if (
      error instanceof
      EmailChangeError
    ) {
      return json(
        {
          success: false,

          code:
            error.code,

          error:
            error.message,

          retryAfterSeconds:
            error.retryAfterSeconds,
        },
        400
      );
    }

    /* ========================================================
       INTERNAL ERROR
       ======================================================== */

    console.error(
      '[Account] Load pending email change failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'EMAIL_CHANGE_STATUS_ERROR',

        error:
          'SaMi could not load your email change status.',
      },
      500
    );
  }
}

/* ============================================================
   DELETE
   /api/account/email-change

   Cancels the currently signed-in user's pending email change.

   This does NOT:
   - change users.email
   - affect memberships
   - affect workspace access
   - affect roles
   - affect permissions
   - affect subscriptions
   ============================================================ */

export async function DELETE() {
  try {
    /* ========================================================
       SESSION
       ======================================================== */

    const session =
      await getSession();

    if (!session) {
      return json(
        {
          success: false,

          code:
            'UNAUTHENTICATED',

          error:
            'You must sign in to manage your email address.',
        },
        401
      );
    }

    /* ========================================================
       CANCEL
       ======================================================== */

    await cancelEmailChange(
      session.user.id
    );

    /* ========================================================
       SUCCESS

       Deliberately idempotent.

       Cancelling when no request exists still succeeds because
       the desired final state is already true:
       no pending email change.
       ======================================================== */

    return json({
      success: true,

      code:
        'EMAIL_CHANGE_CANCELLED',

      message:
        'Your pending email change has been cancelled.',

      pending:
        null,
    });
  } catch (error) {
    /* ========================================================
       ACCOUNT NOT FOUND
       ======================================================== */

    if (
      error instanceof
      UserAccountNotFoundError
    ) {
      return json(
        {
          success: false,

          code:
            'ACCOUNT_NOT_FOUND',

          error:
            'Your SaMi account could not be found.',
        },
        404
      );
    }

    /* ========================================================
       EMAIL CHANGE ERROR
       ======================================================== */

    if (
      error instanceof
      EmailChangeError
    ) {
      return json(
        {
          success: false,

          code:
            error.code,

          error:
            error.message,

          retryAfterSeconds:
            error.retryAfterSeconds,
        },
        400
      );
    }

    /* ========================================================
       INTERNAL ERROR
       ======================================================== */

    console.error(
      '[Account] Cancel email change failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'EMAIL_CHANGE_CANCEL_ERROR',

        error:
          'SaMi could not cancel your email change.',
      },
      500
    );
  }
}