import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';

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
 * Hash the verification code.
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
 * This endpoint ONLY verifies the email code.
 * - Provisioning happens in register (free) or callback (paid)
 * - Email sending happens in register (free) or callback (paid)
 */
export async function POST(request: NextRequest) {
  try {
    /*
     * ============================================================
     * 1. Parse request
     * ============================================================
     */

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body.',
        },
        { status: 400 }
      );
    }

    const rawBody =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>)
        : {};

    const email = normalizeEmail(rawBody.email);
    const code = normalizeCode(rawBody.code);

    /*
     * ============================================================
     * 2. Validate input
     * ============================================================
     */

    if (!email || !code) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email and verification code are required.',
        },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please enter a valid email address.',
        },
        { status: 400 }
      );
    }

    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Verification code must be 6 digits.',
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 3. Find user
     * ============================================================
     */

    const userResult = await queryControl(
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
      `,
      [email]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid or expired verification code.',
        },
        { status: 400 }
      );
    }

    const user = userResult.rows[0];

    /*
     * ============================================================
     * 4. Already verified
     * ============================================================
     */

    if (user.email_verified_at) {
      return NextResponse.json(
        {
          success: true,
          verified: true,
          alreadyVerified: true,
          message: 'Email is already verified.',
        },
        { status: 200 }
      );
    }

    /*
     * ============================================================
     * 5. Hash submitted code
     * ============================================================
     */

    const hashedCode = hashVerificationCode(code);

    /*
     * ============================================================
     * 6. Atomically consume verification code
     * ============================================================
     */

    const verificationResult = await queryControl(
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
      [email, hashedCode]
    );

    if (verificationResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid or expired verification code.',
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 7. Mark email as verified
     * ============================================================
     */

    const updateUserResult = await queryControl(
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
      [user.id]
    );

    if (updateUserResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unable to verify your email. Please try again.',
        },
        { status: 409 }
      );
    }

    const verifiedUser = updateUserResult.rows[0];

    /*
     * ============================================================
     * 8. Invalidate remaining verification codes
     * ============================================================
     */

    await queryControl(
      `
        UPDATE email_verifications
        SET deleted_at = NOW()
        WHERE email = $1
          AND used_at IS NULL
          AND deleted_at IS NULL
      `,
      [email]
    );

    /*
     * ============================================================
     * 9. Update user status
     * ============================================================
     */

    await queryControl(
      `
        UPDATE users
        SET status = 'active', updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [verifiedUser.id]
    );

    /*
     * ============================================================
     * 10. Get tenant info for response
     * ============================================================
     */

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
        ORDER BY tu.is_owner DESC
        LIMIT 1
      `,
      [verifiedUser.id]
    );

    const tenant = tenantResult.rows.length > 0
      ? tenantResult.rows[0]
      : null;

    /*
     * ============================================================
     * 11. Get subscription info for response
     * ============================================================
     */

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
        [tenant.id]
      );

      if (subscriptionResult.rows.length > 0) {
        subscription = subscriptionResult.rows[0];
      }
    }

    /*
     * ============================================================
     * 12. Success response
     * ============================================================
     */

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
        message: 'Email verified successfully. You can now login.',
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('[SaMi] Email verification error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to verify email. Please try again.',
      },
      { status: 500 }
    );
  }
}