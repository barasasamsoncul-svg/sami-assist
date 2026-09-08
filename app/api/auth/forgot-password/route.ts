import {
  NextRequest,
  NextResponse,
} from 'next/server';

import crypto from 'crypto';

import { queryControl } from '@/lib/db/control';
import { sendPasswordResetEmail } from '@/lib/services/password-reset-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const RESET_TOKEN_BYTES = 48;

const RESET_TOKEN_EXPIRY_MINUTES =
  30;

const RESET_RESEND_COOLDOWN_SECONDS =
  60;

const RESET_MAX_REQUESTS_PER_HOUR =
  5;

const MAX_EMAIL_LENGTH =
  254;

/* ============================================================
   TYPES
   ============================================================ */

type ForgotPasswordBody = {
  email?: unknown;
};

type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  status: string | null;
};

type ResetActivityRow = {
  request_count:
    | string
    | number
    | null;

  latest_created_at:
    | Date
    | string
    | null;
};

/* ============================================================
   EMAIL
   ============================================================ */

function normalizeEmail(
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
    .toLowerCase();
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
   TOKENS
   ============================================================ */

function generateResetToken():
  string {
  return crypto
    .randomBytes(
      RESET_TOKEN_BYTES
    )
    .toString(
      'base64url'
    );
}

function hashToken(
  token: string
): string {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      token,
      'utf8'
    )
    .digest('hex');
}

/* ============================================================
   URLS
   ============================================================ */

function normalizeBaseUrl(
  value: string
) {
  return value
    .trim()
    .replace(/\/+$/, '');
}

/**
 * Prefer a configured canonical application URL.
 *
 * This is better than trusting forwarded-host headers for
 * security-sensitive email links.
 */
function getAppBaseUrl(
  request: NextRequest
): string {
  const configuredUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (configuredUrl) {
    try {
      const url =
        new URL(
          configuredUrl
        );

      if (
        url.protocol ===
          'https:' ||
        url.protocol ===
          'http:'
      ) {
        return normalizeBaseUrl(
          url.origin
        );
      }
    } catch {
      console.error(
        '[Auth] APP_URL/NEXT_PUBLIC_APP_URL is invalid.'
      );
    }
  }

  /*
   * Development / fallback.
   *
   * request.nextUrl.origin is preferable to manually building
   * a URL from arbitrary forwarded-host values.
   */
  return normalizeBaseUrl(
    request.nextUrl.origin
  );
}

/**
 * Email clients cannot render the React SaMiLogo component.
 *
 * They need a publicly accessible image URL.
 *
 * SAMI_EMAIL_LOGO_URL can point to the final email-safe
 * export of the approved SaMi identity.
 *
 * Fallback:
 *   <APP_URL>/logo.png
 */
function getEmailLogoUrl(
  baseUrl: string
): string {
  const configuredLogo =
    process.env.SAMI_EMAIL_LOGO_URL?.trim();

  if (configuredLogo) {
    try {
      const url =
        new URL(
          configuredLogo
        );

      if (
        url.protocol ===
          'https:' ||
        url.protocol ===
          'http:'
      ) {
        return url.toString();
      }
    } catch {
      console.error(
        '[Auth] SAMI_EMAIL_LOGO_URL is invalid.'
      );
    }
  }

  return `${baseUrl}/logo.png`;
}

/* ============================================================
   RESPONSES
   ============================================================ */

/**
 * IMPORTANT:
 *
 * This exact response is used whether:
 *
 * - the account exists
 * - it does not exist
 * - its status does not permit reset
 * - a reset was recently requested
 * - the hourly reset threshold was reached
 *
 * This prevents account enumeration.
 */
function successResponse() {
  return NextResponse.json(
    {
      success: true,

      code:
        'RESET_LINK_SENT',

      message:
        'If the email exists, a password reset link has been sent.',

      retryAfterSeconds:
        RESET_RESEND_COOLDOWN_SECONDS,
    },
    {
      status: 200,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',
      },
    }
  );
}

