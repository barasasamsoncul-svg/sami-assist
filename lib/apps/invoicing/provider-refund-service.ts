import 'server-only';

import crypto from 'node:crypto';

import {
  finalizeInvoicePaymentProviderRefund,
  refundInvoicePayment,
} from '@/lib/apps/invoicing/commands';

import {
  finalizeInvoiceCreditNoteProviderRefund,
  refundInvoiceCreditNote,
} from '@/lib/apps/invoicing/credit-notes';

import {
  cleanText,
  InvoicingError,
  INVOICING_PERMISSIONS,
  isoDate,
  money,
  nextDocumentNumber,
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
  providerKey: string;
  provider: InvoiceRefundProvider;
  providerTransactionId: string;
  currency: string;
  amount: number;
  method: string;
};

type LoadedProviderConnection = {
  connectionId: string;
  secrets: InvoicePaymentProviderSecrets;
};

function plainObject(
  value: unknown,
):
  Record<string, unknown> {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(
      value,
    )
    ? value as
        Record<string, unknown>
    : {};
}

function idempotencyKey(
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

function refundProviderMetadata(
  input: {
    providerKey: string;
    provider: InvoiceRefundProvider;
    providerTransactionId: string;
    remote?: InvoiceProviderRefundResult | null;
    providerPaymentId: string;
    providerPaymentNumber: string;
    refundKind: RefundKind;
  },
) {
  return {
    providerKey:
      input.providerKey,
    provider:
      input.provider,
    providerTransactionId:
      input.providerTransactionId,
    providerPaymentId:
      input.providerPaymentId,
    providerPaymentNumber:
      input.providerPaymentNumber,
    providerRefundEventId:
      input.remote
        ?.externalRefundId ||
      null,
    externalRefundId:
      input.remote
        ?.externalRefundId ||
      null,
    providerReference:
      input.remote
        ?.providerReference ||
      null,
    providerStatus:
      input.remote
        ?.status ||
      'pending',
    providerMessage:
      input.remote
        ?.message ||
      'Provider refund request created.',
    manualConfirmationRequired:
      input.remote
        ?.manualConfirmationRequired ===
      true,
    refundKind:
      input.refundKind,
    providerRefundRequestedAt:
      new Date()
        .toISOString(),
  };
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
    const eventTransactionId =
      cleanText(
        payload.externalEventId,
        255,
      ) ||
      externalEventId;

    return /^[0-9]+$/.test(
      eventTransactionId,
    )
      ? eventTransactionId
      : '';
  }

  return cleanText(
    payload.providerReference,
    255,
  );
}

async function loadProviderPayment(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  paymentId:
    string,
): Promise<
  ProviderPayment |
  null
> {
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
    );

  if (
    !providerKey
  ) {
    return null;
  }

  const provider =
    providerFromStorageKey(
      providerKey,
    );

  if (
    !provider
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'This provider does not support automatic refunds in SaMi. Complete the refund with the payment provider first, then record the confirmed manual refund.',
      {
        providerKey,
      },
    );
  }

  const providerTransactionId =
    await resolveProviderTransactionId(
      context,
      {
        provider,
        providerKey,
        paymentMetadata:
          metadata,
      },
    );

  if (
    !providerTransactionId
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'SaMi cannot safely identify the original provider transaction for this older payment. Refund it from the provider dashboard, then record the confirmed manual refund.',
      {
        providerKey,
      },
    );
  }

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
        provider,
      ),
  };
}

async function updatePaymentRefundState(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input: {
    refundId: string;
    status:
      'pending' |
      'requires_action' |
      'failed';
    metadata:
      Record<string, unknown>;
    reference?: string | null;
  },
) {
  await context.pool.query(
    `
      UPDATE invoicing_payment_refunds
      SET
        status=$3,
        reference=COALESCE($4,reference),
        metadata=
          COALESCE(metadata,'{}'::jsonb) ||
          $5::jsonb,
        updated_by=$6,
        updated_at=NOW()
      WHERE id=$1
        AND company_id=$2
    `,
    [
      input.refundId,
      context.companyId,
      input.status,
      input.reference ||
      null,
      JSON.stringify(
        input.metadata,
      ),
      context.userId,
    ],
  );
}

