
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

export const runtime = 'nodejs';

/*
 * ============================================================
 * PesaPal IPN
 * ============================================================
 *
 * PesaPal API 3.0 sends:
 *
 * OrderNotificationType
 * OrderTrackingId
 * OrderMerchantReference
 *
 * It does NOT send the trusted payment status.
 *
 * We therefore query PesaPal ourselves before activating
 * anything.
 */

export async function POST(
  request: NextRequest
) {
  try {
    /*
     * ==========================================================
     * 1. Read notification
     * ==========================================================
     */

    const body =
      await request.json();

    const orderTrackingId =
      String(
        body.OrderTrackingId ||
        body.order_tracking_id ||
        ''
      ).trim();

    const merchantReference =
      String(
        body.OrderMerchantReference ||
        body.merchant_reference ||
        ''
      ).trim();

    const notificationType =
      String(
        body.OrderNotificationType ||
        body.order_notification_type ||
        ''
      ).trim()
        .toUpperCase();

    /*
     * ==========================================================
     * 2. Validate notification
     * ==========================================================
     */

    if (!orderTrackingId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Order tracking ID is required.',
        },
        { status: 400 }
      );
    }

    if (!merchantReference) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Merchant reference is required.',
        },
        { status: 400 }
      );
    }

    /*
     * API 3.0 IPN notifications normally use IPNCHANGE.
     *
     * We don't reject an empty notification type too aggressively
     * because some environments/configurations may omit it.
     */

    if (
      notificationType &&
      notificationType !==
        'IPNCHANGE'
    ) {
      console.warn(
        'Unexpected PesaPal notification type:',
        notificationType
      );
    }

    /*
     * ==========================================================
     * 3. Find our payment transaction
     * ==========================================================
     *
     * Match BOTH:
     *
     * - PesaPal tracking ID
     * - our merchant reference
     *
     * This prevents a payment notification from accidentally
     * being attached to another SaMi transaction.
     */

    const transactionResult =
      await queryControl(
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
            AND (
              pt.metadata ->> 'merchantReference'
            ) = $2
          LIMIT 1
        `,
        [
          orderTrackingId,
          merchantReference,
        ]
      );

    if (
      transactionResult.rows.length === 0
    ) {
      console.error(
        'PesaPal transaction not found:',
        {
          orderTrackingId,
          merchantReference,
        }
      );

      /*
       * Return a controlled response rather than throwing.
       * This allows us to log the unknown transaction.
       */

      return NextResponse.json(
        {
          success: false,
          error:
            'Transaction not found.',
        },
        { status: 404 }
      );
    }

    const transaction =
      transactionResult.rows[0];

    const tenantId =
      transaction.tenant_id;

    const subscriptionId =
      transaction.subscription_id;

    /*
     * ==========================================================
     * 4. Idempotency
     * ==========================================================
     *
     * PesaPal may notify us more than once.
     *
     * If the transaction is already completed, don't provision
     * the workspace again.
     */

    if (
      transaction.status ===
      'completed'
    ) {
      return NextResponse.json(
        {
          success: true,
          alreadyProcessed: true,
          message:
            'Payment has already been processed.',
        },
        { status: 200 }
      );
    }

    /*
     * ==========================================================
     * 5. Ask PesaPal for the REAL status
     * ==========================================================
     */

    const payment =
      await getPesaPalTransactionStatus(
        orderTrackingId
      );

    const paymentStatus =
      payment.status;

    /*
     * ==========================================================
     * 6. Verify amount/currency
     * ==========================================================
     *
     * Never activate a subscription merely because the status
     * says COMPLETED.
     *
     * Make sure the payment amount matches our transaction.
     */

    if (
      payment.amount !== null &&
      Number(payment.amount) !==
        Number(transaction.amount)
    ) {
      console.error(
        'PesaPal amount mismatch:',
        {
          tenantId,

          expected:
            transaction.amount,

          received:
            payment.amount,

          orderTrackingId,
        }
      );

      await queryControl(
        `
          UPDATE payment_transactions
          SET
            status = 'failed',
            updated_at = NOW(),
            metadata =
              COALESCE(metadata, '{}'::jsonb)
              || $2::jsonb
          WHERE id = $1
        `,
        [
          transaction.id,

          JSON.stringify({
            failureReason:
              'amount_mismatch',

            pesapalAmount:
              payment.amount,

            expectedAmount:
              transaction.amount,
          }),
        ]
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'Payment amount mismatch.',
        },
        { status: 400 }
      );
    }

    if (
      payment.currency &&
      payment.currency.toUpperCase() !==
        String(
          transaction.currency
        ).toUpperCase()
    ) {
      console.error(
        'PesaPal currency mismatch:',
        {
          tenantId,

          expected:
            transaction.currency,

          received:
            payment.currency,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'Payment currency mismatch.',
        },
        { status: 400 }
      );
    }

    /*
     * ==========================================================
     * 7. Handle PENDING
     * ==========================================================
     */

    if (
      paymentStatus ===
      'PENDING'
    ) {
      await queryControl(
        `
          UPDATE payment_transactions
          SET
            status = 'pending',
            updated_at = NOW(),
            metadata =
              COALESCE(metadata, '{}'::jsonb)
              || $2::jsonb
          WHERE id = $1
        `,
        [
          transaction.id,

          JSON.stringify({
            pesapalStatus:
              'PENDING',

            lastCheckedAt:
              new Date().toISOString(),
          }),
        ]
      );

      return NextResponse.json(
        {
          success: true,
          status: 'pending',
          message:
            'Payment is still being processed.',
        },
        { status: 200 }
      );
    }

    /*
     * ==========================================================
     * 8. Handle FAILED / INVALID
     * ==========================================================
     */

    if (
      paymentStatus ===
        'FAILED' ||
      paymentStatus ===
        'INVALID'
    ) {
      await queryControl(
        `
          UPDATE payment_transactions
          SET
            status = 'failed',
            updated_at = NOW(),
            metadata =
              COALESCE(metadata, '{}'::jsonb)
              || $2::jsonb
          WHERE id = $1
        `,
        [
          transaction.id,

          JSON.stringify({
            pesapalStatus:
              paymentStatus,

            paymentMethod:
              payment.paymentMethod,

            confirmationCode:
              payment.confirmationCode,

            lastCheckedAt:
              new Date().toISOString(),
          }),
        ]
      );

      /*
       * Keep subscription pending/failed rather than activating it.
       */

      if (subscriptionId) {
        await queryControl(
          `
            UPDATE subscriptions
            SET
              status = 'pending_payment',
              updated_at = NOW()
            WHERE id = $1
              AND status NOT IN (
                'active',
                'cancelled'
              )
          `,
          [subscriptionId]
        );
      }

      return NextResponse.json(
        {
          success: true,
          status:
            paymentStatus.toLowerCase(),
          message:
            'Payment was not completed.',
        },
        { status: 200 }
      );
    }

    /*
     * ==========================================================
     * 9. Only COMPLETED can activate the subscription
     * ==========================================================
     */

    if (
      paymentStatus !==
      'COMPLETED'
    ) {
      console.warn(
        'Unknown PesaPal payment status:',
        {
          status:
            paymentStatus,

          orderTrackingId,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'Unknown payment status.',
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
          metadata =
            COALESCE(metadata, '{}'::jsonb)
            || $2::jsonb
        WHERE id = $1
      `,
      [
        transaction.id,

        JSON.stringify({
          pesapalStatus:
            'COMPLETED',

          paymentMethod:
            payment.paymentMethod,

          confirmationCode:
            payment.confirmationCode,

          completedAt:
            new Date().toISOString(),
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
            started_at =
              COALESCE(
                started_at,
                NOW()
              ),
            current_period_start =
              NOW(),
            current_period_end =
              NOW() + INTERVAL '1 month',
            trial_ends_at =
              NOW() + INTERVAL '15 days',
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

    const appsResult =
      await queryControl(
        `
          SELECT
            m.key
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

    const selectedApps =
      appsResult.rows
        .map(
          row => row.key
        )
        .filter(
          Boolean
        );

    /*
     * ==========================================================
     * 13. Provision workspace
     * ==========================================================
     */

    try {
      await provisionTenant(
        tenantId,
        selectedApps
      );
    } catch (provisionError) {
      /*
       * IMPORTANT:
       *
       * Payment remains completed.
       *
       * We do NOT reverse the payment just because provisioning
       * failed. The workspace can be retried/repaired separately.
       */

      console.error(
        'Tenant provisioning failed after successful payment:',
        {
          tenantId,
          subscriptionId,
          error:
            provisionError,
        }
      );

      await queryControl(
        `
          UPDATE tenants
          SET
            status = 'provisioning',
            updated_at = NOW()
          WHERE id = $1
        `,
        [tenantId]
      );

      return NextResponse.json(
        {
          success: true,
          paymentCompleted: true,
          provisioningPending: true,
          message:
            'Payment confirmed. Workspace provisioning is still in progress.',
        },
        { status: 200 }
      );
    }

    /*
     * ==========================================================
     * 14. Activate tenant
     * ==========================================================
     */

    await queryControl(
      `
        UPDATE tenants
        SET
          status = 'active',
          updated_at = NOW()
        WHERE id = $1
      `,
      [tenantId]
    );

    /*
     * ==========================================================
     * 15. Mark reserved apps as installed
     * ==========================================================
     */

    await queryControl(
      `
        UPDATE tenant_modules
        SET
          status = 'installed',
          installed_at =
            COALESCE(
              installed_at,
              NOW()
            )
        WHERE tenant_id = $1
          AND status = 'pending'
      `,
      [tenantId]
    );

    /*
     * ==========================================================
     * 16. Success
     * ==========================================================
     */

    return NextResponse.json(
      {
        success: true,

        paymentCompleted:
          true,

        workspaceProvisioned:
          true,

        tenantId,

        subscriptionId,

        message:
          'Payment confirmed and workspace activated.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      'PesaPal IPN processing error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          'Failed to process PesaPal notification.',
      },
      { status: 500 }
    );
  }
}