function errorResponse(
  status: number,
  code: string,
  message: string
) {
  return NextResponse.json(
    {
      success: false,
      code,
      error: message,
      message,
    },
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
   RATE LIMITING
   ============================================================ */

/**
 * User-specific reset throttling.
 *
 * We still return the generic success response when throttled,
 * so this check cannot be used to discover registered emails.
 */
async function canIssueResetToken(
  userId: string
): Promise<boolean> {
  const result =
    await queryControl(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE created_at >=
              NOW() - INTERVAL '1 hour'
          ) AS request_count,

          MAX(created_at) AS latest_created_at

        FROM password_reset_tokens

        WHERE user_id = $1
      `,
      [userId]
    );

  const row =
    result.rows[0] as
      | ResetActivityRow
      | undefined;

  const requestCount =
    Number(
      row?.request_count ||
        0
    );

  if (
    requestCount >=
    RESET_MAX_REQUESTS_PER_HOUR
  ) {
    return false;
  }

  if (
    row?.latest_created_at
  ) {
    const latest =
      new Date(
        row.latest_created_at
      ).getTime();

    if (
      !Number.isNaN(latest)
    ) {
      const elapsedSeconds =
        (Date.now() -
          latest) /
        1000;

      if (
        elapsedSeconds <
        RESET_RESEND_COOLDOWN_SECONDS
      ) {
        return false;
      }
    }
  }

  return true;
}

/* ============================================================
   AUDIT
   ============================================================ */

function getClientIp(
  request: NextRequest
): string | null {
  return (
    request.headers
      .get(
        'x-forwarded-for'
      )
      ?.split(',')[0]
      ?.trim() ||
    request.headers.get(
      'x-real-ip'
    ) ||
    null
  );
}

async function recordPasswordResetRequested(
  request: NextRequest,
  userId: string,
  emailSent: boolean
): Promise<void> {
  try {
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
          NULL,
          $1,
          'PASSWORD_RESET_REQUESTED',
          'auth',
          $1,
          $2,
          $3,
          $4,
          NOW()
        )
      `,
      [
        userId,

        getClientIp(
          request
        ),

        request.headers.get(
          'user-agent'
        ) || null,

        JSON.stringify({
          delivery:
            'email',

          emailSent,
        }),
      ]
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to record password reset request:',
      error
    );
  }
}

/* ============================================================
   INVALIDATE TOKEN AFTER EMAIL FAILURE
   ============================================================ */

async function invalidateResetToken(
  userId: string,
  tokenHash: string
) {
  try {
    await queryControl(
      `
        UPDATE password_reset_tokens
        SET deleted_at = NOW()
        WHERE user_id = $1
          AND token_hash = $2
          AND used_at IS NULL
          AND deleted_at IS NULL
      `,
      [
        userId,
        tokenHash,
      ]
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to invalidate undelivered reset token:',
      error
    );
  }
}

