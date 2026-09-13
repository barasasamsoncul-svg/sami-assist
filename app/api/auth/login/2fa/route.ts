import {
  NextRequest,
  NextResponse,
} from 'next/server';

import crypto from 'crypto';

import {
  getControlPool,
  queryControl,
} from '@/lib/db/control';

import {
  createSession,
} from '@/lib/auth/session';

import {
  findUserForLogin,
  getAccountContextForUser,
  validateAccountCanLogin,
} from '@/lib/auth/account-context';

import {
  getValidLoginChallenge,
  markLoginChallengeUsed,
} from '@/lib/auth/login-challenges';

import {
  verifyUserTwoFactorCode,
} from '@/lib/auth/two-factor';

import {
  getLoginTwoFactorMethods,
  type TwoFactorMethod,
} from '@/lib/auth/two-factor-methods';

import {
  verifyEmailTwoFactorCode,
} from '@/lib/auth/email-two-factor';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getClientIp,
  recordAuthEvent,
  recordLoginHistory,
} from '@/lib/auth/auth-events';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_EMAIL_LENGTH =
  254;

const MAX_CHALLENGE_TOKEN_LENGTH =
  512;

const MAX_TWO_FACTOR_CODE_LENGTH =
  64;

const TWO_FACTOR_RATE_LIMIT_MAX_ATTEMPTS =
  getPositiveIntegerEnv(
    'AUTH_TWO_FACTOR_RATE_LIMIT_MAX_ATTEMPTS',
    8
  );

const TWO_FACTOR_RATE_LIMIT_WINDOW_MS =
  getPositiveIntegerEnv(
    'AUTH_TWO_FACTOR_RATE_LIMIT_WINDOW_MS',
    10 * 60 * 1000
  );

const TWO_FACTOR_RATE_LIMIT_BLOCK_MS =
  getPositiveIntegerEnv(
    'AUTH_TWO_FACTOR_RATE_LIMIT_BLOCK_MS',
    15 * 60 * 1000
  );

/* ============================================================
   TYPES
   ============================================================ */

type LoginVerificationMethod =
  | TwoFactorMethod
  | 'recovery';

type TwoFactorLoginBody = {
  email?: unknown;

  challengeToken?: unknown;

  code?: unknown;

  method?: unknown;

  rememberMe?: unknown;
};

type AccountSecurityState = {
  locked_until:
    | Date
    | string
    | null;
};

/* ============================================================
   CONFIG
   ============================================================ */

function getPositiveIntegerEnv(
  name:
    string,
  fallback:
    number
) {
  const value =
    Number(
      process.env[name]
    );

  if (
    !Number.isFinite(
      value
    ) ||
    value <=
      0
  ) {
    return fallback;
  }

  return Math.floor(
    value
  );
}

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeEmail(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .toLowerCase();
}

function normalizeChallengeToken(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.trim();
}

function normalizeCode(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  /*
   * Do not force numeric input.
   *
   * Authenticator codes are numeric.
   * Email OTPs are numeric.
   * Recovery codes may contain letters/separators.
   */
  return value.trim();
}

function normalizeVerificationMethod(
  value:
    unknown
): LoginVerificationMethod | null {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const method =
    value
      .trim()
      .toLowerCase();

  if (
    method ===
      'authenticator' ||
    method ===
      'email' ||
    method ===
      'recovery'
  ) {
    return method;
  }

  return null;
}

function isValidEmail(
  value:
    string
) {
  return (
    value.length >
      0 &&
    value.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value
    )
  );
}

/* ============================================================
   RESPONSES
   ============================================================ */

function jsonResponse(
  body:
    Record<
      string,
      unknown
    >,
  status =
    200,
  headers:
    Record<
      string,
      string
    > = {}
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

        ...headers,
      },
    }
  );
}

function errorResponse(
  status:
    number,
  code:
    string,
  error:
    string,
  extra:
    Record<
      string,
      unknown
    > = {},
  headers:
    Record<
      string,
      string
    > = {}
) {
  return jsonResponse(
    {
      success:
        false,

      code,

      error,

      ...extra,
    },
    status,
    headers
  );
}

function challengeExpiredResponse() {
  return errorResponse(
    400,
    'LOGIN_CHALLENGE_EXPIRED',
    'This login challenge has expired. Please sign in again.'
  );
}

