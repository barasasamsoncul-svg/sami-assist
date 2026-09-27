import 'server-only';

import type {
  PoolClient,
} from 'pg';


async function tableExists(
  client: PoolClient,
  table: string,
) {
  const result =
    await client.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
        LIMIT 1
      `,
      [table],
    );

  return result.rows.length === 1;
}


async function columnExists(
  client: PoolClient,
  table: string,
  column: string,
) {
  const result =
    await client.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        LIMIT 1
      `,
      [table, column],
    );

  return result.rows.length === 1;
}


async function accountingBridgeReady(
  client: PoolClient,
) {
  for (
    const table
    of [
      'accounts',
      'journals',
      'journal_lines',
    ]
  ) {
    if (!(await tableExists(client, table))) {
      return false;
    }

    if (!(await columnExists(client, table, 'company_id'))) {
      return false;
    }
  }

  return true;
}


function companyCode(
  companyId: string,
  suffix: string,
) {
  return (
    'SAMI-' +
    companyId
      .replace(
        /-/g,
        '',
      )
      .slice(
        0,
        8,
      )
      .toUpperCase() +
    '-' +
    suffix
  ).slice(
    0,
    50,
  );
}


async function ensureAccount(
  client: PoolClient,
  input: {
    companyId: string;
    codeSuffix: string;
    name: string;
    type: string;
  },
) {
  const code =
    companyCode(
      input.companyId,
      input.codeSuffix,
    );

  const existing =
    await client.query(
      `
        SELECT id
        FROM accounts
        WHERE company_id = $1
          AND code = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.companyId,
        code,
      ],
    );

  if (existing.rows.length === 1) {
    return String(
      existing.rows[0].id,
    );
  }

  const created =
    await client.query(
      `
        INSERT INTO accounts (
          code,
          name,
          account_type,
          is_active,
          company_id
        )
        VALUES (
          $1,$2,$3,TRUE,$4
        )
        RETURNING id
      `,
      [
        code,
        input.name,
        input.type,
        input.companyId,
      ],
    );

  return String(
    created.rows[0].id,
  );
}


async function journalExists(
  client: PoolClient,
  companyId: string,
  reference: string,
) {
  const result =
    await client.query(
      `
        SELECT id
        FROM journals
        WHERE company_id = $1
          AND reference = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        companyId,
        reference,
      ],
    );

  return result.rows.length > 0;
}


async function createJournal(
  client: PoolClient,
  input: {
    companyId: string;
    reference: string;
    description: string;
    journalDate?: string | null;
    lines: Array<{
      accountId: string;
      description: string;
      debit: number;
      credit: number;
    }>;
  },
) {
  if (
    input.lines.length < 2
  ) {
    return null;
  }

  const debit =
    input.lines.reduce(
      (
        sum,
        line,
      ) =>
        sum +
        Number(
          line.debit ||
          0,
        ),
      0,
    );

  const credit =
    input.lines.reduce(
      (
        sum,
        line,
      ) =>
        sum +
        Number(
          line.credit ||
          0,
        ),
      0,
    );

  if (
    Math.abs(
      debit -
      credit,
    ) >
      0.005
  ) {
    throw new Error(
      'Accounting posting is not balanced.',
    );
  }

  const journalNumber =
    (
      'SAMI-' +
      input.reference
        .replace(
          /[^a-z0-9]+/gi,
          '-',
        )
        .toUpperCase()
    ).slice(
      0,
      100,
    );

  const journal =
    await client.query(
      `
        INSERT INTO journals (
          journal_number,
          journal_date,
          reference,
          description,
          status,
          company_id
        )
        VALUES (
          $1,
          COALESCE($2::date, CURRENT_DATE),
          $3,$4,
          'posted',
          $5
        )
        RETURNING id
      `,
      [
        journalNumber,
        input.journalDate ||
          null,
        input.reference,
        input.description,
        input.companyId,
      ],
    );

  const journalId =
    String(
      journal.rows[0].id,
    );

  for (const line of input.lines) {
    if (
      Math.abs(
        line.debit,
      ) <=
        0.000001 &&
      Math.abs(
        line.credit,
      ) <=
        0.000001
    ) {
      continue;
    }

    await client.query(
      `
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit,
          credit,
          company_id
        )
        VALUES (
          $1,$2,$3,$4,$5,$6
        )
      `,
      [
        journalId,
        line.accountId,
        line.description,
        line.debit,
        line.credit,
        input.companyId,
      ],
    );
  }

  return journalId;
}


