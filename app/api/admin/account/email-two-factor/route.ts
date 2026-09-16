import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  queryControl,
} from '@/lib/db/control';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  enableAdminEmailTwoFactor,
  disableAdminEmailTwoFactor,
  ensureAdminRecoveryCodes,
  getAdminTwoFactorMethodStatus,
  markAdminEmailTwoFactorUsed,
} from '@/lib/auth/admin-two-factor';

import {
  createAdminEmailTwoFactorContextToken,
  invalidateAdminEmailTwoFactorCodes,
  issueAdminEmailTwoFactorCode,
  verifyAdminEmailTwoFactorCode,
} from '@/lib/auth/admin-email-two-factor';

import {
  sendSecurityCodeEmail,
} from '@/lib/services/email';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

const MAX_BODY_BYTES =
  8 * 1024;

const RATE_LIMIT = {
  maxAttempts: 8,
  windowMs:
    10 * 60 * 1000,
  blockMs:
    15 * 60 * 1000,
};

type AdminRow = {
  id: string;
  email: string;
  first_name:
    | string
    | null;
  last_name:
    | string
    | null;
  status: string;
  email_verified:
    boolean;
};

type Action =
  | 'request_enable'
  | 'confirm_enable'
  | 'request_disable'
  | 'confirm_disable';

type RequestBody = {
  action?: Action;
  code?: string;
  contextToken?: string;
};

function jsonResponse(
  body: Record<
    string,
    unknown
  >,
  status = 200,
  extraHeaders?: Record<
    string,
    string
  >
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, private',

        Pragma:
          'no-cache',

        Expires:
          '0',

        'Referrer-Policy':
          'no-referrer',

        'X-Content-Type-Options':
          'nosniff',

        ...extraHeaders,
      },
    }
  );
}

function errorResponse(
  status: number,
  code: string,
  error: string,
  extra?: Record<
    string,
    unknown
  >,
  headers?: Record<
    string,
    string
  >
) {
  return jsonResponse(
    {
      success: false,
      code,
      error,
      ...(extra || {}),
    },
    status,
    headers
  );
}

