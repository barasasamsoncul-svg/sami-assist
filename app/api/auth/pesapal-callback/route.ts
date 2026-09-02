import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  queryControl,
} from '@/lib/db/control';

import {
  provisionTenant,
} from '@/lib/services/tenant-provisioning';

import {
  getPesaPalTransactionStatus,
} from '@/lib/services/pesapal';

import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/services/email';

export const runtime = 'nodejs';

const VERIFICATION_EXPIRY_MINUTES = 15;

/**
 * Generate cryptographically secure 6-digit code.
 */
function generateVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hash verification code before storing it.
 */
function hashVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * POST /api/auth/pesapal-callback
 * 
 * Handles PesaPal IPN callbacks after payment.
 * - Verifies payment status with PesaPal
 * - Provisions tenant (core + app schemas)
 * - Sends verification email
 */
export async function POST(request: NextRequest) {
  try {
    /*
     * ==========================================================
     * 1. Read notification
     * ==========================================================
     */

    const body = await request.json();

    const orderTrackingId = String(
      body.OrderTrackingId ||
      body.order_tracking_id ||
      ''
    ).trim();

    const merchantReference = String(
      body.OrderMerchantReference ||
      body.merchant_reference ||
      ''
    ).trim();

    const notificationType = String(
      body.OrderNotificationType ||
      body.order_notification_type ||
      ''
    ).trim().toUpperCase();

    /*
     * ==========================================================
     * 2. Validate notification
     * ==========================================================
     */

    if (!orderTrackingId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Order tracking ID is required.',
        },
        { status: 400 }
      );
    }

    if (!merchantReference) {
      return NextResponse.json(
        {
          success: false,
          error: 'Merchant reference is required.',
        },
        { status: 400 }
      );
    }

    if (notificationType && notificationType !== 'IPNCHANGE') {
      console.warn(
        'Unexpected PesaPal notification type:',
        notificationType
      );
    }

    /*
     * ==========================================================
     * 3. Find our payment transaction
     * ==========================================================
     */

    const transactionResult = await queryControl(
      `
        SELECT
          pt.id,
          pt.tenant_id,
          pt.subscription_id,
          pt.amount,
          pt.currency,
          pt.status,
          pt.provider_transaction_id,
          pt.metadata
        FROM payment_transactions pt
        WHERE pt.provider = 'pesapal'
          AND pt.provider_transaction_id = $1
          AND (pt.metadata ->> 'merchantReference') = $2
        LIMIT 1
      `,
      [orderTrackingId, merchantReference]
    );

    if (transactionResult.rows.length === 0) {
      console.error(
        'PesaPal transaction not found:',
        {
          orderTrackingId,
          merchantReference,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Transaction not found.',
        },
        { status: 404 }
      );
    }

    const transaction = transactionResult.rows[0];
    const tenantId = transaction.tenant_id;
    const subscriptionId = transaction.subscription_id;

    /*
     * ==========================================================
     * 4. Idempotency - Already processed
     * ==========================================================
     */

    if (transaction.status === 'completed') {
      return NextResponse.json(
        {
          success: true,
          alreadyProcessed: true,
          message: 'Payment has already been processed.',
        },
        { status: 200 }
      );
    }

    /*
     * ==========================================================
     * 5. Ask PesaPal for the REAL status
     * ==========================================================
     */

    const payment = await getPesaPalTransactionStatus(orderTrackingId);
    const paymentStatus = payment.status;

    /*
     * ==========================================================
     * 6. Verify amount/currency
     * ==========================================================
     */

    if (
      payment.amount !== null &&
      Number(payment.amount) !== Number(transaction.amount)
    ) {
      console.error(
        'PesaPal amount mismatch:',
        {
          tenantId,
          expected: transaction.amount,
          received: payment.amount,
          orderTrackingId,
        }
      );

      await queryControl(
        `
          UPDATE payment_transactions
          SET
            status = 'failed',
            updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
          WHERE id = $1
        `,
        [
          transaction.id,
          JSON.stringify({
            failureReason: 'amount_mismatch',
            pesapalAmount: payment.amount,
            expectedAmount: transaction.amount,
          }),
        ]
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Payment amount mismatch.',
        },
        { status: 400 }
      );
    }

    if (
      payment.currency &&
      payment.currency.toUpperCase() !== String(transaction.currency).toUpperCase()
    ) {
      console.error(
        'PesaPal currency mismatch:',
        {
          tenantId,
          expected: transaction.currency,
          received: payment.currency,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Payment currency mismatch.',
        },
        { status: 400 }
      );
    }

    /*
     * ==========================================================
     * 7. Handle PENDING
     * ==========================================================
     */

    if (paymentStatus === 'PENDING') {
      await queryControl(
        `
          UPDATE payment_transactions
          SET
            status = 'pending',
            updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
          WHERE id = $1
        `,
        [
          transaction.id,
          JSON.stringify({
            pesapalStatus: 'PENDING',
            lastCheckedAt: new Date().toISOString(),
          }),
        ]
      );

      return NextResponse.json(
        {
          success: true,
          status: 'pending',
          message: 'Payment is still being processed.',
        },
        { status: 200 }
      );
    }

    /*
     * ==========================================================
     * 8. Handle FAILED / INVALID
     * ==========================================================
     */

    if (paymentStatus === 'FAILED' || paymentStatus === 'INVALID') {
      await queryControl(
        `
          UPDATE payment_transactions
          SET
            status = 'failed',
            updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
          WHERE id = $1
        `,
        [
          transaction.id,
          JSON.stringify({
            pesapalStatus: paymentStatus,
            paymentMethod: payment.paymentMethod,
            confirmationCode: payment.confirmationCode,
            lastCheckedAt: new Date().toISOString(),
          }),
        ]
      );

      if (subscriptionId) {
        await queryControl(
          `
            UPDATE subscriptions
            SET
              status = 'pending_payment',
              updated_at = NOW()
            WHERE id = $1
              AND status NOT IN ('active', 'cancelled')
          `,
          [subscriptionId]
        );
      }

      return NextResponse.json(
        {
          success: true,
          status: paymentStatus.toLowerCase(),
          message: 'Payment was not completed.',
        },
        { status: 200 }
      );
    }

    /*
     * ==========================================================
     * 9. Only COMPLETED can activate
     * ==========================================================
     */

    if (paymentStatus !== 'COMPLETED') {
      console.warn(
        'Unknown PesaPal payment status:',
        {
          status: paymentStatus,
          orderTrackingId,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Unknown payment status.',
        },
        { status: 409 }
      );
    }

    /*
     * ==========================================================
     * 10. Mark payment completed
     * ==========================================================
     */

    await queryControl(
      `
        UPDATE payment_transactions
        SET
          status = 'completed',
          updated_at = NOW(),
          metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
        WHERE id = $1
      `,
      [
        transaction.id,
        JSON.stringify({
          pesapalStatus: 'COMPLETED',
          paymentMethod: payment.paymentMethod,
          confirmationCode: payment.confirmationCode,
          completedAt: new Date().toISOString(),
        }),
      ]
    );

    /*
     * ==========================================================
     * 11. Activate subscription
     * ==========================================================
     */

    if (subscriptionId) {
      await queryControl(
        `
          UPDATE subscriptions
          SET
            status = 'active',
            started_at = COALESCE(started_at, NOW()),
            current_period_start = NOW(),
            current_period_end = NOW() + INTERVAL '1 month',
            trial_ends_at = NOW() + INTERVAL '15 days',
            updated_at = NOW()
          WHERE id = $1
        `,
        [subscriptionId]
      );
    }

    /*
     * ==========================================================
     * 12. Get apps reserved during registration
     * ==========================================================
     */

    const appsResult = await queryControl(
      `
        SELECT m.key
        FROM tenant_modules tm
        INNER JOIN modules m
          ON m.id = tm.module_id
        WHERE tm.tenant_id = $1
          AND tm.status = 'pending'
          AND m.deleted_at IS NULL
        ORDER BY tm.installed_at ASC
      `,
      [tenantId]
    );

    const selectedApps = appsResult.rows
      .map(row => row.key)
      .filter(Boolean);

    /*
     * ==========================================================
     * 13. Provision workspace
     * ==========================================================
     */

    try {
      await provisionTenant(tenantId, selectedApps);
      console.log(`[SaMi] Tenant ${tenantId} provisioned successfully after payment`);

      // Update tenant to active
      await queryControl(
        `
          UPDATE tenants
          SET status = 'active', updated_at = NOW()
          WHERE id = $1
        `,
        [tenantId]
      );

      // Update tenant_modules to installed
      await queryControl(
        `
          UPDATE tenant_modules
          SET status = 'installed', installed_at = NOW()
          WHERE tenant_id = $1 AND status = 'pending'
        `,
        [tenantId]
      );

    } catch (provisionError) {
      console.error(
        'Tenant provisioning failed after successful payment:',
        {
          tenantId,
          subscriptionId,
          error: provisionError,
        }
      );

      await queryControl(
        `
          UPDATE tenants
          SET status = 'provisioning_failed', updated_at = NOW()
          WHERE id = $1
        `,
        [tenantId]
      );

      return NextResponse.json(
        {
          success: true,
          paymentCompleted: true,
          provisioningPending: true,
          message: 'Payment confirmed. Workspace provisioning is still in progress.',
        },
        { status: 200 }
      );
    }

    /*
     * ==========================================================
     * 14. Get user details for email
     * ==========================================================
     */

    const userResult = await queryControl(
      `
        SELECT u.id, u.email, u.first_name
        FROM users u
        INNER JOIN tenant_users tu ON tu.user_id = u.id
        WHERE tu.tenant_id = $1
          AND tu.is_owner = true
          AND u.deleted_at IS NULL
        LIMIT 1
      `,
      [tenantId]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];

      /*
       * ==========================================================
       * 15. Generate and store verification code
       * ==========================================================
       */

      const verificationCode = generateVerificationCode();
      const verificationHash = hashVerificationCode(verificationCode);
      const verificationExpiresAt = new Date(
        Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000
      );

      // Remove old verification codes
      await queryControl(
        `
          DELETE FROM email_verifications
          WHERE email = $1
        `,
        [user.email]
      );

      // Store new verification code
      await queryControl(
        `
          INSERT INTO email_verifications (
            email,
            code_hash,
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
        [user.email, verificationHash, verificationExpiresAt]
      );

      /*
       * ==========================================================
       * 16. Send verification email
       * ==========================================================
       */

      try {
        await sendVerificationEmail(user.email, verificationCode, user.first_name);
        console.log(`[SaMi] Verification email sent to ${user.email}`);
      } catch (emailError) {
        console.error('[SaMi] Failed to send verification email:', emailError);
        // Don't fail the callback, just log error
      }
    }

    /*
     * ==========================================================
     * 17. Success
     * ==========================================================
     */

    return NextResponse.json(
      {
        success: true,
        paymentCompleted: true,
        workspaceProvisioned: true,
        tenantId,
        subscriptionId,
        message: 'Payment confirmed and workspace activated. Check your email for verification.',
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('PesaPal IPN processing error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process PesaPal notification.',
      },
      { status: 500 }
    );
  }
}