// app/api/auth/pesapal-callback/route.ts

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import crypto from 'crypto';

import {
  getControlPool,
  queryControl,
} from '@/lib/db/control';

import {
  getPesaPalTransactionStatus,
} from '@/lib/services/pesapal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   SAMI BILLING MODEL

   PAID SIGNUP
   ------------------------------------------------------------
   registration
      ↓
   subscription = trialing
   workspace = active
   trial = 1 calendar month
   KES 0 due today
   NO PesaPal transaction

   TRIAL END
   ------------------------------------------------------------
   user makes first REAL paid PesaPal payment
      ↓
   that payment enrolls recurring billing
      ↓
   subscription = active
      ↓
   paid period = 1 month

   FUTURE MONTHS
   ------------------------------------------------------------
   PesaPal sends:
     OrderNotificationType=RECURRING

   SaMi:
     verifies payment with GetTransactionStatus
     stores recurring transaction
     extends subscription by one month

   PAYMENT FAILURE
   ------------------------------------------------------------
   active / expired-trial subscription → past_due

   During an unexpired free month:
   failed payment must NEVER destroy the free trial.
   ============================================================ */

/* ============================================================
   TYPES
   ============================================================ */

type CallbackType =
  | 'callback'
  | 'ipn'
  | 'recurring';

type PaymentState =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'INVALID'
  | 'REVERSED'
  | 'UNKNOWN';

type PaymentTransactionRow = {
  id: string;

  tenant_id: string;

  subscription_id:
    | string
    | null;

  provider_transaction_id:
    string;

  amount:
    | number
    | string;

  currency: string;

  status: string;

  description:
    | string
    | null;

  metadata:
    | Record<
        string,
        unknown
      >
    | string
    | null;

  created_at?:
    | Date
    | string;
};

type SubscriptionRow = {
  id: string;

  tenant_id: string;

  plan_id: string;

  status: string;

  started_at:
    | Date
    | string
    | null;

  trial_ends_at:
    | Date
    | string
    | null;

  current_period_start:
    | Date
    | string
    | null;

  current_period_end:
    | Date
    | string
    | null;
};

type ProcessedResult = {
  alreadyProcessed: boolean;

  subscriptionStatus:
    string;
};

/* ============================================================
   PARAMETER HELPERS
   ============================================================ */

