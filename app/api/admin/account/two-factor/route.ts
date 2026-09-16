import {
  NextRequest,
  NextResponse,
} from 'next/server';

import QRCode from 'qrcode';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  createAdminTwoFactorSetup,
  confirmAdminTwoFactorSetup,
  countUnusedAdminRecoveryCodes,
  disableAdminTwoFactor,
  getAdminTwoFactor,
  regenerateAdminRecoveryCodes,
  verifyAdminTwoFactorCode,
} from '@/lib/auth/admin-two-factor';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;

const VERIFY_LIMIT = {
  maxAttempts: 6,
  windowMs: 10 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
};

type Action =
  | 'start_setup'
  | 'confirm_setup'
  | 'disable'
  | 'regenerate_recovery_codes';

type Body = {
  action?: Action;
  code?: string;
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders?: Record<string, string>
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control':
        'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options':
        'nosniff',
      ...extraHeaders,
    },
  });
}

function errorResponse(
  status: number,
  code: string,
  error: string,
  extra?: Record<string, unknown>,
  headers?: Record<string, string>
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

function getClientIp(
  request: NextRequest
) {
  const forwarded =
    request.headers.get(
      'x-forwarded-for'
    );

  if (forwarded) {
    return (
      forwarded
        .split(',')[0]
        ?.trim() || 'unknown'
    );
  }

  return (
    request.headers.get(
      'x-real-ip'
    ) || 'unknown'
  );
}

function requestHasJsonContentType(
  request: NextRequest
) {
  const contentType =
    request.headers.get(
      'content-type'
    );

  return Boolean(
    contentType
      ?.toLowerCase()
      .startsWith(
        'application/json'
      )
  );
}

function bodyWithinLimit(
  request: NextRequest
) {
  const contentLength =
    request.headers.get(
      'content-length'
    );

  if (!contentLength) {
    return true;
  }

  const parsed =
    Number(contentLength);

  return (
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= MAX_BODY_BYTES
  );
}

function sameOrigin(
  request: NextRequest
) {
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
    request.headers.get('origin');

  if (!origin) {
    return true;
  }

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

function normalizeCode(
  value: unknown
) {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value
    .replace(/\s+/g, '')
    .trim();
}

async function readBody(
  request: NextRequest
): Promise<Body | null> {
  if (
    !requestHasJsonContentType(
      request
    ) ||
    !bodyWithinLimit(request)
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
      ) > MAX_BODY_BYTES
    ) {
      return null;
    }

    const body =
      JSON.parse(raw);

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return null;
    }

    const allowedKeys =
      new Set([
        'action',
        'code',
      ]);

    for (
      const key of Object.keys(
        body
      )
    ) {
      if (
        !allowedKeys.has(key)
      ) {
        return null;
      }
    }

    return body as Body;
  } catch {
    return null;
  }
}

async function auditSafely(
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
      '[Admin Account 2FA] Audit error:',
      error
    );
  }
}

async function checkVerificationLimit(
  identifier: string,
  action: string
) {
  return checkRateLimit({
    identifier,
    action,
    maxAttempts:
      VERIFY_LIMIT.maxAttempts,
    windowMs:
      VERIFY_LIMIT.windowMs,
    blockMs:
      VERIFY_LIMIT.blockMs,
  });
}

function rateLimitResponse(
  retryAfterSeconds:
    number | null
) {
  return errorResponse(
    429,
    'TOO_MANY_ATTEMPTS',
    'Too many verification attempts. Try again later.',
    {
      retryAfterSeconds,
    },
    retryAfterSeconds
      ? {
          'Retry-After': String(
            retryAfterSeconds
          ),
        }
      : undefined
  );
}