function sameOrigin(
  request: NextRequest
): boolean {
  const site =
    request.headers.get(
      'sec-fetch-site'
    );

  if (
    site &&
    site !== 'same-origin' &&
    site !== 'same-site' &&
    site !== 'none'
  ) {
    return false;
  }

  const origin =
    request.headers.get(
      'origin'
    );

  if (!origin) {
    return true;
  }

  try {
    return (
      new URL(origin)
        .origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

function getClientIp(
  request: NextRequest
): string {
  const forwarded =
    request.headers.get(
      'x-forwarded-for'
    );

  if (forwarded) {
    return (
      forwarded
        .split(',')[0]
        ?.trim() ||
      'unknown'
    );
  }

  return (
    request.headers.get(
      'x-real-ip'
    ) ||
    'unknown'
  );
}

async function readBody(
  request: NextRequest
): Promise<
  RequestBody | null
> {
  const contentType =
    request.headers.get(
      'content-type'
    );

  if (
    !contentType
      ?.toLowerCase()
      .startsWith(
        'application/json'
      )
  ) {
    return null;
  }

  const contentLength =
    Number(
      request.headers.get(
        'content-length'
      ) || 0
    );

  if (
    Number.isFinite(
      contentLength
    ) &&
    contentLength >
      MAX_BODY_BYTES
  ) {
    return null;
  }

  try {
    const raw =
      await request.text();

    if (
      Buffer.byteLength(
        raw,
        'utf8'
      ) >
      MAX_BODY_BYTES
    ) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !==
        'object' ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const allowed =
      new Set([
        'action',
        'code',
        'contextToken',
      ]);

    for (
      const key of
      Object.keys(parsed)
    ) {
      if (
        !allowed.has(key)
      ) {
        return null;
      }
    }

    return parsed as
      RequestBody;
  } catch {
    return null;
  }
}

function normalizeCode(
  value: unknown
): string {
  return typeof value ===
    'string'
    ? value
        .replace(
          /\s+/g,
          ''
        )
        .trim()
    : '';
}

function normalizeToken(
  value: unknown
): string {
  return typeof value ===
    'string'
    ? value.trim()
    : '';
}

function displayName(
  admin: AdminRow
): string {
  const first =
    admin.first_name
      ?.trim();

  if (first) {
    return first;
  }

  const combined =
    `${admin.first_name || ''} ${admin.last_name || ''}`
      .trim()
      .replace(
        /\s+/g,
        ' '
      );

  return (
    combined ||
    'there'
  );
}

async function getAdmin(
  adminId: string
): Promise<
  AdminRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          email,
          first_name,
          last_name,
          status,
          email_verified
        FROM platform_admins
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [adminId]
    );

  return (
    result.rows[0] ||
    null
  );
}

async function audit(
  input: Parameters<
    typeof recordAdminAuditEvent
  >[0]
) {
  try {
    await recordAdminAuditEvent(
      input
    );
  } catch (error) {
    console.error(
      '[Admin Email 2FA] Audit error:',
      error
    );
  }
}

function cooldownResponse(
  error: unknown
) {
  if (
    !(error instanceof Error)
  ) {
    return null;
  }

  if (
    !error.message.startsWith(
      'EMAIL_CODE_COOLDOWN:'
    )
  ) {
    return null;
  }

  const seconds =
    Number(
      error.message.split(
        ':'
      )[1]
    ) || 60;

  return errorResponse(
    429,
    'EMAIL_CODE_COOLDOWN',
    'Please wait before requesting another security code.',
    {
      retryAfterSeconds:
        seconds,
    },
    {
      'Retry-After':
        String(seconds),
    }
  );
}

export async function GET() {
  let session;

  try {
    session =
      await requireAdminSession();
  } catch {
    return errorResponse(
      401,
      'ADMIN_UNAUTHENTICATED',
      'Your administrator session has expired. Sign in again.'
    );
  }

  try {
    const [
      admin,
      twoFactor,
    ] =
      await Promise.all([
        getAdmin(
          session.adminId
        ),

        getAdminTwoFactorMethodStatus(
          session.adminId
        ),
      ]);

    if (
      !admin ||
      admin.status !==
        'active'
    ) {
      return errorResponse(
        403,
        'ADMIN_ACCOUNT_UNAVAILABLE',
        'This administrator account is not available.'
      );
    }

    return jsonResponse({
      success: true,

      code:
        'ADMIN_EMAIL_TWO_FACTOR_STATUS',

      emailTwoFactor: {
        enabled:
          twoFactor.email
            .enabled,

        verifiedAt:
          twoFactor.email
            .verifiedAt
            ?.toISOString() ??
          null,

        lastUsedAt:
          twoFactor.email
            .lastUsedAt
            ?.toISOString() ??
          null,

        authenticatorEnabled:
          twoFactor
            .authenticator
            .enabled,

        twoFactorEnabled:
          twoFactor.enabled,

        emailVerified:
          admin.email_verified,

        email:
          admin.email,
      },
    });
  } catch (error) {
    console.error(
      '[Admin Email 2FA] Status error:',
      error
    );

    return errorResponse(
      500,
      'ADMIN_EMAIL_TWO_FACTOR_STATUS_ERROR',
      'SaMi could not load email verification settings.'
    );
  }
}

export async function POST(
  request: NextRequest
) {
  if (
    !sameOrigin(request)
  ) {
    return errorResponse(
      403,
      'INVALID_ORIGIN',
      'This security request could not be verified.'
    );
  }

  const body =
    await readBody(
      request
    );

  if (!body) {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'The request could not be processed.'
    );
  }

  if (
    body.action !==
      'request_enable' &&
    body.action !==
      'confirm_enable' &&
    body.action !==
      'request_disable' &&
    body.action !==
      'confirm_disable'
  ) {
    return errorResponse(
      400,
      'INVALID_ACTION',
      'Choose a valid security action.'
    );
  }

  let session;

  try {
    session =
      await requireAdminSession();
  } catch {
    return errorResponse(
      401,
      'ADMIN_UNAUTHENTICATED',
      'Your administrator session has expired. Sign in again.'
    );
  }

  const admin =
    await getAdmin(
      session.adminId
    );

  if (
    !admin ||
    admin.status !==
      'active'
  ) {
    return errorResponse(
      403,
      'ADMIN_ACCOUNT_UNAVAILABLE',
      'This administrator account is not available.'
    );
  }

  if (
    !admin.email_verified
  ) {
    return errorResponse(
      409,
      'ADMIN_EMAIL_NOT_VERIFIED',
      'Verify your administrator email before using email verification.'
    );
  }

  const ip =
    getClientIp(
      request
    );

  const rateIdentifier =
    `admin-email-2fa:${session.adminId}:${ip}`;

  try {
    const rate =
      await checkRateLimit({
        identifier:
          rateIdentifier,

        action:
          body.action,

        maxAttempts:
          RATE_LIMIT.maxAttempts,

        windowMs:
          RATE_LIMIT.windowMs,

        blockMs:
          RATE_LIMIT.blockMs,
      });

    if (!rate.allowed) {
      return errorResponse(
        429,
        'TOO_MANY_ATTEMPTS',
        'Too many security requests. Try again later.',
        {
          retryAfterSeconds:
            rate.retryAfterSeconds,
        },
        rate.retryAfterSeconds
          ? {
              'Retry-After':
                String(
                  rate.retryAfterSeconds
                ),
            }
          : undefined
      );
    }
  } catch (error) {
    console.error(
      '[Admin Email 2FA] Rate limiter error:',
      error
    );

    return errorResponse(
      503,
      'SECURITY_SERVICE_UNAVAILABLE',
      'SaMi security services are temporarily unavailable.',
      {
        retryable: true,
      },
      {
        'Retry-After':
          '30',
      }
    );
  }

  const state =
    await getAdminTwoFactorMethodStatus(
      session.adminId
    );

  if (
    body.action ===
      'request_enable'
  ) {
    if (
      state.email.enabled
    ) {
      return errorResponse(
        409,
        'ADMIN_EMAIL_TWO_FACTOR_ALREADY_ENABLED',
        'Email verification is already enabled.'
      );
    }

    const contextToken =
      createAdminEmailTwoFactorContextToken();

    const context =
      [
        'admin-email-2fa-enable',
        session.sessionId,
        contextToken,
      ].join(':');

    try {
      const issued =
        await issueAdminEmailTwoFactorCode({
          adminId:
            session.adminId,

          sessionId:
            session.sessionId,

          email:
            admin.email,

          purpose:
            'email_2fa_setup',

          context,
        });

      const delivery =
        await sendSecurityCodeEmail(
          admin.email,
          issued.code,
          displayName(admin),
          {
            purpose:
              'email_2fa_setup',

            expiresInMinutes:
              issued.expiresInMinutes,
          }
        );

      if (
        !delivery.success
      ) {
        await invalidateAdminEmailTwoFactorCodes({
          adminId:
            session.adminId,

          purpose:
            'email_2fa_setup',
        });

        return errorResponse(
          503,
          'EMAIL_DELIVERY_UNAVAILABLE',
          'SaMi could not send the security code. Try again shortly.'
        );
      }

      await audit({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.two_factor.email_setup_code_sent',

        action:
          'admin_email_two_factor_enable',

        targetType:
          'platform_admin',

        targetId:
          session.adminId,

        successful:
          true,

        metadata: {
          method: 'email',
        },
      });

      return jsonResponse({
        success: true,

        code:
          'ADMIN_EMAIL_TWO_FACTOR_CODE_SENT',

        contextToken,

        expiresInMinutes:
          issued.expiresInMinutes,

        message:
          'A security code has been sent to your email.',
      });
    } catch (error) {
      const cooldown =
        cooldownResponse(
          error
        );

      if (cooldown) {
        return cooldown;
      }

      console.error(
        '[Admin Email 2FA] Enable code error:',
        error
      );

      return errorResponse(
        500,
        'ADMIN_EMAIL_TWO_FACTOR_CODE_ERROR',
        'SaMi could not start email verification.'
      );
    }
  }

  if (
    body.action ===
      'confirm_enable'
  ) {
    if (
      state.email.enabled
    ) {
      return errorResponse(
        409,
        'ADMIN_EMAIL_TWO_FACTOR_ALREADY_ENABLED',
        'Email verification is already enabled.'
      );
    }

    const code =
      normalizeCode(
        body.code
      );

    const contextToken =
      normalizeToken(
        body.contextToken
      );

    if (
      !/^\d{6}$/.test(
        code
      ) ||
      !contextToken ||
      contextToken.length >
        512
    ) {
      return errorResponse(
        400,
        'INVALID_VERIFICATION',
        'Enter the 6-digit security code.'
      );
    }

    const context =
      [
        'admin-email-2fa-enable',
        session.sessionId,
        contextToken,
      ].join(':');

    const verified =
      await verifyAdminEmailTwoFactorCode({
        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        email:
          admin.email,

        purpose:
          'email_2fa_setup',

        code,

        context,
      });

    if (
      !verified.verified
    ) {
      return errorResponse(
        verified.reason ===
          'expired'
          ? 410
          : verified.reason ===
              'attempts_exhausted'
            ? 429
            : 401,

        'INVALID_EMAIL_SECURITY_CODE',

        verified.reason ===
          'expired'
          ? 'This security code has expired. Request another code.'
          : verified.reason ===
              'attempts_exhausted'
            ? 'Too many incorrect attempts. Request another security code.'
            : 'The security code is incorrect.',

        {
          attemptsRemaining:
            verified.attemptsRemaining,
        }
      );
    }

    await enableAdminEmailTwoFactor(
      session.adminId
    );

    const recoveryCodes =
      await ensureAdminRecoveryCodes(
        session.adminId
      );

    await resetRateLimit(
      rateIdentifier,
      body.action
    ).catch(() => undefined);

    await audit({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'admin.two_factor.email_enabled',

      action:
        'admin_email_two_factor_enable',

      targetType:
        'platform_admin',

      targetId:
        session.adminId,

      successful:
        true,

      metadata: {
        method: 'email',
      },
    });

    return jsonResponse({
      success: true,

      code:
        'ADMIN_EMAIL_TWO_FACTOR_ENABLED',

      emailTwoFactorEnabled:
        true,

      recoveryCodes,

      message:
        'Email verification has been enabled.',
    });
  }

  if (
    body.action ===
      'request_disable'
  ) {
    if (
      !state.email.enabled
    ) {
      return errorResponse(
        409,
        'ADMIN_EMAIL_TWO_FACTOR_NOT_ENABLED',
        'Email verification is not enabled.'
      );
    }

    if (
      session.twoFactorRequired &&
      !state.authenticator
        .enabled
    ) {
      return errorResponse(
        403,
        'TWO_FACTOR_REQUIRED',
        'Two-factor authentication is required for this administrator account.'
      );
    }

    const contextToken =
      createAdminEmailTwoFactorContextToken();

    const context =
      [
        'admin-email-2fa-disable',
        session.sessionId,
        contextToken,
      ].join(':');

    try {
      const issued =
        await issueAdminEmailTwoFactorCode({
          adminId:
            session.adminId,

          sessionId:
            session.sessionId,

          email:
            admin.email,

          purpose:
            'email_2fa_disable',

          context,
        });

      const delivery =
        await sendSecurityCodeEmail(
          admin.email,
          issued.code,
          displayName(admin),
          {
            purpose:
              'security_step_up',

            expiresInMinutes:
              issued.expiresInMinutes,
          }
        );

      if (
        !delivery.success
      ) {
        await invalidateAdminEmailTwoFactorCodes({
          adminId:
            session.adminId,

          purpose:
            'email_2fa_disable',
        });

        return errorResponse(
          503,
          'EMAIL_DELIVERY_UNAVAILABLE',
          'SaMi could not send the security code. Try again shortly.'
        );
      }

      return jsonResponse({
        success: true,

        code:
          'ADMIN_EMAIL_TWO_FACTOR_DISABLE_CODE_SENT',

        contextToken,

        expiresInMinutes:
          issued.expiresInMinutes,

        message:
          'A security code has been sent to your email.',
      });
    } catch (error) {
      const cooldown =
        cooldownResponse(
          error
        );

      if (cooldown) {
        return cooldown;
      }

      console.error(
        '[Admin Email 2FA] Disable code error:',
        error
      );

      return errorResponse(
        500,
        'ADMIN_EMAIL_TWO_FACTOR_DISABLE_CODE_ERROR',
        'SaMi could not start this security verification.'
      );
    }
  }

  const code =
    normalizeCode(
      body.code
    );

  const contextToken =
    normalizeToken(
      body.contextToken
    );

  if (
    !/^\d{6}$/.test(
      code
    ) ||
    !contextToken ||
    contextToken.length >
      512
  ) {
    return errorResponse(
      400,
      'INVALID_VERIFICATION',
      'Enter the 6-digit security code.'
    );
  }

  const context =
    [
      'admin-email-2fa-disable',
      session.sessionId,
      contextToken,
    ].join(':');

  const verified =
    await verifyAdminEmailTwoFactorCode({
      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      email:
        admin.email,

      purpose:
        'email_2fa_disable',

      code,

      context,
    });

  if (
    !verified.verified
  ) {
    return errorResponse(
      verified.reason ===
        'expired'
        ? 410
        : verified.reason ===
            'attempts_exhausted'
          ? 429
          : 401,

      'INVALID_EMAIL_SECURITY_CODE',

      verified.reason ===
        'expired'
        ? 'This security code has expired. Request another code.'
        : verified.reason ===
            'attempts_exhausted'
          ? 'Too many incorrect attempts. Request another security code.'
          : 'The security code is incorrect.',

      {
        attemptsRemaining:
          verified.attemptsRemaining,
      }
    );
  }

  await markAdminEmailTwoFactorUsed(
    session.adminId
  );

  await disableAdminEmailTwoFactor(
    session.adminId
  );

  await invalidateAdminEmailTwoFactorCodes({
    adminId:
      session.adminId,
  });

  await resetRateLimit(
    rateIdentifier,
    body.action
  ).catch(() => undefined);

  await audit({
    request,

    adminId:
      session.adminId,

    sessionId:
      session.sessionId,

    eventType:
      'admin.two_factor.email_disabled',

    action:
      'admin_email_two_factor_disable',

    targetType:
      'platform_admin',

    targetId:
      session.adminId,

    successful:
      true,

    metadata: {
      method: 'email',
    },
  });

  const finalState =
    await getAdminTwoFactorMethodStatus(
      session.adminId
    );

  return jsonResponse({
    success: true,

    code:
      'ADMIN_EMAIL_TWO_FACTOR_DISABLED',

    emailTwoFactorEnabled:
      false,

    twoFactorEnabled:
      finalState.enabled,

    authenticatorEnabled:
      finalState
        .authenticator
        .enabled,

    message:
      'Email verification has been turned off.',
  });
}