import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { queryControl } from '@/lib/db/control';

import { createSession } from '@/lib/auth/session';

import { verifyPassword } from '@/lib/auth/password';

import { getTwoFactorStatus } from '@/lib/auth/two-factor';

import { createLoginChallenge } from '@/lib/auth/login-challenges';

import {
  findUserForLogin,
  getAccountContextForUser,
  validateAccountCanLogin,
} from '@/lib/auth/account-context';

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
const MAX_PASSWORD_LENGTH = 128;

const LOGIN_RATE_LIMIT_MAX_ATTEMPTS =
  getPositiveIntegerEnv(
    'AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS',
    8
  );

const LOGIN_RATE_LIMIT_WINDOW_MS =
  getPositiveIntegerEnv(
    'AUTH_LOGIN_RATE_LIMIT_WINDOW_MS',
    15 * 60 * 1000
  );

const LOGIN_RATE_LIMIT_BLOCK_MS =
  getPositiveIntegerEnv(
    'AUTH_LOGIN_RATE_LIMIT_BLOCK_MS',
    15 * 60 * 1000
  );

const ACCOUNT_LOCK_MAX_ATTEMPTS =
  getPositiveIntegerEnv(
    'AUTH_ACCOUNT_LOCK_MAX_ATTEMPTS',
    5
  );

const ACCOUNT_LOCK_MINUTES =
  getPositiveIntegerEnv(
    'AUTH_ACCOUNT_LOCK_MINUTES',
    15
  );

/* ============================================================
   TYPES
   ============================================================ */

type LoginBody = {
  email?: unknown;
  password?: unknown;
  rememberMe?: unknown;
  next?: unknown;
};

type SecurityState = {
  failed_login_attempts:
    | number
    | string
    | null;

  locked_until:
    | Date
    | string
    | null;
};

/* ============================================================
   CONFIGURATION
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
   INPUT
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

function normalizePassword(
  value: unknown
): string {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  /*
   * Passwords are NEVER trimmed.
   *
   * Leading/trailing spaces may legitimately be part
   * of a user's password.
   */
  return value;
}

function isValidEmail(
  email: string
): boolean {
  return (
    email.length > 0 &&
    email.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

/* ============================================================
   SAFE DESTINATION
   ============================================================ */

function safeNextPath(
  value?: string | null
): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/dashboard';
  }

  if (
    value.startsWith('/api/')
  ) {
    return '/dashboard';
  }

  const blockedRoutes = [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/google-complete',
    '/select-apps',
    '/select-plan',
  ];

  if (
    blockedRoutes.some(
      (route) =>
        value === route ||
        value.startsWith(
          `${route}?`
        ) ||
        value.startsWith(
          `${route}/`
        )
    )
  ) {
    return '/dashboard';
  }

  return value;
}

function getRequestedNext(
  request: NextRequest,
  bodyValue: unknown
): string {
  /* ----------------------------------------------------------
     Explicit client-provided next
     ---------------------------------------------------------- */

  if (
    typeof bodyValue === 'string'
  ) {
    const next =
      safeNextPath(
        bodyValue
      );

    if (
      next !== '/dashboard' ||
      bodyValue ===
        '/dashboard'
    ) {
      return next;
    }
  }

  /* ----------------------------------------------------------
     Backwards-compatible login page:
     /login?next=/settings
     ---------------------------------------------------------- */

  const referer =
    request.headers.get(
      'referer'
    );

  if (referer) {
    try {
      const url =
        new URL(referer);

      if (
        url.origin ===
        request.nextUrl.origin
      ) {
        const requested =
          url.searchParams.get(
            'next'
          );

        if (requested) {
          return safeNextPath(
            requested
          );
        }
      }
    } catch {
      // Ignore invalid Referer.
    }
  }

  return '/dashboard';
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
  extraHeaders: Record<
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

        ...extraHeaders,
      },
    }
  );
}

function genericInvalidCredentialsResponse() {
  return jsonResponse(
    {
      success: false,

      code:
        'INVALID_CREDENTIALS',

      error:
        'Invalid email or password.',
    },
    401
  );
}

