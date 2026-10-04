import 'server-only';

import crypto from 'node:crypto';

import {
  refundInvoicePayment,
} from '@/lib/apps/invoicing/commands';

import {
  refundInvoiceCreditNote,
} from '@/lib/apps/invoicing/credit-notes';

import {
  cleanText,
  InvoicingError,
  INVOICING_PERMISSIONS,
  isoDate,
  money,
  numberInput,
  requireInvoicingContext,
  requireUuid,
} from '@/lib/apps/invoicing/context';

import {
  createInvoiceProviderRefundRemote,
  getInvoiceProviderRefundRemote,
  providerFromStorageKey,
  providerRefundOperationKey,
  type InvoiceRefundProvider,
  type InvoiceProviderRefundResult,
} from '@/lib/apps/invoicing/payment-provider-refunds';

import type {
  InvoicePaymentProviderSecrets,
} from '@/lib/apps/invoicing/payment-provider-adapters';

import {
  openIntegrationSecret,
} from '@/lib/integrations/crypto';

type RefundKind =
  | 'payment'
  | 'credit_note';

type ProviderPayment = {
  paymentId: string;
  paymentNumber: string;
  providerKey: string | null;
  provider: InvoiceRefundProvider | null;
  providerTransactionId: string | null;
  currency: string;
  amount: number;
  method: string;
};

type LoadedProviderConnection = {
  connectionId: string;
  secrets: InvoicePaymentProviderSecrets;
};

type RefundAttempt = {
  id: string;
  providerKey: string;
  status: string;
  payload: Record<string, unknown>;
};

function plainObject(
  value: unknown,
):
  Record<string, unknown> {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function operationKey(
  value: unknown,
  prefix: string,
) {
  return (
    cleanText(
      value,
      120,
    ) ||
    (
      prefix +
      ':' +
      crypto.randomUUID()
    )
  ).slice(
    0,
    120,
  );
}

function providerDisplayName(
  providerKey: string,
) {
  return providerKey
    .replace(
      'invoicing_payment_',
      '',
    )
    .replace(
      /_/g,
      ' ',
    );
}

async function loadProviderConnection(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  providerKey:
    string,
): Promise<LoadedProviderConnection> {
  const result =
    await context.pool.query(
      `
        SELECT
          c.id,
          cr.sealed_payload
        FROM integration_connections c
        INNER JOIN integration_credentials cr
          ON cr.connection_id=c.id
        WHERE c.company_id=$1
          AND c.provider_key=$2
          AND c.status='connected'
          AND c.archived_at IS NULL
        ORDER BY c.updated_at DESC
        LIMIT 1
      `,
      [
        context.companyId,
        providerKey,
      ],
    );

  if (
    !result.rows[0]
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'The original payment provider is no longer connected. Reconnect it before requesting an automatic refund.',
    );
  }

  const payload =
    openIntegrationSecret<{
      providerData?: InvoicePaymentProviderSecrets;
    }>(
      String(
        result.rows[0]
          .sealed_payload,
      ),
    );

  if (
    !payload.providerData
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'The payment provider credentials are unavailable.',
    );
  }

  return {
    connectionId:
      String(
        result.rows[0].id,
      ),
    secrets:
      payload.providerData,
  };
}

async function resolveProviderTransactionId(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input: {
    provider:
      InvoiceRefundProvider;
    providerKey:
      string;
    paymentMetadata:
      Record<string, unknown>;
  },
) {
  const direct =
    cleanText(
      input.paymentMetadata
        .providerTransactionId,
      255,
    );

  if (
    direct
  ) {
    return direct;
  }

  const externalEventId =
    cleanText(
      input.paymentMetadata
        .externalEventId,
      255,
    );

  if (
    !externalEventId
  ) {
    return '';
  }

  const event =
    await context.pool.query(
      `
        SELECT payload
        FROM integration_events
        WHERE company_id=$1
          AND provider_key=$2
          AND external_event_id=$3
          AND event_key='invoicing.payment.succeeded'
        ORDER BY occurred_at DESC
        LIMIT 1
      `,
      [
        context.companyId,
        input.providerKey,
        externalEventId,
      ],
    );

  const payload =
    plainObject(
      event.rows[0]
        ?.payload,
    );

  const explicit =
    cleanText(
      payload.providerTransactionId,
      255,
    );

  if (
    explicit
  ) {
    return explicit;
  }

  if (
    input.provider ===
      'flutterwave'
  ) {
    const candidate =
      cleanText(
        payload.externalEventId,
        255,
      ) ||
      externalEventId;

    return /^[0-9]+$/.test(
      candidate,
    )
      ? candidate
      : '';
  }

  return cleanText(
    payload.providerReference,
    255,
  );
}

