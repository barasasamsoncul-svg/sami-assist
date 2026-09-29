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


async function postAllocation(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    paymentId: string;
    paymentNumber: string;
    paymentDate: string;
    customerId: string;
    currency: string;
    paymentExchangeRate: number;
    allocation: PaymentAllocationInput;
    allowPartialPayments: boolean;
  },
) {
  const invoice =
    await lockOpenInvoice(
      client,
      input.companyId,
      input.allocation.invoiceId,
    );

  if (
    invoice.customerId !==
      input.customerId
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A payment can only be allocated to invoices for the same customer.',
    );
  }

  if (
    invoice.currency !==
      input.currency
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A payment can only be allocated to invoices in the same currency.',
    );
  }

  if (
    Math.abs(
      invoice.exchangeRate -
      input.paymentExchangeRate,
    ) >
      0.0000001
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'This allocation uses a different exchange rate. Complete the Multi-currency setup before combining different exchange-rate invoices in one receipt.',
    );
  }

  if (
    input.allocation.amount >
      invoice.balanceDue +
        0.0001
  ) {
    throw new InvoicingError(
      'PAYMENT_EXCEEDS_BALANCE',
      'Allocation exceeds the remaining invoice balance.',
      {
        invoiceId:
          invoice.id,
        balance:
          invoice.balanceDue,
      },
    );
  }

  if (
    !input.allowPartialPayments &&
    input.allocation.amount <
      invoice.balanceDue -
        0.0001
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Partial payments are disabled for this company. Allocate the full remaining invoice balance.',
      {
        invoiceId:
          invoice.id,
        balance:
          invoice.balanceDue,
      },
    );
  }

  const existing =
    await client.query(
      [
        'SELECT id, status',
        'FROM invoicing_payment_allocations',
        'WHERE company_id = $1',
        '  AND payment_id = $2',
        '  AND invoice_id = $3',
        'LIMIT 1',
        'FOR UPDATE',
      ].join('\n'),
      [
        input.companyId,
        input.paymentId,
        invoice.id,
      ],
    );

  let allocationId =
    '';

  const operationKey =
    input.allocation.operationKey ||
    await nextOperationKey(
      client,
      'allocate',
    );

  if (
    existing.rows.length >
      0
  ) {
    if (
      String(
        existing.rows[0].status,
      ) !==
        'reversed'
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'This payment is already allocated to that invoice.',
      );
    }

    allocationId =
      String(
        existing.rows[0].id,
      );

    await client.query(
      [
        'UPDATE invoicing_payment_allocations',
        'SET amount = $4,',
        "    status = 'posted',",
        '    operation_key = $5,',
        '    created_by = $6,',
        '    reversed_at = NULL,',
        '    reversed_by = NULL,',
        '    reversal_reason = NULL,',
        '    created_at = NOW()',
        'WHERE id = $1',
        '  AND company_id = $2',
        '  AND payment_id = $3',
      ].join('\n'),
      [
        allocationId,
        input.companyId,
        input.paymentId,
        input.allocation.amount,
        operationKey,
        input.userId,
      ],
    );
  } else {
    const created =
      await client.query(
        [
          'INSERT INTO invoicing_payment_allocations (',
          'company_id, payment_id, invoice_id, amount, status, operation_key, created_by',
          ") VALUES ($1,$2,$3,$4,'posted',$5,$6)",
          'RETURNING id',
        ].join('\n'),
        [
          input.companyId,
          input.paymentId,
          invoice.id,
          input.allocation.amount,
          operationKey,
          input.userId,
        ],
      );

    allocationId =
      String(
        created.rows[0].id,
      );
  }

  await postInvoicePaymentAllocationToAccounting(
    client,
    {
      companyId:
        input.companyId,
      userId:
        input.userId,
      allocationId,
      operationKey,
      paymentId:
        input.paymentId,
      paymentNumber:
        input.paymentNumber,
      invoiceId:
        invoice.id,
      invoiceNumber:
        invoice.invoiceNumber,
      allocationDate:
        input.paymentDate,
      amount:
        input.allocation.amount,
      exchangeRate:
        invoice.exchangeRate,
    },
  );

  const settlement =
    await reconcileInvoiceSettlement(
      client,
      input.companyId,
      input.userId,
      invoice.id,
      'Payment ' +
      input.paymentNumber +
      ' allocated.',
    );

  await recordInvoicingActivity(
    client,
    {
      companyId:
        input.companyId,
      userId:
        input.userId,
      invoiceId:
        invoice.id,
      type:
        'invoice.payment_allocated',
      content:
        'Payment ' +
        input.paymentNumber +
        ' allocated to invoice ' +
        invoice.invoiceNumber +
        '.',
      metadata: {
        paymentId:
          input.paymentId,
        allocationId,
        operationKey,
        amount:
          input.allocation.amount,
        remainingBalance:
          settlement.balanceDue,
      },
    },
  );

  return {
    allocationId,
    operationKey,
    invoiceId:
      invoice.id,
    invoiceNumber:
      invoice.invoiceNumber,
    amount:
      input.allocation.amount,
    invoiceStatus:
      settlement.status,
    remainingBalance:
      settlement.balanceDue,
  };
}


