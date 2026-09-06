import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import {
  createSession,
  getSessionRequestMetadata,
} from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import {
  findUserForLogin,
  getAccountContextForUser,
  validateAccountCanLogin,
  type AccountContext,
  type AuthUserRecord,
} from '@/lib/auth/account-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LoginBody = {
  email?: unknown;
  password?: unknown;
  rememberMe?: unknown;
};

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function normalizePassword(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value;
}

function normalizeRememberMe(value: unknown): boolean {
  return value === true;
}

function jsonError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      success: false,
      code,
      message,
      ...(extra || {}),
    },
    { status }
  );
}

function publicUser(user: AuthUserRecord) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarFileId: user.avatarFileId,
    status: user.status,
  };
}

async function recordLoginHistory(params: {
  request: Request;
  userId: string | null;
  sessionId?: string | null;
  successful: boolean;
  failureReason?: string | null;
}): Promise<void> {
  try {
    const metadata =
      getSessionRequestMetadata(params.request);

    await queryControl(
      `
        INSERT INTO login_history (
          user_id,
          session_id,
          ip_address,
          user_agent,
          device_type,
          browser,
          operating_system,
          successful,
          failure_reason,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          NOW()
        )
      `,
      [
        params.userId,
        params.sessionId || null,
        metadata.ipAddress,
        metadata.userAgent,
        metadata.deviceType,
        metadata.browser,
        metadata.operatingSystem,
        params.successful,
        params.failureReason || null,
      ]
    );
  } catch (error) {
    /**
     * Login must not fail just because optional history tables
     * are not created yet.
     */
    console.error(
      '[Auth] Failed to record login history:',
      error
    );
  }
}

async function recordAuditEvent(params: {
  request: Request;
  userId: string;
  tenantId: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const requestMetadata =
      getSessionRequestMetadata(params.request);

    await queryControl(
      `
        INSERT INTO audit_logs (
          tenant_id,
          user_id,
          event_type,
          entity_type,
          entity_id,
          ip_address,
          user_agent,
          metadata,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'auth',
          $2,
          $4,
          $5,
          $6,
          NOW()
        )
      `,
      [
        params.tenantId,
        params.userId,
        params.eventType,
        requestMetadata.ipAddress,
        requestMetadata.userAgent,
        JSON.stringify(params.metadata || {}),
      ]
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to record audit event:',
      error
    );
  }
}

export async function POST(request: NextRequest) {
  let body: LoginBody;

  try {
    body = await request.json();
  } catch {
    return jsonError(
      400,
      'INVALID_JSON',
      'Invalid request body.'
    );
  }

  const email = normalizeEmail(body.email);
  const password = normalizePassword(body.password);
  const rememberMe = normalizeRememberMe(body.rememberMe);

  if (!email || !email.includes('@')) {
    return jsonError(
      400,
      'INVALID_EMAIL',
      'Please enter a valid email address.'
    );
  }

  if (!password) {
    return jsonError(
      400,
      'PASSWORD_REQUIRED',
      'Please enter your password.'
    );
  }

  try {
    const user = await findUserForLogin(email);

    if (!user) {
      await recordLoginHistory({
        request,
        userId: null,
        successful: false,
        failureReason: 'INVALID_CREDENTIALS',
      });

      return jsonError(
        401,
        'INVALID_CREDENTIALS',
        'Invalid email or password.'
      );
    }

    const passwordValid = await verifyPassword(
      password,
      user.passwordHash
    );

    if (!passwordValid) {
      await recordLoginHistory({
        request,
        userId: user.id,
        successful: false,
        failureReason: 'INVALID_CREDENTIALS',
      });

      await recordAuditEvent({
        request,
        userId: user.id,
        tenantId: null,
        eventType: 'LOGIN_FAILED',
        metadata: {
          reason: 'INVALID_CREDENTIALS',
        },
      });

      return jsonError(
        401,
        'INVALID_CREDENTIALS',
        'Invalid email or password.'
      );
    }

    const accountContext: AccountContext =
      await getAccountContextForUser(user.id);

    const validation =
      validateAccountCanLogin(user, accountContext);

    if (!validation.allowed) {
      await recordLoginHistory({
        request,
        userId: user.id,
        successful: false,
        failureReason: validation.code,
      });

      await recordAuditEvent({
        request,
        userId: user.id,
        tenantId: accountContext.tenant?.id || null,
        eventType: 'LOGIN_BLOCKED',
        metadata: {
          code: validation.code,
          reason: validation.message,
        },
      });

      return jsonError(
        validation.httpStatus,
        validation.code,
        validation.message,
        validation.next
          ? { next: validation.next }
          : undefined
      );
    }

    const session = await createSession(
      user.id,
      request,
      {
        rememberMe,
      }
    );

    await recordLoginHistory({
      request,
      userId: user.id,
      sessionId: session.sessionId,
      successful: true,
    });

    await recordAuditEvent({
      request,
      userId: user.id,
      tenantId: accountContext.tenant?.id || null,
      eventType: 'LOGIN_SUCCESS',
      metadata: {
        rememberMe,
        sessionId: session.sessionId,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Login successful.',
        user: publicUser(user),
        tenant: accountContext.tenant,
        subscription: accountContext.subscription,
        role: accountContext.role,
        modules: accountContext.modules,
        session: {
          id: session.sessionId,
          expiresAt:
            session.expiresAt.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Auth] Login failed:', error);

    return jsonError(
      500,
      'LOGIN_FAILED',
      'Something went wrong while signing you in.'
    );
  }
}