export async function GET() {
  try {
    const session =
      await requireAdminSession();

    const [
      factor,
      recoveryCodesRemaining,
    ] = await Promise.all([
      getAdminTwoFactor(
        session.adminId
      ),

      countUnusedAdminRecoveryCodes(
        session.adminId
      ),
    ]);

    return jsonResponse({
      success: true,

      code:
        'ADMIN_TWO_FACTOR_STATE_LOADED',

      twoFactor: {
        enabled: Boolean(
          factor?.enabled
        ),

        required:
          session.twoFactorRequired,

        method:
          factor?.method ??
          'authenticator',

        verifiedAt:
          factor?.verifiedAt
            ?.toISOString() ??
          null,

        lastUsedAt:
          factor?.lastUsedAt
            ?.toISOString() ??
          null,

        recoveryCodesRemaining,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'ADMIN_UNAUTHENTICATED'
    ) {
      return errorResponse(
        401,
        'ADMIN_UNAUTHENTICATED',
        'Your administrator session has expired. Sign in again.'
      );
    }

    console.error(
      '[Admin Account 2FA] State error:',
      error
    );

    return errorResponse(
      500,
      'ADMIN_TWO_FACTOR_STATE_ERROR',
      'SaMi could not load your two-factor authentication settings.'
    );
  }
}

export async function POST(
  request: NextRequest
) {
  if (!sameOrigin(request)) {
    return errorResponse(
      403,
      'INVALID_ORIGIN',
      'This request could not be verified.'
    );
  }

  const body =
    await readBody(request);

  if (!body) {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'The request could not be processed.'
    );
  }

  const action =
    body.action;

  if (
    action !== 'start_setup' &&
    action !==
      'confirm_setup' &&
    action !== 'disable' &&
    action !==
      'regenerate_recovery_codes'
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
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'ADMIN_UNAUTHENTICATED'
    ) {
      return errorResponse(
        401,
        'ADMIN_UNAUTHENTICATED',
        'Your administrator session has expired. Sign in again.'
      );
    }

    return errorResponse(
      500,
      'ADMIN_SESSION_ERROR',
      'SaMi could not verify your administrator session.'
    );
  }

  const adminId =
    session.adminId;

  const ip =
    getClientIp(request);

  if (
    action === 'start_setup'
  ) {
    try {
      const existing =
        await getAdminTwoFactor(
          adminId
        );

      if (existing?.enabled) {
        return errorResponse(
          409,
          'TWO_FACTOR_ALREADY_ENABLED',
          'Two-factor authentication is already enabled.'
        );
      }

      const setup =
        await createAdminTwoFactorSetup(
          {
            adminId,
            email:
              session.email,
          }
        );

      const qrDataUrl =
        await QRCode.toDataURL(
          setup.otpauthUrl,
          {
            errorCorrectionLevel:
              'M',
            margin: 1,
            width: 280,
            type: 'image/png',
          }
        );

      await auditSafely({
        request,
        adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.two_factor.account_setup_started',

        action:
          'admin_two_factor_account_setup',

        targetType:
          'platform_admin',

        targetId: adminId,

        successful: true,

        metadata: {
          method:
            'authenticator',
        },
      });

      return jsonResponse({
        success: true,

        code:
          'ADMIN_TWO_FACTOR_SETUP_STARTED',

        setup: {
          method:
            'authenticator',

          qrDataUrl,

          secret:
            setup.secret,

          otpauthUrl:
            setup.otpauthUrl,
        },
      });
    } catch (error) {
      console.error(
        '[Admin Account 2FA] Setup start error:',
        error
      );

      return errorResponse(
        500,
        'ADMIN_TWO_FACTOR_SETUP_ERROR',
        'SaMi could not start two-factor authentication setup.'
      );
    }
  }

  const code =
    normalizeCode(
      body.code
    );

  if (
    !/^\d{6}$/.test(code)
  ) {
    return errorResponse(
      400,
      'INVALID_VERIFICATION_CODE',
      'Enter the 6-digit code from your authenticator app.',
      {
        field: 'code',
      }
    );
  }

  if (
    action ===
    'confirm_setup'
  ) {
    const rateIdentifier =
      `admin-2fa-setup:${adminId}:${ip}`;

    const rateAction =
      'admin-two-factor-setup-confirm';

    try {
      const limit =
        await checkVerificationLimit(
          rateIdentifier,
          rateAction
        );

      if (!limit.allowed) {
        return rateLimitResponse(
          limit.retryAfterSeconds
        );
      }
    } catch (error) {
      console.error(
        '[Admin Account 2FA] Rate limiter error:',
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
          'Retry-After': '30',
        }
      );
    }

    try {
      const result =
        await confirmAdminTwoFactorSetup(
          {
            adminId,
            code,
          }
        );

      if (!result.enabled) {
        await auditSafely({
          request,
          adminId,

          sessionId:
            session.sessionId,

          eventType:
            'admin.two_factor.account_setup_failed',

          action:
            'admin_two_factor_account_setup',

          targetType:
            'platform_admin',

          targetId:
            adminId,

          successful: false,

          failureReason:
            'invalid_authenticator_code',
        });

        return errorResponse(
          400,
          'INVALID_VERIFICATION_CODE',
          'The verification code is incorrect or has expired.',
          {
            field: 'code',
          }
        );
      }

      try {
        await resetRateLimit(
          rateIdentifier,
          rateAction
        );
      } catch (error) {
        console.error(
          '[Admin Account 2FA] Rate reset failed:',
          error
        );
      }

      await auditSafely({
        request,
        adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.two_factor.account_enabled',

        action:
          'admin_two_factor_account_setup',

        targetType:
          'platform_admin',

        targetId:
          adminId,

        successful: true,

        metadata: {
          method:
            'authenticator',

          recoveryCodeCount:
            result.recoveryCodes
              .length,
        },
      });

      return jsonResponse({
        success: true,

        code:
          'ADMIN_TWO_FACTOR_ENABLED',

        twoFactorEnabled:
          true,

        recoveryCodes:
          result.recoveryCodes,
      });
    } catch (error) {
      console.error(
        '[Admin Account 2FA] Setup confirmation error:',
        error
      );

      return errorResponse(
        500,
        'ADMIN_TWO_FACTOR_CONFIRM_ERROR',
        'SaMi could not complete two-factor authentication setup.'
      );
    }
  }

  if (action === 'disable') {
    if (
      session.twoFactorRequired
    ) {
      return errorResponse(
        403,
        'TWO_FACTOR_REQUIRED',
        'Two-factor authentication is required for this administrator account.'
      );
    }

    const rateIdentifier =
      `admin-2fa-disable:${adminId}:${ip}`;

    const rateAction =
      'admin-two-factor-disable';

    try {
      const limit =
        await checkVerificationLimit(
          rateIdentifier,
          rateAction
        );

      if (!limit.allowed) {
        return rateLimitResponse(
          limit.retryAfterSeconds
        );
      }
    } catch {
      return errorResponse(
        503,
        'SECURITY_SERVICE_UNAVAILABLE',
        'SaMi security services are temporarily unavailable.',
        {
          retryable: true,
        },
        {
          'Retry-After': '30',
        }
      );
    }

    try {
      const valid =
        await verifyAdminTwoFactorCode(
          {
            adminId,
            code,
          }
        );

      if (!valid) {
        await auditSafely({
          request,
          adminId,

          sessionId:
            session.sessionId,

          eventType:
            'admin.two_factor.disable_failed',

          action:
            'admin_two_factor_disable',

          targetType:
            'platform_admin',

          targetId:
            adminId,

          successful: false,

          failureReason:
            'invalid_authenticator_code',
        });

        return errorResponse(
          400,
          'INVALID_VERIFICATION_CODE',
          'The verification code is incorrect or has expired.',
          {
            field: 'code',
          }
        );
      }

      await disableAdminTwoFactor(
        adminId
      );

      try {
        await resetRateLimit(
          rateIdentifier,
          rateAction
        );
      } catch {
        // Security action succeeded.
      }

      await auditSafely({
        request,
        adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.two_factor.account_disabled',

        action:
          'admin_two_factor_disable',

        targetType:
          'platform_admin',

        targetId:
          adminId,

        successful: true,

        metadata: {
          method:
            'authenticator',
        },
      });

      return jsonResponse({
        success: true,

        code:
          'ADMIN_TWO_FACTOR_DISABLED',

        twoFactorEnabled:
          false,

        message:
          'Two-factor authentication has been turned off.',
      });
    } catch (error) {
      console.error(
        '[Admin Account 2FA] Disable error:',
        error
      );

      return errorResponse(
        500,
        'ADMIN_TWO_FACTOR_DISABLE_ERROR',
        'SaMi could not turn off two-factor authentication.'
      );
    }
  }

  if (
    action ===
    'regenerate_recovery_codes'
  ) {
    const rateIdentifier =
      `admin-2fa-recovery:${adminId}:${ip}`;

    const rateAction =
      'admin-two-factor-recovery-regenerate';

    try {
      const limit =
        await checkVerificationLimit(
          rateIdentifier,
          rateAction
        );

      if (!limit.allowed) {
        return rateLimitResponse(
          limit.retryAfterSeconds
        );
      }
    } catch {
      return errorResponse(
        503,
        'SECURITY_SERVICE_UNAVAILABLE',
        'SaMi security services are temporarily unavailable.',
        {
          retryable: true,
        },
        {
          'Retry-After': '30',
        }
      );
    }

    try {
      const factor =
        await getAdminTwoFactor(
          adminId
        );

      if (!factor?.enabled) {
        return errorResponse(
          409,
          'TWO_FACTOR_NOT_ENABLED',
          'Two-factor authentication is not enabled.'
        );
      }

      const valid =
        await verifyAdminTwoFactorCode(
          {
            adminId,
            code,
          }
        );

      if (!valid) {
        await auditSafely({
          request,
          adminId,

          sessionId:
            session.sessionId,

          eventType:
            'admin.two_factor.recovery_codes_regenerate_failed',

          action:
            'admin_two_factor_recovery_codes_regenerate',

          targetType:
            'platform_admin',

          targetId:
            adminId,

          successful: false,

          failureReason:
            'invalid_authenticator_code',
        });

        return errorResponse(
          400,
          'INVALID_VERIFICATION_CODE',
          'The verification code is incorrect or has expired.',
          {
            field: 'code',
          }
        );
      }

      const recoveryCodes =
        await regenerateAdminRecoveryCodes(
          adminId
        );

      try {
        await resetRateLimit(
          rateIdentifier,
          rateAction
        );
      } catch {
        // Security action succeeded.
      }

      await auditSafely({
        request,
        adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.two_factor.recovery_codes_regenerated',

        action:
          'admin_two_factor_recovery_codes_regenerate',

        targetType:
          'platform_admin',

        targetId:
          adminId,

        successful: true,

        metadata: {
          recoveryCodeCount:
            recoveryCodes.length,
        },
      });

      return jsonResponse({
        success: true,

        code:
          'ADMIN_RECOVERY_CODES_REGENERATED',

        recoveryCodes,

        message:
          'New recovery codes have been generated.',
      });
    } catch (error) {
      console.error(
        '[Admin Account 2FA] Recovery code regeneration error:',
        error
      );

      return errorResponse(
        500,
        'ADMIN_RECOVERY_CODES_ERROR',
        'SaMi could not generate new recovery codes.'
      );
    }
  }

  return errorResponse(
    400,
    'INVALID_ACTION',
    'Choose a valid security action.'
  );
}