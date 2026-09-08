import {
  NextRequest,
  NextResponse,
} from 'next/server';

import crypto from 'crypto';

import {
  getControlPool,
  queryControl,
} from '@/lib/db/control';

import { createSession } from '@/lib/auth/session';

import {
  findUserForLogin,
  getAccountContextForUser,
  validateAccountCanLogin,
} from '@/lib/auth/account-context';

import {
  getValidLoginChallenge,
  markLoginChallengeUsed,
} from '@/lib/auth/login-challenges';

import { verifyUserTwoFactorCode } from '@/lib/auth/two-factor';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getClientIp,
  recordAuthEvent,
  recordLoginHistory,
} from '@/lib/auth/auth-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_EMAIL_LENGTH = 254;

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

type TwoFactorLoginBody = {
  email?: unknown;
  challengeToken?: unknown;
  code?: unknown;
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
  name: string,
  fallback: number
) {
  const value =
    Number(
      process.env[name]
    );

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return fallback;
  }

  return Math.floor(value);
}

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeEmail(
  value: unknown
): string {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value
    .trim()
    .toLowerCase();
}

function normalizeChallengeToken(
  value: unknown
): string {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value.trim();
}

function normalizeCode(
  value: unknown
): string {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  /*
   * Do not force numeric input here.
   *
   * verifyUserTwoFactorCode() also supports recovery
   * codes, which may contain letters or separators.
   */
  return value.trim();
}

