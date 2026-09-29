import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  dispatchBusinessAutomationEventSafely,
} from '@/lib/automation/business-events';

import {
  postInvoicePaymentAllocationToAccounting,
  postInvoicePaymentRefundToAccounting,
  postInvoicePaymentToAccounting,
  reverseInvoicingAccountingEvent,
} from '@/lib/apps/invoicing/accounting';

import {
  cleanText,
  InvoicingError,
  INVOICING_PERMISSIONS,
  isoDate,
  money,
  nextDocumentNumber,
  nullableText,
  numberInput,
  optionalUuid,
  recordInvoicingActivity,
  requireInvoicingContext,
  requireUuid,
} from '@/lib/apps/invoicing/context';


type PaymentContext =
  Awaited<
    ReturnType<
      typeof requireInvoicingContext
    >
  >;

type PaymentAllocationInput = {
  invoiceId: string;
  amount: number;
  operationKey: string | null;
};


async function emitPaymentEvent(
  context: PaymentContext,
  input: {
    triggerKey: string;
    recordId: string;
    idempotencySeed: string;
    payload?: Record<string, unknown>;
  },
) {
  await dispatchBusinessAutomationEventSafely({
    runtime: {
      userId:
        context.userId,
      sessionId:
        context.permissions.sessionId,
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      accessibleModuleKeys: [
        ...new Set([
          'invoicing',
          ...context.permissions.permissions
            .map(
              permission =>
                permission.moduleKey
                  ?.trim()
                  .toLowerCase() ||
                '',
            )
            .filter(Boolean),
        ]),
      ],
      permissionSet:
        context.permissions.permissionSet,
      isOwner:
        context.permissions.isOwner,
    },
    moduleKey:
      'invoicing',
    triggerKey:
      input.triggerKey,
    recordType:
      'payment',
    recordId:
      input.recordId,
    payload:
      input.payload || {},
    idempotencySeed:
      input.idempotencySeed,
  });
}


async function recordPaymentActivity(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    paymentId: string;
    type: string;
    content: string;
    metadata?: Record<string, unknown>;
  },
) {
  await client.query(
    [
      'INSERT INTO activities (',
      'company_id, user_id, model, record_id, type, content, metadata',
      ') VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
    ].join('\n'),
    [
      input.companyId,
      input.userId,
      'invoicing.payment',
      input.paymentId,
      input.type,
      input.content,
      JSON.stringify(
        input.metadata || {},
      ),
    ],
  );
}


async function lockPaymentIdentity(
  client: PoolClient,
  key: string,
) {
  await client.query(
    [
      'SELECT pg_advisory_xact_lock(',
      'hashtext($1)',
      ')',
    ].join('\n'),
    [
      key,
    ],
  );
}


function normalizeAllocations(
  value: unknown,
  fallbackInvoiceId: string | null,
  fallbackAmount: number,
): PaymentAllocationInput[] {
  const source =
    Array.isArray(value)
      ? value
      : fallbackInvoiceId
        ? [
            {
              invoiceId:
                fallbackInvoiceId,
              amount:
                fallbackAmount,
            },
          ]
        : [];

  if (
    source.length >
      100
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A payment can allocate to at most 100 invoices at a time.',
    );
  }

  const seen =
    new Set<string>();

  return source.map(
    (
      item,
      index,
    ) => {
      if (
        !item ||
        typeof item !==
          'object' ||
        Array.isArray(item)
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'Payment allocation ' +
          String(index + 1) +
          ' is invalid.',
        );
      }

      const row =
        item as
          Record<string, unknown>;

      const invoiceId =
        requireUuid(
          row.invoiceId,
          'Invoice',
        );

      if (
        seen.has(invoiceId)
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'Each invoice can appear only once in a payment allocation request.',
        );
      }

      seen.add(invoiceId);

      return {
        invoiceId,
        amount:
          numberInput(
            row.amount,
            'Allocation amount',
            {
              min:
                0.0001,
            },
          ),
        operationKey:
          cleanText(
            row.operationKey,
            160,
          ) ||
          null,
      };
    },
  );
}


async function nextOperationKey(
  client: PoolClient,
  prefix: string,
) {
  const result =
    await client.query(
      [
        'SELECT',
        '$1::text || ' +
        "':'" +
        ' || gen_random_uuid()::text AS operation_key',
      ].join('\n'),
      [
        prefix,
      ],
    );

  return String(
    result.rows[0]
      .operation_key,
  ).slice(
    0,
    160,
  );
}


