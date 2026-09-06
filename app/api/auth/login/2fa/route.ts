import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth/session';
import { getAccountContextForUser } from '@/lib/auth/account-context';
import {
  getValidLoginChallenge,
  markLoginChallengeUsed,
} from '@/lib/auth/login-challenges';
import { verifyUserTwoFactorCode } from '@/lib/auth/two-factor';
import {
  recordAuthEvent,
  recordLoginHistory,
} from '@/lib/auth/auth-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const email = normalizeEmail(body.email);
    const challengeToken = String(body.challengeToken || '');
    const code = String(body.code || '');
    const rememberMe = Boolean(body.rememberMe);

    if (!email || !challengeToken || !code) {
      return NextResponse.json(
        {
          success: false,
          code: 'TWO_FACTOR_REQUIRED',
          error: 'Enter your verification code.',
        },
        { status: 400 }
      );
    }

    const challenge = await getValidLoginChallenge({
      email,
      challengeToken,
    });

    if (!challenge) {
      return NextResponse.json(
        {
          success: false,
          code: 'LOGIN_CHALLENGE_EXPIRED',
          error: 'This login challenge has expired. Please sign in again.',
        },
        { status: 400 }
      );
    }

    const validCode = await verifyUserTwoFactorCode({
      userId: challenge.user_id,
      code,
    });

    if (!validCode) {
      await recordLoginHistory({
        request,
        userId: challenge.user_id,
        successful: false,
        failureReason: 'invalid_two_factor_code',
        metadata: {
          email,
        },
      });

      await recordAuthEvent({
        request,
        userId: challenge.user_id,
        eventType: 'TWO_FACTOR_FAILED',
        entityType: 'user',
        entityId: challenge.user_id,
        metadata: {
          email,
        },
      });

      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_TWO_FACTOR_CODE',
          error: 'Invalid verification code.',
        },
        { status: 400 }
      );
    }

    const accountContext = await getAccountContextForUser(
      challenge.user_id
    );

    const session = await createSession(challenge.user_id, request, {
      rememberMe,
    });

    await markLoginChallengeUsed(challenge.id);

    await recordLoginHistory({
      request,
      userId: challenge.user_id,
      sessionId: session.sessionId,
      successful: true,
      metadata: {
        email,
        twoFactor: true,
      },
    });

    await recordAuthEvent({
      request,
      userId: challenge.user_id,
      tenantId: accountContext.tenant?.id || null,
      eventType: 'TWO_FACTOR_LOGIN_SUCCESS',
      entityType: 'session',
      entityId: session.sessionId,
      metadata: {
        email,
      },
    });

    return NextResponse.json({
      success: true,
      code: 'LOGIN_SUCCESS',
      message: 'Login successful.',
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
    console.error('[Auth] 2FA login failed:', error);

    return NextResponse.json(
      {
        success: false,
        code: 'TWO_FACTOR_LOGIN_ERROR',
        error: 'Could not complete login verification.',
      },
      { status: 500 }
    );
  }
}