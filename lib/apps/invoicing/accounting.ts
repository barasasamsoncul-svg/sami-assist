import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  postBalancedLedgerJournal,
  reversePostedLedgerJournal,
} from '@/lib/apps/accounting/ledger-engine';


function accountingDate(
  value: unknown,
) {
  if (
    value instanceof
      Date
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      );
  }

  const text =
    String(
      value ||
      '',
    )
      .trim();

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text,
    )
  ) {
    return text;
  }

  const parsed =
    Date.parse(
      text,
    );

  if (
    Number.isFinite(
      parsed,
    )
  ) {
    return new Date(
      parsed,
    )
      .toISOString()
      .slice(
        0,
        10,
      );
  }

  throw new Error(
    'SaMi could not resolve a valid accounting date for this posting.',
  );
}


type AccountingLine = {
  account:
    'receivable' |
    'revenue' |
    'tax' |
    'cash' |
    'customer_credit' |
    'returns' |
    'bad_debt' |
    'fx_gain_loss';
  description:
    string;
  debit:
    number;
  credit:
    number;
};


const ACCOUNT_BLUEPRINT = {
  receivable: {
    suffix:
      'AR',
    name:
      'SaMi Accounts Receivable',
    accountType:
      'asset_receivable',
  },
  revenue: {
    suffix:
      'REV',
    name:
      'SaMi Sales Revenue',
    accountType:
      'income',
  },
  tax: {
    suffix:
      'TAX',
    name:
      'SaMi Tax Payable',
    accountType:
      'liability_current',
  },
  cash: {
    suffix:
      'CASH',
    name:
      'SaMi Cash and Bank',
    accountType:
      'asset_cash',
  },
  customer_credit: {
    suffix:
      'CREDIT',
    name:
      'SaMi Customer Credits',
    accountType:
      'liability_current',
  },
  returns: {
    suffix:
      'RET',
    name:
      'SaMi Sales Returns',
    accountType:
      'income_contra',
  },
  bad_debt: {
    suffix:
      'BAD',
    name:
      'SaMi Bad Debt Expense',
    accountType:
      'expense',
  },
  fx_gain_loss: {
    suffix:
      'FX',
    name:
      'SaMi Realized FX Gain / Loss',
    accountType:
      'income_other',
  },
} as const;


async function accountingRuntimeReady(
  client:
    PoolClient,
) {
  const result =
    await client.query(
      `
        SELECT
          to_regclass('public.accounts')
            IS NOT NULL
            AS accounts_ready,
          to_regclass('public.journals')
            IS NOT NULL
            AS journals_ready,
          to_regclass('public.journal_lines')
            IS NOT NULL
            AS lines_ready,
          to_regclass('public.invoicing_accounting_links')
            IS NOT NULL
            AS links_ready,
          to_regclass('public.accounting_settings')
            IS NOT NULL
            AS settings_ready,
          to_regclass('public.accounting_fiscal_periods')
            IS NOT NULL
            AS periods_ready,
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'journals'
              AND column_name = 'source_event_key'
          ) AS ledger_v26_ready
      `,
    );

  const row =
    result.rows[0] ||
    {};

  return (
    row.accounts_ready ===
      true &&
    row.journals_ready ===
      true &&
    row.lines_ready ===
      true &&
    row.links_ready ===
      true &&
    row.settings_ready ===
      true &&
    row.periods_ready ===
      true &&
    row.ledger_v26_ready ===
      true
  );
}


function money(
  value:
    unknown,
) {
  const numeric =
    Number(
      value ||
      0,
    );

  return Math.round(
    (
      Number.isFinite(
        numeric,
      )
        ? numeric
        : 0
    ) *
    100,
  ) /
    100;
}


