import 'server-only';

import {
  getControlPool,
} from '@/lib/db/control';

import {
  notifyWorkspaceOwnersOfBillingEvent,
} from '@/lib/billing/notifications';

function normalizedCurrency(
  value:
    string | null | undefined,
) {
  return (
    value ||
    'KES'
  )
    .trim()
    .toUpperCase();
}

function amountsMatch(
  expected:
    number,
  actual:
    number,
) {
  return (
    Math.abs(
      expected -
      actual,
    ) <
    0.01
  );
}

export async function applyVerifiedCheckoutPayment(
  input: {
    provider:
      string;
    providerReference:
      string;
    amount:
      number;
    currency:
      string;
    providerData?:
      Record<
        string,
        unknown
      >;
  },
) {
  const client =
    await getControlPool()
      .connect();

  try {
    await client.query(
      'BEGIN',
    );

    await client.query(
      `
        SELECT
          pg_advisory_xact_lock(
            hashtext($1)::bigint
          )
      `,
      [
        `sami:billing:${input.provider}:${input.providerReference}`,
      ],
    );

    const paymentResult =
      await client.query(
        `
          SELECT
            id,
            tenant_id,
            subscription_id,
            amount,
            currency,
            status,
            metadata
          FROM payment_transactions
          WHERE provider = $1
            AND provider_transaction_id = $2
          ORDER BY
            created_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [
          input.provider,
          input.providerReference,
        ],
      );

    if (
      paymentResult.rows.length !==
        1
    ) {
      throw new Error(
        'Verified provider payment does not match a SaMi billing transaction.',
      );
    }

    const payment =
      paymentResult.rows[0];

    const expectedAmount =
      Number(
        payment.amount,
      );

    const actualAmount =
      Number(
        input.amount,
      );

    if (
      !Number.isFinite(
        expectedAmount,
      ) ||
      !Number.isFinite(
        actualAmount,
      ) ||
      !amountsMatch(
        expectedAmount,
        actualAmount,
      )
    ) {
      throw new Error(
        'Verified provider payment amount does not match the SaMi bill.',
      );
    }

    if (
      normalizedCurrency(
        payment.currency,
      ) !==
      normalizedCurrency(
        input.currency,
      )
    ) {
      throw new Error(
        'Verified provider payment currency does not match the SaMi bill.',
      );
    }

    const metadata =
      payment.metadata &&
      typeof payment.metadata ===
        'object' &&
      !Array.isArray(
        payment.metadata,
      )
        ? payment.metadata as
            Record<
              string,
              unknown
            >
        : {};

    if (
      String(
        payment.status,
      ) ===
        'completed' &&
      typeof metadata
        .subscriptionAppliedAt ===
        'string'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        alreadyProcessed:
          true,
        paymentId:
          String(
            payment.id,
          ),
      };
    }

    if (
      !payment.subscription_id
    ) {
      throw new Error(
        'SaMi billing transaction has no subscription.',
      );
    }

    const subscriptionResult =
      await client.query(
        `
          SELECT
            id,
            status,
            trial_ends_at,
            current_period_end
          FROM subscriptions
          WHERE id = $1
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [
          payment.subscription_id,
        ],
      );

    if (
      subscriptionResult.rows
        .length !==
        1
    ) {
      throw new Error(
        'SaMi subscription was not found for verified payment.',
      );
    }

    const subscription =
      subscriptionResult
        .rows[0];

    if (
      ![
        'trial',
        'trialing',
        'active',
        'past_due',
      ].includes(
        String(
          subscription.status,
        )
          .toLowerCase(),
      )
    ) {
      throw new Error(
        'SaMi subscription cannot accept a payment in its current state.',
      );
    }

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
            ) ||
            $2::jsonb,
          updated_at =
            NOW()
        WHERE id = $1
      `,
      [
        payment.id,
        JSON.stringify({
          providerVerifiedAt:
            new Date()
              .toISOString(),
          providerData:
            input.providerData ||
            {},
        }),
      ],
    );

    const activation =
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
              ) +
              INTERVAL '1 month',
            cancelled_at =
              NULL,
            updated_at =
              NOW()
          WHERE id = $1
            AND deleted_at
                IS NULL
          RETURNING
            status,
            current_period_start,
            current_period_end
        `,
        [
          payment.subscription_id,
        ],
      );

    if (
      activation.rows.length !==
        1
    ) {
      throw new Error(
        'SaMi subscription could not be activated after verified payment.',
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
            ) ||
            jsonb_build_object(
              'subscriptionAppliedAt',
              NOW(),
              'subscriptionStatus',
              'active'
            ),
          updated_at =
            NOW()
        WHERE id = $1
      `,
      [
        payment.id,
      ],
    );

    await client.query(
      'COMMIT',
    );

    try {
      await notifyWorkspaceOwnersOfBillingEvent({
        tenantId:
          String(
            payment.tenant_id,
          ),
        type:
          'billing.payment_succeeded',
        eventKey:
          'billing.payment_succeeded',
        title:
          'Payment received',
        message:
          `SaMi received ${normalizedCurrency(
            input.currency,
          )} ${Number(
            input.amount,
          ).toLocaleString(
            'en-KE',
            {
              maximumFractionDigits:
                2,
            },
          )}. Your workspace subscription is active.`,
        priority:
          'high',
        dedupeKey:
          `billing:payment-succeeded:${payment.id}`,
        metadata: {
          provider:
            input.provider,
          paymentId:
            String(
              payment.id,
            ),
          amount:
            input.amount,
          currency:
            normalizedCurrency(
              input.currency,
            ),
        },
      });
    } catch (
      error
    ) {
      console.error(
        '[SaMi Billing] Payment-success notification failed:',
        error,
      );
    }

    return {
      alreadyProcessed:
        false,
      paymentId:
        String(
          payment.id,
      ),
      subscriptionStatus:
        String(
          activation.rows[0]
            .status,
        ),
      currentPeriodStart:
        activation.rows[0]
          .current_period_start,
      currentPeriodEnd:
        activation.rows[0]
          .current_period_end,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve the original error.
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function markVerifiedCheckoutFailed(
  input: {
    provider:
      string;
    providerReference:
      string;
    providerData?:
      Record<
        string,
        unknown
      >;
  },
) {
  const client =
    await getControlPool()
      .connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
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
              ) ||
              $3::jsonb,
            updated_at =
              NOW()
          WHERE provider = $1
            AND provider_transaction_id = $2
          RETURNING
            tenant_id,
            subscription_id
        `,
        [
          input.provider,
          input.providerReference,
          JSON.stringify({
            providerFailureVerifiedAt:
              new Date()
                .toISOString(),
            providerData:
              input.providerData ||
              {},
          }),
        ],
      );

    const subscriptionId =
      result.rows[0]
        ?.subscription_id;

    if (
      subscriptionId
    ) {
      await client.query(
        `
          UPDATE subscriptions
          SET
            status =
              'past_due',
            updated_at =
              NOW()
          WHERE id = $1
            AND deleted_at
                IS NULL
            AND (
              status =
                'past_due'
              OR (
                status =
                  'active'
                AND (
                  current_period_end IS NULL
                  OR current_period_end <=
                     NOW()
                )
              )
              OR (
                status IN (
                  'trial',
                  'trialing'
                )
                AND (
                  trial_ends_at IS NULL
                  OR trial_ends_at <=
                     NOW()
                )
              )
            )
        `,
        [
          subscriptionId,
        ],
      );
    }

    await client.query(
      'COMMIT',
    );

    const tenantId =
      result.rows[0]
        ?.tenant_id;

    if (
      tenantId
    ) {
      try {
        await notifyWorkspaceOwnersOfBillingEvent({
          tenantId:
            String(
              tenantId,
            ),
          type:
            'billing.payment_failed',
          eventKey:
            'billing.payment_failed',
          title:
            'Payment needs attention',
          message:
            'SaMi could not confirm the latest subscription payment. Open Billing to review the payment and restore full paid access.',
          priority:
            'urgent',
          dedupeKey:
            `billing:payment-failed:${input.provider}:${input.providerReference}`,
          metadata: {
            provider:
              input.provider,
            providerReference:
              input.providerReference,
          },
        });
      } catch (
        error
      ) {
        console.error(
          '[SaMi Billing] Payment-failure notification failed:',
          error,
        );
      }
    }
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve original failure.
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function applyVerifiedRecurringInvoice(
  input: {
    provider:
      string;
    providerSubscriptionId:
      string;
    providerReference:
      string;
    amount:
      number;
    currency:
      string;
    periodStart:
      Date;
    periodEnd:
      Date;
    providerData?:
      Record<
        string,
        unknown
      >;
  },
) {
  if (
    !Number.isFinite(
      input.amount,
    ) ||
    input.amount <=
      0
  ) {
    return {
      ignored:
        true,
      reason:
        'non_positive_invoice',
    };
  }

  if (
    input.periodEnd
      .getTime() <=
    input.periodStart
      .getTime()
  ) {
    throw new Error(
      'Recurring invoice period is invalid.',
    );
  }

  const client =
    await getControlPool()
      .connect();

  try {
    await client.query(
      'BEGIN',
    );

    await client.query(
      `
        SELECT
          pg_advisory_xact_lock(
            hashtext($1)::bigint
          )
      `,
      [
        `sami:recurring:${input.provider}:${input.providerReference}`,
      ],
    );

    const profileResult =
      await client.query(
        `
          SELECT
            bp.id,
            bp.tenant_id,
            bp.subscription_id,
            bp.price_per_user_monthly,
            bp.seat_quantity,
            bp.currency,
            bp.recurring_status
          FROM subscription_billing_profiles bp
          WHERE bp.provider = $1
            AND bp.provider_subscription_id = $2
            AND bp.is_active =
                TRUE
          LIMIT 1
          FOR UPDATE
        `,
        [
          input.provider,
          input.providerSubscriptionId,
        ],
      );

    if (
      profileResult.rows.length !==
        1
    ) {
      throw new Error(
        'Recurring provider subscription is not linked to an active SaMi billing profile.',
      );
    }

    const profile =
      profileResult.rows[0];

    const price =
      Number(
        profile
          .price_per_user_monthly,
      );

    const seats =
      Number(
        profile
          .seat_quantity,
      );

    const expected =
      price *
      seats;

    if (
      !Number.isFinite(
        expected,
      ) ||
      expected <=
        0 ||
      !amountsMatch(
        expected,
        input.amount,
      )
    ) {
      throw new Error(
        'Recurring provider invoice does not match SaMi current billing profile.',
      );
    }

    if (
      normalizedCurrency(
        profile.currency,
      ) !==
      normalizedCurrency(
        input.currency,
      )
    ) {
      throw new Error(
        'Recurring provider invoice currency does not match SaMi billing profile.',
      );
    }

    const existing =
      await client.query(
        `
          SELECT
            id,
            status
          FROM payment_transactions
          WHERE provider = $1
            AND provider_transaction_id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [
          input.provider,
          input.providerReference,
        ],
      );

    if (
      existing.rows[0]
        ?.status ===
        'completed'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        ignored:
          false,
        alreadyProcessed:
          true,
        paymentId:
          String(
            existing.rows[0]
              .id,
          ),
      };
    }

    let paymentId:
      string;

    if (
      existing.rows.length ===
        1
    ) {
      const updated =
        await client.query(
          `
            UPDATE payment_transactions
            SET
              status =
                'completed',
              amount = $3,
              currency = $4,
              metadata =
                COALESCE(
                  metadata,
                  '{}'::jsonb
                ) ||
                $5::jsonb,
              updated_at =
                NOW()
            WHERE id = $1
              AND tenant_id = $2
            RETURNING id
          `,
          [
            existing.rows[0]
              .id,
            profile.tenant_id,
            input.amount,
            input.currency,
            JSON.stringify({
              billingPurpose:
                'recurring_charge',
              providerData:
                input.providerData ||
                {},
              providerVerifiedAt:
                new Date()
                  .toISOString(),
            }),
          ],
        );

      paymentId =
        String(
          updated.rows[0]
            .id,
        );
    } else {
      const inserted =
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
              created_at,
              updated_at
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              'completed',
              'SaMi recurring subscription payment',
              $7::jsonb,
              NOW(),
              NOW()
            )
            RETURNING id
          `,
          [
            profile.tenant_id,
            profile.subscription_id,
            input.provider,
            input.providerReference,
            input.amount,
            input.currency,
            JSON.stringify({
              billingPurpose:
                'recurring_charge',
              providerData:
                input.providerData ||
                {},
              providerVerifiedAt:
                new Date()
                  .toISOString(),
            }),
          ],
        );

      paymentId =
        String(
          inserted.rows[0]
            .id,
        );
    }

    const subscription =
      await client.query(
        `
          UPDATE subscriptions
          SET
            plan_id =
              CASE
                WHEN scheduled_plan_id
                       IS NOT NULL
                 AND scheduled_plan_effective_at
                       IS NOT NULL
                 AND scheduled_plan_effective_at <=
                       $2
                THEN scheduled_plan_id
                ELSE plan_id
              END,
            status =
              'active',
            started_at =
              COALESCE(
                started_at,
                $2
              ),
            current_period_start =
              $2,
            current_period_end =
              $3,
            cancelled_at =
              NULL,
            scheduled_plan_id =
              CASE
                WHEN scheduled_plan_effective_at
                       IS NOT NULL
                 AND scheduled_plan_effective_at <=
                       $2
                THEN NULL
                ELSE scheduled_plan_id
              END,
            scheduled_plan_effective_at =
              CASE
                WHEN scheduled_plan_effective_at
                       IS NOT NULL
                 AND scheduled_plan_effective_at <=
                       $2
                THEN NULL
                ELSE scheduled_plan_effective_at
              END,
            scheduled_plan_requested_by =
              CASE
                WHEN scheduled_plan_effective_at
                       IS NOT NULL
                 AND scheduled_plan_effective_at <=
                       $2
                THEN NULL
                ELSE scheduled_plan_requested_by
              END,
            scheduled_plan_requested_at =
              CASE
                WHEN scheduled_plan_effective_at
                       IS NOT NULL
                 AND scheduled_plan_effective_at <=
                       $2
                THEN NULL
                ELSE scheduled_plan_requested_at
              END,
            updated_at =
              NOW()
          WHERE id = $1
            AND deleted_at
                IS NULL
          RETURNING
            status,
            current_period_start,
            current_period_end
        `,
        [
          profile.subscription_id,
          input.periodStart,
          input.periodEnd,
        ],
      );

    if (
      subscription.rows.length !==
        1
    ) {
      throw new Error(
        'SaMi recurring subscription could not be updated after verified invoice.',
      );
    }

    await client.query(
      `
        UPDATE subscription_billing_profiles
        SET
          recurring_status =
            'active',
          updated_at =
            NOW()
        WHERE id = $1
      `,
      [
        profile.id,
      ],
    );

    await client.query(
      `
        UPDATE payment_transactions
        SET
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            ) ||
            jsonb_build_object(
              'subscriptionAppliedAt',
              NOW(),
              'subscriptionStatus',
              'active'
            ),
          updated_at =
            NOW()
        WHERE id = $1
      `,
      [
        paymentId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    try {
      await notifyWorkspaceOwnersOfBillingEvent({
        tenantId:
          String(
            profile.tenant_id,
          ),
        type:
          'billing.payment_succeeded',
        eventKey:
          'billing.payment_succeeded',
        title:
          'Subscription renewed',
        message:
          `SaMi confirmed the recurring payment of ${normalizedCurrency(
            input.currency,
          )} ${Number(
            input.amount,
          ).toLocaleString(
            'en-KE',
            {
              maximumFractionDigits:
                2,
            },
          )}. Your subscription remains active.`,
        priority:
          'high',
        dedupeKey:
          `billing:recurring-succeeded:${paymentId}`,
        metadata: {
          provider:
            input.provider,
          paymentId,
          amount:
            input.amount,
          currency:
            normalizedCurrency(
              input.currency,
            ),
        },
      });
    } catch (
      error
    ) {
      console.error(
        '[SaMi Billing] Recurring-payment notification failed:',
        error,
      );
    }

    return {
      ignored:
        false,
      alreadyProcessed:
        false,
      paymentId,
      subscriptionStatus:
        'active',
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve original error.
    }

    throw error;
  } finally {
    client.release();
  }
}

