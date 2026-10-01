import 'server-only';

import {
  createHash,
} from 'node:crypto';

import type {
  PoolClient,
} from 'pg';


export type LedgerAmount =
  | number
  | string;


export class LedgerPostingError extends Error {}

export type LedgerPostingLine = {
  accountId: string;
  description?: string | null;
  debit: LedgerAmount;
  credit: LedgerAmount;
};

export type LedgerPostingInput = {
  companyId: string;
  userId: string;
  journalDate: string;
  description: string;
  reference?: string | null;
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  sourceEventKey: string;
  postingKind?:
    | 'system'
    | 'manual'
    | 'reversal'
    | 'opening';
  journalNumber?: string | null;
  reversalOfJournalId?: string | null;
  lines: LedgerPostingLine[];
};

type NormalizedLine = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  debitCents: bigint;
  creditCents: bigint;
};


function moneyCents(
  value:
    LedgerAmount,
  label:
    string,
) {
  const text =
    typeof value ===
      'number'
      ? (
          Number.isFinite(
            value,
          )
            ? value.toFixed(
                2,
              )
            : ''
        )
      : String(
          value,
        ).trim();

  if (
    !/^-?\d{1,13}(?:\.\d{1,2})?$/.test(
      text,
    )
  ) {
    throw new LedgerPostingError(
      label +
      ' must be a valid amount with at most two decimal places.',
    );
  }

  const negative =
    text.startsWith(
      '-',
    );

  const unsigned =
    negative
      ? text.slice(
          1,
        )
      : text;

  const [
    whole,
    fraction =
      '',
  ] =
    unsigned.split(
      '.',
    );

  const cents =
    BigInt(
      whole,
    ) *
      BigInt(
        100,
      ) +
    BigInt(
      fraction.padEnd(
        2,
        '0',
      ),
    );

  return negative
    ? -cents
    : cents;
}


function centsText(
  cents:
    bigint,
) {
  const negative =
    cents <
    BigInt(
      0,
    );

  const amount =
    negative
      ? -cents
      : cents;

  return (
    (
      negative
        ? '-'
        : ''
    ) +
    String(
      amount /
      BigInt(
        100,
      ),
    ) +
    '.' +
    String(
      amount %
      BigInt(
        100,
      ),
    ).padStart(
      2,
      '0',
    )
  );
}


function accountingDate(
  value:
    string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new LedgerPostingError(
      'Accounting posting date must use YYYY-MM-DD.',
    );
  }

  const parsed =
    new Date(
      value +
      'T00:00:00Z',
    );

  if (
    !Number.isFinite(
      parsed.getTime(),
    ) ||
    parsed
      .toISOString()
      .slice(
        0,
        10,
      ) !==
      value
  ) {
    throw new LedgerPostingError(
      'Accounting posting date is invalid.',
    );
  }

  return value;
}


function postingText(
  value:
    string,
  max:
    number,
  label:
    string,
) {
  const text =
    String(
      value ||
      '',
    ).trim();

  if (
    !text ||
    text.length >
      max
  ) {
    throw new LedgerPostingError(
      label +
      ' is required and must not exceed ' +
      max +
      ' characters.',
    );
  }

  return text;
}


