import 'server-only';

import {
  getControlPool,
} from '@/lib/db/control';

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
              status IN (
                'active',
                'past_due'
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
