import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  findPlatformAdminById,
  getSafePlatformAdmin,
  isPlatformAdminLocked,
  updateAdminSuccessfulLogin,
} from '@/lib/auth/admin-auth';

import {
  createAdminSession,
  getAdminRequestIp,
} from '@/lib/auth/admin-session';

import {
  adminLoginChallengeMatchesRequest,
  clearAdminLoginChallengeCookie,
  consumeAdminLoginChallenge,
  getAdminLoginChallengeTokenFromRequest,
  getValidAdminLoginChallenge,
} from '@/lib/auth/admin-login-challenges';

import {
  adminHasEnabledAuthenticator,
  adminHasEnabledEmailTwoFactor,
  countUnusedAdminRecoveryCodes,
  markAdminEmailTwoFactorUsed,
  useAdminRecoveryCode,
  verifyAdminTwoFactorCode,
} from '@/lib/auth/admin-two-factor';

import {
  invalidateAdminEmailTwoFactorCodes,
  issueAdminEmailTwoFactorCode,
  verifyAdminEmailTwoFactorCode,
} from '@/lib/auth/admin-email-two-factor';

import {
  recordAdminAuditEvent,
  recordAdminLoginFailure,
  recordAdminLoginSuccess,
} from '@/lib/auth/admin-events';

import {
  sendSecurityCodeEmail,
} from '@/lib/services/email';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

const MAX_BODY_BYTES =
  8 * 1024;

const VERIFY_RATE_LIMIT = {
  maxAttempts: 8,
  windowMs:
    10 * 60 * 1000,
  blockMs:
    15 * 60 * 1000,
};

const EMAIL_RATE_LIMIT = {
  maxAttempts: 5,
  windowMs:
    10 * 60 * 1000,
  blockMs:
    15 * 60 * 1000,
};

type VerificationMethod =
  | 'authenticator'
  | 'email'
  | 'recovery';

type VerifyBody = {
  action?:
    | 'verify'
    | 'send_email';
  method?:
    VerificationMethod;
  code?: string;
};

type ValidContext = {
  challengeToken: string;
  challenge: Awaited<
    ReturnType<
      typeof getValidAdminLoginChallenge
    >
  > &
    {};
  admin: NonNullable<
    Awaited<
      ReturnType<
        typeof findPlatformAdminById
      >
    >
  >;
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
    site !==
      'same-origin' &&
    site !==
      'same-site' &&
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
    getAdminRequestIp(
      request
    ) ||
    'unknown'
  );
}

function normalizeCode(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .slice(
      0,
      128
    );
}

function normalizeMethod(
  value: unknown
):
  | VerificationMethod
  | null {
  if (
    value ===
      'authenticator' ||
    value === 'email' ||
    value === 'recovery'
  ) {
    return value;
  }

  return null;
}

async function readBody(
  request: NextRequest
): Promise<
  VerifyBody | null
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

    const parsed:
      unknown =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !==
        'object' ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const object =
      parsed as Record<
        string,
        unknown
      >;

    const allowed =
      new Set([
        'action',
        'method',
        'code',
      ]);

    for (
      const key of
      Object.keys(object)
    ) {
      if (
        !allowed.has(key)
      ) {
        return null;
      }
    }

    return object as
      VerifyBody;
  } catch {
    return null;
  }
}

function maskEmail(
  value: string
): string {
  const normalized =
    value
      .trim()
      .toLowerCase();

  const at =
    normalized.indexOf(
      '@'
    );

  if (at <= 0) {
    return '';
  }

  const local =
    normalized.slice(
      0,
      at
    );

  const domain =
    normalized.slice(
      at + 1
    );

  const visible =
    local.slice(
      0,
      Math.min(
        2,
        local.length
      )
    );

  return (
    `${visible}${'*'.repeat(
      Math.max(
        3,
        local.length -
          visible.length
      )
    )}@${domain}`
  );
}

function displayName(
  admin: {
    firstName?:
      string | null;
    lastName?:
      string | null;
  }
): string {
  const first =
    admin.firstName
      ?.trim();

  if (first) {
    return first;
  }

  const combined =
    `${admin.firstName || ''} ${admin.lastName || ''}`
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

async function safeAudit(
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
      '[Admin 2FA] Audit error:',
      error
    );
  }
}

