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

function invalidCredentialsResponse() {
  return NextResponse.json(
    {
      success: false,
      code: 'INVALID_CREDENTIALS',
      error: 'Invalid email or password.',
    },
    {
      status: 401,
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
 * Ensure account is active
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
 * - There is no dashboard dependency.
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
          code: 'INVALID_REQUEST',
          error: 'Invalid request body.',
        },
        {
          status: 400,
        }
      );
    }

    const data = body as {
      email?: unknown;
      password?: unknown;
      rememberMe?: unknown;
    };

    // ========================================================
    // 2. NORMALIZE INPUT
    // ========================================================

    const email = normalizeEmail(data.email);

    const password =
      typeof data.password === 'string'
        ? data.password
        : '';

    /**
     * Currently session.ts uses a fixed 30-day session.
     *
     * We accept rememberMe so the frontend can send it without
     * breaking the API, but session.ts remains authoritative.
     */
    const rememberMe = data.rememberMe === true;

    // Prevent unused-variable warnings while keeping the API
    // compatible with the login form.
    void rememberMe;

    // ========================================================
    // 3. VALIDATE CREDENTIALS
    // ========================================================

    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
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
          code: 'INVALID_EMAIL',
          error: 'Please enter a valid email address.',
        },
        {
          status: 400,
        }
      );
    }

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

    const user = userResult.rows[0];

    // ========================================================
    // 5. DELETED ACCOUNT
    // ========================================================

    if (user.deleted_at) {
      return NextResponse.json(
        {
          success: false,
          code: 'ACCOUNT_UNAVAILABLE',
          error: 'This account is no longer available.',
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // 6. ACCOUNT STATUS CHECK
    // ========================================================

    /**
     * These statuses are never allowed to authenticate.
     */

    const blockedStatuses = new Set([
      'suspended',
      'disabled',
      'deleted',
      'cancelled',
      'banned',
    ]);

    if (blockedStatuses.has(user.status)) {
      return NextResponse.json(
        {
          success: false,
          code: 'ACCOUNT_UNAVAILABLE',
          error:
            'This account is currently unavailable. Please contact SaMi support.',
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // 7. PASSWORD HASH VALIDATION
    // ========================================================

    if (
      !user.password_hash ||
      typeof user.password_hash !== 'string'
    ) {
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
          code: 'EMAIL_VERIFICATION_REQUIRED',
          error:
            'Please verify your email address before signing in.',
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
     * Once the email is verified and the password is correct,
     * the account can become active.
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
        return NextResponse.json(
          {
            success: false,
            code: 'ACCOUNT_UNAVAILABLE',
            error:
              'Unable to activate this account. Please try again.',
          },
          {
            status: 403,
          }
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
     *
     * This is important because getSession() in session.ts
     * also requires:
     *
     * u.status = 'active'
     */

    if (user.status !== 'active') {
      return NextResponse.json(
        {
          success: false,
          code: 'ACCOUNT_UNAVAILABLE',
          error:
            'This account is not currently available for sign in.',
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // 12. CREATE SESSION
    // ========================================================

    /**
     * Your session.ts requires:
     *
     * createSession(userId, request)
     *
     * The request allows the session system to record:
     *
     * - IP address
     * - User-Agent
     * - device type
     * - browser
     * - operating system
     *
     * It also creates the:
     *
     * __Host-sami_session
     *
     * HttpOnly cookie.
     */

    const session = await createSession(
      user.id,
      request
    );

    // ========================================================
    // 13. RETURN AUTHENTICATED USER
    // ========================================================

    /**
     * We intentionally do NOT query:
     *
     * - tenants
     * - subscriptions
     * - workspaces
     * - dashboard
     *
     * Login should authenticate the user.
     *
     * Those features can be added later when their routes
     * actually exist.
     */

    const fullName =
      user.full_name ||
      `${user.first_name || ''} ${user.last_name || ''}`.trim();

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