async function loadPayment(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  paymentId:
    string,
): Promise<ProviderPayment> {
  const result =
    await context.pool.query(
      `
        SELECT
          id,
          payment_number,
          amount,
          currency,
          method,
          metadata
        FROM invoicing_payments
        WHERE id=$1
          AND company_id=$2
          AND status='posted'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        paymentId,
        context.companyId,
      ],
    );

  if (
    !result.rows[0]
  ) {
    throw new InvoicingError(
      'PAYMENT_NOT_FOUND',
      'Payment was not found.',
    );
  }

  const payment =
    result.rows[0];

  const metadata =
    plainObject(
      payment.metadata,
    );

  const providerKey =
    cleanText(
      metadata.sourceProvider,
      180,
    ) ||
    null;

  const provider =
    providerKey
      ? providerFromStorageKey(
          providerKey,
        )
      : null;

  const providerTransactionId =
    provider &&
    providerKey
      ? (
          await resolveProviderTransactionId(
            context,
            {
              provider,
              providerKey,
              paymentMetadata:
                metadata,
            },
          )
        ) ||
        null
      : null;

  return {
    paymentId:
      String(
        payment.id,
      ),
    paymentNumber:
      String(
        payment.payment_number,
      ),
    providerKey,
    provider,
    providerTransactionId,
    currency:
      String(
        payment.currency,
      ),
    amount:
      money(
        payment.amount,
      ),
    method:
      String(
        payment.method ||
        'other',
      ),
  };
}

function providerPayload(
  input: {
    refundKind: RefundKind;
    payment: ProviderPayment;
    creditNoteId?: string | null;
    amount: number;
    reason: string;
    refundDate: string;
    providerStatus: string;
    providerMessage: string;
    externalRefundId?: string | null;
    providerReference?: string | null;
    manualConfirmationRequired?: boolean;
    financialRefundId?: string | null;
    financialRefundNumber?: string | null;
    providerRequestUncertain?: boolean;
  },
) {
  return {
    refundKind:
      input.refundKind,
    paymentId:
      input.payment.paymentId,
    providerPaymentId:
      input.payment.paymentId,
    providerPaymentNumber:
      input.payment.paymentNumber,
    creditNoteId:
      input.creditNoteId ||
      null,
    amount:
      input.amount,
    currency:
      input.payment.currency,
    reason:
      input.reason,
    refundDate:
      input.refundDate,
    provider:
      input.payment.provider,
    providerKey:
      input.payment.providerKey,
    providerTransactionId:
      input.payment.providerTransactionId,
    providerStatus:
      input.providerStatus,
    providerMessage:
      input.providerMessage,
    externalRefundId:
      input.externalRefundId ||
      null,
    providerReference:
      input.providerReference ||
      null,
    manualConfirmationRequired:
      input.manualConfirmationRequired ===
      true,
    financialRefundId:
      input.financialRefundId ||
      null,
    financialRefundNumber:
      input.financialRefundNumber ||
      null,
    providerRequestUncertain:
      input.providerRequestUncertain ===
      true,
  };
}

async function loadAttempt(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  attemptId:
    string,
): Promise<RefundAttempt> {
  const result =
    await context.pool.query(
      `
        SELECT
          id,
          provider_key,
          status,
          payload
        FROM integration_events
        WHERE id=$1
          AND company_id=$2
          AND event_key='invoicing.provider_refund'
        LIMIT 1
      `,
      [
        attemptId,
        context.companyId,
      ],
    );

  if (
    !result.rows[0]
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Provider refund attempt was not found.',
    );
  }

  return {
    id:
      String(
        result.rows[0].id,
      ),
    providerKey:
      String(
        result.rows[0].provider_key,
      ),
    status:
      String(
        result.rows[0].status,
      ),
    payload:
      plainObject(
        result.rows[0].payload,
      ),
  };
}

async function updateAttempt(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input: {
    attemptId: string;
    status:
      'pending' |
      'processed' |
      'failed';
    payload:
      Record<string, unknown>;
  },
) {
  await context.pool.query(
    `
      UPDATE integration_events
      SET
        status=$3,
        processed_at=
          CASE
            WHEN $3 IN ('processed','failed')
            THEN NOW()
            ELSE NULL
          END,
        payload=
          COALESCE(payload,'{}'::jsonb) ||
          $4::jsonb
      WHERE id=$1
        AND company_id=$2
        AND event_key='invoicing.provider_refund'
    `,
    [
      input.attemptId,
      context.companyId,
      input.status,
      JSON.stringify(
        input.payload,
      ),
    ],
  );
}

async function createPaymentAttempt(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input: {
    payment:
      ProviderPayment;
    connectionId:
      string;
    amount:
      number;
    reason:
      string;
    refundDate:
      string;
    idempotencyKey:
      string;
  },
) {
  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await client.query(
      `
        SELECT
          pg_advisory_xact_lock(
            hashtext($1)
          )
      `,
      [
        'provider-refund:' +
        context.companyId +
        ':' +
        input.idempotencyKey,
      ],
    );

    const duplicate =
      await client.query(
        `
          SELECT
            id,
            status,
            payload
          FROM integration_events
          WHERE company_id=$1
            AND provider_key=$2
            AND event_key='invoicing.provider_refund'
            AND external_event_id=$3
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [
          context.companyId,
          input.payment.providerKey,
          input.idempotencyKey,
        ],
      );

    if (
      duplicate.rows[0]
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        attemptId:
          String(
            duplicate.rows[0].id,
          ),
        duplicate:
          true,
        status:
          String(
            duplicate.rows[0].status,
          ),
        payload:
          plainObject(
            duplicate.rows[0].payload,
          ),
      };
    }

    const balance =
      await client.query(
        `
          SELECT
            p.status,
            p.reconciled_at,
            b.unapplied_amount,
            COALESCE(
              (
                SELECT SUM(
                  (e.payload->>'amount')::numeric
                )
                FROM integration_events e
                WHERE e.company_id=p.company_id
                  AND e.event_key='invoicing.provider_refund'
                  AND e.status='pending'
                  AND e.payload->>'refundKind'='payment'
                  AND e.payload->>'paymentId'=p.id::text
              ),
              0
            )::numeric(19,4)
              AS reserved_amount
          FROM invoicing_payments p
          INNER JOIN invoicing_payment_balances b
            ON b.payment_id=p.id
           AND b.company_id=p.company_id
          WHERE p.id=$1
            AND p.company_id=$2
            AND p.deleted_at IS NULL
          FOR UPDATE OF p
        `,
        [
          input.payment.paymentId,
          context.companyId,
        ],
      );

    if (
      !balance.rows[0]
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment was not found.',
      );
    }

    if (
      String(
        balance.rows[0].status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted payment can be refunded.',
      );
    }

    if (
      balance.rows[0]
        .reconciled_at
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Unreconcile this payment before sending money back through the provider.',
      );
    }

    const available =
      money(
        money(
          balance.rows[0]
            .unapplied_amount,
        ) -
        money(
          balance.rows[0]
            .reserved_amount,
        ),
      );

    if (
      input.amount >
        available +
        0.0001
    ) {
      throw new InvoicingError(
        'PAYMENT_EXCEEDS_BALANCE',
        'The refund exceeds the unapplied amount that is not already reserved by another provider refund.',
        {
          unapplied:
            available,
        },
      );
    }

    const attemptId =
      crypto.randomUUID();

    const payload =
      providerPayload({
        refundKind:
          'payment',
        payment:
          input.payment,
        amount:
          input.amount,
        reason:
          input.reason,
        refundDate:
          input.refundDate,
        providerStatus:
          'pending',
        providerMessage:
          'Provider refund request created.',
      });

    await client.query(
      `
        INSERT INTO integration_events (
          id,
          company_id,
          connection_id,
          provider_key,
          event_key,
          external_event_id,
          payload,
          status,
          occurred_at,
          created_at
        )
        VALUES (
          $1,$2,$3,$4,
          'invoicing.provider_refund',
          $5,$6::jsonb,
          'pending',
          NOW(),NOW()
        )
      `,
      [
        attemptId,
        context.companyId,
        input.connectionId,
        input.payment.providerKey,
        input.idempotencyKey,
        JSON.stringify(
          payload,
        ),
      ],
    );

    await client.query(
      'COMMIT',
    );

    return {
      attemptId,
      duplicate:
        false,
      status:
        'pending',
      payload,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

async function createCreditAttempt(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input: {
    creditNoteId:
      string;
    payment:
      ProviderPayment;
    connectionId:
      string;
    amount:
      number;
    reason:
      string;
    refundDate:
      string;
    idempotencyKey:
      string;
  },
) {
  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await client.query(
      `
        SELECT
          pg_advisory_xact_lock(
            hashtext($1)
          )
      `,
      [
        'provider-credit-refund:' +
        context.companyId +
        ':' +
        input.idempotencyKey,
      ],
    );

    const duplicate =
      await client.query(
        `
          SELECT
            id,
            status,
            payload
          FROM integration_events
          WHERE company_id=$1
            AND provider_key=$2
            AND event_key='invoicing.provider_refund'
            AND external_event_id=$3
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [
          context.companyId,
          input.payment.providerKey,
          input.idempotencyKey,
        ],
      );

    if (
      duplicate.rows[0]
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        attemptId:
          String(
            duplicate.rows[0].id,
          ),
        duplicate:
          true,
        status:
          String(
            duplicate.rows[0].status,
          ),
        payload:
          plainObject(
            duplicate.rows[0].payload,
          ),
      };
    }

    const credit =
      await client.query(
        `
          SELECT
            b.currency,
            b.available_amount,
            b.source_invoice_id,
            COALESCE(
              (
                SELECT SUM(
                  (e.payload->>'amount')::numeric
                )
                FROM integration_events e
                WHERE e.company_id=b.company_id
                  AND e.event_key='invoicing.provider_refund'
                  AND e.status='pending'
                  AND e.payload->>'refundKind'='credit_note'
                  AND e.payload->>'creditNoteId'=b.credit_note_id::text
              ),
              0
            )::numeric(19,4)
              AS reserved_amount
          FROM invoicing_credit_note_balances b
          WHERE b.company_id=$1
            AND b.credit_note_id=$2
          LIMIT 1
        `,
        [
          context.companyId,
          input.creditNoteId,
        ],
      );

    if (
      !credit.rows[0]
    ) {
      throw new InvoicingError(
        'CREDIT_NOTE_NOT_FOUND',
        'Credit note was not found or has no available balance.',
      );
    }

    if (
      String(
        credit.rows[0].currency,
      ) !==
        input.payment.currency
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'The original payment currency does not match this credit note.',
      );
    }

    const availableCredit =
      money(
        money(
          credit.rows[0]
            .available_amount,
        ) -
        money(
          credit.rows[0]
            .reserved_amount,
        ),
      );

    if (
      input.amount >
        availableCredit +
        0.0001
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'The refund exceeds the available credit that is not already reserved by another provider refund.',
        {
          availableCredit,
        },
      );
    }

    const allocation =
      await client.query(
        `
          SELECT
            COALESCE(
              SUM(
                COALESCE(
                  a.payment_amount,
                  a.amount
                )
              ),
              0
            )::numeric(19,4)
              AS allocated,
            COALESCE(
              (
                SELECT SUM(r.amount)
                FROM invoicing_credit_note_refunds r
                WHERE r.company_id=$1
                  AND r.status='posted'
                  AND r.metadata->>'providerPaymentId'=$3
              ),
              0
            )::numeric(19,4)
              AS posted_provider_refunds,
            COALESCE(
              (
                SELECT SUM(
                  (e.payload->>'amount')::numeric
                )
                FROM integration_events e
                WHERE e.company_id=$1
                  AND e.event_key='invoicing.provider_refund'
                  AND e.status='pending'
                  AND e.payload->>'refundKind'='credit_note'
                  AND e.payload->>'providerPaymentId'=$3
              ),
              0
            )::numeric(19,4)
              AS pending_provider_refunds
          FROM invoicing_payment_allocations a
          WHERE a.company_id=$1
            AND a.invoice_id=$2
            AND a.payment_id=$3
            AND a.status='posted'
        `,
        [
          context.companyId,
          String(
            credit.rows[0]
              .source_invoice_id,
          ),
          input.payment.paymentId,
        ],
      );

    const refundableFromPayment =
      money(
        money(
          allocation.rows[0]
            ?.allocated,
        ) -
        money(
          allocation.rows[0]
            ?.posted_provider_refunds,
        ) -
        money(
          allocation.rows[0]
            ?.pending_provider_refunds,
        ),
      );

    if (
      input.amount >
        refundableFromPayment +
        0.0001
    ) {
      throw new InvoicingError(
        'PAYMENT_EXCEEDS_BALANCE',
        'The selected original payment does not have enough refundable value allocated to this invoice.',
        {
          refundableFromPayment,
        },
      );
    }

    const attemptId =
      crypto.randomUUID();

    const payload =
      providerPayload({
        refundKind:
          'credit_note',
        payment:
          input.payment,
        creditNoteId:
          input.creditNoteId,
        amount:
          input.amount,
        reason:
          input.reason,
        refundDate:
          input.refundDate,
        providerStatus:
          'pending',
        providerMessage:
          'Provider refund request created.',
      });

    await client.query(
      `
        INSERT INTO integration_events (
          id,
          company_id,
          connection_id,
          provider_key,
          event_key,
          external_event_id,
          payload,
          status,
          occurred_at,
          created_at
        )
        VALUES (
          $1,$2,$3,$4,
          'invoicing.provider_refund',
          $5,$6::jsonb,
          'pending',
          NOW(),NOW()
        )
      `,
      [
        attemptId,
        context.companyId,
        input.connectionId,
        input.payment.providerKey,
        input.idempotencyKey,
        JSON.stringify(
          payload,
        ),
      ],
    );

    await client.query(
      'COMMIT',
    );

    return {
      attemptId,
      duplicate:
        false,
      status:
        'pending',
      payload,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

async function finalizeAttempt(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  attempt:
    RefundAttempt,
  overrides:
    Record<string, unknown> = {},
) {
  const payload = {
    ...attempt.payload,
    ...overrides,
  };

  const refundKind =
    payload.refundKind ===
      'credit_note'
      ? 'credit_note'
      : 'payment';

  const paymentId =
    requireUuid(
      payload.paymentId,
      'Payment',
    );

  const metadata = {
    providerKey:
      attempt.providerKey,
    provider:
      attempt.payload.provider ||
      null,
    providerTransactionId:
      payload.providerTransactionId ||
      null,
    providerRefundEventId:
      payload.externalRefundId ||
      attempt.id,
    externalRefundId:
      payload.externalRefundId ||
      null,
    providerReference:
      payload.providerReference ||
      null,
    providerStatus:
      'succeeded',
    providerMessage:
      payload.providerMessage ||
      'Provider refund completed.',
    providerRefundAttemptId:
      attempt.id,
    providerPaymentId:
      payload.providerPaymentId ||
      paymentId,
    providerPaymentNumber:
      payload.providerPaymentNumber ||
      null,
    manualConfirmationRequired:
      false,
  };

  try {
    const financial =
      refundKind ===
        'payment'
        ? await refundInvoicePayment({
            paymentId,
            amount:
              payload.amount,
            refundDate:
              payload.refundDate,
            method:
              payload.provider ||
              'provider',
            reference:
              payload.providerReference ||
              payload.externalRefundId ||
              null,
            reason:
              payload.reason,
            idempotencyKey:
              'provider-refund:' +
              attempt.id,
            metadata,
          })
        : await refundInvoiceCreditNote({
            creditNoteId:
              requireUuid(
                payload.creditNoteId,
                'Credit note',
              ),
            amount:
              payload.amount,
            refundDate:
              payload.refundDate,
            method:
              payload.provider ||
              'provider',
            reference:
              payload.providerReference ||
              payload.externalRefundId ||
              null,
            reason:
              payload.reason,
            idempotencyKey:
              'provider-refund:' +
              attempt.id,
            metadata,
          });

    const finalPayload = {
      ...payload,
      ...metadata,
      providerStatus:
        'succeeded',
      financialRefundId:
        financial.refundId,
      financialRefundNumber:
        financial.refundNumber,
      financialPostedAt:
        new Date()
          .toISOString(),
    };

    await updateAttempt(
      context,
      {
        attemptId:
          attempt.id,
        status:
          'processed',
        payload:
          finalPayload,
      },
    );

    return {
      refundId:
        financial.refundId,
      refundNumber:
        financial.refundNumber,
      attemptId:
        attempt.id,
      status:
        'posted',
      amount:
        money(
          payload.amount,
        ),
      duplicate:
        financial.duplicate ===
        true,
    };
  } catch (
    error
  ) {
    await updateAttempt(
      context,
      {
        attemptId:
          attempt.id,
        status:
          'pending',
        payload: {
          ...payload,
          providerStatus:
            'succeeded',
          providerMessage:
            payload.providerMessage ||
            'Provider refund completed, but SaMi still needs to post the financial refund.',
          financialPostingError:
            error instanceof
              Error
              ? error.message
              : 'Financial posting failed.',
        },
      },
    );

    throw error;
  }
}

async function applyRemoteResult(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  attempt:
    RefundAttempt,
  remote:
    InvoiceProviderRefundResult,
) {
  const payload = {
    ...attempt.payload,
    providerStatus:
      remote.status,
    providerMessage:
      remote.message,
    externalRefundId:
      remote.externalRefundId ||
      attempt.payload
        .externalRefundId ||
      null,
    providerReference:
      remote.providerReference ||
      attempt.payload
        .providerReference ||
      null,
    manualConfirmationRequired:
      remote.manualConfirmationRequired ===
      true,
    providerCheckedAt:
      new Date()
        .toISOString(),
  };

  if (
    remote.status ===
      'succeeded'
  ) {
    return finalizeAttempt(
      context,
      attempt,
      payload,
    );
  }

  if (
    remote.status ===
      'failed'
  ) {
    await updateAttempt(
      context,
      {
        attemptId:
          attempt.id,
        status:
          'failed',
        payload,
      },
    );

    return {
      attemptId:
        attempt.id,
      status:
        'failed',
      provider:
        attempt.payload.provider ||
        null,
      providerMessage:
        remote.message,
    };
  }

  await updateAttempt(
    context,
    {
      attemptId:
        attempt.id,
      status:
        'pending',
      payload,
    },
  );

  return {
    attemptId:
      attempt.id,
    status:
      remote.status,
    provider:
      attempt.payload.provider ||
      null,
    providerMessage:
      remote.message,
    manualConfirmationRequired:
      remote.manualConfirmationRequired ===
      true,
    externalRefundId:
      remote.externalRefundId,
  };
}

async function executeRemoteRefund(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  attemptId:
    string,
) {
  const attempt =
    await loadAttempt(
      context,
      attemptId,
    );

  const payload =
    attempt.payload;

  const provider =
    providerFromStorageKey(
      attempt.providerKey,
    );

  if (
    !provider
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'This provider does not support automatic refunds in SaMi.',
    );
  }

  const connection =
    await loadProviderConnection(
      context,
      attempt.providerKey,
    );

  let remote:
    InvoiceProviderRefundResult;

  try {
    remote =
      await createInvoiceProviderRefundRemote({
        provider,
        secrets:
          connection.secrets,
        providerTransactionId:
          payload.providerTransactionId,
        amount:
          numberInput(
            payload.amount,
            'Refund amount',
            {
              min:
                0.0001,
            },
          ),
        currency:
          cleanText(
            payload.currency,
            12,
          ),
        reason:
          cleanText(
            payload.reason,
            2000,
          ),
        idempotencyKey:
          providerRefundOperationKey({
            provider,
            companyId:
              context.companyId,
            paymentId:
              requireUuid(
                payload.paymentId,
                'Payment',
              ),
            sourceKind:
              payload.refundKind ===
                'credit_note'
                ? 'credit_note'
                : 'payment',
            sourceId:
              attempt.id,
            amount:
              money(
                payload.amount,
              ),
            nonce:
              attempt.id,
          }),
        actorLabel:
          'SaMi',
      });
  } catch (
    error
  ) {
    const uncertain = {
      ...payload,
      providerStatus:
        'requires_action',
      providerMessage:
        error instanceof
          Error
          ? error.message
          : 'The provider response could not be confirmed.',
      providerRequestUncertain:
        true,
      providerCheckedAt:
        new Date()
          .toISOString(),
    };

    await updateAttempt(
      context,
      {
        attemptId:
          attempt.id,
        status:
          'pending',
        payload:
          uncertain,
      },
    );

    return {
      attemptId:
        attempt.id,
      status:
        'requires_action',
      provider:
        attempt.payload.provider ||
        null,
      providerMessage:
        uncertain
          .providerMessage,
    };
  }

  return applyRemoteResult(
    context,
    attempt,
    remote,
  );
}

export async function requestInvoicePaymentRefund(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      [
        INVOICING_PERMISSIONS
          .PAYMENT_REFUND,
        INVOICING_PERMISSIONS
          .PAYMENT_RECORD,
      ],
    );

  const paymentId =
    requireUuid(
      input.paymentId,
      'Payment',
    );

  const payment =
    await loadPayment(
      context,
      paymentId,
    );

  if (
    !payment.providerKey
  ) {
    return refundInvoicePayment(
      input,
    );
  }

  if (
    !payment.provider
  ) {
    if (
      input.manualProviderRefundConfirmed !==
        true
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Automatic refunds are not available for ' +
        providerDisplayName(
          payment.providerKey,
        ) +
        '. Complete the provider reversal first, then confirm the external refund in SaMi.',
      );
    }

    return refundInvoicePayment({
      ...input,
      method:
        payment.method,
      metadata: {
        providerKey:
          payment.providerKey,
        provider:
          providerDisplayName(
            payment.providerKey,
          ),
        providerStatus:
          'succeeded',
        providerMessage:
          'External provider refund confirmed manually.',
        providerRefundEventId:
          'manual:' +
          crypto.randomUUID(),
        providerPaymentId:
          payment.paymentId,
        providerPaymentNumber:
          payment.paymentNumber,
        manualProviderRefundConfirmedAt:
          new Date()
            .toISOString(),
      },
    });
  }

  if (
    !payment.providerTransactionId
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'SaMi cannot safely identify the original provider transaction for this older payment. Refund it from the provider dashboard, then confirm the external refund in SaMi.',
    );
  }

  const amount =
    numberInput(
      input.amount,
      'Refund amount',
      {
        min:
          0.0001,
      },
    );

  const reason =
    cleanText(
      input.reason,
      2000,
    );

  if (
    !reason
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A refund reason is required.',
    );
  }

  const connection =
    await loadProviderConnection(
      context,
      payment.providerKey,
    );

  const key =
    operationKey(
      input.idempotencyKey,
      'provider-payment-refund',
    );

  const pending =
    await createPaymentAttempt(
      context,
      {
        payment,
        connectionId:
          connection.connectionId,
        amount,
        reason,
        refundDate:
          isoDate(
            input.refundDate,
            new Date(),
          ),
        idempotencyKey:
          key,
      },
    );

  if (
    pending.duplicate
  ) {
    return {
      attemptId:
        pending.attemptId,
      status:
        pending.status ===
          'processed'
          ? 'posted'
          : (
              pending.payload
                .providerStatus ||
              pending.status
            ),
      provider:
        pending.payload
          .provider ||
        null,
      providerMessage:
        pending.payload
          .providerMessage ||
        null,
      financialRefundId:
        pending.payload
          .financialRefundId ||
        null,
    };
  }

  return executeRemoteRefund(
    context,
    pending.attemptId,
  );
}

export async function requestInvoiceCreditNoteRefund(
  input:
    Record<string, unknown>,
) {
  const paymentId =
    cleanText(
      input.paymentId,
      80,
    );

  if (
    !paymentId
  ) {
    return refundInvoiceCreditNote(
      input,
    );
  }

  const context =
    await requireInvoicingContext(
      [
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_REFUND,
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_MANAGE,
      ],
    );

  const payment =
    await loadPayment(
      context,
      requireUuid(
        paymentId,
        'Original payment',
      ),
    );

  if (
    !payment.provider ||
    !payment.providerKey
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The selected payment does not support automatic provider refunds. Leave Manual / offline refund selected after returning the money outside SaMi.',
    );
  }

  if (
    !payment.providerTransactionId
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'SaMi cannot safely identify the original provider transaction for this older payment.',
    );
  }

  const creditNoteId =
    requireUuid(
      input.creditNoteId,
      'Credit note',
    );

  const amount =
    numberInput(
      input.amount,
      'Credit refund amount',
      {
        min:
          0.0001,
      },
    );

  const reason =
    cleanText(
      input.reason,
      2000,
    );

  if (
    !reason
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A credit refund reason is required.',
    );
  }

  const connection =
    await loadProviderConnection(
      context,
      payment.providerKey,
    );

  const key =
    operationKey(
      input.idempotencyKey,
      'provider-credit-refund',
    );

  const pending =
    await createCreditAttempt(
      context,
      {
        creditNoteId,
        payment,
        connectionId:
          connection.connectionId,
        amount,
        reason,
        refundDate:
          isoDate(
            input.refundDate,
            new Date(),
          ),
        idempotencyKey:
          key,
      },
    );

  if (
    pending.duplicate
  ) {
    return {
      attemptId:
        pending.attemptId,
      status:
        pending.status ===
          'processed'
          ? 'posted'
          : (
              pending.payload
                .providerStatus ||
              pending.status
            ),
      provider:
        pending.payload
          .provider ||
        null,
      providerMessage:
        pending.payload
          .providerMessage ||
        null,
      financialRefundId:
        pending.payload
          .financialRefundId ||
        null,
    };
  }

  return executeRemoteRefund(
    context,
    pending.attemptId,
  );
}

export async function checkInvoiceProviderRefund(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      [
        INVOICING_PERMISSIONS
          .PAYMENT_REFUND,
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_REFUND,
      ],
    );

  const attemptId =
    requireUuid(
      input.refundId ||
      input.attemptId,
      'Provider refund attempt',
    );

  const attempt =
    await loadAttempt(
      context,
      attemptId,
    );

  if (
    attempt.status ===
      'processed'
  ) {
    return {
      attemptId,
      status:
        'posted',
      provider:
        attempt.payload
          .provider ||
        null,
      providerMessage:
        attempt.payload
          .providerMessage ||
        'Provider refund completed.',
      financialRefundId:
        attempt.payload
          .financialRefundId ||
        null,
    };
  }

  if (
    attempt.status ===
      'failed'
  ) {
    return {
      attemptId,
      status:
        'failed',
      provider:
        attempt.payload
          .provider ||
        null,
      providerMessage:
        attempt.payload
          .providerMessage ||
        'Provider refund failed.',
    };
  }

  if (
    attempt.payload
      .providerStatus ===
      'succeeded'
  ) {
    return finalizeAttempt(
      context,
      attempt,
    );
  }

  if (
    attempt.payload
      .manualConfirmationRequired ===
      true
  ) {
    return {
      attemptId,
      status:
        attempt.payload
          .providerStatus ||
        'pending',
      provider:
        attempt.payload
          .provider ||
        null,
      providerMessage:
        attempt.payload
          .providerMessage ||
        'Confirm completion from the provider merchant account.',
      manualConfirmationRequired:
        true,
    };
  }

  const provider =
    providerFromStorageKey(
      attempt.providerKey,
    );

  if (
    !provider
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'This provider does not support automatic refund status checks.',
    );
  }

  const externalRefundId =
    cleanText(
      attempt.payload
        .externalRefundId,
      255,
    );

  if (
    !externalRefundId
  ) {
    return {
      attemptId,
      status:
        'requires_action',
      provider:
        attempt.payload
          .provider ||
        provider,
      providerMessage:
        attempt.payload
          .providerMessage ||
        'The provider response is uncertain. Verify the provider dashboard before starting another refund.',
    };
  }

  const connection =
    await loadProviderConnection(
      context,
      attempt.providerKey,
    );

  const remote =
    await getInvoiceProviderRefundRemote({
      provider,
      secrets:
        connection.secrets,
      externalRefundId,
      providerReference:
        attempt.payload
          .providerReference,
      originalTransactionId:
        attempt.payload
          .providerTransactionId,
    });

  return applyRemoteResult(
    context,
    attempt,
    remote,
  );
}

export async function confirmInvoiceProviderRefund(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      [
        INVOICING_PERMISSIONS
          .PAYMENT_REFUND,
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_REFUND,
      ],
    );

  const attemptId =
    requireUuid(
      input.refundId ||
      input.attemptId,
      'Provider refund attempt',
    );

  const attempt =
    await loadAttempt(
      context,
      attemptId,
    );

  if (
    attempt.status !==
      'pending'
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'Only a pending provider refund can be manually confirmed.',
    );
  }

  if (
    input.confirmed !==
      true ||
    attempt.payload
      .manualConfirmationRequired !==
      true ||
    attempt.payload
      .provider !==
      'pesapal'
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'This provider refund does not support manual completion confirmation.',
    );
  }

  return finalizeAttempt(
    context,
    attempt,
    {
      providerStatus:
        'succeeded',
      providerMessage:
        'Provider refund completion confirmed by an authorized SaMi user.',
      manualConfirmationRequired:
        false,
      providerRefundManualConfirmationAt:
        new Date()
          .toISOString(),
      providerRefundManualConfirmationBy:
        context.userId,
    },
  );
}