function normalizeLines(
  lines:
    LedgerPostingLine[],
) {
  if (
    !Array.isArray(
      lines,
    ) ||
    lines.length <
      2 ||
    lines.length >
      200
  ) {
    throw new LedgerPostingError(
      'A posted journal needs between 2 and 200 accounting lines.',
    );
  }

  const normalized:
    NormalizedLine[] =
    [];

  let debitTotal =
    BigInt(
      0,
    );

  let creditTotal =
    BigInt(
      0,
    );

  for (
    const line
    of lines
  ) {
    const debitCents =
      moneyCents(
        line.debit,
        'Journal debit',
      );

    const creditCents =
      moneyCents(
        line.credit,
        'Journal credit',
      );

    if (
      debitCents <
        BigInt(
          0,
        ) ||
      creditCents <
        BigInt(
          0,
        )
    ) {
      throw new LedgerPostingError(
        'Journal amounts cannot be negative.',
      );
    }

    const hasDebit =
      debitCents >
      BigInt(
        0,
      );

    const hasCredit =
      creditCents >
      BigInt(
        0,
      );

    if (
      hasDebit ===
      hasCredit
    ) {
      throw new LedgerPostingError(
        'Each posted journal line needs exactly one debit or one credit.',
      );
    }

    const accountId =
      String(
        line.accountId ||
        '',
      )
        .trim()
        .toLowerCase();

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        accountId,
      )
    ) {
      throw new LedgerPostingError(
        'Every posted journal line needs a valid account.',
      );
    }

    debitTotal +=
      debitCents;

    creditTotal +=
      creditCents;

    normalized.push({
      accountId,
      description:
        String(
          line.description ||
          '',
        )
          .trim()
          .slice(
            0,
            500,
          ),
      debit:
        centsText(
          debitCents,
        ),
      credit:
        centsText(
          creditCents,
        ),
      debitCents,
      creditCents,
    });
  }

  if (
    debitTotal <=
      BigInt(
        0,
      ) ||
    debitTotal !==
      creditTotal
  ) {
    throw new LedgerPostingError(
      'SaMi refused an unbalanced accounting posting.',
    );
  }

  return {
    lines:
      normalized,
    total:
      centsText(
        debitTotal,
      ),
  };
}


async function assertPostingPeriod(
  client:
    PoolClient,
  companyId:
    string,
  journalDate:
    string,
) {
  const settings =
    await client.query(
      `
        SELECT
          global_lock_date::text,
          require_open_period
        FROM accounting_settings
        WHERE company_id = $1
          AND deleted_at IS NULL
        LIMIT 1
        FOR SHARE
      `,
      [
        companyId,
      ],
    );

  const policy =
    settings.rows[0] ||
    {
      global_lock_date:
        null,
      require_open_period:
        true,
    };

  if (
    policy.global_lock_date &&
    journalDate <=
      String(
        policy.global_lock_date,
      )
  ) {
    throw new LedgerPostingError(
      'This accounting date is on or before the company Accounting lock date.',
    );
  }

  const periods =
    await client.query(
      `
        SELECT
          status,
          lock_date::text
        FROM accounting_fiscal_periods
        WHERE company_id = $1
          AND deleted_at IS NULL
          AND $2::date
              BETWEEN starts_on
                  AND ends_on
        FOR SHARE
      `,
      [
        companyId,
        journalDate,
      ],
    );

  if (
    policy.require_open_period !==
      false &&
    periods.rows.length ===
      0
  ) {
    throw new LedgerPostingError(
      'Create an open fiscal period covering this accounting date first.',
    );
  }

  if (
    periods.rows.some(
      row =>
        String(
          row.status ||
          '',
        ) !==
          'open' ||
        (
          row.lock_date &&
          journalDate <=
            String(
              row.lock_date,
            )
        ),
    )
  ) {
    throw new LedgerPostingError(
      'This accounting date belongs to a locked or closing fiscal period.',
    );
  }
}


async function assertPostingAccounts(
  client:
    PoolClient,
  companyId:
    string,
  lines:
    NormalizedLine[],
  manualOnly =
    false,
) {
  const ids =
    [
      ...new Set(
        lines.map(
          line =>
            line.accountId,
        ),
      ),
    ];

  const accounts =
    await client.query(
      `
        SELECT
          id::text,
          is_active,
          allow_manual_posting
        FROM accounts
        WHERE company_id = $1
          AND id = ANY(
            $2::uuid[]
          )
          AND deleted_at IS NULL
        FOR SHARE
      `,
      [
        companyId,
        ids,
      ],
    );

  if (
    accounts.rows.length !==
      ids.length ||
    accounts.rows.some(
      row =>
        row.is_active !==
        true,
    )
  ) {
    throw new LedgerPostingError(
      'Every posted journal line must use an active account belonging to this company.',
    );
  }

  if (
    manualOnly &&
    accounts.rows.some(
      row =>
        row.allow_manual_posting ===
        false,
    )
  ) {
    throw new LedgerPostingError(
      'A manual journal cannot post to a system-only control account.',
    );
  }
}


