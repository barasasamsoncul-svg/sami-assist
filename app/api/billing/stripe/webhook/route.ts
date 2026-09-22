import Stripe from 'stripe';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  applyVerifiedCheckoutPayment,
  applyVerifiedRecurringInvoice,
  markVerifiedCheckoutFailed,
} from '@/lib/billing/payment-application';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

function stripeClient() {
  const secret =
    process.env
      .STRIPE_SECRET_KEY
      ?.trim();

  if (
    !secret
  ) {
    throw new Error(
      'STRIPE_SECRET_KEY is not configured.',
    );
  }

  return new Stripe(
    secret,
  );
}

function json(
  body:
    Record<
      string,
      unknown
    >,
  status =
    200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store',
        'X-Content-Type-Options':
          'nosniff',
      },
    },
  );
}

function objectRecord(
  value:
    unknown,
) {
  return (
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
      ? value as
          Record<
            string,
            unknown
          >
      : {}
  );
}

function stripeId(
  value:
    unknown,
) {
  if (
    typeof value ===
      'string'
  ) {
    return value;
  }

  const record =
    objectRecord(
      value,
    );

  return typeof record.id ===
    'string'
    ? record.id
    : null;
}

function invoiceSubscriptionId(
  invoice:
    Record<
      string,
      unknown
    >,
) {
  const legacy =
    stripeId(
      invoice.subscription,
    );

  if (
    legacy
  ) {
    return legacy;
  }

  const parent =
    objectRecord(
      invoice.parent,
    );

  const details =
    objectRecord(
      parent.subscription_details,
    );

  return stripeId(
    details.subscription,
  );
}

function unixDate(
  value:
    unknown,
) {
  const seconds =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      seconds,
    ) ||
    seconds <=
      0
  ) {
    return null;
  }

  return new Date(
    seconds *
    1000,
  );
}

export async function POST(
  request:
    NextRequest,
) {
  const signature =
    request.headers
      .get(
        'stripe-signature',
      );

  const webhookSecret =
    process.env
      .STRIPE_WEBHOOK_SECRET
      ?.trim();

  if (
    !signature ||
    !webhookSecret
  ) {
    return json(
      {
        success:
          false,
      },
      400,
    );
  }

  const rawBody =
    await request.text();

  let event:
    Stripe.Event;

  try {
    event =
      stripeClient()
        .webhooks
        .constructEvent(
          rawBody,
          signature,
          webhookSecret,
        );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Billing] Invalid Stripe webhook signature:',
      error,
    );

    return json(
      {
        success:
          false,
      },
      400,
    );
  }

  try {
    const object =
      objectRecord(
        event.data
          .object,
      );

    if (
      event.type ===
        'checkout.session.completed'
    ) {
      const reference =
        typeof object.id ===
          'string'
          ? object.id
          : '';

      const paymentStatus =
        typeof object.payment_status ===
          'string'
          ? object.payment_status
          : '';

      const amount =
        Number(
          object.amount_total,
        ) /
        100;

      const currency =
        typeof object.currency ===
          'string'
          ? object.currency
              .toUpperCase()
          : 'KES';

      if (
        reference &&
        paymentStatus ===
          'paid'
      ) {
        await applyVerifiedCheckoutPayment({
          provider:
            'stripe',
          providerReference:
            reference,
          amount,
          currency,
          providerData: {
            eventId:
              event.id,
            eventType:
              event.type,
          },
        });
      }
    }

    if (
      event.type ===
        'checkout.session.async_payment_failed'
    ) {
      const reference =
        typeof object.id ===
          'string'
          ? object.id
          : '';

      if (
        reference
      ) {
        await markVerifiedCheckoutFailed({
          provider:
            'stripe',
          providerReference:
            reference,
          providerData: {
            eventId:
              event.id,
            eventType:
              event.type,
          },
        });
      }
    }

    if (
      event.type ===
        'invoice.paid'
    ) {
      const reference =
        typeof object.id ===
          'string'
          ? object.id
          : '';

      const providerSubscriptionId =
        invoiceSubscriptionId(
          object,
        );

      const amount =
        Number(
          object.amount_paid,
        ) /
        100;

      const currency =
        typeof object.currency ===
          'string'
          ? object.currency
              .toUpperCase()
          : 'KES';

      const periodStart =
        unixDate(
          object.period_start,
        );

      const periodEnd =
        unixDate(
          object.period_end,
        );

      if (
        reference &&
        providerSubscriptionId &&
        periodStart &&
        periodEnd
      ) {
        await applyVerifiedRecurringInvoice({
          provider:
            'stripe',
          providerSubscriptionId,
          providerReference:
            reference,
          amount,
          currency,
          periodStart,
          periodEnd,
          providerData: {
            eventId:
              event.id,
            eventType:
              event.type,
          },
        });
      }
    }

    if (
      event.type ===
        'invoice.payment_failed'
    ) {
      const providerSubscriptionId =
        invoiceSubscriptionId(
          object,
        );

      if (
        providerSubscriptionId
      ) {
        const { queryControl } =
          await import(
            '@/lib/db/control'
          );

        await queryControl(
          `
            UPDATE subscription_billing_profiles bp
            SET
              recurring_status =
                'past_due',
              metadata =
                bp.metadata ||
                $3::jsonb,
              updated_at =
                NOW()
            WHERE bp.provider =
                'stripe'
              AND bp.provider_subscription_id =
                  $1
              AND bp.is_active =
                  TRUE
            RETURNING
              bp.subscription_id
          `,
          [
            providerSubscriptionId,
            event.id,
            JSON.stringify({
              lastFailedInvoiceEvent:
                event.id,
              lastFailedInvoiceAt:
                new Date()
                  .toISOString(),
            }),
          ],
        );

        await queryControl(
          `
            UPDATE subscriptions s
            SET
              status =
                'past_due',
              updated_at =
                NOW()
            WHERE s.id IN (
              SELECT
                bp.subscription_id
              FROM subscription_billing_profiles bp
              WHERE bp.provider =
                  'stripe'
                AND bp.provider_subscription_id =
                    $1
                AND bp.is_active =
                    TRUE
            )
              AND s.deleted_at
                  IS NULL
          `,
          [
            providerSubscriptionId,
          ],
        );
      }
    }

    return json({
      success:
        true,
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Billing] Stripe webhook processing failed:',
      {
        eventId:
          event.id,
        eventType:
          event.type,
        error,
      },
    );

    return json(
      {
        success:
          false,
      },
      500,
    );
  }
}
