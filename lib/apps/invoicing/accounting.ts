import 'server-only';

import type {
  PoolClient,
} from 'pg';


type AccountingLine = {
  account:
    'receivable' |
    'revenue' |
    'tax' |
    'cash' |
    'returns';
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
  returns: {
    suffix:
      'RET',
    name:
      'SaMi Sales Returns',
    accountType:
      'income_contra',
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
            AS links_ready
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

  const existing =
    await client.query(
      `
        SELECT id
        FROM accounts
        WHERE company_id = $1
          AND name = $2
          AND deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        companyId,
        blueprint.name,
      ],
    );

  if (
    existing.rows[0]
      ?.id
  ) {
    return String(
      existing.rows[0].id,
    );
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

  const created =
    await client.query(
      `
        INSERT INTO accounts (
          company_id,
          code,
          name,
          account_type,
          is_active,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,TRUE,$5,$5
        )
        ON CONFLICT (code)
        DO UPDATE
        SET
          updated_at =
            NOW(),
          updated_by =
            EXCLUDED.updated_by
        RETURNING id
      `,
      [
        companyId,
        code,
        blueprint.name,
        blueprint.accountType,
        userId,
      ],
    );

  return String(
    created.rows[0].id,
  );
}


async function postJournal(
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
      string;
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

  const debit =
    money(
      input.lines.reduce(
        (
          total,
          line,
        ) =>
          total +
          line.debit,
        0,
      ),
    );

  const credit =
    money(
      input.lines.reduce(
        (
          total,
          line,
        ) =>
          total +
          line.credit,
        0,
      ),
    );

  if (
    Math.abs(
      debit -
      credit,
    ) >
      0.01 ||
    debit <=
      0
  ) {
    throw new Error(
      'SaMi refused an unbalanced accounting posting.',
    );
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

  const journal =
    await client.query(
      `
        INSERT INTO journals (
          company_id,
          journal_number,
          journal_date,
          reference,
          description,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,
          'SAMI-' ||
          UPPER(
            SUBSTRING(
              MD5($2),
              1,
              16
            )
          ),
          $3,
          $2,
          $4,
          'posted',
          $5,
          $5
        )
        RETURNING id
      `,
      [
        input.companyId,
        input.eventKey,
        input.journalDate,
        input.description,
        input.userId,
      ],
    );

  const journalId =
    String(
      journal.rows[0].id,
    );

  for (
    const line
    of input.lines
  ) {
    const lineDebit =
      money(
        line.debit,
      );

    const lineCredit =
      money(
        line.credit,
      );

    if (
      lineDebit ===
        0 &&
      lineCredit ===
        0
    ) {
      continue;
    }

    await client.query(
      `
        INSERT INTO journal_lines (
          company_id,
          journal_id,
          account_id,
          description,
          debit,
          credit,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$7
        )
      `,
      [
        input.companyId,
        journalId,
        accountIds.get(
          line.account,
        ),
        line.description,
        lineDebit,
        lineCredit,
        input.userId,
      ],
    );
  }

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
      journalId,
      input.userId,
    ],
  );

  return {
    integrated:
      true,
    reused:
      false,
    journalId,
  };
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
    invoiceId:
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
        ' posted',
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
      lines: [
        {
          account:
            'returns',
          description:
            'Sales returns',
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