function deterministicJournalNumber(
  sourceModule:
    string,
  sourceEventKey:
    string,
) {
  const digest =
    createHash(
      'sha256',
    )
      .update(
        sourceModule +
        ':' +
        sourceEventKey,
      )
      .digest(
        'hex',
      )
      .slice(
        0,
        28,
      )
      .toUpperCase();

  return (
    'SYS-' +
    digest
  ).slice(
    0,
    100,
  );
}


export async function postBalancedLedgerJournal(
  client:
    PoolClient,
  input:
    LedgerPostingInput,
) {
  const journalDate =
    accountingDate(
      input.journalDate,
    );

  const sourceModule =
    postingText(
      input.sourceModule,
      80,
      'Posting source module',
    );

  const sourceType =
    postingText(
      input.sourceType,
      120,
      'Posting source type',
    );

  const sourceId =
    postingText(
      input.sourceId,
      160,
      'Posting source ID',
    );

  const sourceEventKey =
    postingText(
      input.sourceEventKey,
      255,
      'Posting source event',
    );

  const description =
    postingText(
      input.description,
      1000,
      'Journal description',
    );

  const normalized =
    normalizeLines(
      input.lines,
    );

  const previous =
    await client.query(
      `
        SELECT id::text
        FROM journals
        WHERE company_id = $1
          AND source_module = $2
          AND source_event_key = $3
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.companyId,
        sourceModule,
        sourceEventKey,
      ],
    );

  if (
    previous.rows[0]
      ?.id
  ) {
    return {
      journalId:
        String(
          previous.rows[0].id,
        ),
      reused:
        true,
      total:
        normalized.total,
    };
  }

  await assertPostingPeriod(
    client,
    input.companyId,
    journalDate,
  );

  await assertPostingAccounts(
    client,
    input.companyId,
    normalized.lines,
  );

  const journalNumber =
    input.journalNumber
      ? postingText(
          input.journalNumber,
          100,
          'Journal number',
        )
      : deterministicJournalNumber(
          sourceModule,
          sourceEventKey,
        );

  const created =
    await client.query(
      `
        INSERT INTO journals (
          company_id,
          journal_number,
          journal_date,
          reference,
          description,
          status,
          source_module,
          source_type,
          source_id,
          source_event_key,
          posting_kind,
          posted_at,
          reversal_of_journal_id,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,'posted',
          $6,$7,$8,$9,$10,NOW(),$11,$12,$12
        )
        ON CONFLICT (
          company_id,
          source_module,
          source_event_key
        )
        WHERE deleted_at IS NULL
          AND source_module IS NOT NULL
          AND source_event_key IS NOT NULL
        DO NOTHING
        RETURNING id::text
      `,
      [
        input.companyId,
        journalNumber,
        journalDate,
        input.reference ||
          sourceEventKey,
        description,
        sourceModule,
        sourceType,
        sourceId,
        sourceEventKey,
        input.postingKind ||
          'system',
        input.reversalOfJournalId ||
          null,
        input.userId,
      ],
    );

  if (
    !created.rows[0]
      ?.id
  ) {
    const concurrent =
      await client.query(
        `
          SELECT id::text
          FROM journals
          WHERE company_id = $1
            AND source_module = $2
            AND source_event_key = $3
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          input.companyId,
          sourceModule,
          sourceEventKey,
        ],
      );

    if (
      !concurrent.rows[0]
        ?.id
    ) {
      throw new LedgerPostingError(
        'SaMi could not resolve the idempotent Accounting posting.',
      );
    }

    return {
      journalId:
        String(
          concurrent.rows[0].id,
        ),
      reused:
        true,
      total:
        normalized.total,
    };
  }

  const journalId =
    String(
      created.rows[0].id,
    );

  for (
    const line
    of normalized.lines
  ) {
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
        line.accountId,
        line.description ||
          description,
        line.debit,
        line.credit,
        input.userId,
      ],
    );
  }

  const proof =
    await client.query(
      `
        SELECT
          COUNT(*)::int AS line_count,
          COALESCE(
            SUM(debit),
            0
          )::text
            AS debit_total,
          COALESCE(
            SUM(credit),
            0
          )::text
            AS credit_total
        FROM journal_lines
        WHERE company_id = $1
          AND journal_id = $2
          AND deleted_at IS NULL
      `,
      [
        input.companyId,
        journalId,
      ],
    );

  if (
    Number(
      proof.rows[0]
        ?.line_count ||
      0,
    ) <
      2 ||
    moneyCents(
      String(
        proof.rows[0]
          ?.debit_total ||
        '0',
      ),
      'Journal debit total',
    ) !==
      moneyCents(
        String(
          proof.rows[0]
            ?.credit_total ||
          '0',
        ),
        'Journal credit total',
      )
  ) {
    throw new LedgerPostingError(
      'SaMi refused to finalize a journal whose persisted lines are not balanced.',
    );
  }

  return {
    journalId,
    reused:
      false,
    total:
      normalized.total,
  };
}