async function ensureAccount(
  client:
    PoolClient,
  companyId:
    string,
  userId:
    string,
  key:
    keyof typeof ACCOUNT_BLUEPRINT,
) {
  const blueprint =
    ACCOUNT_BLUEPRINT[
      key
    ];

  const setupRole =
    {
      receivable:
        'default_receivable_account_id',
      tax:
        'output_tax_account_id',
      cash:
        'default_cash_account_id',
      bad_debt:
        'write_off_account_id',
    } as const;

  const systemRole =
    {
      receivable:
        'receivable_control',
      revenue:
        'invoicing_revenue',
      tax:
        'output_tax',
      cash:
        'cash_default',
      customer_credit:
        'invoicing_customer_credit',
      returns:
        'invoicing_returns',
      bad_debt:
        'write_off',
      fx_gain_loss:
        'invoicing_fx_gain_loss',
    } as const;

  const setupColumn =
    setupRole[
      key as
        keyof typeof setupRole
    ];

  if (
    setupColumn
  ) {
    const mapped =
      await client.query(
        `
          SELECT
            CASE $2::text
              WHEN 'default_receivable_account_id'
                THEN default_receivable_account_id
              WHEN 'output_tax_account_id'
                THEN output_tax_account_id
              WHEN 'default_cash_account_id'
                THEN default_cash_account_id
              WHEN 'write_off_account_id'
                THEN write_off_account_id
              ELSE NULL
            END::text AS account_id
          FROM accounting_settings
          WHERE company_id = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          companyId,
          setupColumn,
        ],
      );

    const mappedId =
      mapped.rows[0]
        ?.account_id;

    if (
      mappedId
    ) {
      const active =
        await client.query(
          `
            SELECT id::text
            FROM accounts
            WHERE id = $1
              AND company_id = $2
              AND is_active = TRUE
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [
            mappedId,
            companyId,
          ],
        );

      if (
        active.rows[0]
          ?.id
      ) {
        return String(
          active.rows[0].id,
        );
      }
    }
  }

  const existing =
    await client.query(
      `
        SELECT id::text
        FROM accounts
        WHERE company_id = $1
          AND deleted_at IS NULL
          AND (
            system_role = $2
            OR (
              system_role IS NULL
              AND name = $3
            )
          )
        ORDER BY
          CASE
            WHEN system_role = $2
              THEN 0
            ELSE 1
          END,
          id
        LIMIT 1
        FOR UPDATE
      `,
      [
        companyId,
        systemRole[
          key
        ],
        blueprint.name,
      ],
    );

  if (
    existing.rows[0]
      ?.id
  ) {
    const id =
      String(
        existing.rows[0].id,
      );

    await client.query(
      `
        UPDATE accounts
        SET
          is_control_account = TRUE,
          system_role =
            COALESCE(
              system_role,
              $3
            ),
          allow_manual_posting =
            FALSE,
          reconcile =
            CASE
              WHEN account_type IN (
                'asset_receivable',
                'liability_payable',
                'asset_cash'
              )
              THEN TRUE
              ELSE reconcile
            END,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        id,
        companyId,
        systemRole[
          key
        ],
        userId,
      ],
    );

    return id;
  }

  const code =
    (
      'SAMI-' +
      blueprint.suffix +
      '-' +
      companyId
        .replace(
          /-/g,
          '',
        )
        .slice(
          0,
          12,
        )
    ).slice(
      0,
      50,
    );

  const normalBalance =
    (
      blueprint.accountType
        .startsWith(
          'liability',
        ) ||
      blueprint.accountType
        .startsWith(
          'equity',
        ) ||
      blueprint.accountType
        .startsWith(
          'income',
        )
    )
      ? 'credit'
      : 'debit';

  const created =
    await client.query(
      `
        INSERT INTO accounts (
          company_id,
          code,
          name,
          account_type,
          normal_balance,
          is_active,
          reconcile,
          allow_manual_posting,
          is_control_account,
          system_role,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,TRUE,$6,FALSE,TRUE,$7,$8,$8
        )
        ON CONFLICT (
          company_id,
          code
        )
        WHERE deleted_at IS NULL
        DO UPDATE
        SET
          updated_at =
            NOW(),
          updated_by =
            EXCLUDED.updated_by,
          is_active =
            TRUE
        RETURNING id::text
      `,
      [
        companyId,
        code,
        blueprint.name,
        blueprint.accountType,
        normalBalance,
        [
          'asset_receivable',
          'liability_payable',
          'asset_cash',
        ].includes(
          blueprint.accountType,
        ),
        systemRole[
          key
        ],
        userId,
      ],
    );

  return String(
    created.rows[0].id,
  );
}


async function postJournalUnsafe(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    eventKey:
      string;
    sourceType:
      string;
    sourceId:
      string;
    journalDate:
      unknown;
    description:
      string;
    lines:
      AccountingLine[];
  },
) {
  if (
    !await accountingRuntimeReady(
      client,
    )
  ) {
    return {
      integrated:
        false,
      reused:
        false,
      journalId:
        null,
    };
  }

  const previous =
    await client.query(
      `
        SELECT journal_id
        FROM invoicing_accounting_links
        WHERE company_id = $1
          AND event_key = $2
        LIMIT 1
      `,
      [
        input.companyId,
        input.eventKey,
      ],
    );

  if (
    previous.rows[0]
      ?.journal_id
  ) {
    return {
      integrated:
        true,
      reused:
        true,
      journalId:
        String(
          previous.rows[0]
            .journal_id,
        ),
    };
  }

  const accountIds =
    new Map<
      AccountingLine['account'],
      string
    >();

  for (
    const line
    of input.lines
  ) {
    if (
      !accountIds.has(
        line.account,
      )
    ) {
      accountIds.set(
        line.account,
        await ensureAccount(
          client,
          input.companyId,
          input.userId,
          line.account,
        ),
      );
    }
  }

  const posting =
    await postBalancedLedgerJournal(
      client,
      {
        companyId:
          input.companyId,
        userId:
          input.userId,
        journalDate:
          accountingDate(
            input.journalDate,
          ),
        description:
          input.description,
        reference:
          input.eventKey,
        sourceModule:
          'invoicing',
        sourceType:
          input.sourceType,
        sourceId:
          input.sourceId,
        sourceEventKey:
          input.eventKey,
        postingKind:
          'system',
        lines:
          input.lines
            .map(
              line => ({
                accountId:
                  accountIds.get(
                    line.account,
                  )!,
                description:
                  line.description,
                debit:
                  money(
                    line.debit,
                  ),
                credit:
                  money(
                    line.credit,
                  ),
              }),
            )
            .filter(
              line =>
                Number(
                  line.debit,
                ) >
                  0 ||
                Number(
                  line.credit,
                ) >
                  0,
            ),
      },
    );

  await client.query(
    `
      INSERT INTO invoicing_accounting_links (
        company_id,
        event_key,
        source_type,
        source_id,
        journal_id,
        created_by
      )
      VALUES (
        $1,$2,$3,$4,$5,$6
      )
      ON CONFLICT (
        company_id,
        event_key
      )
      DO NOTHING
    `,
    [
      input.companyId,
      input.eventKey,
      input.sourceType,
      input.sourceId,
      posting.journalId,
      input.userId,
    ],
  );

  return {
    integrated:
      true,
    reused:
      posting.reused,
    journalId:
      posting.journalId,
  };
}


type AccountingBoundaryInput = {
  companyId: string;
  eventKey: string;
  sourceType: string;
  sourceId: string;
};

async function recordAccountingBoundaryFailure(
  client: PoolClient,
  input: AccountingBoundaryInput,
  error: unknown,
) {
  const message =
    error instanceof Error
      ? error.message.slice(0, 500)
      : 'Unknown Accounting integration error.';

  try {
    await client.query(
      `
        INSERT INTO invoicing_events (
          company_id,
          event_key,
          payload
        )
        VALUES (
          $1,
          'invoicing.integration.accounting_failed',
          jsonb_build_object(
            'sourceType', $2::text,
            'sourceId', $3::text,
            'accountingEventKey', $4::text,
            'message', $5::text,
            'retryable', TRUE
          )
        )
      `,
      [
        input.companyId,
        input.sourceType,
        input.sourceId,
        input.eventKey,
        message,
      ],
    );
  } catch (auditError) {
    console.error('[Invoicing] Could not record Accounting integration failure', {
      eventKey: input.eventKey,
      auditError,
    });
  }
}

async function runOptionalAccountingBoundary<T extends {
  integrated: boolean;
  reused: boolean;
  journalId: string | null;
}>(
  client: PoolClient,
  input: AccountingBoundaryInput,
  work: () => Promise<T>,
): Promise<T | {
  integrated: false;
  reused: false;
  journalId: null;
  reason: 'accounting_write_failed';
}> {
  await client.query('SAVEPOINT invoicing_accounting_boundary');

  try {
    const result = await work();
    await client.query('RELEASE SAVEPOINT invoicing_accounting_boundary');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK TO SAVEPOINT invoicing_accounting_boundary');
      await client.query('RELEASE SAVEPOINT invoicing_accounting_boundary');
    } catch (rollbackError) {
      console.error('[Invoicing] Accounting boundary rollback failed', {
        eventKey: input.eventKey,
        rollbackError,
      });
      throw error;
    }

    console.error('[Invoicing] Optional Accounting integration failed', {
      eventKey: input.eventKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      error,
    });

    await recordAccountingBoundaryFailure(client, input, error);

    return {
      integrated: false,
      reused: false,
      journalId: null,
      reason: 'accounting_write_failed',
    };
  }
}

async function postJournal(
  client: PoolClient,
  input: Parameters<typeof postJournalUnsafe>[1],
) {
  return runOptionalAccountingBoundary(
    client,
    {
      companyId: input.companyId,
      eventKey: input.eventKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    },
    () => postJournalUnsafe(client, input),
  );
}


export async function postInvoiceConfirmationToAccounting(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    invoiceId:
      string;
  },
) {
  if (
    !await accountingRuntimeReady(
      client,
    )
  ) {
    return {
      integrated:
        false,
      reused:
        false,
      journalId:
        null,
    };
  }

  const result =
    await client.query(
      `
        SELECT
          invoice_number,
          invoice_date,
          total_amount,
          tax_total,
          exchange_rate
        FROM invoicing_invoices
        WHERE id = $1
          AND company_id = $2
          AND deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        input.invoiceId,
        input.companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    return {
      integrated:
        false,
      reused:
        false,
      journalId:
        null,
    };
  }

  const invoice =
    result.rows[0];

  const rate =
    Number(
      invoice.exchange_rate ||
      1,
    );

  const total =
    money(
      Number(
        invoice.total_amount ||
        0,
      ) *
      rate,
    );

  const tax =
    money(
      Number(
        invoice.tax_total ||
        0,
      ) *
      rate,
    );

  const revenue =
    money(
      total -
      tax,
    );

  return postJournal(
    client,
    {
      companyId:
        input.companyId,
      userId:
        input.userId,
      eventKey:
        'invoice-confirmed:' +
        input.invoiceId,
      sourceType:
        'invoice',
      sourceId:
        input.invoiceId,
      journalDate:
        String(
          invoice.invoice_date,
        ),
      description:
        'Invoice ' +
        String(
          invoice.invoice_number,
        ) +
        ' confirmed',
      lines: [
        {
          account:
            'receivable',
          description:
            'Accounts receivable',
          debit:
            total,
          credit:
            0,
        },
        {
          account:
            'revenue',
          description:
            'Sales revenue',
          debit:
            0,
          credit:
            revenue,
        },
        {
          account:
            'tax',
          description:
            'Tax payable',
          debit:
            0,
          credit:
            tax,
        },
      ],
    },
  );
}


