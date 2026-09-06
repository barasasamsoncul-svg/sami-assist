import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { createSession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
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

const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = Number(
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS || 8
);

const LOGIN_RATE_LIMIT_WINDOW_MS = Number(
  process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000
);

const LOGIN_RATE_LIMIT_BLOCK_MS = Number(
  process.env.AUTH_LOGIN_RATE_LIMIT_BLOCK_MS || 15 * 60 * 1000
);

const ACCOUNT_LOCK_MAX_ATTEMPTS = Number(
  process.env.AUTH_ACCOUNT_LOCK_MAX_ATTEMPTS || 5
);

const ACCOUNT_LOCK_MINUTES = Number(
  process.env.AUTH_ACCOUNT_LOCK_MINUTES || 15
);

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizePassword(value: unknown): string {
  return String(value || '');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function genericInvalidCredentialsResponse() {
  return NextResponse.json(
    {
      success: false,
      error: 'Invalid email or password.',
      code: 'INVALID_CREDENTIALS',
    },
    { status: 401 }
  );
}

function rateLimitIdentifier(
  request: NextRequest,
  email: string
): string {
  const ip = getClientIp(request) || 'unknown-ip';

  return `login:${email}:${ip}`;
}

async function getUserSecurityState(userId: string) {
  const result = await queryControl(
    `
      SELECT
        failed_login_attempts,
        locked_until
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function recordFailedPasswordAttempt(userId: string) {
  const lockUntil = new Date(
    Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000
  );

  const result = await queryControl(
    `
      UPDATE users
      SET
        failed_login_attempts = failed_login_attempts + 1,
        locked_until =
          CASE
            WHEN failed_login_attempts + 1 >= $2
            THEN $3
            ELSE locked_until
          END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING failed_login_attempts, locked_until
    `,
    [userId, ACCOUNT_LOCK_MAX_ATTEMPTS, lockUntil]
  );

  return result.rows[0] || null;
}

async function clearFailedLoginState(userId: string) {
  await queryControl(
    `
      UPDATE users
      SET
        failed_login_attempts = 0,
        locked_until = NULL,
        last_login_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [userId]
  );
}

function lockedResponse(lockedUntil: Date) {
  return NextResponse.json(
    {
      success: false,
      error:
        'Too many failed login attempts. Please try again later or reset your password.',
      code: 'ACCOUNT_LOCKED',
      lockedUntil: lockedUntil.toISOString(),
    },
    { status: 423 }
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const email = normalizeEmail(body.email);
  const password = normalizePassword(body.password);
  const rememberMe = Boolean(body.rememberMe);

  if (!isValidEmail(email)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Enter a valid email address.',
        code: 'INVALID_EMAIL',
      },
      { status: 400 }
    );
  }

  if (!password) {
    return NextResponse.json(
      {
        success: false,
        error: 'Password is required.',
        code: 'PASSWORD_REQUIRED',
      },
      { status: 400 }
    );
  }

  const rateKey = rateLimitIdentifier(request, email);

  const rateLimit = await checkRateLimit({
    identifier: rateKey,
    action: 'login',
    maxAttempts: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    blockMs: LOGIN_RATE_LIMIT_BLOCK_MS,
  });

  if (!rateLimit.allowed) {
    await recordAuthEvent({
      request,
      eventType: 'LOGIN_RATE_LIMITED',
      metadata: {
        email,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });

    return NextResponse.json(
      {
        success: false,
        error:
          'Too many login attempts. Please wait before trying again.',
        code: 'LOGIN_RATE_LIMITED',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  try {
    const user = await findUserForLogin(email);

    if (!user) {
      await recordLoginHistory({
        request,
        successful: false,
        failureReason: 'user_not_found',
        metadata: { email },
      });

      await recordAuthEvent({
        request,
        eventType: 'LOGIN_FAILED',
        metadata: {
          reason: 'user_not_found',
          email,
        },
      });

      return genericInvalidCredentialsResponse();
    }

    const securityState = await getUserSecurityState(user.id);

    if (securityState?.locked_until) {
      const lockedUntil = new Date(securityState.locked_until);

      if (lockedUntil.getTime() > Date.now()) {
        await recordLoginHistory({
          request,
          userId: user.id,
          successful: false,
          failureReason: 'account_locked',
          metadata: {
            email,
            lockedUntil: lockedUntil.toISOString(),
          },
        });

        await recordAuthEvent({
          request,
          userId: user.id,
          eventType: 'LOGIN_BLOCKED_ACCOUNT_LOCKED',
          entityType: 'user',
          entityId: user.id,
          metadata: {
            email,
            lockedUntil: lockedUntil.toISOString(),
          },
        });

        return lockedResponse(lockedUntil);
      }
    }

    const passwordMatches = await verifyPassword(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      const failedState =
        await recordFailedPasswordAttempt(user.id);

      await recordLoginHistory({
        request,
        userId: user.id,
        successful: false,
        failureReason: 'invalid_password',
        metadata: {
          email,
          failedLoginAttempts:
            failedState?.failed_login_attempts || null,
        },
      });

      await recordAuthEvent({
        request,
        userId: user.id,
        eventType: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: user.id,
        metadata: {
          reason: 'invalid_password',
          email,
          failedLoginAttempts:
            failedState?.failed_login_attempts || null,
        },
      });

      if (failedState?.locked_until) {
        const lockedUntil = new Date(failedState.locked_until);

        if (lockedUntil.getTime() > Date.now()) {
          await recordAuthEvent({
            request,
            userId: user.id,
            eventType: 'ACCOUNT_LOCKED',
            entityType: 'user',
            entityId: user.id,
            metadata: {
              reason: 'too_many_failed_logins',
              failedLoginAttempts:
                failedState.failed_login_attempts,
              lockedUntil: lockedUntil.toISOString(),
            },
          });

          return lockedResponse(lockedUntil);
        }
      }

      return genericInvalidCredentialsResponse();
    }

    const accountContext =
      await getAccountContextForUser(user.id);

    const validation = validateAccountCanLogin(
      user,
      accountContext
    );

    if (!validation.allowed) {
      await recordLoginHistory({
        request,
        userId: user.id,
        successful: false,
        failureReason: validation.code,
        metadata: {
          email,
          next: validation.next || null,
        },
      });

      await recordAuthEvent({
        request,
        userId: user.id,
        tenantId: accountContext.tenant?.id || null,
        eventType: 'LOGIN_BLOCKED',
        entityType: 'user',
        entityId: user.id,
        metadata: {
          reason: validation.code,
          email,
          next: validation.next || null,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: validation.message,
          code: validation.code,
          next: validation.next,
        },
        { status: validation.httpStatus }
      );
    }

    const session = await createSession(user.id, request, {
      rememberMe,
    });

    await clearFailedLoginState(user.id);
    await resetRateLimit(rateKey, 'login');

    await recordLoginHistory({
      request,
      userId: user.id,
      sessionId: session.sessionId,
      successful: true,
      metadata: {
        email,
        rememberMe,
      },
    });

    await recordAuthEvent({
      request,
      userId: user.id,
      tenantId: accountContext.tenant?.id || null,
      eventType: 'LOGIN_SUCCESS',
      entityType: 'session',
      entityId: session.sessionId,
      metadata: {
        email,
        rememberMe,
        accessLevel:
          accountContext.membership?.accessLevel || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Login successful.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarFileId: user.avatarFileId,
      },
      tenant: accountContext.tenant,
      owner: accountContext.owner,
      membership: accountContext.membership,
      subscription: accountContext.subscription,
      role: accountContext.role,
      modules: accountContext.modules,
      session: {
        id: session.sessionId,
        expiresAt: session.expiresAt.toISOString(),
      },
      next: '/dashboard',
    });
  } catch (error) {
    console.error('[Auth] Login failed:', error);

    await recordAuthEvent({
      request,
      eventType: 'LOGIN_ERROR',
      metadata: {
        email,
        message:
          error instanceof Error
            ? error.message
            : 'Unknown login error',
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Login failed. Please try again.',
        code: 'LOGIN_ERROR',
      },
      { status: 500 }
    );
  }
}