function lockedResponse(
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

  return jsonResponse(
    {
      success: false,

      code:
        'ACCOUNT_LOCKED',

      error:
        'Too many failed login attempts. Please try again later or reset your password.',

      lockedUntil:
        lockedUntil.toISOString(),

      retryAfterSeconds,
    },
    423,
    {
      'Retry-After':
        String(
          retryAfterSeconds
        ),
    }
  );
}

/* ============================================================
   RATE LIMIT
   ============================================================ */

function rateLimitIdentifier(
  request: NextRequest,
  email: string
): string {
  const ip =
    getClientIp(request) ||
    'unknown-ip';

  return `login:${email}:${ip}`;
}

/* ============================================================
   SECURITY STATE
   ============================================================ */

async function getUserSecurityState(
  userId: string
): Promise<
  SecurityState | null
> {
  const result =
    await queryControl(
      `
        SELECT
          failed_login_attempts,
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

/* ============================================================
   EXPIRED LOCK
   ============================================================ */

async function clearExpiredAccountLock(
  userId: string
) {
  await queryControl(
    `
      UPDATE users

      SET
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()

      WHERE id = $1
        AND deleted_at IS NULL
        AND locked_until IS NOT NULL
        AND locked_until <= NOW()
    `,
    [
      userId,
    ]
  );
}

/* ============================================================
   FAILED PASSWORD
   ============================================================ */

async function recordFailedPasswordAttempt(
  userId: string
) {
  const lockUntil =
    new Date(
      Date.now() +
        ACCOUNT_LOCK_MINUTES *
          60 *
          1000
    );

  const result =
    await queryControl(
      `
        UPDATE users

        SET
          failed_login_attempts =
            COALESCE(
              failed_login_attempts,
              0
            ) + 1,

          locked_until =
            CASE
              WHEN
                COALESCE(
                  failed_login_attempts,
                  0
                ) + 1 >= $2
              THEN $3
              ELSE locked_until
            END,

          updated_at = NOW()

        WHERE id = $1
          AND deleted_at IS NULL

        RETURNING
          failed_login_attempts,
          locked_until
      `,
      [
        userId,
        ACCOUNT_LOCK_MAX_ATTEMPTS,
        lockUntil,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

/* ============================================================
   SUCCESSFUL PASSWORD LOGIN STATE
   ============================================================ */

async function clearFailedLoginState(
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
   SAFE SECURITY LOGGING
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
      '[Auth] Failed to record auth event:',
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
      '[Auth] Failed to record login history:',
      error
    );
  }
}

/* ============================================================
   POST /api/auth/login
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  let email = '';

  try {
    /* ========================================================
       1. REQUEST
       ======================================================== */

    let body:
      LoginBody;

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
        parsed as LoginBody;
    } catch {
      return jsonResponse(
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

    /* ========================================================
       2. NORMALIZE
       ======================================================== */

    email =
      normalizeEmail(
        body.email
      );

    const password =
      normalizePassword(
        body.password
      );

    /*
     * Strict boolean comparison.
     *
     * Boolean("false") would incorrectly produce true.
     */
    const rememberMe =
      body.rememberMe ===
      true;

    const requestedNext =
      getRequestedNext(
        request,
        body.next
      );

    /* ========================================================
       3. VALIDATION
       ======================================================== */

    if (
      !isValidEmail(
        email
      )
    ) {
      return jsonResponse(
        {
          success: false,

          code:
            'INVALID_EMAIL',

          error:
            'Enter a valid email address.',
        },
        400
      );
    }

    if (!password) {
      return jsonResponse(
        {
          success: false,

          code:
            'PASSWORD_REQUIRED',

          error:
            'Password is required.',
        },
        400
      );
    }

    if (
      password.length >
      MAX_PASSWORD_LENGTH
    ) {
      /*
       * Keep the response generic.
       *
       * The browser UI already enforces the same maximum,
       * while this protects the server from unreasonable input.
       */
      return genericInvalidCredentialsResponse();
    }

    /* ========================================================
       4. REQUEST RATE LIMIT
       ======================================================== */

    const rateKey =
      rateLimitIdentifier(
        request,
        email
      );

    const rateLimit =
      await checkRateLimit({
        identifier:
          rateKey,

        action:
          'login',

        maxAttempts:
          LOGIN_RATE_LIMIT_MAX_ATTEMPTS,

        windowMs:
          LOGIN_RATE_LIMIT_WINDOW_MS,

        blockMs:
          LOGIN_RATE_LIMIT_BLOCK_MS,
      });

    if (
      !rateLimit.allowed
    ) {
      await safeRecordAuthEvent({
        request,

        eventType:
          'LOGIN_RATE_LIMITED',

        metadata: {
          email,

          retryAfterSeconds:
            rateLimit.retryAfterSeconds,
        },
      });

      return jsonResponse(
        {
          success: false,

          code:
            'LOGIN_RATE_LIMITED',

          error:
            'Too many login attempts. Please wait before trying again.',

          retryAfterSeconds:
            rateLimit.retryAfterSeconds,
        },
        429,
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
       5. FIND USER

       Unknown account and wrong password deliberately produce
       the same client-visible response.
       ======================================================== */

    const user =
      await findUserForLogin(
        email
      );

    if (!user) {
      await safeRecordLoginHistory({
        request,

        successful:
          false,

        failureReason:
          'user_not_found',

        metadata: {
          email,
        },
      });

      await safeRecordAuthEvent({
        request,

        eventType:
          'LOGIN_FAILED',

        metadata: {
          reason:
            'user_not_found',

          email,
        },
      });

      return genericInvalidCredentialsResponse();
    }

    /* ========================================================
       6. ACCOUNT LOCK
       ======================================================== */

    const securityState =
      await getUserSecurityState(
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
        )
      ) {
        if (
          lockedUntil.getTime() >
          Date.now()
        ) {
          await safeRecordLoginHistory({
            request,

            userId:
              user.id,

            successful:
              false,

            failureReason:
              'account_locked',

            metadata: {
              email,

              lockedUntil:
                lockedUntil.toISOString(),
            },
          });

          await safeRecordAuthEvent({
            request,

            userId:
              user.id,

            eventType:
              'LOGIN_BLOCKED_ACCOUNT_LOCKED',

            entityType:
              'user',

            entityId:
              user.id,

            metadata: {
              email,

              lockedUntil:
                lockedUntil.toISOString(),
            },
          });

          return lockedResponse(
            lockedUntil
          );
        }

        /*
         * The lock period has expired.
         *
         * Reset the old failed-attempt count before this new
         * authentication attempt.
         */
        await clearExpiredAccountLock(
          user.id
        );
      }
    }

    /* ========================================================
       7. VERIFY PASSWORD
       ======================================================== */

    const passwordMatches =
      await verifyPassword(
        password,
        user.passwordHash
      );

    if (
      !passwordMatches
    ) {
      const failedState =
        await recordFailedPasswordAttempt(
          user.id
        );

      await safeRecordLoginHistory({
        request,

        userId:
          user.id,

        successful:
          false,

        failureReason:
          'invalid_password',

        metadata: {
          email,

          failedLoginAttempts:
            failedState
              ?.failed_login_attempts ??
            null,
        },
      });

      await safeRecordAuthEvent({
        request,

        userId:
          user.id,

        eventType:
          'LOGIN_FAILED',

        entityType:
          'user',

        entityId:
          user.id,

        metadata: {
          reason:
            'invalid_password',

          email,

          failedLoginAttempts:
            failedState
              ?.failed_login_attempts ??
            null,
        },
      });

      /* ------------------------------------------------------
         Account became locked on this attempt
         ------------------------------------------------------ */

      if (
        failedState?.locked_until
      ) {
        const lockedUntil =
          new Date(
            failedState.locked_until
          );

        if (
          !Number.isNaN(
            lockedUntil.getTime()
          ) &&
          lockedUntil.getTime() >
            Date.now()
        ) {
          await safeRecordAuthEvent({
            request,

            userId:
              user.id,

            eventType:
              'ACCOUNT_LOCKED',

            entityType:
              'user',

            entityId:
              user.id,

            metadata: {
              reason:
                'too_many_failed_logins',

              failedLoginAttempts:
                failedState.failed_login_attempts,

              lockedUntil:
                lockedUntil.toISOString(),
            },
          });

          return lockedResponse(
            lockedUntil
          );
        }
      }

      return genericInvalidCredentialsResponse();
    }

    /* ========================================================
       8. ACCOUNT / WORKSPACE / SUBSCRIPTION CONTEXT
       ======================================================== */

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
          'LOGIN_BLOCKED',

        entityType:
          'user',

        entityId:
          user.id,

        metadata: {
          reason:
            validation.code,

          email,

          next:
            validation.next ||
            null,
        },
      });

      return jsonResponse(
        {
          success: false,

          code:
            validation.code,

          error:
            validation.message,

          next:
            validation.next,
        },
        validation.httpStatus
      );
    }

    /* ========================================================
       9. TWO-FACTOR AUTHENTICATION
       ======================================================== */

    const twoFactorStatus =
      await getTwoFactorStatus(
        user.id
      );

    if (
      twoFactorStatus.enabled
    ) {
      /*
       * Password authentication has succeeded, but DO NOT
       * create a SaMi session yet.
       *
       * The 2FA API becomes responsible for session creation
       * after the challenge is satisfied.
       */
      const challenge =
        await createLoginChallenge({
          userId:
            user.id,

          email,

          rememberMe,
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
          'TWO_FACTOR_REQUIRED',

        entityType:
          'user',

        entityId:
          user.id,

        metadata: {
          email,

          rememberMe,

          intendedNext:
            requestedNext,

          challengeExpiresAt:
            challenge.expiresAt.toISOString(),
        },
      });

      return jsonResponse(
        {
          success: false,

          code:
            'TWO_FACTOR_REQUIRED',

          message:
            'Two-factor verification is required.',

          email,

          challengeToken:
            challenge.challengeToken,

          /*
           * LoginClient navigates here and keeps the original
           * requested destination separately in
           * sami_2fa_next.
           */
          next:
            '/login/two-factor',
        },
        403
      );
    }

    /* ========================================================
       10. CREATE SESSION
       ======================================================== */

    const session =
      await createSession(
        user.id,
        request,
        {
          rememberMe,
        }
      );

    /*
     * These operations should normally succeed, but an audit
     * or cleanup failure must not invalidate a session that
     * has already been successfully created.
     */

    await clearFailedLoginState(
      user.id
    ).catch(
      (error) => {
        console.error(
          '[Auth] Failed to clear successful login state:',
          error
        );
      }
    );

    await resetRateLimit(
      rateKey,
      'login'
    ).catch(
      (error) => {
        console.error(
          '[Auth] Failed to reset login rate limit:',
          error
        );
      }
    );

    /* ========================================================
       11. LOGIN HISTORY
       ======================================================== */

    await safeRecordLoginHistory({
      request,

      userId:
        user.id,

      sessionId:
        session.sessionId,

      successful:
        true,

      metadata: {
        email,

        rememberMe,

        next:
          requestedNext,
      },
    });

    /* ========================================================
       12. AUDIT
       ======================================================== */

    await safeRecordAuthEvent({
      request,

      userId:
        user.id,

      tenantId:
        accountContext
          .tenant?.id ||
        null,

      eventType:
        'LOGIN_SUCCESS',

      entityType:
        'session',

      entityId:
        session.sessionId,

      metadata: {
        email,

        rememberMe,

        next:
          requestedNext,

        accessLevel:
          accountContext
            .membership
            ?.accessLevel ||
          null,
      },
    });

    /* ========================================================
       13. SUCCESS
       ======================================================== */

    return jsonResponse({
      success: true,

      code:
        'LOGIN_SUCCESS',

      message:
        'Login successful.',

      user: {
        id:
          user.id,

        email:
          user.email,

        fullName:
          user.fullName,

        firstName:
          user.firstName,

        lastName:
          user.lastName,

        avatarFileId:
          user.avatarFileId,
      },

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

      next:
        requestedNext,
    });
  } catch (error) {
    console.error(
      '[Auth] Login failed:',
      error
    );

    await safeRecordAuthEvent({
      request,

      eventType:
        'LOGIN_ERROR',

      metadata: {
        email,

        message:
          error instanceof Error
            ? error.message
            : 'Unknown login error',
      },
    });

    return jsonResponse(
      {
        success: false,

        code:
          'LOGIN_ERROR',

        error:
          'Login failed. Please try again.',
      },
      500
    );
  }
}