function getParam(
  params: URLSearchParams,
  ...names: string[]
): string | null {
  for (
    const name of names
  ) {
    const value =
      params.get(name);

    if (
      value !== null &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}

/* ============================================================
   CALLBACK TYPE
   ============================================================ */

function detectCallbackType(
  notificationType:
    | string
    | null
): CallbackType {
  const normalized =
    notificationType
      ?.trim()
      .toUpperCase();

  if (
    normalized ===
    'RECURRING'
  ) {
    return 'recurring';
  }

  if (
    normalized ===
    'IPNCHANGE'
  ) {
    return 'ipn';
  }

  /*
   * CALLBACKURL or missing notification type.
   */
  return 'callback';
}

function isNotification(
  callbackType: CallbackType
): callbackType is
  | 'ipn'
  | 'recurring' {
  return (
    callbackType ===
      'ipn' ||
    callbackType ===
      'recurring'
  );
}

/* ============================================================
   PAYMENT STATE
   ============================================================ */

function normalizePaymentState(
  statusCode:
    | number
    | null
    | undefined,

  description:
    | string
    | null
    | undefined
): PaymentState {
  if (
    statusCode === 1
  ) {
    return 'COMPLETED';
  }

  if (
    statusCode === 2
  ) {
    return 'FAILED';
  }

  if (
    statusCode === 3
  ) {
    return 'REVERSED';
  }

  if (
    statusCode === 0
  ) {
    return 'INVALID';
  }

  const normalized =
    String(
      description || ''
    )
      .trim()
      .toUpperCase();

  if (!normalized) {
    return 'UNKNOWN';
  }

  if (
    normalized.includes(
      'COMPLETED'
    ) ||
    normalized.includes(
      'SUCCESS'
    )
  ) {
    return 'COMPLETED';
  }

  if (
    normalized.includes(
      'FAILED'
    )
  ) {
    return 'FAILED';
  }

  if (
    normalized.includes(
      'REVERSED'
    )
  ) {
    return 'REVERSED';
  }

  if (
    normalized.includes(
      'INVALID'
    ) ||
    normalized.includes(
      'CANCEL'
    )
  ) {
    return 'INVALID';
  }

  if (
    normalized.includes(
      'PENDING'
    ) ||
    normalized.includes(
      'PROCESSING'
    )
  ) {
    return 'PENDING';
  }

  return 'UNKNOWN';
}

/* ============================================================
   METADATA
   ============================================================ */

function parseMetadata(
  value: unknown
): Record<string, unknown> {
  if (
    !value
  ) {
    return {};
  }

  if (
    typeof value ===
      'object' &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  if (
    typeof value ===
    'string'
  ) {
    try {
      const parsed =
        JSON.parse(value);

      if (
        parsed &&
        typeof parsed ===
          'object' &&
        !Array.isArray(
          parsed
        )
      ) {
        return parsed as Record<
          string,
          unknown
        >;
      }
    } catch {
      return {};
    }
  }

  return {};
}

/* ============================================================
   NUMBERS / CURRENCY
   ============================================================ */

function numberOrNull(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return null;
  }

  return parsed;
}

function amountsMatch(
  expected: number,
  actual: number
): boolean {
  return (
    Math.abs(
      expected -
        actual
    ) < 0.01
  );
}

function normalizeCurrency(
  value: unknown
): string | null {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  return normalized ||
    null;
}

/* ============================================================
   CONSTANT-TIME STRING COMPARISON
   ============================================================ */

function safeEqual(
  first: string,
  second: string
): boolean {
  const a =
    Buffer.from(first);

  const b =
    Buffer.from(second);

  if (
    a.length !==
    b.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    a,
    b
  );
}

/* ============================================================
   RESPONSE HELPERS
   ============================================================ */

function notificationResponse({
  callbackType,
  orderTrackingId,
  merchantReference,
  status = 200,
}: {
  callbackType:
    | 'ipn'
    | 'recurring';

  orderTrackingId: string;

  merchantReference: string;

  status?: 200 | 500;
}) {
  /*
   * PesaPal requires this JSON acknowledgement for IPNs.
   *
   * `status` here means:
   *
   * 200 = IPN received and processed
   * 500 = IPN received but SaMi could not complete processing
   *
   * It is NOT the payment status.
   */
  return NextResponse.json(
    {
      orderNotificationType:
        callbackType ===
          'recurring'
          ? 'RECURRING'
          : 'IPNCHANGE',

      orderTrackingId,

      orderMerchantReference:
        merchantReference,

      status,
    },
    {
      status:
        status === 200
          ? 200
          : 500,

      headers: {
        'Cache-Control':
          'no-store',
      },
    }
  );
}

function redirectToBilling(
  origin: string,
  paymentState:
    | 'success'
    | 'pending'
    | 'failed'
    | 'error',
  orderTrackingId?:
    string
) {
  const url =
    new URL(
      '/settings',
      origin
    );

  url.searchParams.set(
    'tab',
    'billing'
  );

  url.searchParams.set(
    'payment',
    paymentState
  );

  if (
    orderTrackingId
  ) {
    url.searchParams.set(
      'orderTrackingId',
      orderTrackingId
    );
  }

  return NextResponse.redirect(
    url
  );
}

/* ============================================================
   INITIAL PAYMENT LOOKUP
   ============================================================ */

async function getInitialPayment(
  orderTrackingId: string
): Promise<
  PaymentTransactionRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          tenant_id,
          subscription_id,
          provider_transaction_id,
          amount,
          currency,
          status,
          description,
          metadata,
          created_at

        FROM payment_transactions

        WHERE provider =
          'pesapal'

          AND provider_transaction_id =
            $1

        LIMIT 1
      `,
      [
        orderTrackingId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

/* ============================================================
   SUBSCRIPTION
   ============================================================ */

async function getSubscription(
  subscriptionId: string
): Promise<
  SubscriptionRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          tenant_id,
          plan_id,
          status,
          started_at,
          trial_ends_at,
          current_period_start,
          current_period_end

        FROM subscriptions

        WHERE id = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        subscriptionId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

/* ============================================================
   RECURRING SUBSCRIPTION LOOKUP
   ============================================================ */

async function getSubscriptionByRecurringReference(
  reference: string
): Promise<
  SubscriptionRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          s.id,
          s.tenant_id,
          s.plan_id,
          s.status,
          s.started_at,
          s.trial_ends_at,
          s.current_period_start,
          s.current_period_end

        FROM subscriptions s

        WHERE s.deleted_at IS NULL

          AND (
            s.id::text = $1

            OR EXISTS (
              SELECT 1

              FROM payment_transactions pt

              WHERE pt.provider =
                'pesapal'

                AND pt.subscription_id =
                  s.id

                AND (
                  pt.metadata
                    ->> 'accountNumber'
                    = $1

                  OR

                  pt.metadata
                    ->> 'subscriptionReference'
                    = $1
                )
            )
          )

        LIMIT 1
      `,
      [
        reference,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

/* ============================================================
   RECURRING ENROLLMENT SOURCE
   ============================================================ */

async function getRecurringBillingSource(
  subscriptionId: string
): Promise<
  PaymentTransactionRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          tenant_id,
          subscription_id,
          provider_transaction_id,
          amount,
          currency,
          status,
          description,
          metadata,
          created_at

        FROM payment_transactions

        WHERE provider =
          'pesapal'

          AND subscription_id =
            $1

          AND amount > 0

        ORDER BY
          CASE
            WHEN metadata
              ->> 'billingPurpose'
              =
              'recurring_enrollment'
            THEN 0
            ELSE 1
          END,

          created_at DESC

        LIMIT 1
      `,
      [
        subscriptionId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

/* ============================================================
   PROVIDER STATUS DATA
   ============================================================ */

function createStatusMetadata(
  status:
    Awaited<
      ReturnType<
        typeof getPesaPalTransactionStatus
      >
    >
): Record<string, unknown> {
  return {
    status:
      status.status,

    orderTrackingId:
      status.orderTrackingId,

    merchantReference:
      status.merchantReference,

    amount:
      status.amount,

    currency:
      status.currency,

    paymentMethod:
      status.paymentMethod,

    confirmationCode:
      status.confirmationCode,

    paymentStatusCode:
      status.paymentStatusCode,

    createdDate:
      status.createdDate,

    paymentAccount:
      status.paymentAccount,

    description:
      status.description,

    subscriptionTransactionInfo:
      status
        .subscriptionTransactionInfo,

    verifiedAt:
      new Date()
        .toISOString(),
  };
}

/* ============================================================
   UPDATE PAYMENT PENDING
   ============================================================ */

async function markPaymentPending(
  paymentId: string,
  statusData: Record<
    string,
    unknown
  >
) {
  await queryControl(
    `
      UPDATE payment_transactions

      SET
        status =
          'pending',

        metadata =
          COALESCE(
            metadata,
            '{}'::jsonb
          )
          ||
          jsonb_build_object(
            'lastPesapalStatus',
            $2::jsonb,

            'lastCheckedAt',
            NOW()
          )

      WHERE id = $1
    `,
    [
      paymentId,

      JSON.stringify(
        statusData
      ),
    ]
  );
}

/* ============================================================
   UPDATE PAYMENT FAILED
   ============================================================ */

async function markPaymentFailed(
  paymentId: string,
  paymentState:
    PaymentState,
  statusData: Record<
    string,
    unknown
  >
) {
  await queryControl(
    `
      UPDATE payment_transactions

      SET
        status =
          'failed',

        metadata =
          COALESCE(
            metadata,
            '{}'::jsonb
          )
          ||
          jsonb_build_object(
            'pesapalStatus',
            $2::jsonb,

            'failureState',
            $3,

            'failedAt',
            NOW()
          )

      WHERE id = $1
    `,
    [
      paymentId,

      JSON.stringify(
        statusData
      ),

      paymentState,
    ]
  );
}

/* ============================================================
   PAST DUE

   An unsuccessful payment must NOT destroy an unexpired
   free month.
   ============================================================ */

async function markSubscriptionPastDueIfRequired(
  subscriptionId: string
) {
  await queryControl(
    `
      UPDATE subscriptions

      SET
        status =
          'past_due',

        updated_at =
          NOW()

      WHERE id = $1
        AND deleted_at IS NULL

        AND (
          status IN (
            'active',
            'past_due'
          )

          OR

          (
            status =
              'trialing'

            AND (
              trial_ends_at IS NULL
              OR
              trial_ends_at <= NOW()
            )
          )
        )
    `,
    [
      subscriptionId,
    ]
  );
}

/* ============================================================
   APPLY SUCCESSFUL FIRST PAYMENT

   The first real PesaPal payment happens after the free month.

   GREATEST() also protects the customer if a payment is
   accidentally completed slightly early:

     paid period begins after the existing free period

   rather than destroying the remaining free days.
   ============================================================ */

async function applyInitialSuccessfulPayment(
  payment:
    PaymentTransactionRow,
  statusData: Record<
    string,
    unknown
  >
): Promise<ProcessedResult> {
  if (
    !payment.subscription_id
  ) {
    throw new Error(
      'Subscription payment has no subscription ID.'
    );
  }

  const client =
    await getControlPool()
      .connect();

  try {
    await client.query(
      'BEGIN'
    );

    /*
     * Serialize callbacks for this PesaPal transaction.
     */
    await client.query(
      `
        SELECT
          pg_advisory_xact_lock(
            hashtext($1)::bigint
          )
      `,
      [
        `sami:pesapal:${payment.provider_transaction_id}`,
      ]
    );

    const lockedPaymentResult =
      await client.query(
        `
          SELECT
            id,
            status,
            metadata

          FROM payment_transactions

          WHERE id = $1

          FOR UPDATE
        `,
        [
          payment.id,
        ]
      );

    if (
      lockedPaymentResult
        .rows.length ===
      0
    ) {
      throw new Error(
        'Payment transaction disappeared during processing.'
      );
    }

    const lockedMetadata =
      parseMetadata(
        lockedPaymentResult
          .rows[0].metadata
      );

    /*
     * Strong idempotency:
     *
     * Only return early if the successful payment has already
     * been applied to the subscription.
     */
    if (
      lockedPaymentResult
        .rows[0].status ===
        'completed' &&
      typeof lockedMetadata
        .subscriptionAppliedAt ===
        'string'
    ) {
      const subscription =
        await client.query(
          `
            SELECT status

            FROM subscriptions

            WHERE id = $1
              AND deleted_at IS NULL

            LIMIT 1
          `,
          [
            payment.subscription_id,
          ]
        );

      await client.query(
        'COMMIT'
      );

      return {
        alreadyProcessed:
          true,

        subscriptionStatus:
          subscription.rows[0]
            ?.status ||
          'active',
      };
    }

    const subscriptionResult =
      await client.query(
        `
          SELECT
            id,
            tenant_id,
            status,
            trial_ends_at,
            current_period_end

          FROM subscriptions

          WHERE id = $1
            AND deleted_at IS NULL

          FOR UPDATE
        `,
        [
          payment.subscription_id,
        ]
      );

    if (
      subscriptionResult
        .rows.length ===
      0
    ) {
      throw new Error(
        'Subscription was not found.'
      );
    }

    const subscription =
      subscriptionResult
        .rows[0];

    /*
     * Never silently reactivate a deliberately cancelled or
     * otherwise unavailable subscription.
     */
    if (
      ![
        'trialing',
        'active',
        'past_due',
      ].includes(
        String(
          subscription.status
        )
      )
    ) {
      throw new Error(
        `Subscription cannot accept payment while in "${subscription.status}" status.`
      );
    }

    /*
     * Mark provider payment complete.
     */
    await client.query(
      `
        UPDATE payment_transactions

        SET
          status =
            'completed',

          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            )
            ||
            jsonb_build_object(
              'pesapalStatus',
              $2::jsonb,

              'completedAt',
              NOW()
            )

        WHERE id = $1
      `,
      [
        payment.id,

        JSON.stringify(
          statusData
        ),
      ]
    );

    /*
     * Paid period starts after whichever point is latest:
     *
     * - now
     * - existing current_period_end
     * - trial_ends_at
     *
     * This preserves the full free month.
     */
    const activationResult =
      await client.query(
        `
          UPDATE subscriptions

          SET
            status =
              'active',

            started_at =
              COALESCE(
                started_at,
                NOW()
              ),

            current_period_start =
              GREATEST(
                NOW(),

                COALESCE(
                  current_period_end,
                  trial_ends_at,
                  NOW()
                )
              ),

            current_period_end =
              GREATEST(
                NOW(),

                COALESCE(
                  current_period_end,
                  trial_ends_at,
                  NOW()
                )
              )
              + INTERVAL '1 month',

            cancelled_at =
              NULL,

            updated_at =
              NOW()

          WHERE id = $1
            AND deleted_at IS NULL
            AND status IN (
              'trialing',
              'active',
              'past_due'
            )

          RETURNING
            status,
            current_period_start,
            current_period_end
        `,
        [
          payment.subscription_id,
        ]
      );

    if (
      activationResult
        .rows.length ===
      0
    ) {
      throw new Error(
        'Subscription could not be activated.'
      );
    }

    /*
     * Mark subscription application only after both provider
     * payment and subscription state succeeded.
     */
    await client.query(
      `
        UPDATE payment_transactions

        SET
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            )
            ||
            jsonb_build_object(
              'subscriptionAppliedAt',
              NOW(),

              'subscriptionStatus',
              'active'
            )

        WHERE id = $1
      `,
      [
        payment.id,
      ]
    );

    await client.query(
      'COMMIT'
    );

    return {
      alreadyProcessed:
        false,

      subscriptionStatus:
        'active',
    };
  } catch (error) {
    try {
      await client.query(
        'ROLLBACK'
      );
    } catch {
      // Ignore rollback failure.
    }

    throw error;
  } finally {
    client.release();
  }
}

/* ============================================================
   STORE / PROCESS RECURRING TRANSACTION

   Every recurring payment receives its own row instead of
   growing one giant metadata array on the original payment.
   ============================================================ */

async function applyRecurringPayment({
  source,
  subscription,
  orderTrackingId,
  merchantReference,
  state,
  amount,
  currency,
  statusData,
}: {
  source:
    PaymentTransactionRow;

  subscription:
    SubscriptionRow;

  orderTrackingId: string;

  merchantReference: string;

  state:
    PaymentState;

  amount:
    number | null;

  currency:
    string | null;

  statusData:
    Record<string, unknown>;
}): Promise<ProcessedResult> {
  const client =
    await getControlPool()
      .connect();

  try {
    await client.query(
      'BEGIN'
    );

    await client.query(
      `
        SELECT
          pg_advisory_xact_lock(
            hashtext($1)::bigint
          )
      `,
      [
        `sami:pesapal:${orderTrackingId}`,
      ]
    );

    /*
     * Lock subscription before extending/restricting access.
     */
    const lockedSubscriptionResult =
      await client.query(
        `
          SELECT
            id,
            status,
            trial_ends_at,
            current_period_end

          FROM subscriptions

          WHERE id = $1
            AND deleted_at IS NULL

          FOR UPDATE
        `,
        [
          subscription.id,
        ]
      );

    if (
      lockedSubscriptionResult
        .rows.length ===
      0
    ) {
      throw new Error(
        'Recurring subscription was not found.'
      );
    }

    const lockedSubscription =
      lockedSubscriptionResult
        .rows[0];

    /*
     * Find an existing row first.
     */
    let recurringPaymentResult =
      await client.query(
        `
          SELECT
            id,
            status,
            metadata

          FROM payment_transactions

          WHERE provider =
            'pesapal'

            AND provider_transaction_id =
              $1

          LIMIT 1

          FOR UPDATE
        `,
        [
          orderTrackingId,
        ]
      );

    /*
     * New PesaPal recurring OrderTrackingId:
     * create its own transaction record.
     */
    if (
      recurringPaymentResult
        .rows.length ===
      0
    ) {
      const recurringAmount =
        amount ??
        Number(
          source.amount
        );

      const recurringCurrency =
        currency ||
        normalizeCurrency(
          source.currency
        ) ||
        'KES';

      recurringPaymentResult =
        await client.query(
          `
            INSERT INTO payment_transactions (
              tenant_id,
              subscription_id,
              provider,
              provider_transaction_id,
              amount,
              currency,
              status,
              description,
              metadata,
              created_at
            )

            VALUES (
              $1,
              $2,
              'pesapal',
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              NOW()
            )

            RETURNING
              id,
              status,
              metadata
          `,
          [
            source.tenant_id,

            subscription.id,

            orderTrackingId,

            recurringAmount,

            recurringCurrency,

            state ===
              'COMPLETED'
              ? 'completed'
              : (
                  state ===
                    'FAILED' ||
                  state ===
                    'INVALID' ||
                  state ===
                    'REVERSED'
                    ? 'failed'
                    : 'pending'
                ),

            source.description ||
              'SaMi recurring subscription payment',

            JSON.stringify({
              merchantReference,

              billingPurpose:
                'recurring_charge',

              recurringSourcePaymentId:
                source.id,

              pesapalStatus:
                statusData,

              createdAt:
                new Date()
                  .toISOString(),
            }),
          ]
        );
    }

    const recurringPayment =
      recurringPaymentResult
        .rows[0];

    const recurringMetadata =
      parseMetadata(
        recurringPayment.metadata
      );

    /*
     * Completed payment already used to extend the
     * subscription: do not extend it twice.
     */
    if (
      state ===
        'COMPLETED' &&
      recurringPayment.status ===
        'completed' &&
      typeof recurringMetadata
        .subscriptionAppliedAt ===
        'string'
    ) {
      await client.query(
        'COMMIT'
      );

      return {
        alreadyProcessed:
          true,

        subscriptionStatus:
          String(
            lockedSubscription
              .status
          ),
      };
    }

    /* ========================================================
       PENDING / UNKNOWN
       ======================================================== */

    if (
      state ===
        'PENDING' ||
      state ===
        'UNKNOWN'
    ) {
      await client.query(
        `
          UPDATE payment_transactions

          SET
            status =
              'pending',

            metadata =
              COALESCE(
                metadata,
                '{}'::jsonb
              )
              ||
              jsonb_build_object(
                'lastPesapalStatus',
                $2::jsonb,

                'lastCheckedAt',
                NOW()
              )

          WHERE id = $1
        `,
        [
          recurringPayment.id,

          JSON.stringify(
            statusData
          ),
        ]
      );

      await client.query(
        'COMMIT'
      );

      return {
        alreadyProcessed:
          false,

        subscriptionStatus:
          String(
            lockedSubscription
              .status
          ),
      };
    }

    /* ========================================================
       FAILED / INVALID / REVERSED
       ======================================================== */

    if (
      state ===
        'FAILED' ||
      state ===
        'INVALID' ||
      state ===
        'REVERSED'
    ) {
      await client.query(
        `
          UPDATE payment_transactions

          SET
            status =
              'failed',

            metadata =
              COALESCE(
                metadata,
                '{}'::jsonb
              )
              ||
              jsonb_build_object(
                'pesapalStatus',
                $2::jsonb,

                'failureState',
                $3,

                'failedAt',
                NOW()
              )

          WHERE id = $1
        `,
        [
          recurringPayment.id,

          JSON.stringify(
            statusData
          ),

          state,
        ]
      );

      /*
       * Preserve an unexpired free trial.
       */
      await client.query(
        `
          UPDATE subscriptions

          SET
            status =
              'past_due',

            updated_at =
              NOW()

          WHERE id = $1
            AND deleted_at IS NULL

            AND (
              status IN (
                'active',
                'past_due'
              )

              OR

              (
                status =
                  'trialing'

                AND (
                  trial_ends_at IS NULL
                  OR
                  trial_ends_at <= NOW()
                )
              )
            )
        `,
        [
          subscription.id,
        ]
      );

      const refreshed =
        await client.query(
          `
            SELECT status

            FROM subscriptions

            WHERE id = $1

            LIMIT 1
          `,
          [
            subscription.id,
          ]
        );

      await client.query(
        'COMMIT'
      );

      return {
        alreadyProcessed:
          false,

        subscriptionStatus:
          refreshed.rows[0]
            ?.status ||
          'past_due',
      };
    }

    /* ========================================================
       COMPLETED RECURRING PAYMENT
       ======================================================== */

    if (
      state !==
      'COMPLETED'
    ) {
      throw new Error(
        'Unsupported recurring payment state.'
      );
    }

    if (
      ![
        'trialing',
        'active',
        'past_due',
      ].includes(
        String(
          lockedSubscription
            .status
        )
      )
    ) {
      throw new Error(
        `Subscription cannot receive recurring payment while in "${lockedSubscription.status}" status.`
      );
    }

    /*
     * Confirm the transaction itself.
     */
    await client.query(
      `
        UPDATE payment_transactions

        SET
          status =
            'completed',

          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            )
            ||
            jsonb_build_object(
              'pesapalStatus',
              $2::jsonb,

              'completedAt',
              NOW()
            )

        WHERE id = $1
      `,
      [
        recurringPayment.id,

        JSON.stringify(
          statusData
        ),
      ]
    );

    /*
     * Extend from the end of the existing entitlement period
     * when charged early, or NOW() when payment arrives late.
     */
    const extensionResult =
      await client.query(
        `
          UPDATE subscriptions

          SET
            status =
              'active',

            current_period_start =
              GREATEST(
                NOW(),

                COALESCE(
                  current_period_end,
                  trial_ends_at,
                  NOW()
                )
              ),

            current_period_end =
              GREATEST(
                NOW(),

                COALESCE(
                  current_period_end,
                  trial_ends_at,
                  NOW()
                )
              )
              + INTERVAL '1 month',

            cancelled_at =
              NULL,

            updated_at =
              NOW()

          WHERE id = $1
            AND deleted_at IS NULL
            AND status IN (
              'trialing',
              'active',
              'past_due'
            )

          RETURNING status
        `,
        [
          subscription.id,
        ]
      );

    if (
      extensionResult
        .rows.length ===
      0
    ) {
      throw new Error(
        'Recurring payment could not renew the subscription.'
      );
    }

    await client.query(
      `
        UPDATE payment_transactions

        SET
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            )
            ||
            jsonb_build_object(
              'subscriptionAppliedAt',
              NOW(),

              'subscriptionStatus',
              'active'
            )

        WHERE id = $1
      `,
      [
        recurringPayment.id,
      ]
    );

    await client.query(
      'COMMIT'
    );

    return {
      alreadyProcessed:
        false,

      subscriptionStatus:
        'active',
    };
  } catch (error) {
    try {
      await client.query(
        'ROLLBACK'
      );
    } catch {
      // Ignore rollback failure.
    }

    throw error;
  } finally {
    client.release();
  }
}

/* ============================================================
   FIRST REAL PAYMENT / RECURRING ENROLLMENT CALLBACK
   ============================================================ */

async function processInitialPayment({
  request,
  callbackType,
  orderTrackingId,
  merchantReference,
}: {
  request: NextRequest;

  callbackType:
    CallbackType;

  orderTrackingId:
    string;

  merchantReference:
    string;
}): Promise<NextResponse> {
  const payment =
    await getInitialPayment(
      orderTrackingId
    );

  if (!payment) {
    console.error(
      '[PesaPal] Initial transaction not found:',
      {
        orderTrackingId,
      }
    );

    if (
      callbackType ===
      'ipn'
    ) {
      return notificationResponse({
        callbackType:
          'ipn',

        orderTrackingId,

        merchantReference,

        status:
          500,
      });
    }

    return redirectToBilling(
      request.nextUrl.origin,
      'error',
      orderTrackingId
    );
  }

  if (
    !payment.subscription_id
  ) {
    console.error(
      '[PesaPal] Payment has no subscription:',
      payment.id
    );

    if (
      callbackType ===
      'ipn'
    ) {
      return notificationResponse({
        callbackType:
          'ipn',

        orderTrackingId,

        merchantReference,

        status:
          500,
      });
    }

    return redirectToBilling(
      request.nextUrl.origin,
      'error',
      orderTrackingId
    );
  }

  /* ==========================================================
     VERIFY MERCHANT REFERENCE
     ========================================================== */

  const metadata =
    parseMetadata(
      payment.metadata
    );

  const storedReference =
    typeof metadata
      .merchantReference ===
      'string'
      ? metadata
          .merchantReference
      : null;

  if (
    !storedReference ||
    !safeEqual(
      storedReference,
      merchantReference
    )
  ) {
    console.error(
      '[PesaPal] Merchant reference mismatch:',
      {
        paymentId:
          payment.id,
      }
    );

    if (
      callbackType ===
      'ipn'
    ) {
      return notificationResponse({
        callbackType:
          'ipn',

        orderTrackingId,

        merchantReference,

        status:
          500,
      });
    }

    return redirectToBilling(
      request.nextUrl.origin,
      'error',
      orderTrackingId
    );
  }

  /*
   * New SaMi billing orders created after the free month use
   * recurring enrollment.
   *
   * Older rows may not contain billingPurpose, so we don't
   * hard-fail merely because that metadata is absent.
   */
  const billingPurpose =
    typeof metadata
      .billingPurpose ===
      'string'
      ? metadata
          .billingPurpose
      : null;

  if (
    billingPurpose &&
    billingPurpose !==
      'recurring_enrollment' &&
    billingPurpose !==
      'subscription_payment'
  ) {
    console.error(
      '[PesaPal] Unexpected subscription payment purpose:',
      billingPurpose
    );

    if (
      callbackType ===
      'ipn'
    ) {
      return notificationResponse({
        callbackType:
          'ipn',

        orderTrackingId,

        merchantReference,

        status:
          500,
      });
    }

    return redirectToBilling(
      request.nextUrl.origin,
      'error',
      orderTrackingId
    );
  }

  /* ==========================================================
     VERIFY WITH PESAPAL
     ========================================================== */

  const provider =
    await getPesaPalTransactionStatus(
      orderTrackingId
    );

  /*
   * If PesaPal returns merchant_reference in transaction
   * status, it must also match.
   */
  if (
    provider.merchantReference &&
    !safeEqual(
      provider.merchantReference,
      merchantReference
    )
  ) {
    console.error(
      '[PesaPal] Provider merchant reference mismatch.'
    );

    if (
      callbackType ===
      'ipn'
    ) {
      return notificationResponse({
        callbackType:
          'ipn',

        orderTrackingId,

        merchantReference,

        status:
          500,
      });
    }

    return redirectToBilling(
      request.nextUrl.origin,
      'error',
      orderTrackingId
    );
  }

  const paymentState =
    normalizePaymentState(
      provider
        .paymentStatusCode,

      provider.status
    );

  const expectedAmount =
    numberOrNull(
      payment.amount
    );

  const providerAmount =
    numberOrNull(
      provider.amount
    );

  const expectedCurrency =
    normalizeCurrency(
      payment.currency
    );

  const providerCurrency =
    normalizeCurrency(
      provider.currency
    );

  const statusData =
    createStatusMetadata(
      provider
    );

  /* ==========================================================
     SECURITY: AMOUNT
     ========================================================== */

  if (
    paymentState ===
      'COMPLETED' &&
    (
      expectedAmount ===
        null ||
      providerAmount ===
        null ||
      !amountsMatch(
        expectedAmount,
        providerAmount
      )
    )
  ) {
    console.error(
      '[PesaPal] Initial payment amount mismatch:',
      {
        expectedAmount,
        providerAmount,
        orderTrackingId,
      }
    );

    await markPaymentFailed(
      payment.id,
      'FAILED',
      {
        ...statusData,

        securityFailure:
          'amount_mismatch',
      }
    );

    if (
      callbackType ===
      'ipn'
    ) {
      return notificationResponse({
        callbackType:
          'ipn',

        orderTrackingId,

        merchantReference,

        status:
          500,
      });
    }

    return redirectToBilling(
      request.nextUrl.origin,
      'error',
      orderTrackingId
    );
  }

  /* ==========================================================
     SECURITY: CURRENCY
     ========================================================== */

  if (
    paymentState ===
      'COMPLETED' &&
    (
      !expectedCurrency ||
      !providerCurrency ||
      expectedCurrency !==
        providerCurrency
    )
  ) {
    console.error(
      '[PesaPal] Initial payment currency mismatch:',
      {
        expectedCurrency,
        providerCurrency,
        orderTrackingId,
      }
    );

    await markPaymentFailed(
      payment.id,
      'FAILED',
      {
        ...statusData,

        securityFailure:
          'currency_mismatch',
      }
    );

    if (
      callbackType ===
      'ipn'
    ) {
      return notificationResponse({
        callbackType:
          'ipn',

        orderTrackingId,

        merchantReference,

        status:
          500,
      });
    }

    return redirectToBilling(
      request.nextUrl.origin,
      'error',
      orderTrackingId
    );
  }

  /* ==========================================================
     PENDING / UNKNOWN
     ========================================================== */

  if (
    paymentState ===
      'PENDING' ||
    paymentState ===
      'UNKNOWN'
  ) {
    await markPaymentPending(
      payment.id,
      statusData
    );

    if (
      callbackType ===
      'ipn'
    ) {
      return notificationResponse({
        callbackType:
          'ipn',

        orderTrackingId,

        merchantReference,

        status:
          200,
      });
    }

    return redirectToBilling(
      request.nextUrl.origin,
      'pending',
      orderTrackingId
    );
  }

  /* ==========================================================
     FAILED / INVALID / REVERSED
     ========================================================== */

  if (
    paymentState ===
      'FAILED' ||
    paymentState ===
      'INVALID' ||
    paymentState ===
      'REVERSED'
  ) {
    await markPaymentFailed(
      payment.id,
      paymentState,
      statusData
    );

    await markSubscriptionPastDueIfRequired(
      payment.subscription_id
    );

    if (
      callbackType ===
      'ipn'
    ) {
      /*
       * The failed provider payment itself was successfully
       * processed by SaMi, so acknowledge the IPN with 200.
       */
      return notificationResponse({
        callbackType:
          'ipn',

        orderTrackingId,

        merchantReference,

        status:
          200,
      });
    }

    return redirectToBilling(
      request.nextUrl.origin,
      'failed',
      orderTrackingId
    );
  }

  /* ==========================================================
     SUCCESSFUL FIRST REAL PAYMENT
     ========================================================== */

  if (
    paymentState !==
    'COMPLETED'
  ) {
    throw new Error(
      'Unknown PesaPal payment state.'
    );
  }

  const result =
    await applyInitialSuccessfulPayment(
      payment,
      statusData
    );

  if (
    callbackType ===
    'ipn'
  ) {
    return notificationResponse({
      callbackType:
        'ipn',

      orderTrackingId,

      merchantReference,

      status:
        200,
    });
  }

  return redirectToBilling(
    request.nextUrl.origin,
    'success',
    orderTrackingId
  );
}

/* ============================================================
   RECURRING PAYMENT
   ============================================================ */

async function processRecurringPayment({
  orderTrackingId,
  merchantReference,
}: {
  orderTrackingId:
    string;

  merchantReference:
    string;
}): Promise<NextResponse> {
  /* ==========================================================
     1. FETCH REAL PAYMENT DETAILS
     ========================================================== */

  const provider =
    await getPesaPalTransactionStatus(
      orderTrackingId
    );

  const subscriptionInfo =
    provider
      .subscriptionTransactionInfo;

  /*
   * For RECURRING transactions PesaPal returns:
   *
   * subscription_transaction_info.account_reference
   *
   * Prefer that verified value.
   *
   * Fall back to OrderMerchantReference, which PesaPal
   * documents as the original account_number.
   */
  const accountReference =
    subscriptionInfo
      ?.accountReference
      ?.trim() ||
    merchantReference;

  if (
    !accountReference
  ) {
    console.error(
      '[PesaPal] Recurring payment has no account reference.'
    );

    return notificationResponse({
      callbackType:
        'recurring',

      orderTrackingId,

      merchantReference,

      status:
        500,
    });
  }

  /*
   * If both references are present they must identify the
   * same SaMi subscription/account.
   */
  if (
    subscriptionInfo
      ?.accountReference &&
    !safeEqual(
      subscriptionInfo
        .accountReference,
      merchantReference
    )
  ) {
    console.error(
      '[PesaPal] Recurring account reference mismatch:',
      {
        merchantReference,

        accountReference:
          subscriptionInfo
            .accountReference,
      }
    );

    return notificationResponse({
      callbackType:
        'recurring',

      orderTrackingId,

      merchantReference,

      status:
        500,
    });
  }

  /* ==========================================================
     2. FIND SUBSCRIPTION
     ========================================================== */

  const subscription =
    await getSubscriptionByRecurringReference(
      accountReference
    );

  if (!subscription) {
    console.error(
      '[PesaPal] Recurring subscription not found:',
      {
        accountReference,
        orderTrackingId,
      }
    );

    return notificationResponse({
      callbackType:
        'recurring',

      orderTrackingId,

      merchantReference,

      status:
        500,
    });
  }

  /* ==========================================================
     3. FIND ORIGINAL RECURRING ENROLLMENT

     Its amount/currency are the stored expected billing terms
     for the active PesaPal recurring schedule.
     ========================================================== */

  const source =
    await getRecurringBillingSource(
      subscription.id
    );

  if (!source) {
    console.error(
      '[PesaPal] Recurring billing source not found:',
      {
        subscriptionId:
          subscription.id,
      }
    );

    return notificationResponse({
      callbackType:
        'recurring',

      orderTrackingId,

      merchantReference,

      status:
        500,
    });
  }

  /* ==========================================================
     4. PAYMENT STATE
     ========================================================== */

  const paymentState =
    normalizePaymentState(
      provider
        .paymentStatusCode,

      provider.status
    );

  /*
   * subscription_transaction_info.amount is more specific
   * for recurring transactions, so prefer it.
   */
  const providerAmount =
    numberOrNull(
      subscriptionInfo
        ?.amount ??
      provider.amount
    );

  const expectedAmount =
    numberOrNull(
      source.amount
    );

  const providerCurrency =
    normalizeCurrency(
      provider.currency
    );

  const expectedCurrency =
    normalizeCurrency(
      source.currency
    );

  const statusData =
    createStatusMetadata(
      provider
    );

  /* ==========================================================
     5. COMPLETED PAYMENT SECURITY CHECKS
     ========================================================== */

  if (
    paymentState ===
      'COMPLETED'
  ) {
    if (
      providerAmount ===
        null ||
      expectedAmount ===
        null ||
      !amountsMatch(
        expectedAmount,
        providerAmount
      )
    ) {
      console.error(
        '[PesaPal] Recurring amount mismatch:',
        {
          expectedAmount,
          providerAmount,
          orderTrackingId,
        }
      );

      return notificationResponse({
        callbackType:
          'recurring',

        orderTrackingId,

        merchantReference,

        status:
          500,
      });
    }

    if (
      !providerCurrency ||
      !expectedCurrency ||
      providerCurrency !==
        expectedCurrency
    ) {
      console.error(
        '[PesaPal] Recurring currency mismatch:',
        {
          expectedCurrency,
          providerCurrency,
          orderTrackingId,
        }
      );

      return notificationResponse({
        callbackType:
          'recurring',

        orderTrackingId,

        merchantReference,

        status:
          500,
      });
    }
  }

  /* ==========================================================
     6. STORE + APPLY
     ========================================================== */

  await applyRecurringPayment({
    source,

    subscription,

    orderTrackingId,

    merchantReference,

    state:
      paymentState,

    amount:
      providerAmount,

    currency:
      providerCurrency,

    statusData,
  });

  /*
   * We processed the provider state successfully.
   *
   * Even when the payment itself FAILED, SaMi should return
   * status: 200 here because the IPN was successfully handled.
   */
  return notificationResponse({
    callbackType:
      'recurring',

    orderTrackingId,

    merchantReference,

    status:
      200,
  });
}

/* ============================================================
   MAIN PROCESSOR
   ============================================================ */

async function processPesapalRequest(
  request: NextRequest,
  params: URLSearchParams
): Promise<NextResponse> {
  const orderTrackingId =
    getParam(
      params,

      'OrderTrackingId',

      'orderTrackingId',

      'order_tracking_id'
    );

  const merchantReference =
    getParam(
      params,

      'OrderMerchantReference',

      'orderMerchantReference',

      'merchantReference',

      'merchant_reference'
    );

  const notificationType =
    getParam(
      params,

      'OrderNotificationType',

      'orderNotificationType',

      'notificationType',

      'order_notification_type'
    );

  const callbackType =
    detectCallbackType(
      notificationType
    );

  /* ==========================================================
     REQUIRED IDENTIFIERS
     ========================================================== */

  if (
    !orderTrackingId ||
    !merchantReference
  ) {
    if (
      isNotification(
        callbackType
      )
    ) {
      return NextResponse.json(
        {
          orderNotificationType:
            callbackType ===
              'recurring'
              ? 'RECURRING'
              : 'IPNCHANGE',

          orderTrackingId:
            orderTrackingId ||
            '',

          orderMerchantReference:
            merchantReference ||
            '',

          status:
            500,
        },
        {
          status: 500,

          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    return redirectToBilling(
      request.nextUrl.origin,
      'error',
      orderTrackingId ||
        undefined
    );
  }

  /* ==========================================================
     RECURRING
     ========================================================== */

  if (
    callbackType ===
    'recurring'
  ) {
    return processRecurringPayment({
      orderTrackingId,

      merchantReference,
    });
  }

  /* ==========================================================
     FIRST REAL PAYMENT / NORMAL IPN
     ========================================================== */

  return processInitialPayment({
    request,

    callbackType,

    orderTrackingId,

    merchantReference,
  });
}

/* ============================================================
   ERROR RESPONSE AFTER PARAMETERS ARE KNOWN
   ============================================================ */

function processingErrorResponse(
  request: NextRequest,
  params: URLSearchParams
) {
  const orderTrackingId =
    getParam(
      params,
      'OrderTrackingId',
      'orderTrackingId',
      'order_tracking_id'
    ) ||
    '';

  const merchantReference =
    getParam(
      params,
      'OrderMerchantReference',
      'orderMerchantReference',
      'merchantReference',
      'merchant_reference'
    ) ||
    '';

  const notificationType =
    getParam(
      params,
      'OrderNotificationType',
      'orderNotificationType',
      'notificationType',
      'order_notification_type'
    );

  const callbackType =
    detectCallbackType(
      notificationType
    );

  if (
    isNotification(
      callbackType
    )
  ) {
    return notificationResponse({
      callbackType,

      orderTrackingId,

      merchantReference,

      status:
        500,
    });
  }

  return redirectToBilling(
    request.nextUrl.origin,
    'error',
    orderTrackingId ||
      undefined
  );
}

/* ============================================================
   GET
   ============================================================ */

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  const params =
    request.nextUrl
      .searchParams;

  try {
    return await processPesapalRequest(
      request,
      params
    );
  } catch (error) {
    console.error(
      '[PesaPal Callback GET] Processing failed:',
      error
    );

    return processingErrorResponse(
      request,
      params
    );
  }
}

/* ============================================================
   POST
   ============================================================ */

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  let params =
    new URLSearchParams();

  try {
    const contentType =
      request.headers.get(
        'content-type'
      ) ||
      '';

    if (
      contentType.includes(
        'application/json'
      )
    ) {
      const body:
        unknown =
        await request.json();

      if (
        body &&
        typeof body ===
          'object' &&
        !Array.isArray(body)
      ) {
        for (
          const [
            key,
            value,
          ] of Object.entries(
            body as Record<
              string,
              unknown
            >
          )
        ) {
          if (
            value !==
              undefined &&
            value !==
              null
          ) {
            params.set(
              key,
              String(value)
            );
          }
        }
      }
    } else {
      const body =
        await request.text();

      params =
        new URLSearchParams(
          body
        );
    }

    return await processPesapalRequest(
      request,
      params
    );
  } catch (error) {
    console.error(
      '[PesaPal Callback POST] Processing failed:',
      error
    );

    return processingErrorResponse(
      request,
      params
    );
  }
}