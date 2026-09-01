import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';
import { provisionTenant } from '@/lib/services/tenant-provisioning';
import { createPesaPalOrder } from '@/lib/services/pesapal';

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
     * 9. Find user's tenant
     * ============================================================
     */

    const tenantResult = await queryControl(
      `
        SELECT
          t.id,
          t.name,
          t.slug,
          t.status,
          tu.status AS membership_status,
          tu.is_owner
        FROM tenant_users tu
        INNER JOIN tenants t
          ON t.id = tu.tenant_id
        WHERE tu.user_id = $1
          AND t.deleted_at IS NULL
        ORDER BY
          tu.is_owner DESC,
          tu.created_at ASC
        LIMIT 1
      `,
      [verifiedUser.id]
    );

    if (tenantResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tenant not found.',
        },
        { status: 404 }
      );
    }

    const tenant = tenantResult.rows[0];

    /*
     * ============================================================
     * 10. Activate tenant membership
     * ============================================================
     */

    await queryControl(
      `
        UPDATE tenant_users
        SET
          status = CASE
            WHEN status = 'pending_verification'
              THEN 'active'
            ELSE status
          END
        WHERE tenant_id = $1
          AND user_id = $2
      `,
      [tenant.id, verifiedUser.id]
    );

    /*
     * ============================================================
     * 11. Update user status
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
     * 12. Get subscription and selected apps
     * ============================================================
     */

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

    const subscription = subscriptionResult.rows.length > 0
      ? subscriptionResult.rows[0]
      : null;

    // Get selected apps
    const appsResult = await queryControl(
      `
        SELECT m.key
        FROM tenant_modules tm
        INNER JOIN modules m
          ON m.id = tm.module_id
        WHERE tm.tenant_id = $1
          AND m.deleted_at IS NULL
      `,
      [tenant.id]
    );

    const selectedApps = appsResult.rows.map(row => row.key);

    /*
     * ============================================================
     * 13. Check if payment is required
     * ============================================================
     */

    const requiresPayment = subscription && subscription.status === 'pending_payment';

    /*
     * ============================================================
     * 14. FREE PLAN: Provision immediately
     * ============================================================
     */

    if (!requiresPayment) {
      // Update subscription to active
      await queryControl(
        `
          UPDATE subscriptions
          SET status = 'active', updated_at = NOW()
          WHERE id = $1 AND status = 'pending'
        `,
        [subscription.id]
      );

      // Update tenant to active
      await queryControl(
        `
          UPDATE tenants
          SET status = 'active', updated_at = NOW()
          WHERE id = $1
        `,
        [tenant.id]
      );

      // Update tenant_modules to installed
      await queryControl(
        `
          UPDATE tenant_modules
          SET status = 'installed', installed_at = NOW()
          WHERE tenant_id = $1 AND status = 'pending'
        `,
        [tenant.id]
      );

      // Provision tenant (install core + app schemas)
      try {
        await provisionTenant(tenant.id, selectedApps);
        console.log(`[SaMi] Tenant ${tenant.id} provisioned successfully`);
      } catch (provisionError) {
        console.error('[SaMi] Provisioning error:', provisionError);
        // Don't fail verification, just log error
      }

      return NextResponse.json(
        {
          success: true,
          verified: true,
          alreadyVerified: false,
          requiresPayment: false,
          nextStep: 'login',
          user: {
            id: verifiedUser.id,
            email: verifiedUser.email,
            firstName: verifiedUser.first_name,
            lastName: verifiedUser.last_name,
            fullName: verifiedUser.full_name,
            emailVerified: true,
            status: 'active',
          },
          tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            status: 'active',
          },
          subscription: {
            id: subscription.id,
            plan: subscription.plan_key,
            status: 'active',
          },
          selectedApps,
          message: 'Email verified successfully. Your workspace is being set up.',
        },
        { status: 200 }
      );
    }

    /*
     * ============================================================
     * 15. PAID PLAN: Create PesaPal order after verification
     * ============================================================
     */

    if (requiresPayment) {
      // Get user details for PesaPal
      const userDetails = await queryControl(
        `
          SELECT first_name, last_name, email
          FROM users
          WHERE id = $1 AND deleted_at IS NULL
        `,
        [verifiedUser.id]
      );

      const userData = userDetails.rows[0];

      // Update tenant to pending_payment
      await queryControl(
        `
          UPDATE tenants
          SET status = 'pending_payment', updated_at = NOW()
          WHERE id = $1
        `,
        [tenant.id]
      );

      // Determine amount
      const amount = subscription.plan_key === 'standard'
        ? parseInt(process.env.PESAPAL_PRICE_STANDARD_MONTHLY || '2000')
        : parseInt(process.env.PESAPAL_PRICE_CUSTOM_MONTHLY || '3340');

      // Create PesaPal order
      const pesapalOrder = await createPesaPalOrder({
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        amount,
        email: userData.email,
        firstName: userData.first_name,
        lastName: userData.last_name || '',
        businessName: tenant.name,
        plan: subscription.plan_key,
        selectedApps,
        origin: request.nextUrl.origin,
      });

      return NextResponse.json(
        {
          success: true,
          verified: true,
          alreadyVerified: false,
          requiresPayment: true,
          nextStep: 'payment',
          pesapalOrder,
          user: {
            id: verifiedUser.id,
            email: verifiedUser.email,
            firstName: verifiedUser.first_name,
            lastName: verifiedUser.last_name,
            fullName: verifiedUser.full_name,
            emailVerified: true,
            status: 'active',
          },
          tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            status: 'pending_payment',
          },
          subscription: {
            id: subscription.id,
            plan: subscription.plan_key,
            status: 'pending_payment',
          },
          selectedApps,
          message: 'Email verified successfully. Please complete payment to activate your workspace.',
        },
        { status: 200 }
      );
    }

    /*
     * ============================================================
     * 16. Fallback response
     * ============================================================
     */

    return NextResponse.json(
      {
        success: true,
        verified: true,
        alreadyVerified: false,
        nextStep: 'login',
        user: {
          id: verifiedUser.id,
          email: verifiedUser.email,
          firstName: verifiedUser.first_name,
          lastName: verifiedUser.last_name,
          fullName: verifiedUser.full_name,
          emailVerified: true,
          status: 'active',
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
        },
        selectedApps,
        message: 'Email verified successfully. You can now sign in to SaMi.',
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