export async function postInvoicePaymentToAccounting(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    invoiceId?:
      string;
    paymentId:
      string;
    paymentNumber:
      string;
    paymentDate:
      string;
    amount:
      number;
    exchangeRate?:
      number;
  },
) {
  const amount =
    money(
      input.amount *
      (
        input.exchangeRate ||
        1
      ),
    );

  return postJournal(
    client,
    {
      companyId:
        input.companyId,
      userId:
        input.userId,
      eventKey:
        'invoice-payment:' +
        input.paymentId,
      sourceType:
        'payment',
      sourceId:
        input.paymentId,
      journalDate:
        input.paymentDate,
      description:
        'Payment ' +
        input.paymentNumber +
        ' received',
      lines: [
        {
          account:
            'cash',
          description:
            'Cash / bank',
          debit:
            amount,
          credit:
            0,
        },
        {
          account:
            'customer_credit',
          description:
            'Unapplied customer receipt',
          debit:
            0,
          credit:
            amount,
        },
      ],
    },
  );
}


export async function postInvoicePaymentAllocationToAccounting(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    allocationId:
      string;
    operationKey:
      string;
    paymentId:
      string;
    paymentNumber:
      string;
    invoiceId:
      string;
    invoiceNumber:
      string;
    allocationDate:
      string;
    paymentAmount:
      number;
    invoiceAmount:
      number;
    paymentExchangeRate:
      number;
    invoiceExchangeRate:
      number;
  },
) {
  const paymentBaseAmount =
    money(
      input.paymentAmount *
      input.paymentExchangeRate,
    );

  const invoiceBaseAmount =
    money(
      input.invoiceAmount *
      input.invoiceExchangeRate,
    );

  const realizedFxAmount =
    money(
      paymentBaseAmount -
      invoiceBaseAmount,
    );

  const lines:
    AccountingLine[] = [
      {
        account:
          'customer_credit',
        description:
          'Apply customer credit',
        debit:
          paymentBaseAmount,
        credit:
          0,
      },
      {
        account:
          'receivable',
        description:
          'Accounts receivable',
        debit:
          0,
        credit:
          invoiceBaseAmount,
      },
    ];

  if (
    realizedFxAmount >
      0
  ) {
    lines.push(
      {
        account:
          'fx_gain_loss',
        description:
          'Realized foreign exchange gain',
        debit:
          0,
        credit:
          realizedFxAmount,
      },
    );
  } else if (
    realizedFxAmount <
      0
  ) {
    lines.push(
      {
        account:
          'fx_gain_loss',
        description:
          'Realized foreign exchange loss',
        debit:
          Math.abs(
            realizedFxAmount,
          ),
        credit:
          0,
      },
    );
  }

  return postJournal(
    client,
    {
      companyId:
        input.companyId,
      userId:
        input.userId,
      eventKey:
        'payment-allocation:' +
        input.allocationId +
        ':' +
        input.operationKey,
      sourceType:
        'payment_allocation',
      sourceId:
        input.allocationId,
      journalDate:
        input.allocationDate,
      description:
        'Payment ' +
        input.paymentNumber +
        ' allocated to invoice ' +
        input.invoiceNumber,
      lines,
    },
  );
}