/* ============================================================
   CHALLENGE RATE LIMIT
   ============================================================ */

function hashValue(
  value:
    string
) {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      value,
      'utf8'
    )
    .digest(
      'hex'
    );
}

function twoFactorRateIdentifier(
  request:
    NextRequest,
  challengeToken:
    string
) {
  const ip =
    getClientIp(
      request
    ) ||
    'unknown-ip';

  /*
   * Never place the raw login challenge token in
   * rate-limit storage.
   */
  const challengeHash =
    hashValue(
      challengeToken
    );

  return `login-2fa:${challengeHash}:${ip}`;
}

/* ============================================================
   ORIGINAL LOGIN RATE KEY

   Must remain identical to /api/auth/login.
   ============================================================ */

function loginRateIdentifier(
  request:
    NextRequest,
  email:
    string
) {
  const ip =
    getClientIp(
      request
    ) ||
    'unknown-ip';

  return `login:${email}:${ip}`;
}

/* ============================================================
   REMEMBER ME

   Server-side challenge value wins whenever available.
   ============================================================ */

function resolveRememberMe(
  challenge:
    unknown,
  requestedValue:
    unknown
) {
  if (
    challenge &&
    typeof challenge ===
      'object'
  ) {
    const row =
      challenge as Record<
        string,
        unknown
      >;

    if (
      typeof row
        .remember_me ===
        'boolean'
    ) {
      return row
        .remember_me;
    }

    if (
      typeof row
        .rememberMe ===
        'boolean'
    ) {
      return row
        .rememberMe;
    }
  }

  /*
   * Backwards compatibility for older login-challenge
   * rows/helpers.
   */
  return requestedValue ===
    true;
}

/* ============================================================
   ACCOUNT LOCK
   ============================================================ */

async function getAccountSecurityState(
  userId:
    string
): Promise<
  AccountSecurityState | null
> {
  const result =
    await queryControl(
      `
        SELECT
          locked_until

        FROM users

        WHERE id = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        userId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

function accountLockedResponse(
  lockedUntil:
    Date
) {
  const retryAfterSeconds =
    Math.max(
      1,
      Math.ceil(
        (
          lockedUntil.getTime() -
          Date.now()
        ) /
          1000
      )
    );

  return errorResponse(
    423,
    'ACCOUNT_LOCKED',
    'This account is temporarily locked. Please try again later.',
    {
      lockedUntil:
        lockedUntil
          .toISOString(),

      retryAfterSeconds,
    },
    {
      'Retry-After':
        String(
          retryAfterSeconds
        ),
    }
  );
}

/* ============================================================
   SUCCESSFUL LOGIN CLEANUP
   ============================================================ */

async function clearSuccessfulLoginState(
  userId:
    string
) {
  await queryControl(
    `
      UPDATE users

      SET
        failed_login_attempts = 0,
        locked_until = NULL,
        last_login_at = NOW(),
        updated_at = NOW()

      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [
      userId,
    ]
  );
}

/* ============================================================
   SAFE AUDIT HELPERS
   ============================================================ */

async function safeRecordAuthEvent(
  input:
    Parameters<
      typeof recordAuthEvent
    >[0]
) {
  try {
    await recordAuthEvent(
      input
    );
  } catch (
    error
  ) {
    console.error(
      '[Auth] Failed to record 2FA auth event:',
      error
    );
  }
}

async function safeRecordLoginHistory(
  input:
    Parameters<
      typeof recordLoginHistory
    >[0]
) {
  try {
    await recordLoginHistory(
      input
    );
  } catch (
    error
  ) {
    console.error(
      '[Auth] Failed to record 2FA login history:',
      error
    );
  }
}

/* ============================================================
   RESOLVE LOGIN METHOD

   Backwards compatibility:

   The existing SaMi 2FA client did not send `method`.

   Therefore:
   - if method is explicitly supplied, use it
   - if omitted and Authenticator exists, keep old behavior
   - otherwise use the sole available primary method
   - recovery remains explicit except when it is the only
     available verification fallback
   ============================================================ */