async function loadContext(
  request: NextRequest
): Promise<
  | {
      ok: true;
      value: ValidContext;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  const challengeToken =
    getAdminLoginChallengeTokenFromRequest(
      request
    );

  if (!challengeToken) {
    const response =
      errorResponse(
        401,
        'LOGIN_CHALLENGE_INVALID',
        'Your administrator sign-in challenge is missing or invalid.'
      );

    clearAdminLoginChallengeCookie(
      response
    );

    return {
      ok: false,
      response,
    };
  }

  const challenge =
    await getValidAdminLoginChallenge(
      challengeToken
    );

  if (!challenge) {
    const response =
      errorResponse(
        401,
        'LOGIN_CHALLENGE_EXPIRED',
        'Your administrator sign-in challenge has expired. Sign in again.'
      );

    clearAdminLoginChallengeCookie(
      response
    );

    return {
      ok: false,
      response,
    };
  }

  if (
    !adminLoginChallengeMatchesRequest(
      challenge,
      request
    )
  ) {
    await safeAudit({
      request,

      adminId:
        challenge.adminId,

      eventType:
        'admin.login.challenge_mismatch',

      action:
        'admin_two_factor_verify',

      targetType:
        'platform_admin',

      targetId:
        challenge.adminId,

      successful:
        false,

      failureReason:
        'challenge_request_mismatch',

      metadata: {
        challengeId:
          challenge.id,
      },
    });

    const response =
      errorResponse(
        401,
        'LOGIN_CHALLENGE_INVALID',
        'Your administrator sign-in challenge is no longer valid.'
      );

    clearAdminLoginChallengeCookie(
      response
    );

    return {
      ok: false,
      response,
    };
  }

  const admin =
    await findPlatformAdminById(
      challenge.adminId
    );

  if (!admin) {
    const response =
      errorResponse(
        401,
        'LOGIN_CHALLENGE_INVALID',
        'The administrator account associated with this sign-in no longer exists.'
      );

    clearAdminLoginChallengeCookie(
      response
    );

    return {
      ok: false,
      response,
    };
  }

  if (
    admin.status ===
      'disabled' ||
    admin.status ===
      'suspended'
  ) {
    await recordAdminLoginFailure({
      request,

      adminId:
        admin.id,

      attemptedEmail:
        admin.email,

      failureReason:
        `account_${admin.status}`,

      metadata: {
        stage:
          'two_factor',
      },
    });

    const response =
      errorResponse(
        403,
        admin.status ===
          'disabled'
          ? 'ACCOUNT_DISABLED'
          : 'ACCOUNT_SUSPENDED',
        `This administrator account is ${admin.status}.`
      );

    clearAdminLoginChallengeCookie(
      response
    );

    return {
      ok: false,
      response,
    };
  }

  if (
    isPlatformAdminLocked(
      admin
    )
  ) {
    const response =
      errorResponse(
        423,
        'ACCOUNT_LOCKED',
        'This administrator account is temporarily locked.'
      );

    clearAdminLoginChallengeCookie(
      response
    );

    return {
      ok: false,
      response,
    };
  }

  if (
    !admin.emailVerified
  ) {
    const response =
      errorResponse(
        403,
        'EMAIL_NOT_VERIFIED',
        'The administrator email address has not been verified.'
      );

    clearAdminLoginChallengeCookie(
      response
    );

    return {
      ok: false,
      response,
    };
  }

  if (
    !admin.twoFactorEnabled
  ) {
    const response =
      errorResponse(
        403,
        'TWO_FACTOR_NOT_ENABLED',
        'Two-factor authentication is not configured for this administrator account.'
      );

    clearAdminLoginChallengeCookie(
      response
    );

    return {
      ok: false,
      response,
    };
  }

  return {
    ok: true,

    value: {
      challengeToken,
      challenge,
      admin,
    },
  };
}

async function getMethods(
  adminId: string
) {
  const [
    authenticator,
    email,
    recoveryCount,
  ] =
    await Promise.all([
      adminHasEnabledAuthenticator(
        adminId
      ),

      adminHasEnabledEmailTwoFactor(
        adminId
      ),

      countUnusedAdminRecoveryCodes(
        adminId
      ),
    ]);

  return {
    authenticator,
    email,
    recovery:
      recoveryCount > 0,
    recoveryCodesRemaining:
      recoveryCount,
  };
}

