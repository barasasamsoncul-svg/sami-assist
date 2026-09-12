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
  cancelEmailChange,
  EmailChangeError,
} from '@/lib/account/email-change';

import {
  sendEmailChangeVerificationEmail,
} from '@/lib/services/email';

import {
  recordAuthEvent,
} from '@/lib/auth/auth-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
   ERROR STATUS
   ============================================================ */

function getEmailChangeErrorStatus(
  error: EmailChangeError
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

   Starts an email-change request for the CURRENT signed-in user.

   Flow:

   session
      ↓
   validate new email
      ↓
   create hashed verification request
      ↓
   send raw 6-digit code to NEW email
      ↓
   browser receives only safe pending-state metadata

   IMPORTANT:

   The browser NEVER receives:
   - raw verification code
   - code hash
   - internal request ID
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  /* ==========================================================
     1. SESSION
     ========================================================== */

  let session;

  try {
    session =
      await getSession();
  } catch (error) {
    console.error(
      '[Account] Email-change session lookup failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'EMAIL_CHANGE_REQUEST_ERROR',

        error:
          'SaMi could not start the email change.',
      },
      500
    );
  }

  if (!session) {
    return json(
      {
        success: false,

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
          success: false,

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
        success: false,

        code:
          'INVALID_REQUEST',

        error:
          'Invalid request body.',
      },
      400
    );
  }

  /* ==========================================================
     3. EMAIL TYPE
     ========================================================== */

  if (
    typeof body.email !==
    'string'
  ) {
    return json(
      {
        success: false,

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
     4. ACCOUNT

     Load the signed-in user's global account.

     This is NOT a tenant/team lookup.
     ========================================================== */

  let account;

  try {
    account =
      await getUserAccount(
        session.user.id
      );
  } catch (error) {
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

    console.error(
      '[Account] Email-change account lookup failed:',
      error
    );

    return json(
      {
        success: false,

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

     requestEmailChange():

     - validates email
     - checks current email
     - checks email availability
     - applies cooldown
     - generates six-digit code
     - stores SHA-256(code), not raw code
     - expires after 15 minutes
     ========================================================== */

  let changeRequest;

  try {
    changeRequest =
      await requestEmailChange(
        session.user.id,
        requestedEmail
      );
  } catch (error) {
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
          success: false,

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
        success: false,

        code:
          'EMAIL_CHANGE_REQUEST_ERROR',

        error:
          'SaMi could not start the email change.',
      },
      500
    );
  }

  /* ==========================================================
     6. SEND CODE TO NEW EMAIL

     The raw code exists here only long enough to pass it to the
     server-side email service.

     It is never:
     - logged
     - returned as JSON
     - stored unhashed
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

    /*
     * Development may return success:false if SMTP is not
     * configured.
     *
     * Do not leave an unusable pending request behind.
     */

    if (
      !delivery.success
    ) {
      try {
        await cancelEmailChange(
          session.user.id
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
          success: false,

          code:
            'EMAIL_CHANGE_DELIVERY_UNAVAILABLE',

          error:
            'SaMi could not send the verification code. Please try again.',
        },
        503
      );
    }
  } catch (error) {
    /*
     * If email delivery fails, invalidate the newly created
     * pending request.

     * Otherwise the user would be forced to wait for the
     * cooldown despite never receiving a usable code.
     */

    try {
      await cancelEmailChange(
        session.user.id
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
        success: false,

        code:
          'EMAIL_CHANGE_DELIVERY_ERROR',

        error:
          'SaMi could not send the verification code. Please try again.',
      },
      503
    );
  }

  /* ==========================================================
     7. AUDIT

     Security event only after a verification code was delivered.
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

     Never include:
     changeRequest.code
     changeRequest.requestId
     ========================================================== */

  return json({
    success: true,

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