function isValidEmail(
  value: string
) {
  return (
    value.length > 0 &&
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
  body: Record<
    string,
    unknown
  >,
  status = 200,
  headers: Record<
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
  status: number,
  code: string,
  error: string,
  extra: Record<
    string,
    unknown
  > = {},
  headers: Record<
    string,
    string
  > = {}
) {
  return jsonResponse(
    {
      success: false,
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
  value: string
) {
  return crypto
    .createHash('sha256')
    .update(
      value,
      'utf8'
    )
    .digest('hex');
}

function twoFactorRateIdentifier(
  request: NextRequest,
  challengeToken: string
) {
  const ip =
    getClientIp(request) ||
    'unknown-ip';

  /*
   * Never place the raw login challenge in rate-limit storage.
   */
  const challengeHash =
    hashValue(
      challengeToken
    );

  return `login-2fa:${challengeHash}:${ip}`;
}

/* ============================================================
   ORIGINAL LOGIN RATE KEY

   Must match /api/auth/login.
   ============================================================ */

function loginRateIdentifier(
  request: NextRequest,
  email: string
) {
  const ip =
    getClientIp(request) ||
    'unknown-ip';

  return `login:${email}:${ip}`;
}

/* ============================================================
   REMEMBER DEVICE

   Prefer the value stored with the server-side challenge.
   ============================================================ */

function resolveRememberMe(
  challenge: unknown,
  requestedValue: unknown
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
      typeof row.remember_me ===
      'boolean'
    ) {
      return row.remember_me;
    }

    if (
      typeof row.rememberMe ===
      'boolean'
    ) {
      return row.rememberMe;
    }
  }

  /*
   * Backwards compatibility if the current
   * login-challenges helper has not yet exposed
   * remember_me on its returned row.
   */
  return requestedValue === true;
}

/* ============================================================
   ACCOUNT LOCK
   ============================================================ */

async function getAccountSecurityState(
  userId: string
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
  lockedUntil: Date
) {
  const retryAfterSeconds =
    Math.max(
      1,
      Math.ceil(
        (
          lockedUntil.getTime() -
          Date.now()
        ) / 1000
      )
    );

  return errorResponse(
    423,
    'ACCOUNT_LOCKED',
    'This account is temporarily locked. Please try again later.',
    {
      lockedUntil:
        lockedUntil.toISOString(),

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
  userId: string
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
  input: Parameters<
    typeof recordAuthEvent
  >[0]
) {
  try {
    await recordAuthEvent(
      input
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to record 2FA auth event:',
      error
    );
  }
}

async function safeRecordLoginHistory(
  input: Parameters<
    typeof recordLoginHistory
  >[0]
) {
  try {
    await recordLoginHistory(
      input
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to record 2FA login history:',
      error
    );
  }
}

/* ============================================================
   POST /api/auth/login/2fa
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  let email = '';

  let challengeToken = '';

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
        parsed as TwoFactorLoginBody;
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
       4. LOAD LOGIN CHALLENGE
       ======================================================== */

    const initialChallenge =
      await getValidLoginChallenge({
        email,
        challengeToken,
      });

    if (!initialChallenge) {
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
         * Reuse the existing supported auth action.
         * The identifier itself separates password login
         * attempts from second-factor attempts.
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
       * The user must restart authentication after too many
       * second-factor attempts.
       */
      await markLoginChallengeUsed(
        initialChallenge.id
      ).catch(
        (error) => {
          console.error(
            '[Auth] Failed to invalidate rate-limited 2FA challenge:',
            error
          );
        }
      );

      await safeRecordAuthEvent({
        request,

        userId:
          initialChallenge.user_id,

        eventType:
          'TWO_FACTOR_RATE_LIMITED',

        entityType:
          'user',

        entityId:
          initialChallenge.user_id,

        metadata: {
          email,

          retryAfterSeconds:
            rateLimit.retryAfterSeconds,
        },
      });

      return errorResponse(
        429,
        'LOGIN_CHALLENGE_EXPIRED',
        'Too many verification attempts. Please sign in again.',
        {
          retryAfterSeconds:
            rateLimit.retryAfterSeconds,
        },
        {
          'Retry-After':
            String(
              Math.max(
                1,
                rateLimit.retryAfterSeconds ||
                  1
              )
            ),
        }
      );
    }

    /* ========================================================
       6. SERIALIZE CHALLENGE CONSUMPTION

       Two requests with the same valid TOTP must not be able
       to create two independent sessions.

       The advisory lock serializes this exact challenge.
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
         7. REVALIDATE AFTER LOCK

         Another request may have consumed the challenge while
         this request was waiting for the advisory lock.
         ====================================================== */

      const challenge =
        await getValidLoginChallenge({
          email,
          challengeToken,
        });

      if (!challenge) {
        return challengeExpiredResponse();
      }

      /* ======================================================
         8. BIND CHALLENGE TO USER
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
          () => undefined
        );

        return challengeExpiredResponse();
      }

      /* ======================================================
         9. CHECK ACCOUNT LOCK AGAIN

         Account state may have changed after the password was
         accepted but before the user submitted the second
         factor.
         ====================================================== */

      const securityState =
        await getAccountSecurityState(
          user.id
        );

      if (
        securityState?.locked_until
      ) {
        const lockedUntil =
          new Date(
            securityState.locked_until
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
            () => undefined
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
                lockedUntil.toISOString(),
            },
          });

          return accountLockedResponse(
            lockedUntil
          );
        }
      }

      /* ======================================================
         10. REVALIDATE ACCOUNT / WORKSPACE

         A workspace could have been suspended, deleted or had
         access revoked during the challenge lifetime.
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
          () => undefined
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
          validation.httpStatus,
          validation.code,
          validation.message,
          {
            next:
              validation.next,
          }
        );
      }

      /* ======================================================
         11. VERIFY AUTHENTICATOR / RECOVERY CODE
         ====================================================== */

      const validCode =
        await verifyUserTwoFactorCode({
          userId:
            challenge.user_id,

          code,
        });

      if (!validCode) {
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
          },
        });

        return errorResponse(
          400,
          'INVALID_TWO_FACTOR_CODE',
          'Invalid verification or recovery code.'
        );
      }

      /* ======================================================
         12. DETERMINE SESSION PERSISTENCE

         Server-side challenge value wins whenever the
         login-challenges helper exposes it.
         ====================================================== */

      const rememberMe =
        resolveRememberMe(
          challenge,
          body.rememberMe
        );

      /* ======================================================
         13. CONSUME CHALLENGE BEFORE CREATING SESSION

         At this point:
           password ✓
           account ✓
           workspace ✓
           second factor ✓

         Consuming before session creation closes the challenge
         replay window.
         ====================================================== */

      await markLoginChallengeUsed(
        challenge.id
      );

      /* ======================================================
         14. CREATE AUTHENTICATED SESSION
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
         15. CLEAR LOGIN SECURITY STATE
         ====================================================== */

      await clearSuccessfulLoginState(
        challenge.user_id
      ).catch(
        (error) => {
          console.error(
            '[Auth] Failed to clear login state after 2FA:',
            error
          );
        }
      );

      /*
       * Clear the original password-login rate limit.
       */
      const loginRateKey =
        loginRateIdentifier(
          request,
          email
        );

      await resetRateLimit(
        loginRateKey,
        'login'
      ).catch(
        (error) => {
          console.error(
            '[Auth] Failed to reset password login rate limit after 2FA:',
            error
          );
        }
      );

      /*
       * Clear the challenge-specific 2FA limiter.
       */
      await resetRateLimit(
        twoFactorRateKey,
        'login'
      ).catch(
        (error) => {
          console.error(
            '[Auth] Failed to reset 2FA rate limit:',
            error
          );
        }
      );

      /* ======================================================
         16. LOGIN HISTORY
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

          rememberMe,
        },
      });

      /* ======================================================
         17. AUDIT
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

          rememberMe,

          accessLevel:
            accountContext
              .membership
              ?.accessLevel ||
            null,
        },
      });

      /* ======================================================
         18. SUCCESS

         IMPORTANT:

         Do NOT return:
           next: '/dashboard'

         The new TwoFactorLoginClient already preserves the
         original destination in `sami_2fa_next`.

         By omitting next here, this works:

           /settings
              ↓
           login
              ↓
           2FA
              ↓
           /settings

         rather than forcing every 2FA login to Dashboard.
         ====================================================== */

      return jsonResponse({
        success: true,

        code:
          'LOGIN_SUCCESS',

        message:
          'Login successful.',

        tenant:
          accountContext.tenant,

        owner:
          accountContext.owner,

        membership:
          accountContext.membership,

        subscription:
          accountContext.subscription,

        role:
          accountContext.role,

        modules:
          accountContext.modules,

        session: {
          id:
            session.sessionId,

          expiresAt:
            session.expiresAt.toISOString(),
        },
      });
    } finally {
      /* ======================================================
         RELEASE CHALLENGE LOCK
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
        } catch (unlockError) {
          console.error(
            '[Auth] Failed to release 2FA challenge lock:',
            unlockError
          );
        }
      }

      controlClient.release();
    }
  } catch (error) {
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

        message:
          error instanceof Error
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