export async function postInvoicePaymentRefundToAccounting(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    refundId:
      string;
    refundNumber:
      string;
    refundDate:
      string;
    amount:
      number;
    exchangeRate?:
      number;
  },
) {
  const amount =
    money(
      input.amount *
      (
        input.exchangeRate ||
        1
      ),
    );

  return postJournal(
    client,
    {
      companyId:
        input.companyId,
      userId:
        input.userId,
      eventKey:
        'payment-refund:' +
        input.refundId,
      sourceType:
        'payment_refund',
      sourceId:
        input.refundId,
      journalDate:
        input.refundDate,
      description:
        'Refund ' +
        input.refundNumber +
        ' posted',
      lines: [
        {
          account:
            'customer_credit',
          description:
            'Release unapplied customer credit',
          debit:
            amount,
          credit:
            0,
        },
        {
          account:
            'cash',
          description:
            'Cash / bank refund',
          debit:
            0,
          credit:
            amount,
        },
      ],
    },
  );
}


export async function postInvoiceCreditToAccounting(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    invoiceId:
      string;
    creditNoteId:
      string;
    creditNoteNumber:
      string;
    totalAmount:
      number;
    subtotal?:
      number;
    taxTotal?:
      number;
    receivableAmount:
      number;
    customerCreditAmount:
      number;
    exchangeRate?:
      number;
  },
) {
  const rate =
    input.exchangeRate ||
    1;

  const totalAmount =
    money(
      input.totalAmount *
      rate,
    );

  const taxTotal =
    money(
      (
        input.taxTotal ||
        0
      ) *
      rate,
    );

  const subtotal =
    money(
      (
        input.subtotal ??
        (
          input.totalAmount -
          (
            input.taxTotal ||
            0
          )
        )
      ) *
      rate,
    );

  const receivableAmount =
    money(
      input.receivableAmount *
      rate,
    );

  const customerCreditAmount =
    money(
      input.customerCreditAmount *
      rate,
    );

  if (
    Math.abs(
      totalAmount -
      (
        receivableAmount +
        customerCreditAmount
      ),
    ) >
      0.01
  ) {
    throw new Error(
      'Credit-note accounting split does not match the credit total.',
    );
  }

  const lines:
    AccountingLine[] =
      [
        {
          account:
            'returns',
          description:
            'Sales returns',
          debit:
            subtotal,
          credit:
            0,
        },
      ];

  if (
    taxTotal >
      0
  ) {
    lines.push({
      account:
        'tax',
      description:
        'Tax reversal',
      debit:
        taxTotal,
      credit:
        0,
    });
  }

  if (
    receivableAmount >
      0
  ) {
    lines.push({
      account:
        'receivable',
      description:
        'Accounts receivable offset',
      debit:
        0,
      credit:
        receivableAmount,
    });
  }

  if (
    customerCreditAmount >
      0
  ) {
    lines.push({
      account:
        'customer_credit',
      description:
        'Customer credit created',
      debit:
        0,
      credit:
        customerCreditAmount,
    });
  }

  return postJournal(
    client,
    {
      companyId:
        input.companyId,
      userId:
        input.userId,
      eventKey:
        'invoice-credit:' +
        input.creditNoteId,
      sourceType:
        'credit_note',
      sourceId:
        input.creditNoteId,
      journalDate:
        new Date()
          .toISOString()
          .slice(
            0,
            10,
          ),
      description:
        'Credit note ' +
        input.creditNoteNumber +
        ' issued',
      lines,
    },
  );
}


