import 'server-only';

import {
  getControlPool,
  queryControl,
} from '@/lib/db/control';

import type {
  SamiBillingProviderKey,
} from '@/lib/billing/provider';

export type SubscriptionBillingProfile = {
  id:
    string;
  tenantId:
    string;
  subscriptionId:
    string;
  provider:
    SamiBillingProviderKey;
  providerCustomerId:
    string | null;
  providerSubscriptionId:
    string | null;
  providerPaymentMethodId:
    string | null;
  recurringStatus:
    string;
  currency:
    string;
  pricePerUserMonthly:
    number | null;
  seatQuantity:
    number | null;
  metadata:
    Record<
      string,
      unknown
    >;
  isActive:
    boolean;
  createdAt:
    string;
  updatedAt:
    string;
};

function rowToProfile(
  row:
    Record<
      string,
      unknown
    >,
): SubscriptionBillingProfile {
  const metadata =
    row.metadata &&
    typeof row.metadata ===
      'object' &&
    !Array.isArray(
      row.metadata,
    )
      ? row.metadata as
          Record<
            string,
            unknown
          >
      : {};

  return {
    id:
      String(
        row.id,
      ),
    tenantId:
      String(
        row.tenant_id,
      ),
    subscriptionId:
      String(
        row.subscription_id,
      ),
    provider:
      String(
        row.provider,
      ) as
        SamiBillingProviderKey,
    providerCustomerId:
      typeof row.provider_customer_id ===
        'string'
        ? row.provider_customer_id
        : null,
    providerSubscriptionId:
      typeof row.provider_subscription_id ===
        'string'
        ? row.provider_subscription_id
        : null,
    providerPaymentMethodId:
      typeof row.provider_payment_method_id ===
        'string'
        ? row.provider_payment_method_id
        : null,
    recurringStatus:
      String(
        row.recurring_status ||
        'setup_required',
      ),
    currency:
      String(
        row.currency ||
        'KES',
      ),
    pricePerUserMonthly:
      row.price_per_user_monthly ===
        null ||
      row.price_per_user_monthly ===
        undefined
        ? null
        : Number(
            row.price_per_user_monthly,
          ),
    seatQuantity:
      row.seat_quantity ===
        null ||
      row.seat_quantity ===
        undefined
        ? null
        : Number(
            row.seat_quantity,
          ),
    metadata,
    isActive:
      row.is_active ===
      true,
    createdAt:
      new Date(
        String(
          row.created_at,
        ),
      )
        .toISOString(),
    updatedAt:
      new Date(
        String(
          row.updated_at,
        ),
      )
        .toISOString(),
  };
}

export async function getActiveSubscriptionBillingProfile(
  subscriptionId:
    string,
) {
  try {
    const result =
      await queryControl(
        `
          SELECT *
          FROM subscription_billing_profiles
          WHERE subscription_id = $1
            AND is_active =
                TRUE
          ORDER BY
            updated_at DESC,
            id DESC
          LIMIT 1
        `,
        [
          subscriptionId,
        ],
      );

    return result.rows[0]
      ? rowToProfile(
          result.rows[0],
        )
      : null;
  } catch (
    error
  ) {
    if (
      error &&
      typeof error ===
        'object' &&
      'code' in error &&
      (
        error as {
          code?:
            string;
        }
      ).code ===
        '42P01'
    ) {
      /*
       * Rolling deploy compatibility:
       * old control DB -> new application.
       * Recurring setup still requires the migration before write.
       */
      return null;
    }

    throw error;
  }
}

export async function createSubscriptionBillingProfile(
  input: {
    tenantId:
      string;
    subscriptionId:
      string;
    provider:
      SamiBillingProviderKey;
    providerCustomerId?:
      string | null;
    providerSubscriptionId?:
      string | null;
    providerPaymentMethodId?:
      string | null;
    recurringStatus:
      string;
    currency:
      string;
    pricePerUserMonthly?:
      number | null;
    seatQuantity?:
      number | null;
    metadata?:
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

    /*
     * Serialize billing-profile replacement for one subscription.
     * This keeps the partial unique index and provider history
     * deterministic even if two setup requests race.
     */
    await client.query(
      `
        SELECT
          pg_advisory_xact_lock(
            hashtext($1)::bigint
          )
      `,
      [
        `sami:billing-profile:${input.subscriptionId}`,
      ],
    );

    await client.query(
      `
        UPDATE subscription_billing_profiles
        SET
          is_active =
            FALSE,
          updated_at =
            NOW()
        WHERE subscription_id = $1
          AND is_active =
              TRUE
      `,
      [
        input.subscriptionId,
      ],
    );

    const result =
      await client.query(
        `
          INSERT INTO subscription_billing_profiles (
            tenant_id,
            subscription_id,
            provider,
            provider_customer_id,
            provider_subscription_id,
            provider_payment_method_id,
            recurring_status,
            currency,
            price_per_user_monthly,
            seat_quantity,
            metadata,
            is_active,
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
            $7,
            $8,
            $9,
            $10,
            $11::jsonb,
            TRUE,
            NOW(),
            NOW()
          )
          RETURNING *
        `,
        [
          input.tenantId,
          input.subscriptionId,
          input.provider,
          input.providerCustomerId ||
          null,
          input.providerSubscriptionId ||
          null,
          input.providerPaymentMethodId ||
          null,
          input.recurringStatus,
          input.currency,
          input.pricePerUserMonthly ??
          null,
          input.seatQuantity ??
          null,
          JSON.stringify(
            input.metadata ||
            {},
          ),
        ],
      );

    await client.query(
      'COMMIT',
    );

    return rowToProfile(
      result.rows[0],
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve the original profile error.
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function updateActiveSubscriptionBillingProfile(
  subscriptionId:
    string,
  patch: {
    providerCustomerId?:
      string | null;
    providerSubscriptionId?:
      string | null;
    providerPaymentMethodId?:
      string | null;
    recurringStatus?:
      string;
    pricePerUserMonthly?:
      number | null;
    seatQuantity?:
      number | null;
    metadata?:
      Record<
        string,
        unknown
      >;
  },
) {
  const result =
    await queryControl(
      `
        UPDATE subscription_billing_profiles
        SET
          provider_customer_id =
            COALESCE(
              $2,
              provider_customer_id
            ),
          provider_subscription_id =
            COALESCE(
              $3,
              provider_subscription_id
            ),
          provider_payment_method_id =
            COALESCE(
              $4,
              provider_payment_method_id
            ),
          recurring_status =
            COALESCE(
              $5,
              recurring_status
            ),
          price_per_user_monthly =
            COALESCE(
              $6,
              price_per_user_monthly
            ),
          seat_quantity =
            COALESCE(
              $7,
              seat_quantity
            ),
          metadata =
            metadata ||
            $8::jsonb,
          updated_at =
            NOW()
        WHERE subscription_id = $1
          AND is_active =
              TRUE
        RETURNING *
      `,
      [
        subscriptionId,
        patch.providerCustomerId ??
        null,
        patch.providerSubscriptionId ??
        null,
        patch.providerPaymentMethodId ??
        null,
        patch.recurringStatus ??
        null,
        patch.pricePerUserMonthly ??
        null,
        patch.seatQuantity ??
        null,
        JSON.stringify(
          patch.metadata ||
          {},
        ),
      ],
    );

  return result.rows[0]
    ? rowToProfile(
        result.rows[0],
      )
    : null;
}