/* ============================================================
   POST
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  /* ==========================================================
     REQUEST BODY
     ========================================================== */

  let body:
    ForgotPasswordBody;

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
      parsed as ForgotPasswordBody;
  } catch {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'Invalid request body.'
    );
  }

  /* ==========================================================
     EMAIL VALIDATION
     ========================================================== */

  const email =
    normalizeEmail(
      body.email
    );

  if (
    !isValidEmail(
      email
    )
  ) {
    return errorResponse(
      400,
      'INVALID_EMAIL',
      'Please enter a valid email address.'
    );
  }

  try {
    /* ========================================================
       USER LOOKUP
       ======================================================== */

    const userResult =
      await queryControl(
        `
          SELECT
            id,
            email,
            first_name,
            status
          FROM users
          WHERE LOWER(email) = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [email]
      );

    /*
     * SECURITY:
     *
     * Never reveal whether this email exists.
     */
    if (
      userResult.rows.length ===
      0
    ) {
      return successResponse();
    }

    const user =
      userResult
        .rows[0] as UserRow;

    /* ========================================================
       ACCOUNT STATUS
       ======================================================== */

    const userStatus =
      String(
        user.status || ''
      )
        .trim()
        .toLowerCase();

    /*
     * Locked accounts may still reset their password.
     *
     * Whether password reset clears a lock must be handled by
     * the reset-password API, not here.
     */
    const allowedStatuses =
      new Set([
        'active',
        'locked',
        'pending_verification',
        'pending',
      ]);

    if (
      !allowedStatuses.has(
        userStatus
      )
    ) {
      return successResponse();
    }

    /* ========================================================
       SERVER-SIDE THROTTLING
       ======================================================== */

    const canReset =
      await canIssueResetToken(
        user.id
      );

    if (!canReset) {
      return successResponse();
    }

    /* ========================================================
       CREATE RESET TOKEN
       ======================================================== */

    const rawToken =
      generateResetToken();

    const tokenHash =
      hashToken(
        rawToken
      );

    const expiresAt =
      new Date(
        Date.now() +
          RESET_TOKEN_EXPIRY_MINUTES *
            60 *
            1000
      );

    /*
     * Only one active password reset token per account.
     */
    await queryControl(
      `
        UPDATE password_reset_tokens
        SET deleted_at = NOW()
        WHERE user_id = $1
          AND used_at IS NULL
          AND deleted_at IS NULL
      `,
      [user.id]
    );

    await queryControl(
      `
        INSERT INTO password_reset_tokens (
          user_id,
          token_hash,
          expires_at,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          NOW()
        )
      `,
      [
        user.id,
        tokenHash,
        expiresAt,
      ]
    );

    /* ========================================================
       PASSWORD RESET URL
       ======================================================== */

    const baseUrl =
      getAppBaseUrl(
        request
      );

    const resetUrl =
      `${baseUrl}/reset-password` +
      `?token=${encodeURIComponent(
        rawToken
      )}` +
      `&email=${encodeURIComponent(
        user.email
      )}`;

    /* ========================================================
       SAMI EMAIL BRANDING
       ======================================================== */

    const logoUrl =
      getEmailLogoUrl(
        baseUrl
      );

    /*
     * IMPORTANT:
     *
     * `logoUrl` is intentionally supplied to every email
     * service that sends branded SaMi mail.
     *
     * The password-reset-email service must render this URL
     * in its HTML email template.
     *
     * Passing this as a variable remains compatible with an
     * older service input type while we update that service.
     */
    const emailPayload = {
      email:
        user.email,

      firstName:
        user.first_name ||
        '',

      resetUrl,

      logoUrl,
    };

    const emailResult =
      await sendPasswordResetEmail(
        emailPayload
      );

    /* ========================================================
       EMAIL DELIVERY FAILURE
       ======================================================== */

    if (
      !emailResult.success
    ) {
      console.error(
        '[Auth] Failed to send password reset email:',
        emailResult.error
      );

      /*
       * Do not leave an active reset token that the user never
       * received.
       */
      await invalidateResetToken(
        user.id,
        tokenHash
      );

      await recordPasswordResetRequested(
        request,
        user.id,
        false
      );

      /*
       * Still return the generic response.
       *
       * Exposing delivery failure only for existing accounts
       * would leak account existence.
       */
      return successResponse();
    }

    /* ========================================================
       AUDIT
       ======================================================== */

    await recordPasswordResetRequested(
      request,
      user.id,
      true
    );

    /* ========================================================
       RESPONSE
       ======================================================== */

    return successResponse();
  } catch (error) {
    console.error(
      '[Auth] Forgot password failed:',
      error
    );

    return errorResponse(
      500,
      'FORGOT_PASSWORD_ERROR',
      'Could not process the password recovery request.'
    );
  }
}