function resolveVerificationMethod(
  input: {
    requestedMethod:
      LoginVerificationMethod | null;

    methodWasSupplied:
      boolean;

    methods:
      TwoFactorMethod[];

    preferredMethod:
      TwoFactorMethod | null;

    recoveryAvailable:
      boolean;
  }
): LoginVerificationMethod | null {
  /* ----------------------------------------------------------
     EXPLICIT METHOD
     ---------------------------------------------------------- */

  if (
    input
      .methodWasSupplied
  ) {
    return input
      .requestedMethod;
  }

  /* ----------------------------------------------------------
     LEGACY CLIENT

     Existing SaMi login UI originally verified
     Authenticator/Recovery through this endpoint.
     ---------------------------------------------------------- */

  if (
    input.methods.includes(
      'authenticator'
    )
  ) {
    return 'authenticator';
  }

  /* ----------------------------------------------------------
     ONE PRIMARY METHOD
     ---------------------------------------------------------- */

  if (
    input.methods.length ===
    1
  ) {
    return input.methods[0];
  }

  /* ----------------------------------------------------------
     PREFERRED PRIMARY METHOD
     ---------------------------------------------------------- */

  if (
    input.preferredMethod &&
    input.methods.includes(
      input.preferredMethod
    )
  ) {
    return input
      .preferredMethod;
  }

  /* ----------------------------------------------------------
     RECOVERY-ONLY FALLBACK
     ---------------------------------------------------------- */

  if (
    input.methods.length ===
      0 &&
    input.recoveryAvailable
  ) {
    return 'recovery';
  }

  return null;
}

/* ============================================================
   METHOD AVAILABILITY
   ============================================================ */

function isVerificationMethodAvailable(
  method:
    LoginVerificationMethod,
  input: {
    methods:
      TwoFactorMethod[];

    recoveryAvailable:
      boolean;
  }
) {
  if (
    method ===
    'recovery'
  ) {
    return input
      .recoveryAvailable;
  }

  return input
    .methods
    .includes(
      method
    );
}

/* ============================================================
   METHOD STATE RESPONSE
   ============================================================ */

function methodUnavailableResponse(
  input: {
    methods:
      TwoFactorMethod[];

    preferredMethod:
      TwoFactorMethod | null;

    maskedEmail:
      string | null;

    recoveryAvailable:
      boolean;
  }
) {
  return errorResponse(
    409,
    'TWO_FACTOR_METHOD_NOT_AVAILABLE',
    'This verification method is no longer available. Choose another method.',
    {
      verification: {
        methods:
          input.methods,

        preferredMethod:
          input
            .preferredMethod,

        maskedEmail:
          input
            .maskedEmail,

        recoveryAvailable:
          input
            .recoveryAvailable,
      },
    }
  );
}

/* ============================================================
   EMAIL VERIFICATION FAILURE RESPONSE
   ============================================================ */

function emailVerificationFailureResponse(
  result:
    Awaited<
      ReturnType<
        typeof verifyEmailTwoFactorCode
      >
    >,
  verification: {
    methods:
      TwoFactorMethod[];

    preferredMethod:
      TwoFactorMethod | null;

    maskedEmail:
      string | null;

    recoveryAvailable:
      boolean;
  }
) {
  switch (
    result.reason
  ) {
    /* --------------------------------------------------------
       WRONG CODE
       -------------------------------------------------------- */

    case 'invalid':
      return errorResponse(
        400,
        'INVALID_EMAIL_TWO_FACTOR_CODE',
        'The email verification code is incorrect.',
        {
          attemptsRemaining:
            result
              .attemptsRemaining,
        }
      );

    /* --------------------------------------------------------
       EXPIRED CODE
       -------------------------------------------------------- */

    case 'expired':
      return errorResponse(
        400,
        'EMAIL_TWO_FACTOR_CODE_EXPIRED',
        'This email verification code has expired. Request a new code.',
        {
          attemptsRemaining:
            result
              .attemptsRemaining,
        }
      );

    /* --------------------------------------------------------
       TOO MANY ATTEMPTS ON THIS OTP
       -------------------------------------------------------- */

    case 'attempts_exhausted':
      return errorResponse(
        429,
        'EMAIL_TWO_FACTOR_CODE_ATTEMPTS_EXHAUSTED',
        'This email verification code can no longer be used. Request a new code.',
        {
          attemptsRemaining:
            0,
        }
      );

    /* --------------------------------------------------------
       NO CURRENT OTP

       Happens when:
       - user did not request one
       - previous code was consumed
       - previous code was invalidated
       -------------------------------------------------------- */

    case 'not_found':
      return errorResponse(
        400,
        'EMAIL_TWO_FACTOR_CODE_REQUIRED',
        'Request a new email verification code and try again.'
      );

    /* --------------------------------------------------------
       ACCOUNT EMAIL CHANGED DURING CHALLENGE
       -------------------------------------------------------- */

    case 'email_changed':
      return errorResponse(
        409,
        'EMAIL_TWO_FACTOR_EMAIL_CHANGED',
        'Your account email changed during this login. Sign in again.'
      );

    /* --------------------------------------------------------
       EMAIL 2FA WAS DISABLED AFTER CHALLENGE CREATION
       -------------------------------------------------------- */

    case 'method_disabled':
      return methodUnavailableResponse(
        verification
      );

    /* --------------------------------------------------------
       ACCOUNT BECAME UNAVAILABLE
       -------------------------------------------------------- */

    case 'account_unavailable':
      return challengeExpiredResponse();

    /* --------------------------------------------------------
       SUCCESS IS HANDLED BEFORE THIS FUNCTION
       -------------------------------------------------------- */

    case 'verified':
    default:
      return errorResponse(
        400,
        'INVALID_EMAIL_TWO_FACTOR_CODE',
        'The email verification code could not be verified.'
      );
  }
}