export async function postApprovedManualLedgerJournal(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    journalId: string;
  },
) {
  const journalResult =
    await client.query(
      `
        SELECT
          id::text,
          journal_date::text,
          status,
          posting_kind,
          posted_at::text
        FROM journals
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [
        input.journalId,
        input.companyId,
      ],
    );

  const journal =
    journalResult.rows[0];

  if (!journal) {
    throw new LedgerPostingError(
      'This Accounting journal could not be found.',
    );
  }

  if (
    String(
      journal.status,
    ) ===
      'posted'
  ) {
    const totals =
      await client.query(
        `
          SELECT
            COALESCE(
              SUM(debit),
              0
            )::text
              AS debit_total
          FROM journal_lines
          WHERE company_id = $1
            AND journal_id = $2
            AND deleted_at IS NULL
        `,
        [
          input.companyId,
          input.journalId,
        ],
      );

    return {
      journalId:
        input.journalId,
      reused:
        true,
      total:
        String(
          totals.rows[0]
            ?.debit_total ||
          '0.00',
        ),
    };
  }

  if (
    String(
      journal.status,
    ) !==
      'approved'
  ) {
    throw new LedgerPostingError(
      'Approve this manual journal before posting it.',
    );
  }

  if (
    ![
      'manual',
      'opening',
    ].includes(
      String(
        journal.posting_kind,
      ),
    )
  ) {
    throw new LedgerPostingError(
      'Only approved manual or opening journals can use this posting workflow.',
    );
  }

  const linesResult =
    await client.query(
      `
        SELECT
          account_id::text,
          description,
          debit::text,
          credit::text
        FROM journal_lines
        WHERE company_id = $1
          AND journal_id = $2
          AND deleted_at IS NULL
        ORDER BY
          created_at,
          id
        FOR SHARE
      `,
      [
        input.companyId,
        input.journalId,
      ],
    );

  const normalized =
    normalizeLines(
      linesResult.rows.map(
        line => ({
          accountId:
            String(
              line.account_id,
            ),
          description:
            line.description,
          debit:
            String(
              line.debit,
            ),
          credit:
            String(
              line.credit,
            ),
        }),
      ),
    );

  await assertPostingPeriod(
    client,
    input.companyId,
    String(
      journal.journal_date,
    ),
  );

  await assertPostingAccounts(
    client,
    input.companyId,
    normalized.lines,
    true,
  );

  const proof =
    await client.query(
      `
        SELECT
          COUNT(*)::int AS line_count,
          COALESCE(
            SUM(debit),
            0
          )::text
            AS debit_total,
          COALESCE(
            SUM(credit),
            0
          )::text
            AS credit_total
        FROM journal_lines
        WHERE company_id = $1
          AND journal_id = $2
          AND deleted_at IS NULL
      `,
      [
        input.companyId,
        input.journalId,
      ],
    );

  if (
    Number(
      proof.rows[0]
        ?.line_count ||
      0,
    ) <
      2 ||
    moneyCents(
      String(
        proof.rows[0]
          ?.debit_total ||
        '0',
      ),
      'Journal debit total',
    ) !==
      moneyCents(
        String(
          proof.rows[0]
            ?.credit_total ||
          '0',
      ),
      'Journal credit total',
    )
  ) {
    throw new LedgerPostingError(
      'SaMi refused to post a journal whose persisted lines are not balanced.',
    );
  }

  await client.query(
    `
      UPDATE journals
      SET
        status = 'posted',
        posted_at = NOW(),
        posted_by = $3,
        updated_by = $3,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
        AND status = 'approved'
    `,
    [
      input.journalId,
      input.companyId,
      input.userId,
    ],
  );

  return {
    journalId:
      input.journalId,
    reused:
      false,
    total:
      normalized.total,
  };
}


export async function reversePostedLedgerJournal(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    originalJournalId: string;
    journalDate: string;
    description: string;
    sourceModule: string;
    sourceType: string;
    sourceId: string;
    sourceEventKey: string;
  },
) {
  const original =
    await client.query(
      `
        SELECT
          id::text,
          journal_number,
          status,
          reversed_by_journal_id::text
        FROM journals
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [
        input.originalJournalId,
        input.companyId,
      ],
    );

  const journal =
    original.rows[0];

  if (
    !journal ||
    String(
      journal.status,
    ) !==
      'posted'
  ) {
    throw new LedgerPostingError(
      'Only an existing posted journal can be reversed.',
    );
  }

  if (
    journal.reversed_by_journal_id
  ) {
    return {
      journalId:
        String(
          journal.reversed_by_journal_id,
        ),
      reused:
        true,
    };
  }

  const originalLines =
    await client.query(
      `
        SELECT
          account_id::text,
          description,
          debit::text,
          credit::text
        FROM journal_lines
        WHERE company_id = $1
          AND journal_id = $2
          AND deleted_at IS NULL
        ORDER BY
          created_at,
          id
        FOR SHARE
      `,
      [
        input.companyId,
        input.originalJournalId,
      ],
    );

  if (
    originalLines.rows.length <
      2
  ) {
    throw new LedgerPostingError(
      'The original posted journal does not contain a valid accounting entry.',
    );
  }

  const reversal =
    await postBalancedLedgerJournal(
      client,
      {
        companyId:
          input.companyId,
        userId:
          input.userId,
        journalDate:
          input.journalDate,
        description:
          input.description,
        reference:
          'Reversal of ' +
          String(
            journal.journal_number,
          ),
        sourceModule:
          input.sourceModule,
        sourceType:
          input.sourceType,
        sourceId:
          input.sourceId,
        sourceEventKey:
          input.sourceEventKey,
        postingKind:
          'reversal',
        reversalOfJournalId:
          input.originalJournalId,
        lines:
          originalLines.rows.map(
            line => ({
              accountId:
                String(
                  line.account_id,
                ),
              description:
                'Reversal · ' +
                String(
                  line.description ||
                  input.description,
                ),
              debit:
                String(
                  line.credit,
                ),
              credit:
                String(
                  line.debit,
                ),
            }),
          ),
      },
    );

  await client.query(
    `
      UPDATE journals
      SET
        reversed_by_journal_id = $3,
        updated_by = $4,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
        AND reversed_by_journal_id IS NULL
    `,
    [
      input.originalJournalId,
      input.companyId,
      reversal.journalId,
      input.userId,
    ],
  );

  return reversal;
}