async function accountSet(
  client: PoolClient,
  companyId: string,
) {
  const [
    receivable,
    revenue,
    taxPayable,
    cash,
  ] =
    await Promise.all([
      ensureAccount(
        client,
        {
          companyId,
          codeSuffix:
            'AR',
          name:
            'Accounts Receivable',
          type:
            'asset_receivable',
        },
      ),
      ensureAccount(
        client,
        {
          companyId,
          codeSuffix:
            'REV',
          name:
            'Sales Revenue',
          type:
            'income',
        },
      ),
      ensureAccount(
        client,
        {
          companyId,
          codeSuffix:
            'TAX',
          name:
            'Output Tax Payable',
          type:
            'liability_current',
        },
      ),
      ensureAccount(
        client,
        {
          companyId,
          codeSuffix:
            'CASH',
          name:
            'Cash and Bank',
          type:
            'asset_cash',
        },
      ),
    ]);

  return {
    receivable,
    revenue,
    taxPayable,
    cash,
  };
}


export async function postInvoiceToAccounting(
  client: PoolClient,
  input: {
    companyId: string;
    invoiceId: string;
  },
) {
  if (!(await accountingBridgeReady(client))) {
    return {
      integrated: false,
      posted: false,
    };
  }

  const invoice =
    await client.query(
      `
        SELECT
          invoice_number,
          invoice_date,
          status,
          total_amount,
          tax_total,
          currency
        FROM invoicing_invoices
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.invoiceId,
        input.companyId,
      ],
    );

  if (invoice.rows.length !== 1) {
    return {
      integrated: true,
      posted: false,
    };
  }

  const row =
    invoice.rows[0];

  if (
    ![
      'confirmed',
      'sent',
      'viewed',
      'partially_paid',
      'paid',
      'overdue',
      'written_off',
    ].includes(
      String(
        row.status,
      ),
    )
  ) {
    return {
      integrated: true,
      posted: false,
    };
  }

  const reference =
    'invoice:' +
    input.invoiceId +
    ':posted';

  if (
    await journalExists(
      client,
      input.companyId,
      reference,
    )
  ) {
    return {
      integrated: true,
      posted: false,
      reused: true,
    };
  }

  const accounts =
    await accountSet(
      client,
      input.companyId,
    );

  const total =
    Number(
      row.total_amount ||
      0,
    );

  const tax =
    Math.max(
      0,
      Math.min(
        total,
        Number(
          row.tax_total ||
          0,
        ),
      ),
    );

  const revenue =
    total -
    tax;

  const journalId =
    await createJournal(
      client,
      {
        companyId:
          input.companyId,
        reference,
        journalDate:
          row.invoice_date
            ? String(
                row.invoice_date,
              )
            : null,
        description:
          'Invoice ' +
          String(
            row.invoice_number,
          ) +
          ' · ' +
          String(
            row.currency ||
            '',
          ),
        lines: [
          {
            accountId:
              accounts.receivable,
            description:
              'Accounts receivable',
            debit:
              total,
            credit:
              0,
          },
          {
            accountId:
              accounts.revenue,
            description:
              'Sales revenue',
            debit:
              0,
            credit:
              revenue,
          },
          {
            accountId:
              accounts.taxPayable,
            description:
              'Output tax',
            debit:
              0,
            credit:
              tax,
          },
        ],
      },
    );

  return {
    integrated: true,
    posted:
      Boolean(
        journalId,
      ),
    journalId,
  };
}


export async function reverseInvoiceAccounting(
  client: PoolClient,
  input: {
    companyId: string;
    invoiceId: string;
    reason: string;
  },
) {
  if (!(await accountingBridgeReady(client))) {
    return {
      integrated: false,
      posted: false,
    };
  }

  const reference =
    'invoice:' +
    input.invoiceId +
    ':reversal';

  if (
    await journalExists(
      client,
      input.companyId,
      reference,
    )
  ) {
    return {
      integrated: true,
      posted: false,
      reused: true,
    };
  }

  const invoice =
    await client.query(
      `
        SELECT
          invoice_number,
          invoice_date,
          total_amount,
          tax_total
        FROM invoicing_invoices
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.invoiceId,
        input.companyId,
      ],
    );

  if (invoice.rows.length !== 1) {
    return {
      integrated: true,
      posted: false,
    };
  }

  const accounts =
    await accountSet(
      client,
      input.companyId,
    );

  const total =
    Number(
      invoice.rows[0]
        .total_amount ||
      0,
    );

  const tax =
    Math.max(
      0,
      Math.min(
        total,
        Number(
          invoice.rows[0]
            .tax_total ||
          0,
        ),
      ),
    );

  const revenue =
    total -
    tax;

  const journalId =
    await createJournal(
      client,
      {
        companyId:
          input.companyId,
        reference,
        journalDate:
          invoice.rows[0]
            .invoice_date
            ? String(
                invoice.rows[0]
                  .invoice_date,
              )
            : null,
        description:
          'Reverse invoice ' +
          String(
            invoice.rows[0]
              .invoice_number,
          ) +
          ': ' +
          input.reason,
        lines: [
          {
            accountId:
              accounts.receivable,
            description:
              'Reverse receivable',
            debit:
              0,
            credit:
              total,
          },
          {
            accountId:
              accounts.revenue,
            description:
              'Reverse revenue',
            debit:
              revenue,
            credit:
              0,
          },
          {
            accountId:
              accounts.taxPayable,
            description:
              'Reverse output tax',
            debit:
              tax,
            credit:
              0,
          },
        ],
      },
    );

  return {
    integrated: true,
    posted:
      Boolean(
        journalId,
      ),
    journalId,
  };
}