async function reconcileInvoiceSettlement(
  client: PoolClient,
  companyId: string,
  userId: string,
  invoiceId: string,
  reason: string,
) {
  const result =
    await client.query(
      [
        'SELECT',
        'i.status,',
        'i.total_amount,',
        'COALESCE((',
        '  SELECT SUM(a.amount)',
        '  FROM invoicing_payment_allocations a',
        '  INNER JOIN invoicing_payments p',
        '    ON p.id = a.payment_id',
        '  WHERE a.invoice_id = i.id',
        '    AND a.company_id = i.company_id',
        "    AND a.status = 'posted'",
        "    AND p.status = 'posted'",
        '    AND p.deleted_at IS NULL',
        '),0) AS paid_amount,',
        'COALESCE((',
        '  SELECT SUM(cn.total_amount)',
        '  FROM invoicing_credit_notes cn',
        '  WHERE cn.invoice_id = i.id',
        '    AND cn.company_id = i.company_id',
        "    AND cn.status IN ('issued','applied','refunded')",
        '    AND cn.deleted_at IS NULL',
        '),0) AS credited_amount,',
        '(',
        '  SELECT h.from_status',
        '  FROM invoicing_status_history h',
        '  WHERE h.invoice_id = i.id',
        '    AND h.company_id = i.company_id',
        "    AND h.to_status IN ('partially_paid','paid')",
        '    AND h.from_status IS NOT NULL',
        "    AND h.from_status NOT IN ('partially_paid','paid')",
        '  ORDER BY h.created_at DESC, h.id DESC',
        '  LIMIT 1',
        ') AS prior_open_status',
        'FROM invoicing_invoices i',
        'WHERE i.id = $1',
        '  AND i.company_id = $2',
        '  AND i.deleted_at IS NULL',
        'FOR UPDATE',
      ].join('\n'),
      [
        invoiceId,
        companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice was not found.',
    );
  }

  const row =
    result.rows[0];

  const currentStatus =
    String(row.status);

  const totalAmount =
    money(row.total_amount);

  const paidAmount =
    money(row.paid_amount);

  const creditedAmount =
    money(row.credited_amount);

  const balanceDue =
    money(
      Math.max(
        totalAmount -
        paidAmount -
        creditedAmount,
        0,
      ),
    );

  if (
    [
      'cancelled',
      'void',
      'written_off',
    ].includes(
      currentStatus,
    )
  ) {
    return {
      status:
        currentStatus,
      balanceDue,
    };
  }

  const priorOpenStatus =
    row.prior_open_status
      ? String(
          row.prior_open_status,
        )
      : '';

  const openStatuses = [
    'confirmed',
    'sent',
    'viewed',
    'overdue',
  ];

  let nextStatus =
    currentStatus;

  if (
    balanceDue <=
      0.0001
  ) {
    nextStatus =
      'paid';
  } else if (
    paidAmount >
      0.0001
  ) {
    nextStatus =
      'partially_paid';
  } else if (
    openStatuses.includes(
      priorOpenStatus,
    )
  ) {
    nextStatus =
      priorOpenStatus;
  } else if (
    openStatuses.includes(
      currentStatus,
    )
  ) {
    nextStatus =
      currentStatus;
  } else {
    nextStatus =
      'confirmed';
  }

  if (
    nextStatus !==
      currentStatus
  ) {
    await client.query(
      [
        'UPDATE invoicing_invoices',
        'SET status = $3::varchar(30),',
        "    paid_at = CASE WHEN $3 = 'paid' THEN COALESCE(paid_at,NOW()) ELSE NULL END,",
        '    updated_by = $4,',
        '    updated_at = NOW()',
        'WHERE id = $1',
        '  AND company_id = $2',
      ].join('\n'),
      [
        invoiceId,
        companyId,
        nextStatus,
        userId,
      ],
    );

    await client.query(
      [
        'INSERT INTO invoicing_status_history (',
        'invoice_id, company_id, from_status, to_status, reason, changed_by',
        ') VALUES ($1,$2,$3,$4,$5,$6)',
      ].join('\n'),
      [
        invoiceId,
        companyId,
        currentStatus,
        nextStatus,
        reason,
        userId,
      ],
    );
  }

  return {
    status:
      nextStatus,
    balanceDue,
  };
}


async function lockOpenInvoice(
  client: PoolClient,
  companyId: string,
  invoiceId: string,
) {
  const result =
    await client.query(
      [
        'SELECT',
        'i.id, i.invoice_number, i.customer_id, i.currency,',
        'i.exchange_rate, i.status,',
        'a.balance_due, a.effective_status',
        'FROM invoicing_invoices i',
        'INNER JOIN invoicing_aging a',
        '  ON a.invoice_id = i.id',
        ' AND a.company_id = i.company_id',
        'WHERE i.id = $1',
        '  AND i.company_id = $2',
        '  AND i.deleted_at IS NULL',
        'FOR UPDATE OF i',
      ].join('\n'),
      [
        invoiceId,
        companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice was not found.',
    );
  }

  const row =
    result.rows[0];

  const status =
    String(
      row.effective_status ||
      row.status,
    );

  if (
    [
      'draft',
      'pending_approval',
      'rejected',
      'cancelled',
      'void',
      'written_off',
      'paid',
    ].includes(status)
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'Payments can only be allocated to an open posted invoice.',
    );
  }

  return {
    id:
      String(row.id),
    invoiceNumber:
      String(row.invoice_number),
    customerId:
      String(row.customer_id),
    currency:
      String(row.currency),
    exchangeRate:
      Number(
        row.exchange_rate ||
        1,
      ),
    balanceDue:
      money(row.balance_due),
  };
}