export async function recordInvoicePayment(
  input: Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS.PAYMENT_RECORD,
    );

  const amount =
    numberInput(
      input.amount,
      'Payment amount',
      {
        min:
          0.0001,
      },
    );

  const fallbackInvoiceId =
    optionalUuid(
      input.invoiceId,
    );

  const allocations =
    normalizeAllocations(
      input.allocations,
      fallbackInvoiceId,
      amount,
    );

  const requestedCustomerId =
    optionalUuid(
      input.customerId,
    );

  const paymentMethod =
    cleanText(
      input.method,
      50,
    ) ||
    'other';

  const reference =
    cleanText(
      input.reference,
      255,
    );

  const idempotencyKey =
    cleanText(
      input.idempotencyKey,
      160,
    ) ||
    null;

  const paymentDate =
    isoDate(
      input.paymentDate,
      new Date(),
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    if (
      idempotencyKey
    ) {
      await lockPaymentIdentity(
        client,
        [
          'invoicing-payment-idempotency',
          context.companyId,
          idempotencyKey,
        ].join(':'),
      );

      const previous =
        await client.query(
          [
            'SELECT p.id, p.payment_number, p.status,',
            'b.allocated_amount, b.refunded_amount, b.unapplied_amount',
            'FROM invoicing_payments p',
            'INNER JOIN invoicing_payment_balances b',
            '  ON b.payment_id = p.id',
            ' AND b.company_id = p.company_id',
            'WHERE p.company_id = $1',
            '  AND p.idempotency_key = $2',
            '  AND p.deleted_at IS NULL',
            'LIMIT 1',
          ].join('\n'),
          [
            context.companyId,
            idempotencyKey,
          ],
        );

      if (
        previous.rows.length >
          0
      ) {
        await client.query(
          'COMMIT',
        );

        return {
          paymentId:
            String(
              previous.rows[0].id,
            ),
          paymentNumber:
            String(
              previous.rows[0].payment_number,
            ),
          status:
            String(
              previous.rows[0].status,
            ),
          allocatedAmount:
            money(
              previous.rows[0].allocated_amount,
            ),
          refundedAmount:
            money(
              previous.rows[0].refunded_amount,
            ),
          unappliedAmount:
            money(
              previous.rows[0].unapplied_amount,
            ),
          reused:
            true,
        };
      }
    }

    if (
      reference
    ) {
      await lockPaymentIdentity(
        client,
        [
          'invoicing-payment-reference',
          context.companyId,
          paymentMethod.toLowerCase(),
          reference.toLowerCase(),
        ].join(':'),
      );

      const duplicate =
        await client.query(
          [
            'SELECT id, payment_number',
            'FROM invoicing_payments',
            'WHERE company_id = $1',
            '  AND deleted_at IS NULL',
            "  AND status <> 'reversed'",
            "  AND LOWER(BTRIM(COALESCE(method,''))) = $2",
            "  AND LOWER(BTRIM(COALESCE(reference,''))) = $3",
            'LIMIT 1',
          ].join('\n'),
          [
            context.companyId,
            paymentMethod.toLowerCase(),
            reference.toLowerCase(),
          ],
        );

      if (
        duplicate.rows.length >
          0
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'This payment reference has already been posted as ' +
          String(
            duplicate.rows[0].payment_number,
          ) +
          '.',
          {
            existingPaymentId:
              String(
                duplicate.rows[0].id,
              ),
          },
        );
      }
    }

    const settings =
      await client.query(
        [
          'SELECT allow_partial_payments',
          'FROM invoicing_settings',
          'WHERE company_id = $1',
          'LIMIT 1',
        ].join('\n'),
        [
          context.companyId,
        ],
      );

    const allowPartialPayments =
      settings.rows[0]
        ?.allow_partial_payments !==
      false;

    let customerId =
      requestedCustomerId;

    let currency =
      cleanText(
        input.currency,
        3,
      )
        .toUpperCase();

    let exchangeRate =
      numberInput(
        input.exchangeRate ===
          undefined ||
        input.exchangeRate ===
          null ||
        input.exchangeRate ===
          ''
          ? 1
          : input.exchangeRate,
        'Payment exchange rate',
        {
          min:
            0.00000001,
        },
      );

    if (
      allocations.length >
        0
    ) {
      const firstInvoice =
        await lockOpenInvoice(
          client,
          context.companyId,
          allocations[0].invoiceId,
        );

      customerId =
        customerId ||
        firstInvoice.customerId;

      currency =
        currency ||
        firstInvoice.currency;

      if (
        input.exchangeRate ===
          undefined ||
        input.exchangeRate ===
          null ||
        input.exchangeRate ===
          ''
      ) {
        exchangeRate =
          firstInvoice.exchangeRate;
      }

      if (
        firstInvoice.customerId !==
          customerId
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'The selected customer does not own the invoice being paid.',
        );
      }

      if (
        firstInvoice.currency !==
          currency
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'Payment currency must match the invoice currency.',
        );
      }
    }

    if (
      !customerId
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Choose the customer who made this payment.',
      );
    }

    const customer =
      await client.query(
        [
          'SELECT id, currency, status',
          'FROM invoicing_customers',
          'WHERE id = $1',
          '  AND company_id = $2',
          '  AND deleted_at IS NULL',
          'LIMIT 1',
        ].join('\n'),
        [
          customerId,
          context.companyId,
        ],
      );

    if (
      customer.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Choose a valid customer for this company.',
      );
    }

    if (
      String(
        customer.rows[0].status,
      ) !==
        'active'
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Payments cannot be recorded for an inactive customer.',
      );
    }

    currency =
      currency ||
      String(
        customer.rows[0].currency ||
        context.company.currentCompany.currency ||
        'KES',
      )
        .toUpperCase()
        .slice(
          0,
          3,
        );

    const allocationTotal =
      money(
        allocations.reduce(
          (
            sum,
            allocation,
          ) =>
            sum +
            allocation.amount,
          0,
        ),
      );

    if (
      allocationTotal >
      amount +
        0.0001
    ) {
      throw new InvoicingError(
        'PAYMENT_EXCEEDS_BALANCE',
        'Allocated amount cannot exceed the payment received.',
        {
          paymentAmount:
            amount,
          allocationTotal,
        },
      );
    }

    const paymentNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'payment',
      );

    const payment =
      await client.query(
        [
          'INSERT INTO invoicing_payments (',
          'company_id, payment_number, customer_id, payment_date, amount, currency,',
          'exchange_rate, method, reference, idempotency_key, accounting_model,',
          'status, notes, created_by, updated_by',
          ") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'customer_credit','posted',$11,$12,$12)",
          'RETURNING id',
        ].join('\n'),
        [
          context.companyId,
          paymentNumber,
          customerId,
          paymentDate,
          amount,
          currency,
          exchangeRate,
          paymentMethod,
          reference ||
            null,
          idempotencyKey,
          nullableText(
            input.notes,
            3000,
          ),
          context.userId,
        ],
      );

    const paymentId =
      String(
        payment.rows[0].id,
      );

    await postInvoicePaymentToAccounting(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        paymentId,
        paymentNumber,
        paymentDate,
        amount,
        exchangeRate,
      },
    );

    const postedAllocations = [];

    for (
      const allocation
      of allocations
    ) {
      postedAllocations.push(
        await postAllocation(
          client,
          {
            companyId:
              context.companyId,
            userId:
              context.userId,
            paymentId,
            paymentNumber,
            paymentDate,
            customerId,
            currency,
            paymentExchangeRate:
              exchangeRate,
            allocation,
            allowPartialPayments,
          },
        ),
      );
    }

    const balance =
      await client.query(
        [
          'SELECT allocated_amount, refunded_amount, unapplied_amount',
          'FROM invoicing_payment_balances',
          'WHERE payment_id = $1',
          '  AND company_id = $2',
          'LIMIT 1',
        ].join('\n'),
        [
          paymentId,
          context.companyId,
        ],
      );

    const allocatedAmount =
      money(
        balance.rows[0]?.allocated_amount,
      );

    const refundedAmount =
      money(
        balance.rows[0]?.refunded_amount,
      );

    const unappliedAmount =
      money(
        balance.rows[0]?.unapplied_amount,
      );

    await recordPaymentActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        paymentId,
        type:
          'invoicing.payment_received',
        content:
          'Payment ' +
          paymentNumber +
          ' received.',
        metadata: {
          customerId,
          amount,
          allocatedAmount,
          refundedAmount,
          unappliedAmount,
          currency,
          method:
            paymentMethod,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitPaymentEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.posted',
        recordId:
          paymentId,
        idempotencySeed:
          'posted:' +
          paymentId,
        payload: {
          paymentNumber,
          amount,
          allocatedAmount,
          unappliedAmount,
          allocations:
            postedAllocations,
        },
      },
    );

    return {
      paymentId,
      paymentNumber,
      status:
        'posted',
      amount,
      allocatedAmount,
      refundedAmount,
      unappliedAmount,
      allocations:
        postedAllocations,
      reused:
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


export async function allocateInvoicePayment(
  input: Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS.PAYMENT_RECORD,
    );

  const paymentId =
    requireUuid(
      input.paymentId,
      'Payment',
    );

  const fallbackAmount =
    input.amount ===
      undefined ||
    input.amount ===
      null ||
    input.amount ===
      ''
      ? 0
      : numberInput(
          input.amount,
          'Allocation amount',
          {
            min:
              0.0001,
          },
        );

  const allocations =
    normalizeAllocations(
      input.allocations,
      optionalUuid(
        input.invoiceId,
      ),
      fallbackAmount,
    );

  if (
    allocations.length ===
      0
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose at least one invoice allocation.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const paymentResult =
      await client.query(
        [
          'SELECT p.id, p.payment_number, p.customer_id, p.payment_date,',
          'p.currency, p.exchange_rate, p.status, p.accounting_model,',
          'b.unapplied_amount',
          'FROM invoicing_payments p',
          'INNER JOIN invoicing_payment_balances b',
          '  ON b.payment_id = p.id',
          ' AND b.company_id = p.company_id',
          'WHERE p.id = $1',
          '  AND p.company_id = $2',
          '  AND p.deleted_at IS NULL',
          'FOR UPDATE OF p',
        ].join('\n'),
        [
          paymentId,
          context.companyId,
        ],
      );

    if (
      paymentResult.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment was not found.',
      );
    }

    const payment =
      paymentResult.rows[0];

    if (
      String(
        payment.status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted payment can be allocated.',
      );
    }

    if (
      String(
        payment.accounting_model,
      ) !==
        'customer_credit'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'This legacy payment must be reversed and re-recorded before changing its allocations.',
      );
    }

    const totalToAllocate =
      money(
        allocations.reduce(
          (
            sum,
            allocation,
          ) =>
            sum +
            allocation.amount,
          0,
        ),
      );

    const unapplied =
      money(
        payment.unapplied_amount,
      );

    if (
      totalToAllocate >
      unapplied +
        0.0001
    ) {
      throw new InvoicingError(
        'PAYMENT_EXCEEDS_BALANCE',
        'Allocation exceeds the unapplied payment balance.',
        {
          unapplied,
          requested:
            totalToAllocate,
        },
      );
    }

    const settings =
      await client.query(
        [
          'SELECT allow_partial_payments',
          'FROM invoicing_settings',
          'WHERE company_id = $1',
          'LIMIT 1',
        ].join('\n'),
        [
          context.companyId,
        ],
      );

    const results = [];

    for (
      const allocation
      of allocations
    ) {
      results.push(
        await postAllocation(
          client,
          {
            companyId:
              context.companyId,
            userId:
              context.userId,
            paymentId,
            paymentNumber:
              String(
                payment.payment_number,
              ),
            paymentDate:
              String(
                payment.payment_date,
              ),
            customerId:
              String(
                payment.customer_id,
              ),
            currency:
              String(
                payment.currency,
              ),
            paymentExchangeRate:
              Number(
                payment.exchange_rate ||
                1,
              ),
            allocation,
            allowPartialPayments:
              settings.rows[0]
                ?.allow_partial_payments !==
              false,
          },
        ),
      );
    }

    const balance =
      await client.query(
        [
          'SELECT allocated_amount, refunded_amount, unapplied_amount',
          'FROM invoicing_payment_balances',
          'WHERE payment_id = $1',
          '  AND company_id = $2',
          'LIMIT 1',
        ].join('\n'),
        [
          paymentId,
          context.companyId,
        ],
      );

    await recordPaymentActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        paymentId,
        type:
          'invoicing.payment_allocated',
        content:
          'Payment ' +
          String(
            payment.payment_number,
          ) +
          ' allocated.',
        metadata: {
          allocations:
            results,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitPaymentEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.allocated',
        recordId:
          paymentId,
        idempotencySeed:
          'allocated:' +
          paymentId +
          ':' +
          results
            .map(
              item =>
                item.operationKey,
            )
            .join(','),
        payload: {
          allocations:
            results,
        },
      },
    );

    return {
      paymentId,
      paymentNumber:
        String(
          payment.payment_number,
        ),
      allocations:
        results,
      allocatedAmount:
        money(
          balance.rows[0]?.allocated_amount,
        ),
      refundedAmount:
        money(
          balance.rows[0]?.refunded_amount,
        ),
      unappliedAmount:
        money(
          balance.rows[0]?.unapplied_amount,
        ),
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


export async function reverseInvoicePaymentAllocation(
  input: Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS.PAYMENT_RECORD,
    );

  const allocationId =
    requireUuid(
      input.allocationId,
      'Payment allocation',
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
      'An allocation reversal reason is required.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        [
          'SELECT',
          'a.id, a.payment_id, a.invoice_id, a.amount, a.status, a.operation_key,',
          'p.payment_number, p.accounting_model,',
          'i.invoice_number',
          'FROM invoicing_payment_allocations a',
          'INNER JOIN invoicing_payments p',
          '  ON p.id = a.payment_id',
          ' AND p.company_id = a.company_id',
          'INNER JOIN invoicing_invoices i',
          '  ON i.id = a.invoice_id',
          ' AND i.company_id = a.company_id',
          'WHERE a.id = $1',
          '  AND a.company_id = $2',
          'FOR UPDATE OF a',
        ].join('\n'),
        [
          allocationId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment allocation was not found.',
      );
    }

    const allocation =
      result.rows[0];

    if (
      String(
        allocation.status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted allocation can be reversed.',
      );
    }

    if (
      String(
        allocation.accounting_model,
      ) !==
        'customer_credit'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'This legacy allocation cannot be changed independently. Reverse the original payment instead.',
      );
    }

    const operationKey =
      String(
        allocation.operation_key ||
        allocation.id,
      );

    await client.query(
      [
        'UPDATE invoicing_payment_allocations',
        "SET status = 'reversed',",
        '    reversed_at = NOW(),',
        '    reversed_by = $3,',
        '    reversal_reason = $4',
        'WHERE id = $1',
        '  AND company_id = $2',
      ].join('\n'),
      [
        allocationId,
        context.companyId,
        context.userId,
        reason,
      ],
    );

    await reverseInvoicingAccountingEvent(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        originalEventKey:
          'payment-allocation:' +
          allocationId +
          ':' +
          operationKey,
        reversalEventKey:
          'payment-allocation-reversal:' +
          allocationId +
          ':' +
          operationKey,
        sourceType:
          'payment_allocation_reversal',
        sourceId:
          allocationId,
        description:
          'Allocation of payment ' +
          String(
            allocation.payment_number,
          ) +
          ' to invoice ' +
          String(
            allocation.invoice_number,
          ) +
          ' reversed',
      },
    );

    const settlement =
      await reconcileInvoiceSettlement(
        client,
        context.companyId,
        context.userId,
        String(
          allocation.invoice_id,
        ),
        'Payment allocation reversed: ' +
        reason,
      );

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId:
          String(
            allocation.invoice_id,
          ),
        type:
          'invoice.payment_allocation_reversed',
        content:
          'Allocation from payment ' +
          String(
            allocation.payment_number,
          ) +
          ' reversed.',
        metadata: {
          allocationId,
          paymentId:
            String(
              allocation.payment_id,
            ),
          amount:
            money(
              allocation.amount,
            ),
          reason,
        },
      },
    );

    await recordPaymentActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        paymentId:
          String(
            allocation.payment_id,
          ),
        type:
          'invoicing.payment_allocation_reversed',
        content:
          'Allocation to invoice ' +
          String(
            allocation.invoice_number,
          ) +
          ' reversed.',
        metadata: {
          allocationId,
          amount:
            money(
              allocation.amount,
            ),
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      allocationId,
      paymentId:
        String(
          allocation.payment_id,
        ),
      invoiceId:
        String(
          allocation.invoice_id,
        ),
      status:
        'reversed',
      invoiceStatus:
        settlement.status,
      remainingBalance:
        settlement.balanceDue,
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


export async function reconcileInvoicePayment(
  input: Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS.PAYMENT_RECORD,
    );

  const paymentId =
    requireUuid(
      input.paymentId,
      'Payment',
    );

  const reference =
    cleanText(
      input.reference,
      255,
    );

  const notes =
    nullableText(
      input.notes,
      3000,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        [
          'SELECT payment_number, status, reconciled_at',
          'FROM invoicing_payments',
          'WHERE id = $1',
          '  AND company_id = $2',
          '  AND deleted_at IS NULL',
          'FOR UPDATE',
        ].join('\n'),
        [
          paymentId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment was not found.',
      );
    }

    if (
      String(
        result.rows[0].status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted payment can be reconciled.',
      );
    }

    if (
      result.rows[0].reconciled_at
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        paymentId,
        paymentNumber:
          String(
            result.rows[0].payment_number,
          ),
        reconciled:
          true,
        reused:
          true,
      };
    }

    await client.query(
      [
        'UPDATE invoicing_payments',
        'SET reconciled_at = NOW(),',
        '    reconciled_by = $3,',
        '    reconciliation_reference = $4,',
        '    reconciliation_notes = $5,',
        '    updated_by = $3,',
        '    updated_at = NOW()',
        'WHERE id = $1',
        '  AND company_id = $2',
      ].join('\n'),
      [
        paymentId,
        context.companyId,
        context.userId,
        reference ||
          null,
        notes,
      ],
    );

    await recordPaymentActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        paymentId,
        type:
          'invoicing.payment_reconciled',
        content:
          'Payment ' +
          String(
            result.rows[0].payment_number,
          ) +
          ' reconciled.',
        metadata: {
          reference:
            reference ||
            null,
          notes,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitPaymentEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.reconciled',
        recordId:
          paymentId,
        idempotencySeed:
          'reconciled:' +
          paymentId,
        payload: {
          reference:
            reference ||
            null,
        },
      },
    );

    return {
      paymentId,
      paymentNumber:
        String(
          result.rows[0].payment_number,
        ),
      reconciled:
        true,
      reused:
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


export async function refundInvoicePayment(
  input: Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS.PAYMENT_RECORD,
    );

  const paymentId =
    requireUuid(
      input.paymentId,
      'Payment',
    );

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

  const idempotencyKey =
    cleanText(
      input.idempotencyKey,
      160,
    ) ||
    null;

  const refundDate =
    isoDate(
      input.refundDate,
      new Date(),
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const paymentResult =
      await client.query(
        [
          'SELECT p.id, p.payment_number, p.status, p.currency, p.exchange_rate,',
          'p.method, p.accounting_model, b.unapplied_amount',
          'FROM invoicing_payments p',
          'INNER JOIN invoicing_payment_balances b',
          '  ON b.payment_id = p.id',
          ' AND b.company_id = p.company_id',
          'WHERE p.id = $1',
          '  AND p.company_id = $2',
          '  AND p.deleted_at IS NULL',
          'FOR UPDATE OF p',
        ].join('\n'),
        [
          paymentId,
          context.companyId,
        ],
      );

    if (
      paymentResult.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment was not found.',
      );
    }

    const payment =
      paymentResult.rows[0];

    if (
      String(
        payment.status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted payment can be refunded.',
      );
    }

    if (
      String(
        payment.accounting_model,
      ) !==
        'customer_credit'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'This legacy payment cannot use unapplied-balance refunds. Reverse and re-record the receipt first.',
      );
    }

    if (
      amount >
      money(
        payment.unapplied_amount,
      ) +
        0.0001
    ) {
      throw new InvoicingError(
        'PAYMENT_EXCEEDS_BALANCE',
        'Only the unapplied portion of a payment can be refunded.',
        {
          unapplied:
            money(
              payment.unapplied_amount,
            ),
        },
      );
    }

    if (
      idempotencyKey
    ) {
      await lockPaymentIdentity(
        client,
        [
          'invoicing-payment-refund-idempotency',
          context.companyId,
          idempotencyKey,
        ].join(':'),
      );

      const previous =
        await client.query(
          [
            'SELECT id, refund_number, status',
            'FROM invoicing_payment_refunds',
            'WHERE company_id = $1',
            '  AND idempotency_key = $2',
            'LIMIT 1',
          ].join('\n'),
          [
            context.companyId,
            idempotencyKey,
          ],
        );

      if (
        previous.rows.length >
          0
      ) {
        await client.query(
          'COMMIT',
        );

        return {
          refundId:
            String(
              previous.rows[0].id,
            ),
          refundNumber:
            String(
              previous.rows[0].refund_number,
            ),
          status:
            String(
              previous.rows[0].status,
            ),
          reused:
            true,
        };
      }
    }

    const sequenceResult =
      await client.query(
        [
          'SELECT COALESCE(MAX((',
          "  regexp_replace(refund_number, '[^0-9]', '', 'g')",
          ')::bigint),0) + 1 AS next_value',
          'FROM invoicing_payment_refunds',
          'WHERE company_id = $1',
        ].join('\n'),
        [
          context.companyId,
        ],
      );

    const refundNumber =
      'REF-' +
      String(
        Number(
          sequenceResult.rows[0]?.next_value ||
          1,
        ),
      ).padStart(
        6,
        '0',
      );

    const refund =
      await client.query(
        [
          'INSERT INTO invoicing_payment_refunds (',
          'company_id, payment_id, refund_number, refund_date, amount, currency,',
          'method, reference, reason, status, idempotency_key, created_by, updated_by',
          ") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'posted',$10,$11,$11)",
          'RETURNING id',
        ].join('\n'),
        [
          context.companyId,
          paymentId,
          refundNumber,
          refundDate,
          amount,
          String(
            payment.currency,
          ),
          cleanText(
            input.method,
            50,
          ) ||
          String(
            payment.method ||
            'other',
          ),
          cleanText(
            input.reference,
            255,
          ) ||
          null,
          reason,
          idempotencyKey,
          context.userId,
        ],
      );

    const refundId =
      String(
        refund.rows[0].id,
      );

    await postInvoicePaymentRefundToAccounting(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        refundId,
        refundNumber,
        refundDate,
        amount,
        exchangeRate:
          Number(
            payment.exchange_rate ||
            1,
          ),
      },
    );

    await recordPaymentActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        paymentId,
        type:
          'invoicing.payment_refunded',
        content:
          'Refund ' +
          refundNumber +
          ' posted.',
        metadata: {
          refundId,
          amount,
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitPaymentEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.refunded',
        recordId:
          paymentId,
        idempotencySeed:
          'refund:' +
          refundId,
        payload: {
          refundId,
          refundNumber,
          amount,
        },
      },
    );

    return {
      refundId,
      refundNumber,
      paymentId,
      status:
        'posted',
      amount,
      reused:
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


export async function reverseInvoicePaymentRefund(
  input: Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS.PAYMENT_RECORD,
    );

  const refundId =
    requireUuid(
      input.refundId,
      'Payment refund',
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
      'A refund reversal reason is required.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        [
          'SELECT r.id, r.payment_id, r.refund_number, r.status,',
          'p.payment_number',
          'FROM invoicing_payment_refunds r',
          'INNER JOIN invoicing_payments p',
          '  ON p.id = r.payment_id',
          ' AND p.company_id = r.company_id',
          'WHERE r.id = $1',
          '  AND r.company_id = $2',
          'FOR UPDATE OF r',
        ].join('\n'),
        [
          refundId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment refund was not found.',
      );
    }

    const refund =
      result.rows[0];

    if (
      String(
        refund.status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted refund can be reversed.',
      );
    }

    await client.query(
      [
        'UPDATE invoicing_payment_refunds',
        "SET status = 'reversed',",
        '    reversed_at = NOW(),',
        '    reversed_by = $3,',
        '    reversal_reason = $4,',
        '    updated_by = $3,',
        '    updated_at = NOW()',
        'WHERE id = $1',
        '  AND company_id = $2',
      ].join('\n'),
      [
        refundId,
        context.companyId,
        context.userId,
        reason,
      ],
    );

    await reverseInvoicingAccountingEvent(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        originalEventKey:
          'payment-refund:' +
          refundId,
        reversalEventKey:
          'payment-refund-reversal:' +
          refundId,
        sourceType:
          'payment_refund_reversal',
        sourceId:
          refundId,
        description:
          'Refund ' +
          String(
            refund.refund_number,
          ) +
          ' reversed',
      },
    );

    await recordPaymentActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        paymentId:
          String(
            refund.payment_id,
          ),
        type:
          'invoicing.payment_refund_reversed',
        content:
          'Refund ' +
          String(
            refund.refund_number,
          ) +
          ' reversed.',
        metadata: {
          refundId,
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      refundId,
      paymentId:
        String(
          refund.payment_id,
        ),
      status:
        'reversed',
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


export async function reverseInvoicePayment(
  input: Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS.PAYMENT_RECORD,
    );

  const paymentId =
    requireUuid(
      input.paymentId,
      'Payment',
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
      'A reversal reason is required.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const paymentResult =
      await client.query(
        [
          'SELECT',
          'id, payment_number, amount, currency, status, reconciled_at, accounting_model',
          'FROM invoicing_payments',
          'WHERE id = $1',
          '  AND company_id = $2',
          '  AND deleted_at IS NULL',
          'FOR UPDATE',
        ].join('\n'),
        [
          paymentId,
          context.companyId,
        ],
      );

    if (
      paymentResult.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment was not found.',
      );
    }

    const payment =
      paymentResult.rows[0];

    if (
      String(
        payment.status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted payment can be reversed.',
      );
    }

    const refunds =
      await client.query(
        [
          'SELECT COUNT(*)::int AS count',
          'FROM invoicing_payment_refunds',
          'WHERE payment_id = $1',
          '  AND company_id = $2',
          "  AND status = 'posted'",
        ].join('\n'),
        [
          paymentId,
          context.companyId,
        ],
      );

    if (
      Number(
        refunds.rows[0]?.count ||
        0,
      ) >
        0
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Reverse posted refunds before reversing the original payment.',
      );
    }

    const allocations =
      await client.query(
        [
          'SELECT',
          'a.id, a.invoice_id, a.amount, a.operation_key, a.status,',
          'i.invoice_number',
          'FROM invoicing_payment_allocations a',
          'INNER JOIN invoicing_invoices i',
          '  ON i.id = a.invoice_id',
          ' AND i.company_id = a.company_id',
          'WHERE a.payment_id = $1',
          '  AND a.company_id = $2',
          "  AND a.status = 'posted'",
          'ORDER BY a.created_at, a.id',
          'FOR UPDATE OF a',
        ].join('\n'),
        [
          paymentId,
          context.companyId,
        ],
      );

    const accountingModel =
      String(
        payment.accounting_model ||
        'legacy_direct_ar',
      );

    if (
      accountingModel ===
        'customer_credit'
    ) {
      for (
        const allocation
        of allocations.rows
      ) {
        const allocationId =
          String(
            allocation.id,
          );

        const operationKey =
          String(
            allocation.operation_key ||
            allocationId,
          );

        await client.query(
          [
            'UPDATE invoicing_payment_allocations',
            "SET status = 'reversed',",
            '    reversed_at = NOW(),',
            '    reversed_by = $3,',
            '    reversal_reason = $4',
            'WHERE id = $1',
            '  AND company_id = $2',
          ].join('\n'),
          [
            allocationId,
            context.companyId,
            context.userId,
            'Payment reversal: ' +
            reason,
          ],
        );

        await reverseInvoicingAccountingEvent(
          client,
          {
            companyId:
              context.companyId,
            userId:
              context.userId,
            originalEventKey:
              'payment-allocation:' +
              allocationId +
              ':' +
              operationKey,
            reversalEventKey:
              'payment-allocation-reversal:' +
              allocationId +
              ':' +
              operationKey,
            sourceType:
              'payment_allocation_reversal',
            sourceId:
              allocationId,
            description:
              'Payment ' +
              String(
                payment.payment_number,
              ) +
              ' allocation to invoice ' +
              String(
                allocation.invoice_number,
              ) +
              ' reversed',
          },
        );
      }
    } else {
      await client.query(
        [
          'UPDATE invoicing_payment_allocations',
          "SET status = 'reversed',",
          '    reversed_at = NOW(),',
          '    reversed_by = $3,',
          '    reversal_reason = $4',
          'WHERE payment_id = $1',
          '  AND company_id = $2',
          "  AND status = 'posted'",
        ].join('\n'),
        [
          paymentId,
          context.companyId,
          context.userId,
          'Legacy payment reversal: ' +
          reason,
        ],
      );
    }

    await client.query(
      [
        'UPDATE invoicing_payments',
        "SET status = 'reversed',",
        "    metadata = COALESCE(metadata,'{}'::jsonb) ||",
        "      jsonb_build_object(",
        "        'reversedAt', NOW(),",
        "        'reversedBy', ($3::uuid)::text,",
        "        'reversalReason', $4::text,",
        "        'wasReconciled', reconciled_at IS NOT NULL",
        '      ),',
        '    updated_by = $3,',
        '    updated_at = NOW()',
        'WHERE id = $1',
        '  AND company_id = $2',
      ].join('\n'),
      [
        paymentId,
        context.companyId,
        context.userId,
        reason,
      ],
    );

    await reverseInvoicingAccountingEvent(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        originalEventKey:
          'invoice-payment:' +
          paymentId,
        reversalEventKey:
          'invoice-payment-reversal:' +
          paymentId,
        sourceType:
          'payment_reversal',
        sourceId:
          paymentId,
        description:
          'Payment ' +
          String(
            payment.payment_number,
          ) +
          ' reversed',
      },
    );

    const invoiceIds =
      [
        ...new Set(
          allocations.rows
            .map(
              row =>
                row.invoice_id
                  ? String(
                      row.invoice_id,
                    )
                  : '',
            )
            .filter(Boolean),
        ),
      ];

    const settlements = [];

    for (
      const invoiceId
      of invoiceIds
    ) {
      const settlement =
        await reconcileInvoiceSettlement(
          client,
          context.companyId,
          context.userId,
          invoiceId,
          'Payment ' +
          String(
            payment.payment_number,
          ) +
          ' reversed: ' +
          reason,
        );

      settlements.push({
        invoiceId,
        ...settlement,
      });

      await recordInvoicingActivity(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          invoiceId,
          type:
            'invoice.payment_reversed',
          content:
            'Payment ' +
            String(
              payment.payment_number,
            ) +
            ' reversed.',
          metadata: {
            paymentId,
            amount:
              money(
                payment.amount,
              ),
            reason,
          },
        },
      );
    }

    await recordPaymentActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        paymentId,
        type:
          'invoicing.payment_reversed',
        content:
          'Payment ' +
          String(
            payment.payment_number,
          ) +
          ' reversed.',
        metadata: {
          amount:
            money(
              payment.amount,
            ),
          reason,
          settlements,
          wasReconciled:
            Boolean(
              payment.reconciled_at,
            ),
          accountingModel,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitPaymentEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.reversed',
        recordId:
          paymentId,
        idempotencySeed:
          'reversed:' +
          paymentId,
        payload: {
          paymentNumber:
            String(
              payment.payment_number,
            ),
          settlements,
        },
      },
    );

    return {
      paymentId,
      paymentNumber:
        String(
          payment.payment_number,
        ),
      status:
        'reversed',
      settlements,
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