export async function postCreditNoteApplicationToAccounting(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    creditNoteId:
      string;
    applicationId:
      string;
    creditNoteNumber:
      string;
    invoiceNumber:
      string;
    amount:
      number;
    exchangeRate?:
      number;
  },
) {
  const amount =
    money(
      input.amount *
      (
        input.exchangeRate ||
        1
      ),
    );

  return postJournal(
    client,
    {
      companyId:
        input.companyId,
      userId:
        input.userId,
      eventKey:
        'credit-application:' +
        input.applicationId,
      sourceType:
        'credit_note_application',
      sourceId:
        input.applicationId,
      journalDate:
        new Date()
          .toISOString()
          .slice(
            0,
            10,
          ),
      description:
        'Apply credit note ' +
        input.creditNoteNumber +
        ' to invoice ' +
        input.invoiceNumber,
      lines: [
        {
          account:
            'customer_credit',
          description:
            'Use customer credit',
          debit:
            amount,
          credit:
            0,
        },
        {
          account:
            'receivable',
          description:
            'Accounts receivable',
          debit:
            0,
          credit:
            amount,
        },
      ],
    },
  );
}


export async function postCreditNoteRefundToAccounting(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    creditNoteId:
      string;
    refundId:
      string;
    refundNumber:
      string;
    refundDate:
      string;
    amount:
      number;
    exchangeRate?:
      number;
  },
) {
  const amount =
    money(
      input.amount *
      (
        input.exchangeRate ||
        1
      ),
    );

  return postJournal(
    client,
    {
      companyId:
        input.companyId,
      userId:
        input.userId,
      eventKey:
        'credit-refund:' +
        input.refundId,
      sourceType:
        'credit_note_refund',
      sourceId:
        input.refundId,
      journalDate:
        input.refundDate,
      description:
        'Refund ' +
        input.refundNumber +
        ' from customer credit',
      lines: [
        {
          account:
            'customer_credit',
          description:
            'Release customer credit',
          debit:
            amount,
          credit:
            0,
        },
        {
          account:
            'cash',
          description:
            'Cash / bank refund',
          debit:
            0,
          credit:
            amount,
        },
      ],
    },
  );
}