export async function GET(
  request: NextRequest
) {
  try {
    const context =
      await loadContext(
        request
      );

    if (!context.ok) {
      return context.response;
    }

    const {
      challenge,
      admin,
    } =
      context.value;

    const methods =
      await getMethods(
        admin.id
      );

    if (
      !methods.authenticator &&
      !methods.email &&
      !methods.recovery
    ) {
      const response =
        errorResponse(
          409,
          'NO_TWO_FACTOR_METHOD_AVAILABLE',
          'No administrator verification method is currently available.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    return jsonResponse({
      success: true,

      code:
        'ADMIN_TWO_FACTOR_CHALLENGE',

      methods: {
        authenticator:
          methods.authenticator,

        email:
          methods.email,

        recovery:
          methods.recovery,
      },

      recoveryCodesRemaining:
        methods.recoveryCodesRemaining,

      email:
        methods.email
          ? maskEmail(
              admin.email
            )
          : null,

      expiresAt:
        challenge.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error(
      '[Admin 2FA] Challenge status error:',
      error
    );

    return errorResponse(
      500,
      'ADMIN_TWO_FACTOR_STATUS_ERROR',
      'SaMi could not load administrator verification.'
    );
  }
}

export async function POST(
  request: NextRequest
) {
  if (
    !sameOrigin(
      request
    )
  ) {
    return errorResponse(
      403,
      'INVALID_ORIGIN',
      'This security request could not be verified.'
    );
  }

  try {
    const context =
      await loadContext(
        request
      );

    if (!context.ok) {
      return context.response;
    }

    const {
      challenge,
      admin,
    } =
      context.value;

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

    const action =
      body.action ||
      'verify';

    if (
      action !==
        'verify' &&
      action !==
        'send_email'
    ) {
      return errorResponse(
        400,
        'INVALID_ACTION',
        'Choose a valid verification action.'
      );
    }

    const methods =
      await getMethods(
        admin.id
      );

    const ip =
      getClientIp(
        request
      );

    if (
      action ===
      'send_email'
    ) {
      if (
        !methods.email
      ) {
        return errorResponse(
          409,
          'EMAIL_TWO_FACTOR_NOT_ENABLED',
          'Email verification is not enabled for this administrator account.'
        );
      }

      const rateIdentifier =
        `admin-login-email-2fa:${admin.id}:${ip}`;

      try {
        const rate =
          await checkRateLimit({
            identifier:
              rateIdentifier,

            action:
              'send_email',

            maxAttempts:
              EMAIL_RATE_LIMIT.maxAttempts,

            windowMs:
              EMAIL_RATE_LIMIT.windowMs,

            blockMs:
              EMAIL_RATE_LIMIT.blockMs,
          });

        if (
          !rate.allowed
        ) {
          return errorResponse(
            429,
            'TOO_MANY_EMAIL_CODES',
            'Too many security code requests. Try again later.',
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
          '[Admin 2FA] Email rate limiter error:',
          error
        );

        return errorResponse(
          503,
          'SECURITY_SERVICE_UNAVAILABLE',
          'SaMi security services are temporarily unavailable.',
          {
            retryable:
              true,
          },
          {
            'Retry-After':
              '30',
          }
        );
      }

      try {
        const contextValue =
          [
            'admin-login-2fa',
            challenge.id,
          ].join(':');

        const issued =
          await issueAdminEmailTwoFactorCode({
            adminId:
              admin.id,

            sessionId:
              null,

            email:
              admin.email,

            purpose:
              'login_2fa',

            context:
              contextValue,
          });

        const delivery =
          await sendSecurityCodeEmail(
            admin.email,
            issued.code,
            displayName(
              admin
            ),
            {
              purpose:
                'login_2fa',

              expiresInMinutes:
                issued.expiresInMinutes,
            }
          );

        if (
          !delivery.success
        ) {
          await invalidateAdminEmailTwoFactorCodes({
            adminId:
              admin.id,

            purpose:
              'login_2fa',
          });

          await safeAudit({
            request,

            adminId:
              admin.id,

            eventType:
              'admin.two_factor.email_delivery_failed',

            action:
              'admin_two_factor_send_email',

            targetType:
              'platform_admin',

            targetId:
              admin.id,

            successful:
              false,

            failureReason:
              'email_delivery_failed',

            metadata: {
              challengeId:
                challenge.id,
            },
          });

          return errorResponse(
            503,
            'EMAIL_DELIVERY_UNAVAILABLE',
            'SaMi could not send the security code. Try again shortly.'
          );
        }

        await safeAudit({
          request,

          adminId:
            admin.id,

          eventType:
            'admin.two_factor.email_code_sent',

          action:
            'admin_two_factor_send_email',

          targetType:
            'platform_admin',

          targetId:
            admin.id,

          successful:
            true,

          metadata: {
            challengeId:
              challenge.id,

            method:
              'email',
          },
        });

        return jsonResponse({
          success: true,

          code:
            'ADMIN_TWO_FACTOR_EMAIL_SENT',

          emailCodeSent:
            true,

          email:
            maskEmail(
              admin.email
            ),

          expiresInMinutes:
            issued.expiresInMinutes,

          message:
            'A security code has been sent to your administrator email.',
        });
      } catch (error) {
        if (
          error instanceof
            Error &&
          error.message.startsWith(
            'EMAIL_CODE_COOLDOWN:'
          )
        ) {
          const retryAfterSeconds =
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

        console.error(
          '[Admin 2FA] Email code issue error:',
          error
        );

        return errorResponse(
          500,
          'EMAIL_CODE_ERROR',
          'SaMi could not prepare your security code.'
        );
      }
    }

    const method =
      normalizeMethod(
        body.method
      );

    if (!method) {
      return errorResponse(
        400,
        'TWO_FACTOR_METHOD_REQUIRED',
        'Choose a verification method.'
      );
    }

    const code =
      normalizeCode(
        body.code
      );

    if (!code) {
      return errorResponse(
        400,
        'TWO_FACTOR_CODE_REQUIRED',
        'Enter your administrator verification code.'
      );
    }

    if (
      (
        method ===
          'authenticator' ||
        method ===
          'email'
      ) &&
      !/^\d{6}$/.test(
        code
      )
    ) {
      return errorResponse(
        400,
        'INVALID_TWO_FACTOR_CODE_FORMAT',
        'Enter the 6-digit verification code.'
      );
    }

    if (
      method ===
        'authenticator' &&
      !methods.authenticator
    ) {
      return errorResponse(
        409,
        'AUTHENTICATOR_NOT_ENABLED',
        'Authenticator verification is not enabled for this administrator account.'
      );
    }

    if (
      method ===
        'email' &&
      !methods.email
    ) {
      return errorResponse(
        409,
        'EMAIL_TWO_FACTOR_NOT_ENABLED',
        'Email verification is not enabled for this administrator account.'
      );
    }

    if (
      method ===
        'recovery' &&
      !methods.recovery
    ) {
      return errorResponse(
        409,
        'RECOVERY_CODES_UNAVAILABLE',
        'No unused administrator recovery codes are available.'
      );
    }

    const rateIdentifier =
      `admin-login-2fa:${admin.id}:${ip}`;

    try {
      const rate =
        await checkRateLimit({
          identifier:
            rateIdentifier,

          action:
            `verify_${method}`,

          maxAttempts:
            VERIFY_RATE_LIMIT.maxAttempts,

          windowMs:
            VERIFY_RATE_LIMIT.windowMs,

          blockMs:
            VERIFY_RATE_LIMIT.blockMs,
        });

      if (
        !rate.allowed
      ) {
        await safeAudit({
          request,

          adminId:
            admin.id,

          eventType:
            'admin.two_factor.blocked',

          action:
            'admin_two_factor_verify',

          targetType:
            'platform_admin',

          targetId:
            admin.id,

          successful:
            false,

          failureReason:
            'rate_limited',

          metadata: {
            challengeId:
              challenge.id,

            method,
          },
        });

        return errorResponse(
          429,
          'TOO_MANY_VERIFICATION_ATTEMPTS',
          'Too many verification attempts. Try again later.',
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
        '[Admin 2FA] Verification rate limiter error:',
        error
      );

      return errorResponse(
        503,
        'SECURITY_SERVICE_UNAVAILABLE',
        'SaMi security services are temporarily unavailable.',
        {
          retryable:
            true,
        },
        {
          'Retry-After':
            '30',
        }
      );
    }

    let valid =
      false;

    let verificationMethod:
      | 'totp'
      | 'email'
      | 'recovery_code'
      | null =
      null;

    if (
      method ===
      'authenticator'
    ) {
      valid =
        await verifyAdminTwoFactorCode({
          adminId:
            admin.id,

          code,
        });

      if (valid) {
        verificationMethod =
          'totp';
      }
    }

    if (
      method ===
      'recovery'
    ) {
      valid =
        await useAdminRecoveryCode({
          adminId:
            admin.id,

          code,
        });

      if (valid) {
        verificationMethod =
          'recovery_code';
      }
    }

    if (
      method ===
      'email'
    ) {
      const emailVerification =
        await verifyAdminEmailTwoFactorCode({
          adminId:
            admin.id,

          sessionId:
            null,

          email:
            admin.email,

          purpose:
            'login_2fa',

          code,

          context: [
            'admin-login-2fa',
            challenge.id,
          ].join(':'),
        });

      valid =
        emailVerification
          .verified;

      if (valid) {
        verificationMethod =
          'email';

        await markAdminEmailTwoFactorUsed(
          admin.id
        );
      }

      if (
        !valid &&
        emailVerification
          .reason ===
          'attempts_exhausted'
      ) {
        await safeAudit({
          request,

          adminId:
            admin.id,

          eventType:
            'admin.two_factor.email_attempts_exhausted',

          action:
            'admin_two_factor_verify',

          targetType:
            'platform_admin',

          targetId:
            admin.id,

          successful:
            false,

          failureReason:
            'attempts_exhausted',

          metadata: {
            challengeId:
              challenge.id,

            method:
              'email',
          },
        });
      }
    }

    if (!valid) {
      await recordAdminLoginFailure({
        request,

        adminId:
          admin.id,

        attemptedEmail:
          admin.email,

        failureReason:
          'invalid_second_factor',

        metadata: {
          stage:
            'two_factor',

          challengeId:
            challenge.id,

          method,
        },
      });

      await safeAudit({
        request,

        adminId:
          admin.id,

        eventType:
          'admin.two_factor.failed',

        action:
          'admin_two_factor_verify',

        targetType:
          'platform_admin',

        targetId:
          admin.id,

        successful:
          false,

        failureReason:
          'invalid_second_factor',

        metadata: {
          challengeId:
            challenge.id,

          method,
        },
      });

      return errorResponse(
        401,
        'INVALID_TWO_FACTOR_CODE',
        method ===
          'recovery'
          ? 'The recovery code is invalid or has already been used.'
          : 'The verification code is incorrect or has expired.'
      );
    }

    const consumed =
      await consumeAdminLoginChallenge(
        challenge.id
      );

    if (!consumed) {
      const response =
        errorResponse(
          409,
          'LOGIN_CHALLENGE_CONSUMED',
          'This administrator sign-in challenge has already been used.'
        );

      clearAdminLoginChallengeCookie(
        response
      );

      return response;
    }

    await invalidateAdminEmailTwoFactorCodes({
      adminId:
        admin.id,

      purpose:
        'login_2fa',
    });

    const session =
      await createAdminSession({
        adminId:
          admin.id,

        request,

        rememberMe:
          challenge.rememberMe,
      });

    await updateAdminSuccessfulLogin(
      admin.id,
      getAdminRequestIp(
        request
      )
    );

    try {
      await resetRateLimit(
        rateIdentifier,
        `verify_${method}`
      );
    } catch (error) {
      console.error(
        '[Admin 2FA] Rate-limit reset error:',
        error
      );
    }

    await recordAdminLoginSuccess({
      request,

      adminId:
        admin.id,

      sessionId:
        session.sessionId,

      attemptedEmail:
        admin.email,

      metadata: {
        authenticationMethod:
          'password_and_two_factor',

        secondFactorMethod:
          verificationMethod,

        challengeId:
          challenge.id,

        rememberMe:
          challenge.rememberMe,
      },
    });

    await safeAudit({
      request,

      adminId:
        admin.id,

      sessionId:
        session.sessionId,

      eventType:
        'admin.two_factor.success',

      action:
        'admin_two_factor_verify',

      targetType:
        'platform_admin',

      targetId:
        admin.id,

      successful:
        true,

      metadata: {
        secondFactorMethod:
          verificationMethod,

        challengeId:
          challenge.id,
      },
    });

    const response =
      jsonResponse({
        success: true,

        code:
          'ADMIN_TWO_FACTOR_SUCCESS',

        authenticated:
          true,

        admin:
          getSafePlatformAdmin(
            admin
          ),

        session: {
          id:
            session.sessionId,

          expiresAt:
            session.expiresAt.toISOString(),
        },

        next:
          '/admin',
      });

    clearAdminLoginChallengeCookie(
      response
    );

    return response;
  } catch (error) {
    console.error(
      '[Admin Auth] Two-factor verification error:',
      error instanceof Error
        ? error.message
        : 'Unknown administrator two-factor error'
    );

    return errorResponse(
      500,
      'ADMIN_TWO_FACTOR_ERROR',
      'SaMi could not complete administrator verification.'
    );
  }
}