/* ============================================================
   POST
   /api/auth/login/2fa

   REQUEST

   Authenticator:
   {
     "email": "...",
     "challengeToken": "...",
     "method": "authenticator",
     "code": "123456"
   }

   Email:
   {
     "email": "...",
     "challengeToken": "...",
     "method": "email",
     "code": "123456"
   }

   Recovery:
   {
     "email": "...",
     "challengeToken": "...",
     "method": "recovery",
     "code": "..."
   }

   FLOW

   Password already verified
        ↓
   Validate login challenge
        ↓
   Rate-limit verification attempts
        ↓
   Advisory lock exact challenge
        ↓
   Revalidate challenge
        ↓
   Revalidate account/workspace
        ↓
   Revalidate currently enabled 2FA methods
        ↓
   Verify selected factor
        ↓
   Consume challenge ONCE
        ↓
   Create session
        ↓
   Login complete
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  let email =
    '';

  let challengeToken =
    '';

  let selectedMethod:
    LoginVerificationMethod | null =
    null;

  try {
    /* ========================================================
       1. PARSE REQUEST
       ======================================================== */

    let body:
      TwoFactorLoginBody;

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
          TwoFactorLoginBody;
    } catch {
      return errorResponse(
        400,
        'INVALID_REQUEST',
        'Invalid request body.'
      );
    }

    /* ========================================================
       2. NORMALIZE
       ======================================================== */

    email =
      normalizeEmail(
        body.email
      );

    challengeToken =
      normalizeChallengeToken(
        body.challengeToken
      );

    const code =
      normalizeCode(
        body.code
      );

    const methodWasSupplied =
      body.method !==
        undefined &&
      body.method !==
        null &&
      body.method !==
        '';

    const requestedMethod =
      normalizeVerificationMethod(
        body.method
      );

    /* ========================================================
       3. VALIDATE INPUT
       ======================================================== */

    if (
      !isValidEmail(
        email
      )
    ) {
      return errorResponse(
        400,
        'INVALID_EMAIL',
        'Enter a valid email address.'
      );
    }

    if (
      !challengeToken ||
      challengeToken.length >
        MAX_CHALLENGE_TOKEN_LENGTH
    ) {
      return challengeExpiredResponse();
    }

    if (
      methodWasSupplied &&
      !requestedMethod
    ) {
      return errorResponse(
        400,
        'INVALID_TWO_FACTOR_METHOD',
        'Choose Authenticator, Email, or a recovery code.'
      );
    }

    if (
      !code ||
      code.length >
        MAX_TWO_FACTOR_CODE_LENGTH
    ) {
      return errorResponse(
        400,
        'TWO_FACTOR_REQUIRED',
        'Enter your verification or recovery code.'
      );
    }

    /* ========================================================
       4. INITIAL CHALLENGE VALIDATION
       ======================================================== */

    const initialChallenge =
      await getValidLoginChallenge({
        email,

        challengeToken,
      });

    if (
      !initialChallenge
    ) {
      return challengeExpiredResponse();
    }

    /* ========================================================
       5. RATE LIMIT SECOND-FACTOR ATTEMPTS
       ======================================================== */

    const twoFactorRateKey =
      twoFactorRateIdentifier(
        request,
        challengeToken
      );

    const rateLimit =
      await checkRateLimit({
        identifier:
          twoFactorRateKey,

        /*
         * Reuse the supported login limiter action.
         *
         * The identifier separates password login attempts
         * from challenge verification attempts.
         */
        action:
          'login',

        maxAttempts:
          TWO_FACTOR_RATE_LIMIT_MAX_ATTEMPTS,

        windowMs:
          TWO_FACTOR_RATE_LIMIT_WINDOW_MS,

        blockMs:
          TWO_FACTOR_RATE_LIMIT_BLOCK_MS,
      });

    if (
      !rateLimit.allowed
    ) {
      /*
       * Too many challenge attempts invalidates the entire
       * password-authenticated login challenge.
       */
      await markLoginChallengeUsed(
        initialChallenge.id
      ).catch(
        (
          error
        ) => {
          console.error(
            '[Auth] Failed to invalidate rate-limited 2FA challenge:',
            error
          );
        }
      );

      await safeRecordAuthEvent({
        request,

        userId:
          initialChallenge
            .user_id,

        eventType:
          'TWO_FACTOR_RATE_LIMITED',

        entityType:
          'user',

        entityId:
          initialChallenge
            .user_id,

        metadata: {
          email,

          retryAfterSeconds:
            rateLimit
              .retryAfterSeconds,
        },
      });

      return errorResponse(
        429,
        'LOGIN_CHALLENGE_EXPIRED',
        'Too many verification attempts. Please sign in again.',
        {
          retryAfterSeconds:
            rateLimit
              .retryAfterSeconds,
        },
        {
          'Retry-After':
            String(
              Math.max(
                1,
                rateLimit
                  .retryAfterSeconds ||
                  1
              )
            ),
        }
      );
    }

    /* ========================================================
       6. SERIALIZE EXACT LOGIN CHALLENGE

       This prevents two concurrent successful verification
       requests from creating two independent sessions using
       one challenge.
       ======================================================== */

    const controlClient =
      await getControlPool()
        .connect();

    const challengeLockKey =
      `sami:login-2fa:${initialChallenge.id}`;

    let challengeLockAcquired =
      false;

    try {
      await controlClient.query(
        `
          SELECT pg_advisory_lock(
            hashtext($1)::bigint
          )
        `,
        [
          challengeLockKey,
        ]
      );

      challengeLockAcquired =
        true;

      /* ======================================================
         7. REVALIDATE CHALLENGE AFTER LOCK

         Another request may have completed the challenge while
         this request waited for the advisory lock.
         ====================================================== */

      const challenge =
        await getValidLoginChallenge({
          email,

          challengeToken,
        });

      if (
        !challenge
      ) {
        return challengeExpiredResponse();
      }

      /* ======================================================
         8. BIND CHALLENGE TO ACCOUNT
         ====================================================== */

      const user =
        await findUserForLogin(
          email
        );

      if (
        !user ||
        user.id !==
          challenge.user_id
      ) {
        await markLoginChallengeUsed(
          challenge.id
        ).catch(
          () =>
            undefined
        );

        return challengeExpiredResponse();
      }

      /* ======================================================
         9. CHECK ACCOUNT LOCK AGAIN
         ====================================================== */

      const securityState =
        await getAccountSecurityState(
          user.id
        );

      if (
        securityState
          ?.locked_until
      ) {
        const lockedUntil =
          new Date(
            securityState
              .locked_until
          );

        if (
          !Number.isNaN(
            lockedUntil.getTime()
          ) &&
          lockedUntil.getTime() >
            Date.now()
        ) {
          await markLoginChallengeUsed(
            challenge.id
          ).catch(
            () =>
              undefined
          );

          await safeRecordAuthEvent({
            request,

            userId:
              user.id,

            eventType:
              'TWO_FACTOR_LOGIN_BLOCKED',

            entityType:
              'user',

            entityId:
              user.id,

            metadata: {
              reason:
                'account_locked',

              email,

              lockedUntil:
                lockedUntil
                  .toISOString(),
            },
          });

          return accountLockedResponse(
            lockedUntil
          );
        }
      }

      /* ======================================================
         10. REVALIDATE ACCOUNT / WORKSPACE

         Workspace, membership or subscription state may have
         changed while the login challenge was open.
         ====================================================== */

      const accountContext =
        await getAccountContextForUser(
          user.id
        );

      const validation =
        validateAccountCanLogin(
          user,
          accountContext
        );

      if (
        !validation.allowed
      ) {
        await markLoginChallengeUsed(
          challenge.id
        ).catch(
          () =>
            undefined
        );

        await safeRecordLoginHistory({
          request,

          userId:
            user.id,

          successful:
            false,

          failureReason:
            validation.code,

          metadata: {
            email,

            twoFactor:
              true,

            next:
              validation.next ||
              null,
          },
        });

        await safeRecordAuthEvent({
          request,

          userId:
            user.id,

          tenantId:
            accountContext
              .tenant?.id ||
            null,

          eventType:
            'TWO_FACTOR_LOGIN_BLOCKED',

          entityType:
            'user',

          entityId:
            user.id,

          metadata: {
            reason:
              validation.code,

            email,
          },
        });

        return errorResponse(
          validation
            .httpStatus,
          validation.code,
          validation.message,
          {
            next:
              validation.next,
          }
        );
      }

      /* ======================================================
         11. REVALIDATE CURRENT 2FA METHODS

         Do not trust the methods returned earlier by
         /api/auth/login.

         They may have changed while this challenge remained
         open.
         ====================================================== */

      const verification =
        await getLoginTwoFactorMethods(
          challenge.user_id
        );

      /*
       * If every second-factor method was removed while this
       * challenge was open, do not silently downgrade the
       * already-created challenge into password-only login.
       *
       * Invalidate it and require a fresh sign-in.
       */
      if (
        !verification.required
      ) {
        await markLoginChallengeUsed(
          challenge.id
        ).catch(
          () =>
            undefined
        );

        return challengeExpiredResponse();
      }

      /* ======================================================
         12. RESOLVE SELECTED METHOD
         ====================================================== */

      selectedMethod =
        resolveVerificationMethod({
          requestedMethod,

          methodWasSupplied,

          methods:
            verification
              .methods,

          preferredMethod:
            verification
              .preferredMethod,

          recoveryAvailable:
            verification
              .recoveryAvailable,
        });

      if (
        !selectedMethod
      ) {
        return errorResponse(
          400,
          'TWO_FACTOR_METHOD_REQUIRED',
          'Choose a verification method.',
          {
            verification: {
              methods:
                verification
                  .methods,

              preferredMethod:
                verification
                  .preferredMethod,

              maskedEmail:
                verification
                  .maskedEmail,

              recoveryAvailable:
                verification
                  .recoveryAvailable,
            },
          }
        );
      }

      /* ======================================================
         13. VERIFY METHOD IS STILL AVAILABLE
         ====================================================== */

      if (
        !isVerificationMethodAvailable(
          selectedMethod,
          {
            methods:
              verification
                .methods,

            recoveryAvailable:
              verification
                .recoveryAvailable,
          }
        )
      ) {
        await safeRecordAuthEvent({
          request,

          userId:
            challenge.user_id,

          tenantId:
            accountContext
              .tenant?.id ||
            null,

          eventType:
            'TWO_FACTOR_METHOD_UNAVAILABLE',

          entityType:
            'user',

          entityId:
            challenge.user_id,

          metadata: {
            requestedMethod:
              selectedMethod,

            availableMethods:
              verification
                .methods,

            recoveryAvailable:
              verification
                .recoveryAvailable,
          },
        });

        return methodUnavailableResponse({
          methods:
            verification
              .methods,

          preferredMethod:
            verification
              .preferredMethod,

          maskedEmail:
            verification
              .maskedEmail,

          recoveryAvailable:
            verification
              .recoveryAvailable,
        });
      }

      /* ======================================================
         14. VERIFY SECOND FACTOR
         ====================================================== */

      let secondFactorValid =
        false;

      /* ------------------------------------------------------
         EMAIL OTP
         ------------------------------------------------------ */

      if (
        selectedMethod ===
        'email'
      ) {
        const emailResult =
          await verifyEmailTwoFactorCode({
            userId:
              challenge.user_id,

            purpose:
              'login_2fa',

            /*
             * Must match the exact context used by
             * /api/auth/login/2fa/email/send.
             */
            context:
              challengeToken,

            code,
          });

        if (
          !emailResult.success
        ) {
          await safeRecordLoginHistory({
            request,

            userId:
              challenge.user_id,

            successful:
              false,

            failureReason:
              'invalid_two_factor_code',

            metadata: {
              email,

              twoFactor:
                true,

              method:
                'email',

              reason:
                emailResult.reason,

              attemptsRemaining:
                emailResult
                  .attemptsRemaining,
            },
          });

          await safeRecordAuthEvent({
            request,

            userId:
              challenge.user_id,

            tenantId:
              accountContext
                .tenant?.id ||
              null,

            eventType:
              'TWO_FACTOR_FAILED',

            entityType:
              'user',

            entityId:
              challenge.user_id,

            metadata: {
              email,

              method:
                'email',

              reason:
                emailResult.reason,

              attemptsRemaining:
                emailResult
                  .attemptsRemaining,
            },
          });

          /*
           * If the account itself became unavailable, this
           * challenge should not remain reusable.
           */
          if (
            emailResult.reason ===
              'account_unavailable'
          ) {
            await markLoginChallengeUsed(
              challenge.id
            ).catch(
              () =>
                undefined
            );
          }

          /*
           * If the account email changed, require a completely
           * fresh password login rather than continuing a
           * challenge created for the previous email identity.
           */
          if (
            emailResult.reason ===
              'email_changed'
          ) {
            await markLoginChallengeUsed(
              challenge.id
            ).catch(
              () =>
                undefined
            );
          }

          return emailVerificationFailureResponse(
            emailResult,
            {
              methods:
                verification
                  .methods,

              preferredMethod:
                verification
                  .preferredMethod,

              maskedEmail:
                verification
                  .maskedEmail,

              recoveryAvailable:
                verification
                  .recoveryAvailable,
            }
          );
        }

        secondFactorValid =
          true;
      }

      /* ------------------------------------------------------
         AUTHENTICATOR
         ------------------------------------------------------ */

      if (
        selectedMethod ===
        'authenticator'
      ) {
        /*
         * verifyUserTwoFactorCode() currently understands both:
         *
         * - TOTP
         * - Recovery codes
         *
         * For an explicit Authenticator request the normal
         * six-digit TOTP path succeeds.
         *
         * Recovery remains separately exposed to the UI below
         * as an emergency method.
         */
        secondFactorValid =
          await verifyUserTwoFactorCode({
            userId:
              challenge.user_id,

            code,
          });
      }

      /* ------------------------------------------------------
         RECOVERY CODE
         ------------------------------------------------------ */

      if (
        selectedMethod ===
        'recovery'
      ) {
        /*
         * Recovery codes are account-level emergency fallback
         * credentials.
         *
         * verifyUserTwoFactorCode() already consumes a matching
         * recovery code one time.
         */
        secondFactorValid =
          await verifyUserTwoFactorCode({
            userId:
              challenge.user_id,

            code,
          });
      }

      /* ======================================================
         15. INVALID AUTHENTICATOR / RECOVERY
         ====================================================== */

      if (
        !secondFactorValid
      ) {
        await safeRecordLoginHistory({
          request,

          userId:
            challenge.user_id,

          successful:
            false,

          failureReason:
            'invalid_two_factor_code',

          metadata: {
            email,

            twoFactor:
              true,

            method:
              selectedMethod,
          },
        });

        await safeRecordAuthEvent({
          request,

          userId:
            challenge.user_id,

          tenantId:
            accountContext
              .tenant?.id ||
            null,

          eventType:
            'TWO_FACTOR_FAILED',

          entityType:
            'user',

          entityId:
            challenge.user_id,

          metadata: {
            email,

            method:
              selectedMethod,
          },
        });

        return errorResponse(
          400,
          selectedMethod ===
            'recovery'
            ? 'INVALID_RECOVERY_CODE'
            : 'INVALID_TWO_FACTOR_CODE',
          selectedMethod ===
            'recovery'
            ? 'Invalid or already-used recovery code.'
            : 'Invalid authenticator verification code.'
        );
      }

      /* ======================================================
         16. DETERMINE SESSION PERSISTENCE
         ====================================================== */

      const rememberMe =
        resolveRememberMe(
          challenge,
          body.rememberMe
        );

      /* ======================================================
         17. CONSUME LOGIN CHALLENGE

         At this point:

           password ✓
           account ✓
           workspace ✓
           selected second factor ✓

         The advisory lock ensures only one request can reach
         this point for this challenge at a time.
         ====================================================== */

      await markLoginChallengeUsed(
        challenge.id
      );

      /* ======================================================
         18. CREATE AUTHENTICATED SESSION

         No session existed before successful second-factor
         verification.
         ====================================================== */

      const session =
        await createSession(
          challenge.user_id,
          request,
          {
            rememberMe,
          }
        );

      /* ======================================================
         19. CLEAR LOGIN SECURITY STATE
         ====================================================== */

      await clearSuccessfulLoginState(
        challenge.user_id
      ).catch(
        (
          error
        ) => {
          console.error(
            '[Auth] Failed to clear login state after 2FA:',
            error
          );
        }
      );

      /* ------------------------------------------------------
         Original password-login limiter
         ------------------------------------------------------ */

      const loginRateKey =
        loginRateIdentifier(
          request,
          email
        );

      await resetRateLimit(
        loginRateKey,
        'login'
      ).catch(
        (
          error
        ) => {
          console.error(
            '[Auth] Failed to reset password login rate limit after 2FA:',
            error
          );
        }
      );

      /* ------------------------------------------------------
         Challenge-specific second-factor limiter
         ------------------------------------------------------ */

      await resetRateLimit(
        twoFactorRateKey,
        'login'
      ).catch(
        (
          error
        ) => {
          console.error(
            '[Auth] Failed to reset 2FA rate limit:',
            error
          );
        }
      );

      /* ======================================================
         20. LOGIN HISTORY
         ====================================================== */

      await safeRecordLoginHistory({
        request,

        userId:
          challenge.user_id,

        sessionId:
          session.sessionId,

        successful:
          true,

        metadata: {
          email,

          twoFactor:
            true,

          twoFactorMethod:
            selectedMethod,

          rememberMe,
        },
      });

      /* ======================================================
         21. SECURITY AUDIT
         ====================================================== */

      await safeRecordAuthEvent({
        request,

        userId:
          challenge.user_id,

        tenantId:
          accountContext
            .tenant?.id ||
          null,

        eventType:
          'TWO_FACTOR_LOGIN_SUCCESS',

        entityType:
          'session',

        entityId:
          session.sessionId,

        metadata: {
          email,

          method:
            selectedMethod,

          rememberMe,

          accessLevel:
            accountContext
              .membership
              ?.accessLevel ||
            null,
        },
      });

      /* ======================================================
         22. SUCCESS

         Do not force /dashboard here.

         The login client already preserves the destination
         across password → 2FA.
         ====================================================== */

      return jsonResponse({
        success:
          true,

        code:
          'LOGIN_SUCCESS',

        message:
          'Login successful.',

        verificationMethod:
          selectedMethod,

        tenant:
          accountContext
            .tenant,

        owner:
          accountContext
            .owner,

        membership:
          accountContext
            .membership,

        subscription:
          accountContext
            .subscription,

        role:
          accountContext
            .role,

        modules:
          accountContext
            .modules,

        session: {
          id:
            session
              .sessionId,

          expiresAt:
            session
              .expiresAt
              .toISOString(),
        },
      });
    } finally {
      /* ======================================================
         RELEASE CHALLENGE ADVISORY LOCK
         ====================================================== */

      if (
        challengeLockAcquired
      ) {
        try {
          await controlClient.query(
            `
              SELECT pg_advisory_unlock(
                hashtext($1)::bigint
              )
            `,
            [
              challengeLockKey,
            ]
          );
        } catch (
          unlockError
        ) {
          console.error(
            '[Auth] Failed to release 2FA challenge lock:',
            unlockError
          );
        }
      }

      controlClient.release();
    }
  } catch (
    error
  ) {
    /*
     * Never log:
     * - verification code
     * - recovery code
     * - raw challenge token
     */
    console.error(
      '[Auth] 2FA login failed:',
      error
    );

    await safeRecordAuthEvent({
      request,

      eventType:
        'TWO_FACTOR_LOGIN_ERROR',

      metadata: {
        email,

        method:
          selectedMethod,

        message:
          error instanceof
            Error
            ? error.message
            : 'Unknown two-factor login error',
      },
    });

    return errorResponse(
      500,
      'TWO_FACTOR_LOGIN_ERROR',
      'Could not complete login verification.'
    );
  }
}