async function updateCreditRefundState(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input: {
    refundId: string;
    status:
      'pending' |
      'requires_action' |
      'failed';
    metadata:
      Record<string, unknown>;
    reference?: string | null;
  },
) {
  await context.pool.query(
    `
      UPDATE invoicing_credit_note_refunds
      SET
        status=$3,
        reference=COALESCE($4,reference),
        metadata=
          COALESCE(metadata,'{}'::jsonb) ||
          $5::jsonb,
        updated_at=NOW()
      WHERE id=$1
        AND company_id=$2
    `,
    [
      input.refundId,
      context.companyId,
      input.status,
      input.reference ||
      null,
      JSON.stringify(
        input.metadata,
      ),
    ],
  );
}

async function createPendingPaymentRefund(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input: {
    payment:
      ProviderPayment;
    amount:
      number;
    reason:
      string;
    refundDate:
      string;
    operationKey:
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
        'provider-payment-refund:' +
        context.companyId +
        ':' +
        input.payment.paymentId,
      ],
    );

    const duplicate =
      await client.query(
        `
          SELECT
            id,
            refund_number,
            amount,
            status,
            metadata
          FROM invoicing_payment_refunds
          WHERE company_id=$1
            AND idempotency_key=$2
          LIMIT 1
        `,
        [
          context.companyId,
          input.operationKey,
        ],
      );

    if (
      duplicate.rows[0]
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        refundId:
          String(
            duplicate.rows[0].id,
          ),
        refundNumber:
          String(
            duplicate.rows[0]
              .refund_number,
          ),
        status:
          String(
            duplicate.rows[0].status,
          ),
        amount:
          money(
            duplicate.rows[0].amount,
          ),
        metadata:
          plainObject(
            duplicate.rows[0].metadata,
          ),
        duplicate:
          true,
      };
    }

    const balance =
      await client.query(
        `
          SELECT
            p.status,
            p.reconciled_at,
            p.exchange_rate,
            b.unapplied_amount,
            COALESCE(
              (
                SELECT SUM(r.amount)
                FROM invoicing_payment_refunds r
                WHERE r.payment_id=p.id
                  AND r.company_id=p.company_id
                  AND r.status IN (
                    'pending',
                    'requires_action'
                  )
              ),
              0
            )::numeric(19,4)
              AS reserved_refund_amount
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
            .reserved_refund_amount,
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

    const refundNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'payment',
      );

    const inserted =
      await client.query(
        `
          INSERT INTO invoicing_payment_refunds (
            company_id,
            payment_id,
            refund_number,
            refund_date,
            amount,
            currency,
            method,
            reference,
            reason,
            status,
            idempotency_key,
            metadata,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,NULL,$8,
            'pending',
            $9,$10::jsonb,$11,$11
          )
          RETURNING id
        `,
        [
          context.companyId,
          input.payment.paymentId,
          refundNumber,
          input.refundDate,
          input.amount,
          input.payment.currency,
          input.payment.provider,
          input.reason,
          input.operationKey,
          JSON.stringify(
            refundProviderMetadata({
              providerKey:
                input.payment.providerKey,
              provider:
                input.payment.provider,
              providerTransactionId:
                input.payment.providerTransactionId,
              providerPaymentId:
                input.payment.paymentId,
              providerPaymentNumber:
                input.payment.paymentNumber,
              refundKind:
                'payment',
            }),
          ),
          context.userId,
        ],
      );

    await client.query(
      'COMMIT',
    );

    return {
      refundId:
        String(
          inserted.rows[0].id,
        ),
      refundNumber,
      status:
        'pending',
      amount:
        input.amount,
      metadata:
        refundProviderMetadata({
          providerKey:
            input.payment.providerKey,
          provider:
            input.payment.provider,
          providerTransactionId:
            input.payment.providerTransactionId,
          providerPaymentId:
            input.payment.paymentId,
          providerPaymentNumber:
            input.payment.paymentNumber,
          refundKind:
            'payment',
        }),
      duplicate:
        false,
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

async function createPendingCreditRefund(
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
    amount:
      number;
    reason:
      string;
    refundDate:
      string;
    operationKey:
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
        input.creditNoteId,
      ],
    );

    const duplicate =
      await client.query(
        `
          SELECT
            id,
            refund_number,
            amount,
            status,
            metadata
          FROM invoicing_credit_note_refunds
          WHERE company_id=$1
            AND idempotency_key=$2
          LIMIT 1
        `,
        [
          context.companyId,
          input.operationKey,
        ],
      );

    if (
      duplicate.rows[0]
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        refundId:
          String(
            duplicate.rows[0].id,
          ),
        refundNumber:
          String(
            duplicate.rows[0]
              .refund_number,
          ),
        status:
          String(
            duplicate.rows[0].status,
          ),
        amount:
          money(
            duplicate.rows[0].amount,
          ),
        metadata:
          plainObject(
            duplicate.rows[0].metadata,
          ),
        duplicate:
          true,
      };
    }

    const credit =
      await client.query(
        `
          SELECT
            b.source_invoice_id,
            b.currency,
            b.available_amount,
            n.credit_note_number,
            source.exchange_rate,
            COALESCE(
              (
                SELECT SUM(r.amount)
                FROM invoicing_credit_note_refunds r
                WHERE r.credit_note_id=b.credit_note_id
                  AND r.company_id=b.company_id
                  AND r.status IN (
                    'pending',
                    'requires_action'
                  )
              ),
              0
            )::numeric(19,4)
              AS reserved_credit_refund
          FROM invoicing_credit_note_balances b
          INNER JOIN invoicing_credit_notes n
            ON n.id=b.credit_note_id
           AND n.company_id=b.company_id
          INNER JOIN invoicing_invoices source
            ON source.id=b.source_invoice_id
           AND source.company_id=b.company_id
          WHERE b.company_id=$1
            AND b.credit_note_id=$2
          LIMIT 1
          FOR UPDATE OF n
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
            .reserved_credit_refund,
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
                  AND r.status IN (
                    'pending',
                    'requires_action',
                    'posted'
                  )
                  AND r.metadata->>'providerPaymentId'=$3
              ),
              0
            )::numeric(19,4)
              AS provider_refunded
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
            ?.provider_refunded,
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

    const refundNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'credit_refund',
      );

    const inserted =
      await client.query(
        `
          INSERT INTO invoicing_credit_note_refunds (
            company_id,
            credit_note_id,
            refund_number,
            refund_date,
            amount,
            method,
            reference,
            reason,
            status,
            idempotency_key,
            metadata,
            created_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,NULL,$7,
            'pending',
            $8,$9::jsonb,$10
          )
          RETURNING id
        `,
        [
          context.companyId,
          input.creditNoteId,
          refundNumber,
          input.refundDate,
          input.amount,
          input.payment.provider,
          input.reason,
          input.operationKey,
          JSON.stringify(
            refundProviderMetadata({
              providerKey:
                input.payment.providerKey,
              provider:
                input.payment.provider,
              providerTransactionId:
                input.payment.providerTransactionId,
              providerPaymentId:
                input.payment.paymentId,
              providerPaymentNumber:
                input.payment.paymentNumber,
              refundKind:
                'credit_note',
            }),
          ),
          context.userId,
        ],
      );

    await client.query(
      'COMMIT',
    );

    return {
      refundId:
        String(
          inserted.rows[0].id,
        ),
      refundNumber,
      status:
        'pending',
      amount:
        input.amount,
      metadata:
        refundProviderMetadata({
          providerKey:
            input.payment.providerKey,
          provider:
            input.payment.provider,
          providerTransactionId:
            input.payment.providerTransactionId,
          providerPaymentId:
            input.payment.paymentId,
          providerPaymentNumber:
            input.payment.paymentNumber,
          refundKind:
            'credit_note',
        }),
      duplicate:
        false,
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

async function executeProviderRefund(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input: {
    refundKind:
      RefundKind;
    refundId:
      string;
    payment:
      ProviderPayment;
    amount:
      number;
    reason:
      string;
    operationKey:
      string;
  },
) {
  const connection =
    await loadProviderConnection(
      context,
      input.payment
        .providerKey,
    );

  let remote:
    InvoiceProviderRefundResult;

  try {
    remote =
      await createInvoiceProviderRefundRemote({
        provider:
          input.payment.provider,
        secrets:
          connection.secrets,
        providerTransactionId:
          input.payment
            .providerTransactionId,
        amount:
          input.amount,
        currency:
          input.payment.currency,
        reason:
          input.reason,
        idempotencyKey:
          providerRefundOperationKey({
            provider:
              input.payment.provider,
            companyId:
              context.companyId,
            paymentId:
              input.payment.paymentId,
            sourceKind:
              input.refundKind ===
                'payment'
                ? 'payment'
                : 'credit_note',
            sourceId:
              input.refundId,
            amount:
              input.amount,
            nonce:
              input.operationKey,
          }),
        actorLabel:
          'SaMi',
      });
  } catch (
    error
  ) {
    const metadata =
      refundProviderMetadata({
        providerKey:
          input.payment.providerKey,
        provider:
          input.payment.provider,
        providerTransactionId:
          input.payment
            .providerTransactionId,
        providerPaymentId:
          input.payment.paymentId,
        providerPaymentNumber:
          input.payment.paymentNumber,
        refundKind:
          input.refundKind,
      });

    const failedMetadata = {
      ...metadata,
      providerStatus:
        'failed',
      providerMessage:
        error instanceof
          Error
          ? error.message
          : 'Payment provider rejected the refund request.',
      providerRefundFailedAt:
        new Date()
          .toISOString(),
    };

    if (
      input.refundKind ===
        'payment'
    ) {
      await updatePaymentRefundState(
        context,
        {
          refundId:
            input.refundId,
          status:
            'failed',
          metadata:
            failedMetadata,
        },
      );
    } else {
      await updateCreditRefundState(
        context,
        {
          refundId:
            input.refundId,
          status:
            'failed',
          metadata:
            failedMetadata,
        },
      );
    }

    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      failedMetadata
        .providerMessage,
    );
  }

  const metadata =
    refundProviderMetadata({
      providerKey:
        input.payment.providerKey,
      provider:
        input.payment.provider,
      providerTransactionId:
        input.payment
          .providerTransactionId,
      providerPaymentId:
        input.payment.paymentId,
      providerPaymentNumber:
        input.payment.paymentNumber,
      refundKind:
        input.refundKind,
      remote,
    });

  if (
    remote.status ===
      'succeeded'
  ) {
    return input.refundKind ===
      'payment'
      ? finalizeInvoicePaymentProviderRefund({
          refundId:
            input.refundId,
          reference:
            remote.providerReference ||
            remote.externalRefundId,
          metadata,
        })
      : finalizeInvoiceCreditNoteProviderRefund({
          refundId:
            input.refundId,
          reference:
            remote.providerReference ||
            remote.externalRefundId,
          metadata,
        });
  }

  const status =
    remote.status ===
      'requires_action'
      ? 'requires_action'
      : remote.status ===
          'failed'
        ? 'failed'
        : 'pending';

  if (
    input.refundKind ===
      'payment'
  ) {
    await updatePaymentRefundState(
      context,
      {
        refundId:
          input.refundId,
        status,
        reference:
          remote.providerReference ||
          remote.externalRefundId,
        metadata,
      },
    );
  } else {
    await updateCreditRefundState(
      context,
      {
        refundId:
          input.refundId,
        status,
        reference:
          remote.providerReference ||
          remote.externalRefundId,
        metadata,
      },
    );
  }

  return {
    refundId:
      input.refundId,
    paymentId:
      input.payment.paymentId,
    status,
    provider:
      input.payment.provider,
    providerMessage:
      remote.message,
    manualConfirmationRequired:
      remote.manualConfirmationRequired ===
      true,
    externalRefundId:
      remote.externalRefundId,
  };
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

  const providerPayment =
    await loadProviderPayment(
      context,
      paymentId,
    );

  if (
    !providerPayment
  ) {
    return refundInvoicePayment(
      input,
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

  const operationKey =
    idempotencyKey(
      input.idempotencyKey,
      'provider-payment-refund',
    );

  const pending =
    await createPendingPaymentRefund(
      context,
      {
        payment:
          providerPayment,
        amount,
        reason,
        refundDate:
          isoDate(
            input.refundDate,
            new Date(),
          ),
        operationKey,
      },
    );

  if (
    pending.duplicate
  ) {
    return pending;
  }

  return executeProviderRefund(
    context,
    {
      refundKind:
        'payment',
      refundId:
        pending.refundId,
      payment:
        providerPayment,
      amount,
      reason,
      operationKey,
    },
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

  const creditNoteId =
    requireUuid(
      input.creditNoteId,
      'Credit note',
    );

  const payment =
    await loadProviderPayment(
      context,
      requireUuid(
        paymentId,
        'Original payment',
      ),
    );

  if (
    !payment
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The selected payment was recorded manually and cannot be refunded automatically through a provider.',
    );
  }

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

  const operationKey =
    idempotencyKey(
      input.idempotencyKey,
      'provider-credit-refund',
    );

  const pending =
    await createPendingCreditRefund(
      context,
      {
        creditNoteId,
        payment,
        amount,
        reason,
        refundDate:
          isoDate(
            input.refundDate,
            new Date(),
          ),
        operationKey,
      },
    );

  if (
    pending.duplicate
  ) {
    return pending;
  }

  return executeProviderRefund(
    context,
    {
      refundKind:
        'credit_note',
      refundId:
        pending.refundId,
      payment,
      amount,
      reason,
      operationKey,
    },
  );
}

async function loadRefundForStatus(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input: {
    kind:
      RefundKind;
    refundId:
      string;
  },
) {
  const table =
    input.kind ===
      'payment'
      ? 'invoicing_payment_refunds'
      : 'invoicing_credit_note_refunds';

  const result =
    await context.pool.query(
      `
        SELECT
          id,
          amount,
          status,
          metadata,
          reference
        FROM ${table}
        WHERE id=$1
          AND company_id=$2
        LIMIT 1
      `,
      [
        input.refundId,
        context.companyId,
      ],
    );

  if (
    !result.rows[0]
  ) {
    throw new InvoicingError(
      input.kind ===
        'payment'
        ? 'PAYMENT_NOT_FOUND'
        : 'CREDIT_NOTE_NOT_FOUND',
      'Refund request was not found.',
    );
  }

  return result.rows[0];
}

export async function checkInvoiceProviderRefund(
  input:
    Record<string, unknown>,
) {
  const kind =
    cleanText(
      input.refundKind,
      40,
    ) ===
      'credit_note'
      ? 'credit_note'
      : 'payment';

  const context =
    await requireInvoicingContext(
      kind ===
        'payment'
        ? [
            INVOICING_PERMISSIONS
              .PAYMENT_REFUND,
            INVOICING_PERMISSIONS
              .PAYMENT_RECORD,
          ]
        : [
            INVOICING_PERMISSIONS
              .CREDIT_NOTE_REFUND,
            INVOICING_PERMISSIONS
              .CREDIT_NOTE_MANAGE,
          ],
    );

  const refundId =
    requireUuid(
      input.refundId,
      'Refund',
    );

  const refund =
    await loadRefundForStatus(
      context,
      {
        kind,
        refundId,
      },
    );

  const status =
    String(
      refund.status,
    );

  if (
    [
      'posted',
      'failed',
      'reversed',
    ].includes(
      status,
    )
  ) {
    return {
      refundId,
      refundKind:
        kind,
      status,
      metadata:
        plainObject(
          refund.metadata,
        ),
    };
  }

  const metadata =
    plainObject(
      refund.metadata,
    );

  if (
    metadata
      .manualConfirmationRequired ===
      true
  ) {
    return {
      refundId,
      refundKind:
        kind,
      status,
      provider:
        metadata.provider ||
        null,
      providerMessage:
        metadata.providerMessage ||
        'Confirm the refund in the provider merchant account before posting it in SaMi.',
      manualConfirmationRequired:
        true,
    };
  }

  const providerKey =
    cleanText(
      metadata.providerKey,
      180,
    );

  const provider =
    providerFromStorageKey(
      providerKey,
    );

  if (
    !provider
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'This refund does not have a supported automatic provider.',
    );
  }

  const connection =
    await loadProviderConnection(
      context,
      providerKey,
    );

  const remote =
    await getInvoiceProviderRefundRemote({
      provider,
      secrets:
        connection.secrets,
      externalRefundId:
        metadata.externalRefundId,
      providerReference:
        metadata.providerReference,
      originalTransactionId:
        metadata.providerTransactionId,
    });

  const updatedMetadata = {
    ...metadata,
    providerStatus:
      remote.status,
    providerMessage:
      remote.message,
    externalRefundId:
      remote.externalRefundId ||
      metadata.externalRefundId ||
      null,
    providerReference:
      remote.providerReference ||
      metadata.providerReference ||
      null,
    providerRefundCheckedAt:
      new Date()
        .toISOString(),
  };

  if (
    remote.status ===
      'succeeded'
  ) {
    return kind ===
      'payment'
      ? finalizeInvoicePaymentProviderRefund({
          refundId,
          reference:
            remote.providerReference ||
            remote.externalRefundId,
          metadata:
            updatedMetadata,
        })
      : finalizeInvoiceCreditNoteProviderRefund({
          refundId,
          reference:
            remote.providerReference ||
            remote.externalRefundId,
          metadata:
            updatedMetadata,
        });
  }

  const nextStatus =
    remote.status ===
      'requires_action'
      ? 'requires_action'
      : remote.status ===
          'failed'
        ? 'failed'
        : 'pending';

  if (
    kind ===
      'payment'
  ) {
    await updatePaymentRefundState(
      context,
      {
        refundId,
        status:
          nextStatus,
        reference:
          remote.providerReference ||
          remote.externalRefundId,
        metadata:
          updatedMetadata,
      },
    );
  } else {
    await updateCreditRefundState(
      context,
      {
        refundId,
        status:
          nextStatus,
        reference:
          remote.providerReference ||
          remote.externalRefundId,
        metadata:
          updatedMetadata,
      },
    );
  }

  return {
    refundId,
    refundKind:
      kind,
    status:
      nextStatus,
    provider,
    providerMessage:
      remote.message,
    manualConfirmationRequired:
      remote.manualConfirmationRequired ===
      true,
  };
}

export async function confirmInvoiceProviderRefund(
  input:
    Record<string, unknown>,
) {
  const kind =
    cleanText(
      input.refundKind,
      40,
    ) ===
      'credit_note'
      ? 'credit_note'
      : 'payment';

  const context =
    await requireInvoicingContext(
      kind ===
        'payment'
        ? [
            INVOICING_PERMISSIONS
              .PAYMENT_REFUND,
            INVOICING_PERMISSIONS
              .PAYMENT_RECORD,
          ]
        : [
            INVOICING_PERMISSIONS
              .CREDIT_NOTE_REFUND,
            INVOICING_PERMISSIONS
              .CREDIT_NOTE_MANAGE,
          ],
    );

  const refundId =
    requireUuid(
      input.refundId,
      'Refund',
    );

  const refund =
    await loadRefundForStatus(
      context,
      {
        kind,
        refundId,
      },
    );

  if (
    ![
      'pending',
      'requires_action',
    ].includes(
      String(
        refund.status,
      ),
    )
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'Only a pending provider refund can be manually confirmed.',
    );
  }

  const metadata =
    plainObject(
      refund.metadata,
    );

  if (
    metadata
      .manualConfirmationRequired !==
      true ||
    metadata.provider !==
      'pesapal'
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'This refund does not require manual provider completion confirmation.',
    );
  }

  if (
    input.confirmed !==
      true
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Confirm that the refund is completed in the provider merchant account before posting it in SaMi.',
    );
  }

  const updatedMetadata = {
    ...metadata,
    providerStatus:
      'succeeded',
    providerMessage:
      'Provider refund completion confirmed by an authorized SaMi user.',
    providerRefundManualConfirmationAt:
      new Date()
        .toISOString(),
    providerRefundManualConfirmationBy:
      context.userId,
  };

  return kind ===
    'payment'
    ? finalizeInvoicePaymentProviderRefund({
        refundId,
        reference:
          cleanText(
            metadata.providerReference,
            255,
          ) ||
          cleanText(
            refund.reference,
            255,
          ) ||
          null,
        metadata:
          updatedMetadata,
      })
    : finalizeInvoiceCreditNoteProviderRefund({
        refundId,
        reference:
          cleanText(
            metadata.providerReference,
            255,
          ) ||
          cleanText(
            refund.reference,
            255,
          ) ||
          null,
        metadata:
          updatedMetadata,
      });
}
