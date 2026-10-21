import crypto from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getIntaSendInvoiceStatus,
  getIntaSendSubscription,
} from '@/lib/billing/providers/intasend';

import {
  applyVerifiedCheckoutPayment,
  applyVerifiedRecurringInvoice,
  markVerifiedCheckoutFailed,
} from '@/lib/billing/payment-application';

import {
  notifyWorkspaceOwnersOfBillingEvent,
} from '@/lib/billing/notifications';

import {
  queryControl,
} from '@/lib/db/control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RecordValue =
  Record<string, unknown>;

function objectRecord(value: unknown): RecordValue {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? value as RecordValue
    : {};
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');

  return a.length === b.length &&
    crypto.timingSafeEqual(a, b);
}

function json(
  body: RecordValue,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function safeMoney(value: unknown) {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    return Number.NaN;
  }

  const amount = Number(value);

  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 100) / 100
    : Number.NaN;
}

function parseIntaSendDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const raw = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const parsed = new Date(
    dateOnly ? `${raw}T00:00:00+03:00` : raw,
  );

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed;
}

function addOneMonthNoOverflow(value: Date) {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  const nextMonthEnd =
    new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  const nextDate = new Date(
    Date.UTC(
      year,
      month + 1,
      Math.min(day, nextMonthEnd),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );

  return nextDate;
}

async function handleCollectionEvent(
  event: RecordValue,
) {
  const invoiceId =
    stringValue(event.invoice_id);

  if (!invoiceId) {
    return {
      ignored: true,
      reason: 'missing_invoice_id',
    };
  }

  // Recurring subscription charges are handled via subscription_event.
  // Collection events can arrive for them too, and must not be mistaken
  // for one-time checkout transactions which SaMi never created locally.
  const localPayment = await queryControl(
    `
      SELECT id
      FROM payment_transactions
      WHERE provider = 'intasend'
        AND provider_transaction_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [invoiceId],
  );

  if (localPayment.rows.length !== 1) {
    return {
      ignored: true,
      reason: 'unmatched_collection',
    };
  }

  const verified =
    await getIntaSendInvoiceStatus(invoiceId);

  const verifiedInvoiceId =
    stringValue(verified.invoice_id);

  if (
    verifiedInvoiceId &&
    verifiedInvoiceId !== invoiceId
  ) {
    throw new Error(
      'IntaSend payment status returned a mismatched invoice ID.',
    );
  }

  const state =
    stringValue(verified.state)
      .toUpperCase();

  const amount =
    safeMoney(verified.value);

  const currency =
    stringValue(verified.currency)
      .toUpperCase();

  if (state === 'COMPLETE') {
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !currency
    ) {
      throw new Error(
        'IntaSend verified a completed invoice with invalid amount or currency.',
      );
    }

    return applyVerifiedCheckoutPayment({
      provider: 'intasend',
      providerReference: invoiceId,
      amount,
      currency,
      providerData: {
        topic: 'collection_event',
        state,
        apiRef: stringValue(verified.api_ref),
        providerRef: stringValue(verified.provider_ref),
      },
    });
  }

  if (
    state === 'FAILED' ||
    state === 'CANCELED'
  ) {
    await markVerifiedCheckoutFailed({
      provider: 'intasend',
      providerReference: invoiceId,
      providerData: {
        topic: 'collection_event',
        state,
        failedReason: stringValue(
          verified.failed_reason,
        ),
      },
    });

    return {
      ignored: false,
      state,
    };
  }

  // IntaSend sends intermediate PENDING/PROCESSING/RETRY states too.
  // A later webhook carries the final state.
  return {
    ignored: true,
    reason: 'invoice_not_final',
    state,
  };
}

async function handleSubscriptionEvent(
  event: RecordValue,
) {
  const providerSubscriptionId =
    stringValue(event.subscription_id);

  if (!providerSubscriptionId) {
    return {
      ignored: true,
      reason: 'missing_subscription_id',
    };
  }

  // Never authorize a subscription change from the webhook payload alone:
  // re-read the authoritative provider resource with the server secret.
  const providerSubscription =
    await getIntaSendSubscription(
      providerSubscriptionId,
    );

  const actualId =
    stringValue(
      providerSubscription.subscription_id,
      providerSubscription.id,
    );

  if (
    actualId &&
    actualId !== providerSubscriptionId
  ) {
    throw new Error(
      'IntaSend subscription status returned a mismatched subscription ID.',
    );
  }

  const remoteReference =
    stringValue(providerSubscription.reference);

  const result = await queryControl(
    `
      SELECT
        bp.id AS profile_id,
        bp.tenant_id,
        bp.subscription_id,
        bp.recurring_status,
        bp.currency,
        bp.price_per_user_monthly,
        bp.seat_quantity,
        s.status AS subscription_status,
        s.trial_ends_at,
        s.current_period_end,
        s.cancelled_at
      FROM subscription_billing_profiles bp
      INNER JOIN subscriptions s
        ON s.id = bp.subscription_id
       AND s.deleted_at IS NULL
      WHERE bp.provider = 'intasend'
        AND bp.provider_subscription_id = $1
        AND bp.is_active = TRUE
      ORDER BY bp.updated_at DESC
      LIMIT 1
    `,
    [providerSubscriptionId],
  );

  if (result.rows.length !== 1) {
    // May arrive between provider creation and the local profile write.
    // It is safe to acknowledge because the next status event can reconcile.
    return {
      ignored: true,
      reason: 'unlinked_subscription',
    };
  }

  const profile = result.rows[0];
  const expectedReference =
    `sami-${String(profile.tenant_id)}-${String(profile.subscription_id)}`;

  if (
    !remoteReference ||
    remoteReference !== expectedReference
  ) {
    throw new Error(
      'IntaSend subscription reference does not match its SaMi tenant and subscription.',
    );
  }

  const providerStatus =
    stringValue(providerSubscription.status)
      .toUpperCase();

  const trialEndsAt =
    profile.trial_ends_at
      ? new Date(String(profile.trial_ends_at))
      : null;

  const trialIsStillValid =
    trialEndsAt &&
    !Number.isNaN(trialEndsAt.getTime()) &&
    trialEndsAt.getTime() > Date.now();

  let recurringStatus: string;
  if (providerStatus === 'ACTIVE') {
    recurringStatus =
      trialIsStillValid ? 'trialing' : 'active';
  } else if (
    providerStatus === 'CANCELED' ||
    providerStatus === 'COMPLETE'
  ) {
    recurringStatus = 'cancelled';
  } else if (providerStatus === 'FAILED') {
    recurringStatus = 'past_due';
  } else {
    recurringStatus = 'setup_pending';
  }

  const cardMask =
    stringValue(providerSubscription.card_mask);
  const cardType =
    stringValue(providerSubscription.card_type);
  const failReason =
    stringValue(providerSubscription.fail_reason);
  const completedCycles =
    Number(providerSubscription.completed_cycles);

  await queryControl(
    `
      UPDATE subscription_billing_profiles
      SET
        recurring_status = $2,
        metadata =
          metadata ||
          $3::jsonb,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      profile.profile_id,
      recurringStatus,
      JSON.stringify({
        providerStatus,
        completedCycles:
          Number.isFinite(completedCycles)
            ? completedCycles
            : null,
        cardMask: cardMask || null,
        cardType: cardType || null,
        failureReason: failReason || null,
        lastSubscriptionEventAt:
          new Date().toISOString(),
      }),
    ],
  );

  if (providerStatus === 'FAILED') {
    const subscriptionBoundary =
      profile.trial_ends_at ||
      profile.current_period_end;
    const boundary =
      subscriptionBoundary
        ? new Date(String(subscriptionBoundary))
        : null;
    const pastDue =
      !boundary ||
      Number.isNaN(boundary.getTime()) ||
      boundary.getTime() <= Date.now();

    if (pastDue && !profile.cancelled_at) {
      await queryControl(
        `
          UPDATE subscriptions
          SET
            status = 'past_due',
            updated_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
            AND cancelled_at IS NULL
        `,
        [profile.subscription_id],
      );

      await notifyWorkspaceOwnersOfBillingEvent({
        tenantId: String(profile.tenant_id),
        type: 'billing.payment_failed',
        eventKey: 'billing.payment_failed',
        title: 'Subscription payment needs attention',
        message:
          `IntaSend could not complete the latest SaMi subscription charge. ${failReason ? `Reason: ${failReason.slice(0, 180)}. ` : ''}Open Billing to review payment recovery. Your workspace data is retained.`,
        priority: 'urgent',
        dedupeKey:
          `billing:intasend-subscription-failed:${providerSubscriptionId}:${String(providerSubscription.updated_at || providerSubscription.fail_reason || providerStatus)}`,
        metadata: {
          provider: 'intasend',
          providerSubscriptionId,
          providerStatus,
          failureReason: failReason || null,
        },
      });
    }
  }

  const payments = Array.isArray(providerSubscription.payments)
    ? providerSubscription.payments
        .map(value => objectRecord(value))
    : [];

  const latestCompletePayment = payments
    .map(payment => ({
      payment,
      invoice: objectRecord(payment.invoice),
      createdAt:
        parseIntaSendDate(payment.created_at) ||
        parseIntaSendDate(
          objectRecord(payment.invoice).created_at,
        ),
    }))
    .filter(item =>
      stringValue(item.invoice.invoice_id) &&
      stringValue(item.invoice.state).toUpperCase() === 'COMPLETE' &&
      Number.isFinite(safeMoney(item.invoice.value)) &&
      safeMoney(item.invoice.value) > 0,
    )
    .sort((a, b) =>
      (a.createdAt?.getTime() || 0) -
      (b.createdAt?.getTime() || 0),
    )
    .at(-1);

  if (
    latestCompletePayment &&
    (
      providerStatus === 'ACTIVE' ||
      providerStatus === 'COMPLETE'
    )
  ) {
    const invoice =
      latestCompletePayment.invoice;
    const invoiceId =
      stringValue(invoice.invoice_id);
    const existing = await queryControl(
      `
        SELECT status
        FROM payment_transactions
        WHERE provider = 'intasend'
          AND provider_transaction_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [invoiceId],
    );

    if (
      existing.rows[0]?.status !== 'completed'
    ) {
      const periodStart =
        parseIntaSendDate(profile.current_period_end) ||
        parseIntaSendDate(profile.trial_ends_at) ||
        latestCompletePayment.createdAt;
      const providerNextDate =
        parseIntaSendDate(providerSubscription.next_date);
      const periodEnd =
        providerNextDate &&
        periodStart &&
        providerNextDate.getTime() > periodStart.getTime()
          ? providerNextDate
          : periodStart
            ? addOneMonthNoOverflow(periodStart)
            : null;
      const amount =
        safeMoney(invoice.value);
      const currency =
        stringValue(invoice.currency)
          .toUpperCase();

      if (
        !periodStart ||
        !periodEnd ||
        periodEnd.getTime() <= periodStart.getTime() ||
        !Number.isFinite(amount) ||
        !currency
      ) {
        throw new Error(
          'IntaSend recurring invoice is missing valid period, amount, or currency data.',
        );
      }

      await applyVerifiedRecurringInvoice({
        provider: 'intasend',
        providerSubscriptionId,
        providerReference: invoiceId,
        amount,
        currency,
        periodStart,
        periodEnd,
        providerData: {
          topic: 'subscription_event',
          transactionId:
            stringValue(latestCompletePayment.payment.transaction_id),
          completedCycles:
            Number.isFinite(completedCycles)
              ? completedCycles
              : null,
          cardMask: cardMask || null,
          cardType: cardType || null,
        },
      });
    }
  }

  return {
    ignored: false,
    providerStatus,
    recurringStatus,
  };
}

export async function POST(
  request: NextRequest,
) {
  const expectedChallenge =
    process.env.INTASEND_WEBHOOK_CHALLENGE
      ?.trim() || '';

  if (!expectedChallenge) {
    return json(
      { success: false, error: 'Webhook challenge is not configured.' },
      503,
    );
  }

  let event: RecordValue;
  try {
    event = objectRecord(await request.json());
  } catch {
    return json(
      { success: false, error: 'Invalid JSON payload.' },
      400,
    );
  }

  const suppliedChallenge =
    stringValue(event.challenge);

  if (
    !suppliedChallenge ||
    !constantTimeEqual(
      suppliedChallenge,
      expectedChallenge,
    )
  ) {
    return json(
      { success: false },
      401,
    );
  }

  const topic =
    stringValue(event.topic);

  try {
    if (topic === 'collection_event') {
      const result =
        await handleCollectionEvent(event);

      return json({
        success: true,
        topic,
        ...result,
      });
    }

    if (topic === 'subscription_event') {
      const result =
        await handleSubscriptionEvent(event);

      return json({
        success: true,
        topic,
        ...result,
      });
    }

    // Other IntaSend account topics are intentionally outside SaMi
    // subscription billing; acknowledge them without side effects.
    return json({
      success: true,
      ignored: true,
      reason: 'unsupported_topic',
    });
  } catch (error) {
    console.error(
      '[SaMi Billing] IntaSend webhook processing failed:',
      {
        topic,
        resourceId:
          stringValue(
            event.invoice_id,
            event.subscription_id,
          ) || null,
        error,
      },
    );

    return json(
      { success: false },
      500,
    );
  }
}