async function reverseInvoicingAccountingEventUnsafe(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    originalEventKey:
      string;
    reversalEventKey:
      string;
    sourceType:
      string;
    sourceId:
      string;
    description:
      string;
  },
) {
  if (
    !await accountingRuntimeReady(
      client,
    )
  ) {
    return {
      integrated:
        false,
      reused:
        false,
      journalId:
        null,
    };
  }

  const existing =
    await client.query(
      `
        SELECT journal_id
        FROM invoicing_accounting_links
        WHERE company_id = $1
          AND event_key = $2
        LIMIT 1
      `,
      [
        input.companyId,
        input.reversalEventKey,
      ],
    );

  if (
    existing.rows[0]
      ?.journal_id
  ) {
    return {
      integrated:
        true,
      reused:
        true,
      journalId:
        String(
          existing.rows[0]
            .journal_id,
        ),
    };
  }

  const original =
    await client.query(
      `
        SELECT journal_id::text
        FROM invoicing_accounting_links
        WHERE company_id = $1
          AND event_key = $2
        LIMIT 1
      `,
      [
        input.companyId,
        input.originalEventKey,
      ],
    );

  if (
    !original.rows[0]
      ?.journal_id
  ) {
    return {
      integrated:
        true,
      reused:
        false,
      journalId:
        null,
    };
  }

  const reversal =
    await reversePostedLedgerJournal(
      client,
      {
        companyId:
          input.companyId,
        userId:
          input.userId,
        originalJournalId:
          String(
            original.rows[0]
              .journal_id,
          ),
        journalDate:
          new Date()
            .toISOString()
            .slice(
              0,
              10,
            ),
        description:
          input.description,
        sourceModule:
          'invoicing',
        sourceType:
          input.sourceType,
        sourceId:
          input.sourceId,
        sourceEventKey:
          input.reversalEventKey,
      },
    );

  await client.query(
    `
      INSERT INTO invoicing_accounting_links (
        company_id,
        event_key,
        source_type,
        source_id,
        journal_id,
        created_by
      )
      VALUES (
        $1,$2,$3,$4,$5,$6
      )
      ON CONFLICT (
        company_id,
        event_key
      )
      DO NOTHING
    `,
    [
      input.companyId,
      input.reversalEventKey,
      input.sourceType,
      input.sourceId,
      reversal.journalId,
      input.userId,
    ],
  );

  return {
    integrated:
      true,
    reused:
      reversal.reused,
    journalId:
      reversal.journalId,
  };
}


