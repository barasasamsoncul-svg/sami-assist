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
 *
 * The plain six-digit code is never stored in the database.
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
 * Email verification flow:
 *
 * 1. Validate email + code
 * 2. Find the user
 * 3. Check whether email is already verified
 * 4. Atomically consume a valid verification code
 * 5. Mark the user as verified
 * 6. Activate the tenant/member where appropriate
 * 7. Update the subscription state where appropriate
 * 8. Invalidate all remaining verification codes
 * 9. Return the resulting account state
 *
 * NOTE:
 * This route does NOT create a login session.
 * Login/session creation will be handled by /api/auth/login.
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
      /*
       * Do not reveal whether the email exists.
       */
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
      /*
       * We still return the user's current account state.
       *
       * This makes the frontend able to continue correctly if
       * the user accidentally submits the verification code twice.
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
        [user.id]
      );

      const tenant =
        tenantResult.rows.length > 0
          ? tenantResult.rows[0]
          : null;

      const subscriptionResult = tenant
        ? await queryControl(
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
              ORDER BY
                s.created_at DESC
              LIMIT 1
            `,
            [tenant.id]
          )
        : null;

      const subscription =
        subscriptionResult &&
        subscriptionResult.rows.length > 0
          ? subscriptionResult.rows[0]
          : null;

      return NextResponse.json(
        {
          success: true,
          verified: true,
          alreadyVerified: true,

          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            fullName: user.full_name,
            emailVerified: true,
            status: user.status,
          },

          tenant: tenant
            ? {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                status: tenant.status,
                membershipStatus:
                  tenant.membership_status,
                isOwner: tenant.is_owner,
              }
            : null,

          subscription: subscription
            ? {
                id: subscription.id,
                plan: subscription.plan_key,
                name: subscription.plan_name,
                status: subscription.status,
                trialEndsAt:
                  subscription.trial_ends_at,
              }
            : null,

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

    const hashedCode =
      hashVerificationCode(code);

    /*
     * ============================================================
     * 6. Atomically consume verification code
     * ============================================================
     *
     * We intentionally perform this as one database operation.
     *
     * A code:
     *
     * - must belong to this email
     * - must have the correct hash
     * - must not be expired
     * - must not already be used
     * - must not be deleted
     *
     * The newest valid code wins.
     */

    const verificationResult =
      await queryControl(
        `
          UPDATE email_verifications
          SET
            used_at = NOW()
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
        [
          email,
          hashedCode,
        ]
      );

    /*
     * ============================================================
     * 7. Invalid / expired code
     * ============================================================
     */

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
     * 8. Mark email as verified
     * ============================================================
     */

    const updateUserResult =
      await queryControl(
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

    /*
     * This should normally never happen because we checked
     * email_verified_at above.
     */
    if (updateUserResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Unable to verify your email. Please try again.',
        },
        { status: 409 }
      );
    }

    const verifiedUser =
      updateUserResult.rows[0];

    /*
     * ============================================================
     * 9. Invalidate remaining verification codes
     * ============================================================
     *
     * Once the email has been verified, no older code should
     * remain usable.
     */

    await queryControl(
      `
        UPDATE email_verifications
        SET
          deleted_at = NOW()
        WHERE email = $1
          AND used_at IS NULL
          AND deleted_at IS NULL
      `,
      [email]
    );

    /*
     * ============================================================
     * 10. Find user's tenant
     * ============================================================
     *
     * A newly registered SaMi user should normally have one
     * tenant membership.
     *
     * We prefer the owner membership if multiple memberships exist.
     */

    const tenantResult =
      await queryControl(
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

    let tenant:
      | {
          id: string;
          name: string;
          slug: string;
          status: string;
          membership_status: string;
          is_owner: boolean;
        }
      | null = null;

    if (tenantResult.rows.length > 0) {
      tenant = tenantResult.rows[0];
    }

    /*
     * ============================================================
     * 11. Activate tenant membership
     * ============================================================
     *
     * Verification should move the owner/member out of the
     * pending_verification state.
     *
     * Payment remains a separate requirement for paid plans.
     */

    if (tenant) {
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
        [
          tenant.id,
          verifiedUser.id,
        ]
      );

      /*
       * Refresh membership status after update.
       */
      const refreshedMembership =
        await queryControl(
          `
            SELECT
              status,
              is_owner
            FROM tenant_users
            WHERE tenant_id = $1
              AND user_id = $2
            LIMIT 1
          `,
          [
            tenant.id,
            verifiedUser.id,
          ]
        );

      if (
        refreshedMembership.rows.length > 0
      ) {
        tenant.membership_status =
          refreshedMembership.rows[0].status;

        tenant.is_owner =
          Boolean(
            refreshedMembership.rows[0]
              .is_owner
          );
      }
    }

    /*
     * ============================================================
     * 12. Get subscription
     * ============================================================
     */

    let subscription:
      | {
          id: string;
          status: string;
          plan_key: string;
          plan_name: string;
          trial_ends_at: Date | string | null;
        }
      | null = null;

    if (tenant) {
      const subscriptionResult =
        await queryControl(
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
            ORDER BY
              s.created_at DESC
            LIMIT 1
          `,
          [tenant.id]
        );

      if (
        subscriptionResult.rows.length > 0
      ) {
        subscription =
          subscriptionResult.rows[0];
      }
    }

    /*
     * ============================================================
     * 13. Activate free/trial subscription
     * ============================================================
     *
     * Free/trial registration:
     *
     * pending
     *   ↓
     * trialing
     *
     * Paid registration:
     *
     * pending_payment
     *   ↓
     * remains pending_payment
     *
     * Payment activation will be handled by the PesaPal
     * callback/webhook flow.
     */

    if (
      tenant &&
      subscription &&
      subscription.status === 'pending'
    ) {
      const isFreeOrTrial =
        subscription.plan_key ===
          'free' ||
        subscription.trial_ends_at !==
          null;

      if (isFreeOrTrial) {
        await queryControl(
          `
            UPDATE subscriptions
            SET
              status = 'trialing',
              updated_at = NOW()
            WHERE id = $1
              AND status = 'pending'
          `,
          [subscription.id]
        );

        /*
         * Refresh subscription state.
         */
        const refreshedSubscription =
          await queryControl(
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
              WHERE s.id = $1
                AND p.deleted_at IS NULL
              LIMIT 1
            `,
            [subscription.id]
          );

        if (
          refreshedSubscription.rows.length >
          0
        ) {
          subscription =
            refreshedSubscription.rows[0];
        }
      }
    }

    /*
     * ============================================================
     * 14. Determine tenant activation state
     * ============================================================
     *
     * Free/trial:
     *
     * verified
     * + active membership
     * + trialing subscription
     * = active workspace
     *
     * Paid:
     *
     * verified
     * + pending_payment subscription
     * = remain pending_payment
     *
     * Payment should activate the workspace later.
     */

    if (tenant) {
      const membershipActive =
        tenant.membership_status ===
        'active';

      const subscriptionActive =
        subscription &&
        (
          subscription.status ===
            'trialing' ||
          subscription.status ===
            'active'
        );

      const paymentRequired =
        subscription &&
        subscription.status ===
          'pending_payment';

      if (
        membershipActive &&
        subscriptionActive
      ) {
        await queryControl(
          `
            UPDATE tenants
            SET
              status = 'active',
              updated_at = NOW()
            WHERE id = $1
              AND status IN (
                'pending_verification',
                'provisioning'
              )
          `,
          [tenant.id]
        );

        tenant.status = 'active';
      } else if (paymentRequired) {
        await queryControl(
          `
            UPDATE tenants
            SET
              status = 'pending_payment',
              updated_at = NOW()
            WHERE id = $1
              AND status = 'pending_verification'
          `,
          [tenant.id]
        );

        tenant.status =
          'pending_payment';
      }
    }

    /*
     * ============================================================
     * 15. Update user status
     * ============================================================
     *
     * The user itself becomes active after email verification.
     *
     * Workspace/payment restrictions are represented by the
     * tenant and subscription status.
     */

    if (
      verifiedUser.status ===
        'pending_verification' ||
      verifiedUser.status ===
        'pending'
    ) {
      const userStatusResult =
        await queryControl(
          `
            UPDATE users
            SET
              status = 'active',
              updated_at = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
            RETURNING
              status
          `,
          [verifiedUser.id]
        );

      if (
        userStatusResult.rows.length > 0
      ) {
        verifiedUser.status =
          userStatusResult.rows[0].status;
      }
    }

    /*
     * ============================================================
     * 16. Get selected apps
     * ============================================================
     *
     * Registration creates tenant_modules with status = pending.
     *
     * We DO NOT install/provision them here.
     *
     * The workspace provisioning/install flow will handle that
     * after verification/payment requirements are satisfied.
     */

    let selectedApps: Array<{
      id: string;
      key: string;
      name: string;
      version: string | null;
      status: string;
    }> = [];

    if (tenant) {
      const appsResult =
        await queryControl(
          `
            SELECT
              m.id,
              m.key,
              m.name,
              m.version,
              tm.status
            FROM tenant_modules tm
            INNER JOIN modules m
              ON m.id = tm.module_id
            WHERE tm.tenant_id = $1
              AND m.deleted_at IS NULL
            ORDER BY
              m.name ASC
          `,
          [tenant.id]
        );

      selectedApps =
        appsResult.rows.map(
          (app) => ({
            id: app.id,
            key: app.key,
            name: app.name,
            version:
              app.version ?? null,
            status: app.status,
          })
        );
    }

    /*
     * ============================================================
     * 17. Determine next step
     * ============================================================
     */

    let nextStep:
      | 'login'
      | 'payment'
      | 'provisioning' =
      'login';

    if (
      subscription &&
      subscription.status ===
        'pending_payment'
    ) {
      nextStep = 'payment';
    } else if (
      tenant &&
      tenant.status ===
        'provisioning'
    ) {
      nextStep = 'provisioning';
    }

    /*
     * ============================================================
     * 18. Success response
     * ============================================================
     *
     * No authentication token is returned here.
     *
     * Login will create the authenticated session.
     */

    return NextResponse.json(
      {
        success: true,
        verified: true,
        alreadyVerified: false,

        user: {
          id: verifiedUser.id,
          email: verifiedUser.email,
          firstName:
            verifiedUser.first_name,
          lastName:
            verifiedUser.last_name,
          fullName:
            verifiedUser.full_name,
          emailVerified: true,
          status: verifiedUser.status,
        },

        tenant: tenant
          ? {
              id: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
              status: tenant.status,
              membershipStatus:
                tenant.membership_status,
              isOwner: tenant.is_owner,
            }
          : null,

        subscription: subscription
          ? {
              id: subscription.id,
              plan:
                subscription.plan_key,
              name:
                subscription.plan_name,
              status:
                subscription.status,
              trialEndsAt:
                subscription.trial_ends_at,
            }
          : null,

        selectedApps,

        nextStep,

        message:
          tenant?.status ===
          'pending_payment'
            ? 'Email verified successfully. Complete payment to activate your workspace.'
            : 'Email verified successfully. You can now sign in to SaMi.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      '[SaMi] Email verification error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          'Failed to verify email. Please try again.',
      },
      { status: 500 }
    );
  }
}