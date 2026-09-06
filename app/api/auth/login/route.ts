import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import { queryControl } from '@/lib/db/control';
import { createSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

// ============================================================
// CONSTANTS
// ============================================================

const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 128;

// ============================================================
// TYPES
// ============================================================

type LoginRequest = {
  email?: unknown;
  password?: unknown;
  rememberMe?: unknown;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  status: string;
  email_verified_at: Date | string | null;
  avatar_file_id: string | null;
  deleted_at: Date | string | null;
};

// ============================================================
// HELPERS
// ============================================================

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return (
    email.length > 0 &&
    email.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

/**
 * Keep authentication failure responses deliberately generic
 * so we don't reveal whether an email address exists.
 */
function invalidCredentialsResponse() {
  return NextResponse.json(
    {
      success: false,
      authenticated: false,
      code: 'INVALID_CREDENTIALS',
      error: 'Invalid email or password.',
    },
    {
      status: 401,
    }
  );
}

/**
 * Standard account-state response.
 */
function accountUnavailableResponse(
  code:
    | 'ACCOUNT_LOCKED'
    | 'ACCOUNT_SUSPENDED'
    | 'ACCOUNT_DISABLED'
    | 'ACCOUNT_DELETED'
    | 'ACCOUNT_CANCELLED'
    | 'ACCOUNT_BANNED'
    | 'ACCOUNT_UNAVAILABLE',
  error: string,
  status = 403
) {
  return NextResponse.json(
    {
      success: false,
      authenticated: false,
      code,
      error,
    },
    {
      status,
    }
  );
}

// ============================================================
// POST /api/auth/login
// ============================================================

/**
 * SaMi login flow:
 *
 * Login form
 *    ↓
 * Validate request
 *    ↓
 * Normalize email
 *    ↓
 * Find user
 *    ↓
 * Check account availability
 *    ↓
 * Verify password
 *    ↓
 * Verify email
 *    ↓
 * Activate pending verified account
 *    ↓
 * Check active status
 *    ↓
 * Future Identity Core checks:
 *    ├── 2FA
 *    ├── device verification
 *    ├── suspicious-login verification
 *    └── other authentication challenges
 *    ↓
 * Create server-side session
 *    ↓
 * Set __Host-sami_session cookie
 *    ↓
 * Return authenticated user
 *
 * IMPORTANT:
 *
 * - Raw passwords are never stored.
 * - Raw passwords are never logged.
 * - Raw session tokens are never stored in the database.
 * - Session creation is handled by lib/auth/session.ts.
 * - The login API does NOT perform redirects.
 * - The login API does NOT depend on the dashboard.
 * - Authentication state is communicated using stable codes.
 * - The frontend decides which authentication screen to display.
 */

export async function POST(request: NextRequest) {
  try {
    // ========================================================
    // 1. PARSE REQUEST
    // ========================================================

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          code: 'INVALID_REQUEST',
          error: 'Invalid request body.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          code: 'INVALID_REQUEST',
          error: 'Invalid request body.',
        },
        {
          status: 400,
        }
      );
    }

    const data = body as LoginRequest;

    // ========================================================
    // 2. NORMALIZE INPUT
    // ========================================================

    const email = normalizeEmail(data.email);

    const password =
      typeof data.password === 'string'
        ? data.password
        : '';

    /**
     * The login page sends rememberMe.
     *
     * IMPORTANT:
     * createSession() currently owns the session lifetime.
     * Until createSession() accepts a session-lifetime option,
     * we deliberately do not pretend that rememberMe changes
     * the session duration.
     */
    const rememberMe = data.rememberMe === true;

    // Keep API compatibility and make the intended behavior
    // explicit without changing session.ts from this route.
    void rememberMe;

    // ========================================================
    // 3. VALIDATE REQUEST
    // ========================================================

    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          code: 'MISSING_CREDENTIALS',
          error: 'Email and password are required.',
        },
        {
          status: 400,
        }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          code: 'INVALID_EMAIL',
          error: 'Please enter a valid email address.',
        },
        {
          status: 400,
        }
      );
    }

    /**
     * We intentionally return the generic authentication error
     * for an excessively long password instead of exposing
     * validation details about the password.
     */
    if (password.length > MAX_PASSWORD_LENGTH) {
      return invalidCredentialsResponse();
    }

    // ========================================================
    // 4. FIND USER
    // ========================================================

    /**
     * We intentionally do not immediately reveal whether an
     * email exists.
     *
     * Unknown email and incorrect password return the same
     * authentication response.
     */

    const userResult = await queryControl(
      `
        SELECT
          id,
          email,
          password_hash,
          first_name,
          last_name,
          full_name,
          phone,
          status,
          email_verified_at,
          avatar_file_id,
          deleted_at
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
      `,
      [email]
    );

    if (userResult.rows.length === 0) {
      return invalidCredentialsResponse();
    }

    const user = userResult.rows[0] as UserRow;

    // ========================================================
    // 5. DELETED ACCOUNT
    // ========================================================

    if (user.deleted_at) {
      return accountUnavailableResponse(
        'ACCOUNT_DELETED',
        'This account is no longer available.'
      );
    }

    // ========================================================
    // 6. ACCOUNT STATUS CHECK
    // ========================================================

    /**
     * These statuses must never receive a normal session.
     *
     * We return distinct codes because the frontend is capable
     * of presenting the appropriate state.
     */

    switch (user.status) {
      case 'suspended':
        return accountUnavailableResponse(
          'ACCOUNT_SUSPENDED',
          'This account has been suspended. Please contact SaMi support.'
        );

      case 'disabled':
        return accountUnavailableResponse(
          'ACCOUNT_DISABLED',
          'This account is disabled. Please contact your administrator.'
        );

      case 'deleted':
        return accountUnavailableResponse(
          'ACCOUNT_DELETED',
          'This account is no longer available.'
        );

      case 'cancelled':
        return accountUnavailableResponse(
          'ACCOUNT_CANCELLED',
          'This account has been cancelled. Please contact SaMi support.'
        );

      case 'banned':
        return accountUnavailableResponse(
          'ACCOUNT_BANNED',
          'This account is unavailable. Please contact SaMi support.'
        );

      case 'locked':
        return accountUnavailableResponse(
          'ACCOUNT_LOCKED',
          'This account is temporarily locked. Please try again later.'
        );

      default:
        break;
    }

    // ========================================================
    // 7. PASSWORD HASH VALIDATION
    // ========================================================

    if (
      !user.password_hash ||
      typeof user.password_hash !== 'string'
    ) {
      /**
       * This should never normally happen.
       *
       * Do not reveal the internal database state to the client.
       */
      console.error(
        '[SaMi] User has no valid password hash:',
        user.id
      );

      return invalidCredentialsResponse();
    }

    // ========================================================
    // 8. VERIFY PASSWORD
    // ========================================================

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return invalidCredentialsResponse();
    }

    // ========================================================
    // 9. EMAIL VERIFICATION
    // ========================================================

    /**
     * Email verification is required before creating an
     * authenticated application session.
     */

    if (!user.email_verified_at) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          code: 'EMAIL_VERIFICATION_REQUIRED',
          error:
            'Please verify your email address before signing in.',
          nextStep: 'verify-email',
          user: {
            id: user.id,
            email: user.email,
            emailVerified: false,
          },
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // 10. ACTIVATE VERIFIED ACCOUNT
    // ========================================================

    /**
     * Registration may initially create users as:
     *
     * pending
     * pending_verification
     *
     * Once the email has been verified and the password is
     * correct, the account can become active.
     */

    if (
      user.status === 'pending_verification' ||
      user.status === 'pending'
    ) {
      const activationResult = await queryControl(
        `
          UPDATE users
          SET
            status = 'active',
            updated_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
            AND email_verified_at IS NOT NULL
            AND status IN (
              'pending_verification',
              'pending'
            )
          RETURNING
            id,
            status
        `,
        [user.id]
      );

      if (activationResult.rows.length === 0) {
        /**
         * The account changed between the initial SELECT and
         * this update.
         */
        return accountUnavailableResponse(
          'ACCOUNT_UNAVAILABLE',
          'Unable to activate this account. Please try again.'
        );
      }

      user.status = 'active';
    }

    // ========================================================
    // 11. FINAL ACTIVE-ACCOUNT CHECK
    // ========================================================

    /**
     * Only active users should receive a normal authenticated
     * session.
     */

    if (user.status !== 'active') {
      return accountUnavailableResponse(
        'ACCOUNT_UNAVAILABLE',
        'This account is not currently available for sign in.'
      );
    }

    // ========================================================
    // 12. FUTURE AUTHENTICATION CHALLENGES
    // ========================================================

    /**
     * IMPORTANT:
     *
     * Do NOT create fake 2FA/device-verification behavior here.
     *
     * When Identity Core implements those systems, this is the
     * correct point in the flow to evaluate them:
     *
     * Password verified
     *       ↓
     * Email verified
     *       ↓
     * Account active
     *       ↓
     * Authentication challenge
     *       ↓
     * Session
     *
     * For example:
     *
     * if (requiresTwoFactor) {
     *   return NextResponse.json({
     *     success: false,
     *     authenticated: false,
     *     code: 'TWO_FACTOR_REQUIRED',
     *     nextStep: '2fa',
     *   }, { status: 200 });
     * }
     *
     * The actual implementation should use a short-lived,
     * server-side challenge rather than storing credentials
     * or authentication secrets in browser storage.
     */

    // ========================================================
    // 13. CREATE SERVER-SIDE SESSION
    // ========================================================

    /**
     * session.ts is authoritative for session creation.
     *
     * It is responsible for:
     *
     * - generating the session token
     * - storing the session securely
     * - recording request metadata
     * - setting the __Host-sami_session cookie
     * - enforcing the session lifetime
     */

    const session = await createSession(
  user.id,
  request,
  {
    rememberMe,
  }
);

    // ========================================================
    // 14. BUILD SAFE USER RESPONSE
    // ========================================================

    /**
     * Never return:
     *
     * - password_hash
     * - session token
     * - internal authentication secrets
     * - database credentials
     */

    const fullName =
      user.full_name ||
      `${user.first_name || ''} ${user.last_name || ''}`.trim();

    // ========================================================
    // 15. SUCCESS RESPONSE
    // ========================================================

    return NextResponse.json(
      {
        success: true,
        authenticated: true,

        user: {
          id: user.id,
          email: user.email,

          firstName:
            user.first_name || '',

          lastName:
            user.last_name || '',

          fullName,

          phone:
            user.phone || null,

          emailVerified:
            Boolean(user.email_verified_at),

          avatarFileId:
            user.avatar_file_id || null,

          status: 'active',
        },

        session: {
          id: session.sessionId,
          expiresAt: session.expiresAt,
        },

        message: 'Login successful.',
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    // ========================================================
    // UNEXPECTED ERROR
    // ========================================================

    /**
     * Never expose:
     *
     * - SQL errors
     * - database credentials
     * - password information
     * - session tokens
     * - internal stack traces
     */

    console.error(
      '[SaMi] Login error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        code: 'LOGIN_FAILED',
        error:
          'Unable to sign in right now. Please try again.',
      },
      {
        status: 500,
      }
    );
  }
}