export async function reverseInvoicingAccountingEvent(
  client: PoolClient,
  input: Parameters<typeof reverseInvoicingAccountingEventUnsafe>[1],
) {
  return runOptionalAccountingBoundary(
    client,
    {
      companyId: input.companyId,
      eventKey: input.reversalEventKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    },
    () => reverseInvoicingAccountingEventUnsafe(client, input),
  );
}


export async function postInvoiceWriteOffToAccounting(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    invoiceId:
      string;
  },
) {
  if (
    !await accountingRuntimeReady(
      client,
    )
  ) {
    return {
      integrated:
        false,
      reused:
        false,
      journalId:
        null,
    };
  }

  const invoice =
    await client.query(
      `
        SELECT
          i.invoice_number,
          i.exchange_rate,
          aging.balance_due
        FROM invoicing_invoices i
        INNER JOIN invoicing_aging aging
          ON aging.invoice_id =
             i.id
         AND aging.company_id =
             i.company_id
        WHERE i.id = $1
          AND i.company_id = $2
          AND i.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        input.invoiceId,
        input.companyId,
      ],
    );

  if (
    invoice.rows.length !==
      1
  ) {
    return {
      integrated:
        false,
      reused:
        false,
      journalId:
        null,
    };
  }

  const amount =
    money(
      Number(
        invoice.rows[0]
          .balance_due ||
        0,
      ) *
      Number(
        invoice.rows[0]
          .exchange_rate ||
        1,
      ),
    );

  if (
    amount <=
      0
  ) {
    return {
      integrated:
        true,
      reused:
        false,
      journalId:
        null,
    };
  }

  return postJournal(
    client,
    {
      companyId:
        input.companyId,
      userId:
        input.userId,
      eventKey:
        'invoice-writeoff:' +
        input.invoiceId,
      sourceType:
        'invoice_writeoff',
      sourceId:
        input.invoiceId,
      journalDate:
        new Date()
          .toISOString()
          .slice(
            0,
            10,
          ),
      description:
        'Invoice ' +
        String(
          invoice.rows[0]
            .invoice_number,
        ) +
        ' written off',
      lines: [
        {
          account:
            'bad_debt',
          description:
            'Bad debt expense',
          debit:
            amount,
          credit:
            0,
        },
        {
          account:
            'receivable',
          description:
            'Accounts receivable',
          debit:
            0,
          credit:
            amount,
        },
      ],
    },
  );
}
