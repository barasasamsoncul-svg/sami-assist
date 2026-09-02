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

import {
  sendVerificationEmail,
} from '@/lib/services/email';

export const runtime = 'nodejs';

const VERIFICATION_EXPIRY_MINUTES = 15;

/**
 * Generate a cryptographically secure 6-digit
 * verification code.
 */
function generateVerificationCode(): string {
  return crypto
    .randomInt(100000, 1000000)
    .toString();
}

/**
 * Hash verification code before storing it.
 */
function hashVerificationCode(
  code: string
): string {
  return crypto
    .createHash('sha256')
    .update(code)
    .digest('hex');
}

/**
 * Safely extract a required database ID.
 *
 * PostgreSQL/pg can expose returned values as
 * nullable depending on inferred types.
 */
function requireDatabaseId(
  value: unknown,
  entityName: string
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(
      `Invalid ${entityName} ID returned from database.`
    );
  }

  return value;
}

/**
 * Normalize payment status returned by PesaPal.
 */
function normalizePaymentStatus(
  value: unknown
): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

/**
 * Safely convert an amount to a number.
 */
function normalizeAmount(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const amount = Number(value);

  return Number.isFinite(amount)
    ? amount
    : null;
}

/**
 * POST /api/auth/pesapal-callback
 *
 * Handles PesaPal IPN callbacks after payment.
 *
 * Flow:
 *
 * 1. Read PesaPal notification.
 * 2. Find our payment transaction.
 * 3. Ask PesaPal for the authoritative status.
 * 4. Verify amount and currency.
 * 5. Handle pending/failed payments.
 * 6. Activate subscription only after COMPLETED.
 * 7. Provision the tenant.
 * 8. Activate tenant/modules.
 * 9. Generate email verification code.
 * 10. Send verification email.
 *
 * IMPORTANT:
 * Payment completion and workspace provisioning are
 * deliberately treated as separate operations.
 *
 * A successful payment must never be lost just because
 * tenant provisioning temporarily fails.
 */
