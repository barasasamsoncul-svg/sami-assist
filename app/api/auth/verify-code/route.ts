import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { queryControl, withControlTransaction } from '@/lib/db/control';

export const runtime = 'nodejs';

const CODE_LENGTH = 6;

/**
 * Normalize an email address.
 */
function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

/**
 * Normalize a verification code.
 */
function normalizeCode(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

/**
 * Validate email format.
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Hash the verification code before comparing it with the database.
 *
 * Verification codes are never stored or queried in plain text.
 */
function hashVerificationCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code)
    .digest('hex');
}

/**
 * POST /api/auth/verify-code
 *
 * This endpoint ONLY verifies the email verification code.
 *
 * Responsibilities:
 * - Validate email + 6-digit code
 * - Find the user
 * - Atomically consume the verification code
 * - Mark the email as verified
 * - Activate the account
 * - Invalidate all remaining verification codes
 * - Return tenant/subscription information
 *
 * NOT responsible for:
 * - Sending verification emails
 * - Creating verification codes
 * - Provisioning tenants
 * - Creating payments
 * - Creating sessions
 * - Redirecting users
 *
 * Email sending happens during registration/payment completion.
 * Tenant provisioning happens during registration/payment completion.
 * Login creates the authenticated session.
 */
export async function POST(request: NextRequest) {
  try {
    // ============================================================
    // 1. Parse request
    // ============================================================

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body.',
        },
        { status: 400 },
      );
    }

    const rawBody =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>)
        : {};

    const email = normalizeEmail(rawBody.email);
    const code = normalizeCode(rawBody.code);

    // ============================================================
    // 2. Validate input
    // ============================================================

    if (!email || !code) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email and verification code are required.',
        },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please enter a valid email address.',
        },
        { status: 400 },
      );
    }

    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Verification code must be 6 digits.',
        },
        { status: 400 },
      );
    }

    // ============================================================
    // 3. Hash submitted code
    // ============================================================

    const hashedCode = hashVerificationCode(code);

    // ============================================================
    // 4. Atomically verify everything
    // ============================================================
    //
    // These operations must succeed or fail together:
    //
    // 1. Find and consume the verification code
    // 2. Mark email as verified
    // 3. Activate the account
    // 4. Invalidate all remaining codes
    //
    // Using a transaction prevents partially completed verification.
    // ============================================================

    const verificationResult = await withControlTransaction(
      async (client) => {
        // ----------------------------------------------------------
        // Find the user
        // ----------------------------------------------------------

        const userResult = await client.query(
          `
            SELECT
              id,
              email,
              first_name,
              last_name,
              full_name,
              status,
              email_verified_at,
              deleted_at
            FROM users
            WHERE LOWER(email) = $1
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [email],
        );

        if (userResult.rows.length === 0) {
          return {
            type: 'invalid' as const,
          };
        }

        const user = userResult.rows[0];

        // ----------------------------------------------------------
        // Already verified
        // ----------------------------------------------------------

        if (user.email_verified_at) {
          return {
            type: 'already_verified' as const,
            user,
          };
        }

        // ----------------------------------------------------------
        // Consume the newest valid verification code
        // ----------------------------------------------------------

        const codeResult = await client.query(
          `
            UPDATE email_verifications
            SET used_at = NOW()
            WHERE id = (
              SELECT id
              FROM email_verifications
              WHERE email = $1
                AND code_hash = $2
                AND expires_at > NOW()
                AND used_at IS NULL
                AND deleted_at IS NULL
              ORDER BY created_at DESC
              LIMIT 1
              FOR UPDATE SKIP LOCKED
            )
            RETURNING id
          `,
          [email, hashedCode],
        );

        if (codeResult.rows.length === 0) {
          return {
            type: 'invalid' as const,
          };
        }

        // ----------------------------------------------------------
        // Mark email as verified
        // ----------------------------------------------------------

        const updateUserResult = await client.query(
          `
            UPDATE users
            SET
              email_verified_at = NOW(),
              updated_at = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
              AND email_verified_at IS NULL
            RETURNING
              id,
              email,
              first_name,
              last_name,
              full_name,
              status,
              email_verified_at
          `,
          [user.id],
        );

        if (updateUserResult.rows.length === 0) {
          throw new Error(
            'Unable to update user verification status.',
          );
        }

        const verifiedUser = updateUserResult.rows[0];

        // ----------------------------------------------------------
        // Invalidate all other verification codes
        // ----------------------------------------------------------

        await client.query(
          `
            UPDATE email_verifications
            SET deleted_at = NOW()
            WHERE email = $1
              AND used_at IS NULL
              AND deleted_at IS NULL
          `,
          [email],
        );

        // ----------------------------------------------------------
        // Activate account
        // ----------------------------------------------------------

        await client.query(
          `
            UPDATE users
            SET
              status = 'active',
              updated_at = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
          `,
          [verifiedUser.id],
        );

        return {
          type: 'verified' as const,
          user: verifiedUser,
        };
      },
    );

    // ============================================================
    // 5. Invalid / expired code
    // ============================================================

    if (verificationResult.type === 'invalid') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid or expired verification code.',
        },
        { status: 400 },
      );
    }

    // ============================================================
    // 6. Already verified
    // ============================================================

    if (verificationResult.type === 'already_verified') {
      return NextResponse.json(
        {
          success: true,
          verified: true,
          alreadyVerified: true,
          message: 'Email is already verified.',
        },
        { status: 200 },
      );
    }

    const verifiedUser = verificationResult.user;

    // ============================================================
    // 7. Get tenant information
    // ============================================================

    const tenantResult = await queryControl(
      `
        SELECT
          t.id,
          t.name,
          t.slug,
          t.status
        FROM tenant_users tu
        INNER JOIN tenants t
          ON t.id = tu.tenant_id
        WHERE tu.user_id = $1
          AND t.deleted_at IS NULL
        ORDER BY tu.is_owner DESC, tu.created_at ASC
        LIMIT 1
      `,
      [verifiedUser.id],
    );

    const tenant =
      tenantResult.rows.length > 0
        ? tenantResult.rows[0]
        : null;

    // ============================================================
    // 8. Get subscription information
    // ============================================================

    let subscription = null;

    if (tenant) {
      const subscriptionResult = await queryControl(
        `
          SELECT
            s.id,
            s.status,
            p.key AS plan_key,
            p.name AS plan_name,
            s.trial_ends_at
          FROM subscriptions s
          INNER JOIN plans p
            ON p.id = s.plan_id
          WHERE s.tenant_id = $1
            AND p.deleted_at IS NULL
          ORDER BY s.created_at DESC
          LIMIT 1
        `,
        [tenant.id],
      );

      if (subscriptionResult.rows.length > 0) {
        subscription = subscriptionResult.rows[0];
      }
    }

    // ============================================================
    // 9. Success response
    // ============================================================

    return NextResponse.json(
      {
        success: true,
        verified: true,
        alreadyVerified: false,

        user: {
          id: verifiedUser.id,
          email: verifiedUser.email,
          firstName: verifiedUser.first_name,
          lastName: verifiedUser.last_name,
          fullName: verifiedUser.full_name,
          emailVerified: true,
          status: 'active',
        },

        tenant: tenant
          ? {
              id: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
              status: tenant.status,
            }
          : null,

        subscription: subscription
          ? {
              id: subscription.id,
              plan: subscription.plan_key,
              status: subscription.status,
              trialEndsAt: subscription.trial_ends_at,
            }
          : null,

        message:
          'Email verified successfully. You can now login.',
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      '[SaMi] Email verification error:',
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to verify email. Please try again.',
      },
      { status: 500 },
    );
  }
}