export async function postPaymentToAccounting(
  client: PoolClient,
  input: {
    companyId: string;
    paymentId: string;
  },
) {
  if (!(await accountingBridgeReady(client))) {
    return {
      integrated: false,
      posted: false,
    };
  }

  const reference =
    'payment:' +
    input.paymentId +
    ':posted';

  if (
    await journalExists(
      client,
      input.companyId,
      reference,
    )
  ) {
    return {
      integrated: true,
      posted: false,
      reused: true,
    };
  }

  const payment =
    await client.query(
      `
        SELECT
          payment_number,
          payment_date,
          amount,
          currency,
          status
        FROM invoicing_payments
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.paymentId,
        input.companyId,
      ],
    );

  if (
    payment.rows.length !==
      1 ||
    String(
      payment.rows[0]
        .status,
    ) !==
      'posted'
  ) {
    return {
      integrated: true,
      posted: false,
    };
  }

  const accounts =
    await accountSet(
      client,
      input.companyId,
    );

  const amount =
    Number(
      payment.rows[0]
        .amount ||
      0,
    );

  const journalId =
    await createJournal(
      client,
      {
        companyId:
          input.companyId,
        reference,
        journalDate:
          payment.rows[0]
            .payment_date
            ? String(
                payment.rows[0]
                  .payment_date,
              )
            : null,
        description:
          'Payment ' +
          String(
            payment.rows[0]
              .payment_number,
          ),
        lines: [
          {
            accountId:
              accounts.cash,
            description:
              'Cash received',
            debit:
              amount,
            credit:
              0,
          },
          {
            accountId:
              accounts.receivable,
            description:
              'Settle accounts receivable',
            debit:
              0,
            credit:
              amount,
          },
        ],
      },
    );

  return {
    integrated: true,
    posted:
      Boolean(
        journalId,
      ),
    journalId,
  };
}


export async function reversePaymentAccounting(
  client: PoolClient,
  input: {
    companyId: string;
    paymentId: string;
    reason: string;
  },
) {
  if (!(await accountingBridgeReady(client))) {
    return {
      integrated: false,
      posted: false,
    };
  }

  const reference =
    'payment:' +
    input.paymentId +
    ':reversal';

  if (
    await journalExists(
      client,
      input.companyId,
      reference,
    )
  ) {
    return {
      integrated: true,
      posted: false,
      reused: true,
    };
  }

  const payment =
    await client.query(
      `
        SELECT
          payment_number,
          payment_date,
          amount
        FROM invoicing_payments
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.paymentId,
        input.companyId,
      ],
    );

  if (payment.rows.length !== 1) {
    return {
      integrated: true,
      posted: false,
    };
  }

  const accounts =
    await accountSet(
      client,
      input.companyId,
    );

  const amount =
    Number(
      payment.rows[0]
        .amount ||
      0,
    );

  const journalId =
    await createJournal(
      client,
      {
        companyId:
          input.companyId,
        reference,
        journalDate:
          payment.rows[0]
            .payment_date
            ? String(
                payment.rows[0]
                  .payment_date,
              )
            : null,
        description:
          'Reverse payment ' +
          String(
            payment.rows[0]
              .payment_number,
          ) +
          ': ' +
          input.reason,
        lines: [
          {
            accountId:
              accounts.cash,
            description:
              'Reverse cash receipt',
            debit:
              0,
            credit:
              amount,
          },
          {
            accountId:
              accounts.receivable,
            description:
              'Restore accounts receivable',
            debit:
              amount,
            credit:
              0,
          },
        ],
      },
    );

  return {
    integrated: true,
    posted:
      Boolean(
        journalId,
      ),
    journalId,
  };
}


