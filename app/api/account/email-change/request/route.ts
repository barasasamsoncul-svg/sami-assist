import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  getUserAccount,
  UserAccountNotFoundError,
} from '@/lib/account/user-account';

import {
  requestEmailChange,
  cancelEmailChangeRequest,
  EmailChangeError,
} from '@/lib/account/email-change';

import {
  sendEmailChangeVerificationEmail,
} from '@/lib/services/email';

import {
  recordAuthEvent,
} from '@/lib/auth/auth-events';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const EMAIL_CHANGE_EXPIRY_MINUTES =
  15;

const EMAIL_CHANGE_RESEND_SECONDS =
  60;

/* ============================================================
   TYPES
   ============================================================ */

type EmailChangeRequestBody = {
  email?: unknown;
};

/* ============================================================
   RESPONSE
   ============================================================ */

function json(
  body:
    Record<
      string,
      unknown
    >,

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
   EMAIL CHANGE ERROR STATUS
   ============================================================ */

function getEmailChangeErrorStatus(
  error:
    EmailChangeError
): number {
  switch (
    error.code
  ) {
    case 'INVALID_NEW_EMAIL':
      return 400;

    case 'EMAIL_UNCHANGED':
      return 409;

    case 'EMAIL_UNAVAILABLE':
      return 409;

    case 'EMAIL_CHANGE_COOLDOWN':
      return 429;

    case 'INVALID_EMAIL_CHANGE_CODE':
      return 400;

    case 'EMAIL_CHANGE_EXPIRED':
      return 400;

    default:
      return 400;
  }
}

/* ============================================================
   POST
   /api/account/email-change/request
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  /* ==========================================================
     1. SESSION
     ========================================================== */

  let session;

  try {
    session =
      await getSession();
  } catch (
    error
  ) {
    console.error(
      '[Account] Email-change session lookup failed:',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'EMAIL_CHANGE_REQUEST_ERROR',

        error:
          'SaMi could not start the email change.',
      },
      500
    );
  }

  if (
    !session
  ) {
    return json(
      {
        success:
          false,

        code:
          'UNAUTHENTICATED',

        error:
          'You must sign in to change your email address.',
      },
      401
    );
  }

  /* ==========================================================
     2. BODY
     ========================================================== */

  let body:
    EmailChangeRequestBody;

  try {
    const parsed =
      await request.json();

    if (
      !parsed ||
      typeof parsed !==
        'object' ||
      Array.isArray(
        parsed
      )
    ) {
      return json(
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
      parsed as EmailChangeRequestBody;
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
      400
    );
  }

  /* ==========================================================
     3. EMAIL
     ========================================================== */

  if (
    typeof body.email !==
    'string'
  ) {
    return json(
      {
        success:
          false,

        code:
          'INVALID_NEW_EMAIL',

        error:
          'Enter a valid email address.',

        field:
          'email',
      },
      400
    );
  }

  const requestedEmail =
    body.email
      .trim()
      .toLowerCase();

  /* ==========================================================
     4. GLOBAL ACCOUNT
     ========================================================== */

  let account;

  try {
    account =
      await getUserAccount(
        session.user.id
      );
  } catch (
    error
  ) {
    if (
      error instanceof
      UserAccountNotFoundError
    ) {
      return json(
        {
          success:
            false,

          code:
            'ACCOUNT_NOT_FOUND',

          error:
            'Your SaMi account could not be found.',
        },
        404
      );
    }

    console.error(
      '[Account] Email-change account lookup failed:',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'EMAIL_CHANGE_REQUEST_ERROR',

        error:
          'SaMi could not start the email change.',
      },
      500
    );
  }

  /* ==========================================================
     5. CREATE EMAIL-CHANGE REQUEST
     ========================================================== */

  let changeRequest;

  try {
    changeRequest =
      await requestEmailChange(
        session.user.id,
        requestedEmail
      );
  } catch (
    error
  ) {
    if (
      error instanceof
      UserAccountNotFoundError
    ) {
      return json(
        {
          success:
            false,

          code:
            'ACCOUNT_NOT_FOUND',

          error:
            'Your SaMi account could not be found.',
        },
        404
      );
    }

    if (
      error instanceof
      EmailChangeError
    ) {
      await recordAuthEvent({
        request,

        userId:
          session.user.id,

        eventType:
          'EMAIL_CHANGE_REQUEST_REJECTED',

        metadata: {
          code:
            error.code,

          requestedEmail,
        },
      });

      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,

          field:
            error.code ===
              'INVALID_NEW_EMAIL'
              ? 'email'
              : undefined,

          retryAfterSeconds:
            error.retryAfterSeconds,
        },
        getEmailChangeErrorStatus(
          error
        )
      );
    }

    console.error(
      '[Account] Create email-change request failed:',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'EMAIL_CHANGE_REQUEST_ERROR',

        error:
          'SaMi could not start the email change.',
      },
      500
    );
  }

  /* ==========================================================
     6. DELIVER VERIFICATION CODE

     changeRequest.requestId stays server-side.

     If delivery fails we invalidate ONLY this exact request.
     ========================================================== */

  try {
    const delivery =
      await sendEmailChangeVerificationEmail(
        changeRequest.email,
        changeRequest.code,

        account.firstName ||
          account.fullName ||
          'there',

        {
          expiresInMinutes:
            EMAIL_CHANGE_EXPIRY_MINUTES,
        }
      );

    /* ========================================================
       EMAIL SERVICE RETURNED success:false
       ======================================================== */

    if (
      !delivery.success
    ) {
      try {
        await cancelEmailChangeRequest(
          session.user.id,
          changeRequest.requestId
        );
      } catch (
        cleanupError
      ) {
        console.error(
          '[Account] Failed to clean up undelivered email-change request:',
          cleanupError
        );
      }

      await recordAuthEvent({
        request,

        userId:
          session.user.id,

        eventType:
          'EMAIL_CHANGE_DELIVERY_FAILED',

        metadata: {
          requestedEmail:
            changeRequest.email,
        },
      });

      return json(
        {
          success:
            false,

          code:
            'EMAIL_CHANGE_DELIVERY_UNAVAILABLE',

          error:
            'SaMi could not send the verification code. Please try again.',
        },
        503
      );
    }
  } catch (
    error
  ) {
    /* ========================================================
       EMAIL SERVICE THREW

       Again, invalidate ONLY the request whose delivery failed.
       ======================================================== */

    try {
      await cancelEmailChangeRequest(
        session.user.id,
        changeRequest.requestId
      );
    } catch (
      cleanupError
    ) {
      console.error(
        '[Account] Failed to clean up email-change request after delivery failure:',
        cleanupError
      );
    }

    console.error(
      '[Account] Email-change verification delivery failed:',
      error
    );

    await recordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        'EMAIL_CHANGE_DELIVERY_FAILED',

      metadata: {
        requestedEmail:
          changeRequest.email,
      },
    });

    return json(
      {
        success:
          false,

        code:
          'EMAIL_CHANGE_DELIVERY_ERROR',

        error:
          'SaMi could not send the verification code. Please try again.',
      },
      503
    );
  }

  /* ==========================================================
     7. AUDIT SUCCESSFUL DELIVERY
     ========================================================== */

  await recordAuthEvent({
    request,

    userId:
      session.user.id,

    eventType:
      'EMAIL_CHANGE_REQUESTED',

    metadata: {
      currentEmail:
        account.email,

      requestedEmail:
        changeRequest.email,

      expiresAt:
        changeRequest.expiresAt,
    },
  });

  /* ==========================================================
     8. SAFE RESPONSE

     NEVER expose:
     - changeRequest.code
     - changeRequest.requestId
     ========================================================== */

  return json({
    success:
      true,

    code:
      'EMAIL_CHANGE_CODE_SENT',

    message:
      'A verification code has been sent to your new email address.',

    pending: {
      email:
        changeRequest.email,

      expiresAt:
        changeRequest.expiresAt,

      canResendInSeconds:
        EMAIL_CHANGE_RESEND_SECONDS,
    },
  });
}