export async function POST(
  request: NextRequest
) {
  try {
    // ==========================================================
    // 1. READ PESA PAL NOTIFICATION
    // ==========================================================

    let body: Record<string, unknown>;

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

    const orderTrackingId = String(
      body.OrderTrackingId ??
        body.order_tracking_id ??
        ''
    ).trim();

    const merchantReference = String(
      body.OrderMerchantReference ??
        body.merchant_reference ??
        ''
    ).trim();

    const notificationType = String(
      body.OrderNotificationType ??
        body.order_notification_type ??
        ''
    )
      .trim()
      .toUpperCase();

    // ==========================================================
    // 2. VALIDATE NOTIFICATION
    // ==========================================================

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

    if (
      notificationType &&
      notificationType !== 'IPNCHANGE'
    ) {
      console.warn(
        '[SaMi] Unexpected PesaPal notification type:',
        notificationType
      );
    }

    // ==========================================================
    // 3. FIND PAYMENT TRANSACTION
    // ==========================================================

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
        '[SaMi] PesaPal transaction not found:',
        {
          orderTrackingId,
          merchantReference,
        }
      );

      /*
       * Returning 404 may cause PesaPal to retry the
       * notification. That is preferable to silently
       * acknowledging a transaction SaMi does not know.
       */
      return NextResponse.json(
        {
          success: false,
          error: 'Transaction not found.',
        },
        { status: 404 }
      );
    }

    const transaction =
      transactionResult.rows[0];

    const transactionId =
      requireDatabaseId(
        transaction.id,
        'payment transaction'
      );

    const tenantId =
      requireDatabaseId(
        transaction.tenant_id,
        'tenant'
      );

    const subscriptionId =
      transaction.subscription_id === null ||
      transaction.subscription_id === undefined
        ? null
        : requireDatabaseId(
            transaction.subscription_id,
            'subscription'
          );

    const transactionStatus =
      String(
        transaction.status ?? ''
      )
        .trim()
        .toLowerCase();

    // ==========================================================
    // 4. IDEMPOTENCY / RECOVERY CHECK
    // ==========================================================

    /*
     * A payment marked completed normally needs no further
     * processing.
     *
     * HOWEVER:
     *
     * If payment completed but tenant provisioning previously
     * failed, we intentionally continue so the callback can
     * retry provisioning.
     */
    if (
      transactionStatus === 'completed'
    ) {
      const tenantResult =
        await queryControl(
          `
            SELECT
              status
            FROM tenants
            WHERE id = $1
            LIMIT 1
          `,
          [tenantId]
        );

      if (
        tenantResult.rows.length === 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Tenant associated with payment was not found.',
          },
          { status: 404 }
        );
      }

      const tenantStatus =
        String(
          tenantResult.rows[0].status ?? ''
        )
          .trim()
          .toLowerCase();

      /*
       * Payment is already complete and workspace is active.
       * Nothing else needs to happen.
       */
      if (
        tenantStatus === 'active'
      ) {
        return NextResponse.json(
          {
            success: true,
            alreadyProcessed: true,
            paymentCompleted: true,
            workspaceProvisioned: true,
            tenantId,
            subscriptionId,
            message:
              'Payment and workspace have already been processed.',
          },
          { status: 200 }
        );
      }

      /*
       * Otherwise continue and attempt provisioning again.
       */
      console.log(
        `[SaMi] Payment ${transactionId} is completed but tenant ${tenantId} is ${tenantStatus}. Retrying workspace provisioning.`
      );
    }

    // ==========================================================
    // 5. ASK PESAPAL FOR AUTHORITATIVE PAYMENT STATUS
    // ==========================================================

    const payment =
      await getPesaPalTransactionStatus(
        orderTrackingId
      );

    const paymentStatus =
      normalizePaymentStatus(
        payment.status
      );

    console.log(
      '[SaMi] PesaPal payment status:',
      {
        orderTrackingId,
        merchantReference,
        status: paymentStatus,
      }
    );

    // ==========================================================
    // 6. VERIFY PAYMENT AMOUNT
    // ==========================================================

    const expectedAmount =
      normalizeAmount(
        transaction.amount
      );

    const receivedAmount =
      normalizeAmount(
        payment.amount
      );

    /*
     * Only perform the amount comparison when PesaPal
     * actually supplied an amount.
     */
    if (
      receivedAmount !== null &&
      expectedAmount !== null &&
      receivedAmount !== expectedAmount
    ) {
      console.error(
        '[SaMi] PesaPal amount mismatch:',
        {
          tenantId,
          expected: expectedAmount,
          received: receivedAmount,
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
              COALESCE(
                metadata,
                '{}'::jsonb
              ) || $2::jsonb
          WHERE id = $1
        `,
        [
          transactionId,
          JSON.stringify({
            failureReason:
              'amount_mismatch',
            pesapalAmount:
              payment.amount,
            expectedAmount:
              transaction.amount,
            checkedAt:
              new Date().toISOString(),
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

    // ==========================================================
    // 7. VERIFY CURRENCY
    // ==========================================================

    const expectedCurrency =
      transaction.currency === null ||
      transaction.currency === undefined
        ? ''
        : String(
            transaction.currency
          )
            .trim()
            .toUpperCase();

    const receivedCurrency =
      payment.currency
        ? String(payment.currency)
            .trim()
            .toUpperCase()
        : '';

    if (
      receivedCurrency &&
      expectedCurrency &&
      receivedCurrency !== expectedCurrency
    ) {
      console.error(
        '[SaMi] PesaPal currency mismatch:',
        {
          tenantId,
          expected: expectedCurrency,
          received: receivedCurrency,
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
              COALESCE(
                metadata,
                '{}'::jsonb
              ) || $2::jsonb
          WHERE id = $1
        `,
        [
          transactionId,
          JSON.stringify({
            failureReason:
              'currency_mismatch',
            pesapalCurrency:
              payment.currency,
            expectedCurrency:
              transaction.currency,
            checkedAt:
              new Date().toISOString(),
          }),
        ]
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

    // ==========================================================
    // 8. HANDLE PENDING
    // ==========================================================

    if (
      paymentStatus === 'PENDING'
    ) {
      await queryControl(
        `
          UPDATE payment_transactions
          SET
            status = 'pending',
            updated_at = NOW(),
            metadata =
              COALESCE(
                metadata,
                '{}'::jsonb
              ) || $2::jsonb
          WHERE id = $1
        `,
        [
          transactionId,
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
          paymentCompleted: false,
          message:
            'Payment is still being processed.',
        },
        { status: 200 }
      );
    }

    // ==========================================================
    // 9. HANDLE FAILED / INVALID
    // ==========================================================

    if (
      paymentStatus === 'FAILED' ||
      paymentStatus === 'INVALID'
    ) {
      await queryControl(
        `
          UPDATE payment_transactions
          SET
            status = 'failed',
            updated_at = NOW(),
            metadata =
              COALESCE(
                metadata,
                '{}'::jsonb
              ) || $2::jsonb
          WHERE id = $1
        `,
        [
          transactionId,
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
          paymentCompleted: false,
          message:
            'Payment was not completed.',
        },
        { status: 200 }
      );
    }

    // ==========================================================
    // 10. ONLY COMPLETED CAN ACTIVATE
    // ==========================================================

    if (
      paymentStatus !== 'COMPLETED'
    ) {
      console.warn(
        '[SaMi] Unknown PesaPal payment status:',
        {
          status: paymentStatus,
          orderTrackingId,
          merchantReference,
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

    // ==========================================================
    // 11. MARK PAYMENT COMPLETED
    // ==========================================================

    await queryControl(
      `
        UPDATE payment_transactions
        SET
          status = 'completed',
          updated_at = NOW(),
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            ) || $2::jsonb
        WHERE id = $1
      `,
      [
        transactionId,
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

    // ==========================================================
    // 12. ACTIVATE SUBSCRIPTION
    // ==========================================================

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
            trial_ends_at = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [subscriptionId]
      );
    }

    // ==========================================================
    // 13. GET SELECTED APPS
    // ==========================================================

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
          ORDER BY
            tm.installed_at ASC NULLS FIRST,
            m.key ASC
        `,
        [tenantId]
      );

    const selectedApps =
      appsResult.rows
        .map((row) =>
          typeof row.key === 'string'
            ? row.key.trim().toLowerCase()
            : ''
        )
        .filter(Boolean);

    // ==========================================================
    // 14. PROVISION WORKSPACE
    // ==========================================================

    try {
      /*
       * tenantId is guaranteed to be a string here.
       */
      await provisionTenant(
        tenantId,
        selectedApps
      );

      console.log(
        `[SaMi] Tenant ${tenantId} provisioned successfully after payment`
      );

      // ----------------------------------------------------------
      // ACTIVATE TENANT
      // ----------------------------------------------------------

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

      // ----------------------------------------------------------
      // MARK MODULES INSTALLED
      // ----------------------------------------------------------

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
    } catch (provisionError) {
      console.error(
        '[SaMi] Tenant provisioning failed after successful payment:',
        {
          tenantId,
          subscriptionId,
          error: provisionError,
        }
      );

      /*
       * IMPORTANT:
       *
       * We do NOT reverse the successful payment.
       * The customer has already paid.
       *
       * We mark the tenant as provisioning_failed so
       * a retry/recovery process can provision it later.
       */
      await queryControl(
        `
          UPDATE tenants
          SET
            status = 'provisioning_failed',
            updated_at = NOW()
          WHERE id = $1
        `,
        [tenantId]
      );

      return NextResponse.json(
        {
          success: true,
          paymentCompleted: true,
          workspaceProvisioned: false,
          provisioningPending: true,
          tenantId,
          subscriptionId,
          message:
            'Payment confirmed. Workspace provisioning is still in progress.',
        },
        { status: 200 }
      );
    }

    // ==========================================================
    // 15. GET OWNER
    // ==========================================================

    const userResult =
      await queryControl(
        `
          SELECT
            u.id,
            u.email,
            u.first_name,
            u.email_verified_at
          FROM users u
          INNER JOIN tenant_users tu
            ON tu.user_id = u.id
          WHERE tu.tenant_id = $1
            AND tu.is_owner = true
            AND u.deleted_at IS NULL
          LIMIT 1
        `,
        [tenantId]
      );

    // ==========================================================
    // 16. CREATE VERIFICATION CODE
    // ==========================================================

    if (
      userResult.rows.length > 0
    ) {
      const user =
        userResult.rows[0];

      /*
       * If the owner is already verified, do not generate
       * another verification code.
       */
      if (!user.email_verified_at) {
        const verificationCode =
          generateVerificationCode();

        const verificationHash =
          hashVerificationCode(
            verificationCode
          );

        const verificationExpiresAt =
          new Date(
            Date.now() +
              VERIFICATION_EXPIRY_MINUTES *
                60 *
                1000
          );

        // --------------------------------------------------------
        // DELETE OLD CODES
        // --------------------------------------------------------

        await queryControl(
          `
            DELETE FROM email_verifications
            WHERE email = $1
          `,
          [user.email]
        );

        // --------------------------------------------------------
        // STORE NEW CODE
        // --------------------------------------------------------

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
          [
            user.email,
            verificationHash,
            verificationExpiresAt,
          ]
        );

        // --------------------------------------------------------
        // SEND VERIFICATION EMAIL
        // --------------------------------------------------------

        try {
          await sendVerificationEmail(
            user.email,
            verificationCode,
            String(
              user.first_name ?? ''
            )
          );

          console.log(
            `[SaMi] Verification email sent to ${user.email}`
          );
        } catch (emailError) {
          /*
           * Payment and provisioning have already succeeded.
           * Email failure must not cause the payment callback
           * to be considered failed.
           */
          console.error(
            '[SaMi] Failed to send verification email:',
            emailError
          );
        }
      }
    } else {
      console.error(
        `[SaMi] No owner found for tenant ${tenantId} after successful payment.`
      );
    }

    // ==========================================================
    // 17. SUCCESS
    // ==========================================================

    return NextResponse.json(
      {
        success: true,
        paymentCompleted: true,
        workspaceProvisioned: true,
        tenantId,
        subscriptionId,
        message:
          'Payment confirmed and workspace activated. Check your email for verification.',
      },
      { status: 200 }
    );
  } catch (error) {
    // ==========================================================
    // GLOBAL ERROR HANDLER
    // ==========================================================

    console.error(
      '[SaMi] PesaPal IPN processing error:',
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