export async function postCreditNoteToAccounting(
  client: PoolClient,
  input: {
    companyId: string;
    creditNoteId: string;
  },
) {
  if (!(await accountingBridgeReady(client))) {
    return {
      integrated: false,
      posted: false,
    };
  }

  const reference =
    'credit-note:' +
    input.creditNoteId +
    ':posted';

  if (
    await journalExists(
      client,
      input.companyId,
      reference,
    )
  ) {
    return {
      integrated: true,
      posted: false,
      reused: true,
    };
  }

  const credit =
    await client.query(
      `
        SELECT
          credit_note_number,
          issue_date,
          total_amount,
          status
        FROM invoicing_credit_notes
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.creditNoteId,
        input.companyId,
      ],
    );

  if (
    credit.rows.length !==
      1 ||
    ![
      'issued',
      'applied',
      'refunded',
    ].includes(
      String(
        credit.rows[0]
          .status,
      ),
    )
  ) {
    return {
      integrated: true,
      posted: false,
    };
  }

  const accounts =
    await accountSet(
      client,
      input.companyId,
    );

  const amount =
    Number(
      credit.rows[0]
        .total_amount ||
      0,
    );

  const journalId =
    await createJournal(
      client,
      {
        companyId:
          input.companyId,
        reference,
        journalDate:
          credit.rows[0]
            .issue_date
            ? String(
                credit.rows[0]
                  .issue_date,
              )
            : null,
        description:
          'Credit note ' +
          String(
            credit.rows[0]
              .credit_note_number,
          ),
        lines: [
          {
            accountId:
              accounts.revenue,
            description:
              'Sales return / credit',
            debit:
              amount,
            credit:
              0,
          },
          {
            accountId:
              accounts.receivable,
            description:
              'Reduce accounts receivable',
            debit:
              0,
            credit:
              amount,
          },
        ],
      },
    );

  return {
    integrated: true,
    posted:
      Boolean(
        journalId,
      ),
    journalId,
  };
}


export async function reverseCreditNoteAccounting(
  client: PoolClient,
  input: {
    companyId: string;
    creditNoteId: string;
    reason: string;
  },
) {
  if (!(await accountingBridgeReady(client))) {
    return {
      integrated: false,
      posted: false,
    };
  }

  const reference =
    'credit-note:' +
    input.creditNoteId +
    ':reversal';

  if (
    await journalExists(
      client,
      input.companyId,
      reference,
    )
  ) {
    return {
      integrated: true,
      posted: false,
      reused: true,
    };
  }

  const credit =
    await client.query(
      `
        SELECT
          credit_note_number,
          issue_date,
          total_amount
        FROM invoicing_credit_notes
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.creditNoteId,
        input.companyId,
      ],
    );

  if (credit.rows.length !== 1) {
    return {
      integrated: true,
      posted: false,
    };
  }

  const accounts =
    await accountSet(
      client,
      input.companyId,
    );

  const amount =
    Number(
      credit.rows[0]
        .total_amount ||
      0,
    );

  const journalId =
    await createJournal(
      client,
      {
        companyId:
          input.companyId,
        reference,
        journalDate:
          credit.rows[0]
            .issue_date
            ? String(
                credit.rows[0]
                  .issue_date,
              )
            : null,
        description:
          'Reverse credit note ' +
          String(
            credit.rows[0]
              .credit_note_number,
          ) +
          ': ' +
          input.reason,
        lines: [
          {
            accountId:
              accounts.revenue,
            description:
              'Reverse sales return',
            debit:
              0,
            credit:
              amount,
          },
          {
            accountId:
              accounts.receivable,
            description:
              'Restore receivable',
            debit:
              amount,
            credit:
              0,
          },
        ],
      },
    );

  return {
    integrated: true,
    posted:
      Boolean(
        journalId,
      ),
    journalId,
  };
}
