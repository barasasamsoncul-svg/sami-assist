import "server-only";

import {
  createHash,
} from "node:crypto";
import type {
  PoolClient,
} from "pg";

import {
  requireEnterpriseModuleTableContext,
} from "@/lib/apps/enterprise/service";
import {
  recordWorkspaceAuditEvent,
} from "@/lib/services/workspace-activity";

import {
  postBalancedLedgerJournal,
} from "./ledger-engine";
import type {
  OpeningBalanceBatchDetail,
  OpeningBalanceLine,
  OpeningBalanceReconciliation,
  OpeningBalanceWorkspace,
} from "./opening-balance-types";
import {
  AccountingInputError,
  accountingDate,
  accountingId,
  decimalAmount,
  minorUnits,
} from "./validation";


type SourceRow = {
  sourceRowKey: string;
  accountCode: string;
  description: string;
  debit: string;
  credit: string;
  subledgerType: string;
  subledgerReference: string;
  subledgerName: string;
};


type ValidatedBatch = {
  batchId: string;
  ready: boolean;
  debitTotal: string;
  creditTotal: string;
  difference: string;
  lineCount: number;
  errorCount: number;
  warningCount: number;
  batchErrors: string[];
  reconciliation: OpeningBalanceReconciliation[];
  lines: Array<{
    accountId: string;
    description: string;
    debit: string;
    credit: string;
  }>;
};


const SOURCE_TYPES =
  new Set([
    "manual",
    "csv",
    "migration",
  ]);

const SUBLEDGER_TYPES =
  new Set([
    "none",
    "customer",
    "vendor",
    "bank",
    "tax",
    "employee",
    "other",
  ]);


function requiredText(
  value: unknown,
  max: number,
  label: string,
) {
  const text =
    typeof value === "string"
      ? value.trim()
      : "";

  if (!text || text.length > max) {
    throw new AccountingInputError(
      label +
        " is required and must not exceed " +
        max +
        " characters.",
    );
  }

  return text;
}


function optionalText(
  value: unknown,
  max: number,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  if (typeof value !== "string") {
    throw new AccountingInputError(
      "Opening-balance text values must contain text.",
    );
  }

  return value
    .trim()
    .slice(
      0,
      max,
    );
}


function requestBody(
  input: unknown,
) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new AccountingInputError(
      "Enter a valid opening-balance request.",
    );
  }

  return input as Record<
    string,
    unknown
  >;
}


function assertCompany(
  body: Record<string, unknown>,
  companyId: string,
) {
  if (
    accountingId(
      body.expectedCompanyId,
    ) !==
    companyId
  ) {
    throw new AccountingInputError(
      "Your company changed. Reload Opening Balances before continuing.",
    );
  }
}


function parseCsv(
  input: string,
) {
  if (
    !input.trim()
  ) {
    throw new AccountingInputError(
      "Choose a CSV file containing opening-balance rows.",
    );
  }

  const rows:
    string[][] =
    [];

  let row:
    string[] =
    [];
  let cell =
    "";
  let quoted =
    false;

  for (
    let index =
      0;
    index <
      input.length;
    index +=
      1
  ) {
    const char =
      input[
        index
      ];

    if (
      quoted
    ) {
      if (
        char ===
          '"' &&
        input[
          index +
            1
        ] ===
          '"'
      ) {
        cell +=
          '"';
        index +=
          1;
      } else if (
        char ===
          '"'
      ) {
        quoted =
          false;
      } else {
        cell +=
          char;
      }

      continue;
    }

    if (
      char ===
        '"'
    ) {
      quoted =
        true;
      continue;
    }

    if (
      char ===
        ","
    ) {
      row.push(
        cell,
      );
      cell =
        "";
      continue;
    }

    if (
      char ===
        "\n"
    ) {
      row.push(
        cell.replace(
          /\r$/,
          "",
        ),
      );
      rows.push(
        row,
      );
      row =
        [];
      cell =
        "";
      continue;
    }

    cell +=
      char;
  }

  if (
    quoted
  ) {
    throw new AccountingInputError(
      "The CSV contains an unterminated quoted value.",
    );
  }

  if (
    cell ||
    row.length
  ) {
    row.push(
      cell.replace(
        /\r$/,
        "",
      ),
    );
    rows.push(
      row,
    );
  }

  return rows.filter(
    candidate =>
      candidate.some(
        value =>
          value.trim(),
      ),
  );
}


function headerKey(
  input: string,
) {
  return input
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "_",
    )
    .replace(
      /^_+|_+$/g,
      "",
    );
}


function csvSourceRows(
  csvText: string,
) {
  const rows =
    parseCsv(
      csvText,
    );

  if (
    rows.length <
      3
  ) {
    throw new AccountingInputError(
      "Opening-balance CSV needs a header and at least two data rows.",
    );
  }

  const headers =
    rows[0].map(
      headerKey,
    );

  const aliases:
    Record<
      string,
      string[]
    > = {
      accountCode: [
        "account_code",
        "account",
        "code",
      ],
      description: [
        "description",
        "memo",
        "narration",
      ],
      debit: [
        "debit",
        "debit_amount",
      ],
      credit: [
        "credit",
        "credit_amount",
      ],
      subledgerType: [
        "subledger_type",
        "party_type",
      ],
      subledgerReference: [
        "subledger_reference",
        "party_reference",
        "party_ref",
      ],
      subledgerName: [
        "subledger_name",
        "party_name",
      ],
      sourceRowKey: [
        "source_row_key",
        "row_key",
        "external_key",
      ],
    };

  const indexes =
    Object.fromEntries(
      Object.entries(
        aliases,
      ).map(
        ([
          key,
          options,
        ]) => [
          key,
          options
            .map(
              option =>
                headers.indexOf(
                  option,
                ),
            )
            .find(
              value =>
                value !==
                -1,
            ) ??
            -1,
        ],
      ),
    ) as Record<
      keyof typeof aliases,
      number
    >;

  for (
    const required
    of [
      "accountCode",
      "debit",
      "credit",
    ] as const
  ) {
    if (
      indexes[
        required
      ] ===
      -1
    ) {
      throw new AccountingInputError(
        "CSV must include account_code, debit and credit columns.",
      );
    }
  }

  if (
    rows.length -
      1 >
    10000
  ) {
    throw new AccountingInputError(
      "One opening-balance batch can contain at most 10,000 rows.",
    );
  }

  const value = (
    columns: string[],
    key: keyof typeof aliases,
  ) =>
    indexes[
      key
    ] ===
      -1
      ? ""
      : String(
          columns[
            indexes[
              key
            ]
          ] ??
            "",
        ).trim();

  return rows
    .slice(
      1,
    )
    .map(
      (
        columns,
        index,
      ): SourceRow => ({
        sourceRowKey:
          value(
            columns,
            "sourceRowKey",
          ) ||
          String(
            index +
              1,
          ),
        accountCode:
          value(
            columns,
            "accountCode",
          ),
        description:
          value(
            columns,
            "description",
          ),
        debit:
          value(
            columns,
            "debit",
          ),
        credit:
          value(
            columns,
            "credit",
          ),
        subledgerType:
          value(
            columns,
            "subledgerType",
          ) ||
          "none",
        subledgerReference:
          value(
            columns,
            "subledgerReference",
          ),
        subledgerName:
          value(
            columns,
            "subledgerName",
          ),
      }),
    );
}


function jsonSourceRows(
  input: unknown,
) {
  if (
    !Array.isArray(
      input,
    ) ||
    input.length <
      2 ||
    input.length >
      10000
  ) {
    throw new AccountingInputError(
      "Opening balances need between 2 and 10,000 rows.",
    );
  }

  return input.map(
    (
      value,
      index,
    ): SourceRow => {
      if (
        !value ||
        typeof value !==
          "object" ||
        Array.isArray(
          value,
        )
      ) {
        throw new AccountingInputError(
          "Every opening-balance row must be a valid record.",
        );
      }

      const row =
        value as Record<
          string,
          unknown
        >;

      return {
        sourceRowKey:
          optionalText(
            row.sourceRowKey,
            160,
          ) ||
          String(
            index +
              1,
          ),
        accountCode:
          optionalText(
            row.accountCode,
            50,
          ),
        description:
          optionalText(
            row.description,
            500,
          ),
        debit:
          optionalText(
            row.debit,
            80,
          ),
        credit:
          optionalText(
            row.credit,
            80,
          ),
        subledgerType:
          optionalText(
            row.subledgerType,
            20,
          ) ||
          "none",
        subledgerReference:
          optionalText(
            row.subledgerReference,
            160,
          ),
        subledgerName:
          optionalText(
            row.subledgerName,
            255,
          ),
      };
    },
  );
}


function normalizeSourceRows(
  body: Record<
    string,
    unknown
  >,
) {
  const rows =
    typeof body.csvText ===
      "string"
      ? csvSourceRows(
          body.csvText,
        )
      : jsonSourceRows(
          body.rows,
        );

  return rows.map(
    row => ({
      ...row,
      accountCode:
        row.accountCode.trim(),
      subledgerType:
        row.subledgerType
          .trim()
          .toLowerCase(),
    }),
  );
}


function hashRequest(
  payload: {
    name: string;
    asOfDate: string;
    sourceType: string;
    rows: SourceRow[];
  },
) {
  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        payload,
      ),
    )
    .digest(
      "hex",
    );
}


function centsDifference(
  debit:
    bigint,
  credit:
    bigint,
) {
  return decimalAmount(
    debit -
      credit,
  );
}


function reconciliationFromRows(
  rows: Array<
    Record<
      string,
      unknown
    >
  >,
): OpeningBalanceReconciliation[] {
  const byAccount =
    new Map<
      string,
      {
        accountId: string;
        code: string;
        name: string;
        accountType: string;
        requiredSubledger:
          | "customer"
          | "vendor";
        control:
          bigint;
        subledger:
          bigint;
        references:
          Set<string>;
      }
    >();

  for (
    const row
    of rows
  ) {
    const accountType =
      String(
        row.account_type ||
          "",
      );

    if (
      accountType !==
        "asset_receivable" &&
      accountType !==
        "liability_payable"
    ) {
      continue;
    }

    if (
      !row.account_id
    ) {
      continue;
    }

    const accountId =
      String(
        row.account_id,
      );

    const entry =
      byAccount.get(
        accountId,
      ) || {
        accountId,
        code:
          String(
            row.account_code ||
              row.account_code_input ||
              "",
          ),
        name:
          String(
            row.account_name ||
              "",
          ),
        accountType,
        requiredSubledger:
          accountType ===
            "asset_receivable"
            ? "customer"
            : "vendor",
        control:
          BigInt(
            0,
          ),
        subledger:
          BigInt(
            0,
          ),
        references:
          new Set<
            string
          >(),
      };

    const debit =
      row.debit ===
        null ||
      row.debit ===
        undefined
        ? BigInt(
            0,
          )
        : minorUnits(
            String(
              row.debit,
            ),
          );

    const credit =
      row.credit ===
        null ||
      row.credit ===
        undefined
        ? BigInt(
            0,
          )
        : minorUnits(
            String(
              row.credit,
            ),
          );

    const signed =
      debit -
      credit;

    entry.control +=
      signed;

    if (
      String(
        row.subledger_type ||
          "",
      ) ===
        entry.requiredSubledger &&
      String(
        row.subledger_reference ||
          "",
      ).trim()
    ) {
      entry.subledger +=
        signed;
      entry.references.add(
        String(
          row.subledger_reference,
        ).trim(),
      );
    }

    byAccount.set(
      accountId,
      entry,
    );
  }

  return [
    ...byAccount.values(),
  ].map(
    entry => {
      const difference =
        entry.control -
        entry.subledger;

      return {
        accountId:
          entry.accountId,
        code:
          entry.code,
        name:
          entry.name,
        accountType:
          entry.accountType,
        requiredSubledger:
          entry.requiredSubledger,
        controlBalance:
          decimalAmount(
            entry.control,
          ),
        subledgerBalance:
          decimalAmount(
            entry.subledger,
          ),
        difference:
          decimalAmount(
            difference,
          ),
        counterparties:
          entry.references.size,
        complete:
          difference ===
          BigInt(
            0,
          ),
      };
    },
  );
}


async function validateBatch(
  client: PoolClient,
  companyId: string,
  userId: string,
  batchId: string,
): Promise<ValidatedBatch> {
  const batchResult =
    await client.query(
      `SELECT
         id::text,
         status
       FROM accounting_opening_balance_batches
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [
        companyId,
        batchId,
      ],
    );

  const batch =
    batchResult
      .rows[
        0
      ];

  if (
    !batch
  ) {
    throw new AccountingInputError(
      "This opening-balance batch could not be found.",
    );
  }

  if (
    batch.status ===
      "posted"
  ) {
    throw new AccountingInputError(
      "Posted opening balances are immutable.",
    );
  }

  if (
    batch.status ===
      "cancelled"
  ) {
    throw new AccountingInputError(
      "A cancelled opening-balance batch cannot be validated.",
    );
  }

  const accountsResult =
    await client.query(
      `SELECT
         id::text,
         code,
         name,
         account_type,
         is_active
       FROM accounts
       WHERE company_id=$1
         AND deleted_at IS NULL
       FOR SHARE`,
      [
        companyId,
      ],
    );

  const accounts =
    new Map<
      string,
      Record<
        string,
        unknown
      >
    >();

  for (
    const account
    of accountsResult.rows
  ) {
    accounts.set(
      String(
        account.code,
      )
        .trim()
        .toUpperCase(),
      account,
    );
  }

  const linesResult =
    await client.query(
      `SELECT
         id::text,
         row_number,
         source_row_key,
         account_code_input,
         description,
         raw_debit,
         raw_credit,
         subledger_type,
         subledger_reference,
         subledger_name
       FROM accounting_opening_balance_lines
       WHERE company_id=$1
         AND batch_id=$2
         AND deleted_at IS NULL
       ORDER BY row_number,id
       FOR UPDATE`,
      [
        companyId,
        batchId,
      ],
    );

  if (
    linesResult.rows.length <
      2
  ) {
    throw new AccountingInputError(
      "Opening balances need at least two rows.",
    );
  }

  const duplicateKeys =
    new Set<
      string
    >();
  const seenKeys =
    new Set<
      string
    >();

  for (
    const line
    of linesResult.rows
  ) {
    const key =
      String(
        line.source_row_key ||
          "",
      ).trim();

    if (
      key &&
      seenKeys.has(
        key,
      )
    ) {
      duplicateKeys.add(
        key,
      );
    }

    if (
      key
    ) {
      seenKeys.add(
        key,
      );
    }
  }

  let debitTotal =
    BigInt(
      0,
    );
  let creditTotal =
    BigInt(
      0,
    );
  let errorCount =
    0;
  let warningCount =
    0;

  const validatedRows:
    Array<
      Record<
        string,
        unknown
      >
    > =
    [];

  const postingLines:
    ValidatedBatch[
      "lines"
    ] =
    [];

  for (
    const line
    of linesResult.rows
  ) {
    const messages:
      string[] =
      [];

    const warnings:
      string[] =
      [];

    const code =
      String(
        line.account_code_input ||
          "",
      ).trim();

    const account =
      accounts.get(
        code.toUpperCase(),
      );

    if (
      !code
    ) {
      messages.push(
        "Account code is required.",
      );
    } else if (
      !account
    ) {
      messages.push(
        "Account code does not exist in this company.",
      );
    } else if (
      account.is_active !==
        true
    ) {
      messages.push(
        "Account is inactive.",
      );
    }

    let debit:
      bigint | null =
      null;
    let credit:
      bigint | null =
      null;

    try {
      debit =
        minorUnits(
          String(
            line.raw_debit ||
              "",
          ),
        );
    } catch {
      messages.push(
        "Debit must be a positive amount with at most two decimals.",
      );
    }

    try {
      credit =
        minorUnits(
          String(
            line.raw_credit ||
              "",
          ),
        );
    } catch {
      messages.push(
        "Credit must be a positive amount with at most two decimals.",
      );
    }

    if (
      debit !==
        null &&
      credit !==
        null
    ) {
      const hasDebit =
        debit >
        BigInt(
          0,
        );
      const hasCredit =
        credit >
        BigInt(
          0,
        );

      if (
        hasDebit ===
        hasCredit
      ) {
        messages.push(
          "Enter exactly one debit or one credit.",
        );
      }

      debitTotal +=
        debit;
      creditTotal +=
        credit;
    }

    const subledgerType =
      String(
        line.subledger_type ||
          "none",
      )
        .trim()
        .toLowerCase();

    if (
      !SUBLEDGER_TYPES.has(
        subledgerType,
      )
    ) {
      messages.push(
        "Subledger type is not supported.",
      );
    }

    const subledgerReference =
      String(
        line.subledger_reference ||
          "",
      ).trim();

    const accountType =
      account
        ? String(
            account.account_type ||
              "",
          )
        : "";

    if (
      accountType ===
        "asset_receivable" &&
      (
        subledgerType !==
          "customer" ||
        !subledgerReference
      )
    ) {
      messages.push(
        "Receivable opening balances need a customer subledger type and reference.",
      );
    }

    if (
      accountType ===
        "liability_payable" &&
      (
        subledgerType !==
          "vendor" ||
        !subledgerReference
      )
    ) {
      messages.push(
        "Payable opening balances need a vendor subledger type and reference.",
      );
    }

    if (
      (
        subledgerType ===
          "customer" &&
        accountType !==
          "asset_receivable"
      ) ||
      (
        subledgerType ===
          "vendor" &&
        accountType !==
          "liability_payable"
      )
    ) {
      warnings.push(
        "Customer/vendor tag is outside the standard receivable/payable control account.",
      );
    }

    const sourceRowKey =
      String(
        line.source_row_key ||
          "",
      ).trim();

    if (
      sourceRowKey &&
      duplicateKeys.has(
        sourceRowKey,
      )
    ) {
      messages.push(
        "Source row key is duplicated in this batch.",
      );
    }

    const status =
      messages.length
        ? "error"
        : warnings.length
          ? "warning"
          : "valid";

    if (
      status ===
        "error"
    ) {
      errorCount +=
        1;
    } else if (
      status ===
        "warning"
    ) {
      warningCount +=
        1;
    }

    const debitText =
      debit ===
        null
        ? null
        : decimalAmount(
            debit,
          );

    const creditText =
      credit ===
        null
        ? null
        : decimalAmount(
            credit,
          );

    await client.query(
      `UPDATE accounting_opening_balance_lines
       SET
         account_id=$4,
         debit=$5,
         credit=$6,
         validation_status=$7,
         validation_messages=$8::jsonb,
         updated_by=$9,
         updated_at=NOW()
       WHERE company_id=$1
         AND batch_id=$2
         AND id=$3`,
      [
        companyId,
        batchId,
        line.id,
        account
          ? account.id
          : null,
        debitText,
        creditText,
        status,
        JSON.stringify([
          ...messages,
          ...warnings,
        ]),
        userId,
      ],
    );

    const enriched = {
      ...line,
      account_id:
        account
          ? account.id
          : null,
      account_code:
        account
          ? account.code
          : null,
      account_name:
        account
          ? account.name
          : null,
      account_type:
        accountType,
      debit:
        debitText,
      credit:
        creditText,
      validation_status:
        status,
      validation_messages: [
        ...messages,
        ...warnings,
      ],
    };

    validatedRows.push(
      enriched,
    );

    if (
      status !==
        "error" &&
      account &&
      debitText !==
        null &&
      creditText !==
        null
    ) {
      postingLines.push({
        accountId:
          String(
            account.id,
          ),
        description:
          String(
            line.description ||
              "",
          ).trim(),
        debit:
          debitText,
        credit:
          creditText,
      });
    }
  }

  const difference =
    debitTotal -
    creditTotal;

  const batchErrors:
    string[] =
    [];

  if (
    debitTotal ===
      BigInt(
        0,
      )
  ) {
    batchErrors.push(
      "Opening-balance total cannot be zero.",
    );
  }

  if (
    difference !==
      BigInt(
        0,
      )
  ) {
    batchErrors.push(
      "Total debits and credits must balance before posting.",
    );
  }

  const reconciliation =
    reconciliationFromRows(
      validatedRows,
    );

  for (
    const item
    of reconciliation
  ) {
    if (
      !item.complete
    ) {
      batchErrors.push(
        item.code +
          " subledger detail does not reconcile to its control-account opening balance.",
      );
    }
  }

  const ready =
    errorCount ===
      0 &&
    batchErrors.length ===
      0 &&
    postingLines.length ===
      linesResult
        .rows
        .length;

  const summary = {
    lineCount:
      linesResult.rows
        .length,
    errorCount,
    warningCount,
    debitTotal:
      decimalAmount(
        debitTotal,
      ),
    creditTotal:
      decimalAmount(
        creditTotal,
      ),
    difference:
      centsDifference(
        debitTotal,
        creditTotal,
      ),
    batchErrors,
    reconciliation,
  };

  await client.query(
    `UPDATE accounting_opening_balance_batches
     SET
       status=$3,
       validation_summary=$4::jsonb,
       validated_at=$5,
       validated_by=$6,
       updated_by=$6,
       updated_at=NOW()
     WHERE company_id=$1
       AND id=$2
       AND deleted_at IS NULL`,
    [
      companyId,
      batchId,
      ready
        ? "validated"
        : "draft",
      JSON.stringify(
        summary,
      ),
      ready
        ? new Date()
        : null,
      userId,
    ],
  );

  return {
    batchId,
    ready,
    debitTotal:
      summary.debitTotal,
    creditTotal:
      summary.creditTotal,
    difference:
      summary.difference,
    lineCount:
      summary.lineCount,
    errorCount,
    warningCount,
    batchErrors,
    reconciliation,
    lines:
      postingLines,
  };
}


export async function getOpeningBalanceWorkspace(
  batchId?:
    string | null,
  linePageInput?:
    string | number | null,
): Promise<OpeningBalanceWorkspace> {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_opening_balance_batches",
      "view",
    );

  const selectedId =
    batchId
      ? accountingId(
          batchId,
        )
      : null;

  const parsedLinePage =
    Number(
      linePageInput ||
        1,
    );

  const linePage =
    Number.isInteger(
      parsedLinePage,
    ) &&
    parsedLinePage >
      0
      ? Math.min(
          parsedLinePage,
          100000,
        )
      : 1;

  const linePageSize =
    100;

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );

    const batches =
      await client.query(
        `SELECT
           b.id::text,
           b.name,
           b.as_of_date::text,
           b.source_type,
           b.status,
           b.import_key::text,
           b.validated_at::text,
           b.posted_at::text,
           b.posted_journal_id::text,
           b.created_at::text,
           COUNT(l.id)::int AS line_count,
           COUNT(l.id) FILTER (WHERE l.validation_status='valid')::int AS valid_count,
           COUNT(l.id) FILTER (WHERE l.validation_status='warning')::int AS warning_count,
           COUNT(l.id) FILTER (WHERE l.validation_status='error')::int AS error_count,
           COALESCE(SUM(l.debit),0)::text AS debit_total,
           COALESCE(SUM(l.credit),0)::text AS credit_total,
           (COALESCE(SUM(l.debit),0)-COALESCE(SUM(l.credit),0))::text AS difference
         FROM accounting_opening_balance_batches b
         LEFT JOIN accounting_opening_balance_lines l
           ON l.company_id=b.company_id
          AND l.batch_id=b.id
          AND l.deleted_at IS NULL
         WHERE b.company_id=$1
           AND b.deleted_at IS NULL
         GROUP BY b.id
         ORDER BY b.as_of_date DESC,b.created_at DESC,b.id DESC
         LIMIT 100`,
        [
          context.companyId,
        ],
      );

    const accounts =
      await client.query(
        `SELECT
           id::text,
           code,
           name,
           account_type,
           is_active
         FROM accounts
         WHERE company_id=$1
           AND deleted_at IS NULL
         ORDER BY sequence,code,name`,
        [
          context.companyId,
        ],
      );

    let selected:
      OpeningBalanceBatchDetail | null =
      null;

    if (
      selectedId
    ) {
      const header =
        await client.query(
          `SELECT
             b.id::text,
             b.name,
             b.as_of_date::text,
             b.source_type,
             b.status,
             b.import_key::text,
             b.validation_summary,
             b.validated_at::text,
             b.posted_at::text,
             b.posted_journal_id::text,
             b.created_at::text,
             COUNT(l.id)::int AS line_count,
             COUNT(l.id) FILTER (WHERE l.validation_status='valid')::int AS valid_count,
             COUNT(l.id) FILTER (WHERE l.validation_status='warning')::int AS warning_count,
             COUNT(l.id) FILTER (WHERE l.validation_status='error')::int AS error_count,
             COALESCE(SUM(l.debit),0)::text AS debit_total,
             COALESCE(SUM(l.credit),0)::text AS credit_total,
             (COALESCE(SUM(l.debit),0)-COALESCE(SUM(l.credit),0))::text AS difference
           FROM accounting_opening_balance_batches b
           LEFT JOIN accounting_opening_balance_lines l
             ON l.company_id=b.company_id
            AND l.batch_id=b.id
            AND l.deleted_at IS NULL
           WHERE b.company_id=$1
             AND b.id=$2
             AND b.deleted_at IS NULL
           GROUP BY b.id
           LIMIT 1`,
          [
            context.companyId,
            selectedId,
          ],
        );

      if (
        !header.rows[
          0
        ]
      ) {
        throw new AccountingInputError(
          "This opening-balance batch could not be found.",
        );
      }

      const lines =
        await client.query(
          `SELECT
             l.id::text,
             l.row_number,
             l.source_row_key,
             l.account_code_input,
             l.account_id::text,
             a.code AS account_code,
             a.name AS account_name,
             a.account_type,
             COALESCE(l.description,'') AS description,
             COALESCE(l.raw_debit,'') AS raw_debit,
             COALESCE(l.raw_credit,'') AS raw_credit,
             l.debit::text,
             l.credit::text,
             l.subledger_type,
             l.subledger_reference,
             l.subledger_name,
             l.validation_status,
             l.validation_messages
           FROM accounting_opening_balance_lines l
           LEFT JOIN accounts a
             ON a.company_id=l.company_id
            AND a.id=l.account_id
            AND a.deleted_at IS NULL
           WHERE l.company_id=$1
             AND l.batch_id=$2
             AND l.deleted_at IS NULL
           ORDER BY l.row_number,l.id
           LIMIT $3
           OFFSET $4`,
          [
            context.companyId,
            selectedId,
            linePageSize,
            (
              linePage -
              1
            ) *
              linePageSize,
          ],
        );

      const typedLines =
        lines.rows.map(
          (
            row,
          ): OpeningBalanceLine => ({
            ...row,
            row_number:
              Number(
                row.row_number,
              ),
            validation_messages:
              Array.isArray(
                row.validation_messages,
              )
                ? row.validation_messages.map(
                    String,
                  )
                : [],
          }),
        );

      const reconciliationRows =
        await client.query(
          `SELECT
             l.account_id::text,
             a.code AS account_code,
             a.name AS account_name,
             a.account_type,
             l.debit::text,
             l.credit::text,
             l.subledger_type,
             l.subledger_reference
           FROM accounting_opening_balance_lines l
           JOIN accounts a
             ON a.company_id=l.company_id
            AND a.id=l.account_id
            AND a.deleted_at IS NULL
           WHERE l.company_id=$1
             AND l.batch_id=$2
             AND l.deleted_at IS NULL`,
          [
            context.companyId,
            selectedId,
          ],
        );

      const reconciliation =
        reconciliationFromRows(
          reconciliationRows.rows,
        );

      selected = {
        ...header.rows[
          0
        ],
        validation_summary:
          header.rows[
            0
          ]
            .validation_summary &&
          typeof header.rows[
            0
          ]
            .validation_summary ===
            "object"
            ? header.rows[
                0
              ]
                .validation_summary
            : {},
        lines:
          typedLines,
        reconciliation,
        line_page:
          linePage,
        line_page_size:
          linePageSize,
        line_total_count:
          Number(
            header.rows[
              0
            ].line_count ||
              0,
          ),
      } as OpeningBalanceBatchDetail;
    }

    const counts =
      await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE status='draft')::int AS draft,
           COUNT(*) FILTER (WHERE status='validated')::int AS validated,
           COUNT(*) FILTER (WHERE status='posted')::int AS posted,
           COUNT(*) FILTER (WHERE status='cancelled')::int AS cancelled
         FROM accounting_opening_balance_batches
         WHERE company_id=$1
           AND deleted_at IS NULL`,
        [
          context.companyId,
        ],
      );

    await client.query(
      "COMMIT",
    );

    return {
      companyId:
        context.companyId,
      currency:
        context.company
          .currentCompany
          .currency,
      batches:
        batches.rows,
      selected,
      accounts:
        accounts.rows,
      counts: {
        draft:
          counts.rows[
            0
          ]?.draft ||
          0,
        validated:
          counts.rows[
            0
          ]?.validated ||
          0,
        posted:
          counts.rows[
            0
          ]?.posted ||
          0,
        cancelled:
          counts.rows[
            0
          ]?.cancelled ||
          0,
      },
    };
  } catch (
    error
  ) {
    await client.query(
      "ROLLBACK",
    );
    throw error;
  } finally {
    client.release();
  }
}


export async function createOpeningBalanceBatch(
  input: unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_opening_balance_batches",
      "create",
    );

  const body =
    requestBody(
      input,
    );

  assertCompany(
    body,
    context.companyId,
  );

  const name =
    requiredText(
      body.name,
      160,
      "Batch name",
    );

  const asOfDate =
    accountingDate(
      body.asOfDate,
    );

  const sourceType =
    typeof body.sourceType ===
      "string" &&
    SOURCE_TYPES.has(
      body.sourceType,
    )
      ? body.sourceType
      : "migration";

  const importKey =
    accountingId(
      body.importKey,
    );

  const rows =
    normalizeSourceRows(
      body,
    );

  const requestHash =
    hashRequest({
      name,
      asOfDate,
      sourceType,
      rows,
    });

  const client =
    await context.pool.connect();

  let createdId =
    "";

  try {
    await client.query(
      "BEGIN",
    );

    const existing =
      await client.query(
        `SELECT id::text,request_hash,status
         FROM accounting_opening_balance_batches
         WHERE company_id=$1
           AND import_key=$2
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [
          context.companyId,
          importKey,
        ],
      );

    if (
      existing.rows[
        0
      ]
    ) {
      if (
        String(
          existing.rows[
            0
          ].request_hash,
        ) !==
        requestHash
      ) {
        throw new AccountingInputError(
          "This import request key was already used for different opening-balance data.",
        );
      }

      await client.query(
        "COMMIT",
      );

      return {
        id:
          String(
            existing.rows[
              0
            ].id,
          ),
        status:
          String(
            existing.rows[
              0
            ].status,
          ),
        replayed:
          true,
      };
    }

    const created =
      await client.query(
        `INSERT INTO accounting_opening_balance_batches (
           company_id,
           name,
           as_of_date,
           source_type,
           status,
           import_key,
           request_hash,
           created_by,
           updated_by
         )
         VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$7)
         RETURNING id::text`,
        [
          context.companyId,
          name,
          asOfDate,
          sourceType,
          importKey,
          requestHash,
          context.userId,
        ],
      );

    createdId =
      String(
        created.rows[
          0
        ].id,
      );

    for (
      const [
        index,
        row,
      ]
      of rows.entries()
    ) {
      if (
        !SUBLEDGER_TYPES.has(
          row.subledgerType,
        )
      ) {
        row.subledgerType =
          "none";
      }

      await client.query(
        `INSERT INTO accounting_opening_balance_lines (
           company_id,
           batch_id,
           row_number,
           source_row_key,
           account_code_input,
           description,
           raw_debit,
           raw_credit,
           subledger_type,
           subledger_reference,
           subledger_name,
           validation_status,
           created_by,
           updated_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'unchecked',$12,$12)`,
        [
          context.companyId,
          createdId,
          index +
            1,
          row.sourceRowKey ||
            null,
          row.accountCode,
          row.description ||
            null,
          row.debit,
          row.credit,
          row.subledgerType,
          row.subledgerReference ||
            null,
          row.subledgerName ||
            null,
          context.userId,
        ],
      );
    }

    const validation =
      await validateBatch(
        client,
        context.companyId,
        context.userId,
        createdId,
      );

    await client.query(
      "COMMIT",
    );

    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        "accounting.opening_balance.imported",
      module:
        "accounting",
      resourceType:
        "accounting_opening_balance_batches",
      resourceId:
        createdId,
      summary:
        "Opening-balance migration batch imported and validated",
      result:
        "success",
      metadata: {
        sourceType,
        asOfDate,
        lineCount:
          validation.lineCount,
        errorCount:
          validation.errorCount,
        balanced:
          validation.difference ===
          "0.00",
      },
    }).catch(
      error =>
        console.error(
          "[Accounting] Opening-balance import audit delivery failed",
          error,
        ),
    );

    return {
      id:
        createdId,
      status:
        validation.ready
          ? "validated"
          : "draft",
      replayed:
        false,
      validation,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        "ROLLBACK",
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function updateOpeningBalanceLine(
  input: unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_opening_balance_lines",
      "edit",
    );

  const body =
    requestBody(
      input,
    );

  assertCompany(
    body,
    context.companyId,
  );

  const batchId =
    accountingId(
      body.batchId,
    );

  const lineId =
    accountingId(
      body.lineId,
    );

  const accountCode =
    requiredText(
      body.accountCode,
      50,
      "Account code",
    );

  const description =
    optionalText(
      body.description,
      500,
    );

  const debit =
    optionalText(
      body.debit,
      80,
    );

  const credit =
    optionalText(
      body.credit,
      80,
    );

  const subledgerType =
    optionalText(
      body.subledgerType,
      20,
    )
      .toLowerCase() ||
    "none";

  if (
    !SUBLEDGER_TYPES.has(
      subledgerType,
    )
  ) {
    throw new AccountingInputError(
      "Choose a supported subledger type.",
    );
  }

  const subledgerReference =
    optionalText(
      body.subledgerReference,
      160,
    );

  const subledgerName =
    optionalText(
      body.subledgerName,
      255,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    const batch =
      await client.query(
        `SELECT status
         FROM accounting_opening_balance_batches
         WHERE company_id=$1
           AND id=$2
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [
          context.companyId,
          batchId,
        ],
      );

    if (
      !batch.rows[
        0
      ]
    ) {
      throw new AccountingInputError(
        "This opening-balance batch could not be found.",
      );
    }

    if (
      ![
        "draft",
        "validated",
      ].includes(
        String(
          batch.rows[
            0
          ].status,
        ),
      )
    ) {
      throw new AccountingInputError(
        "Only draft or validated opening balances can be corrected.",
      );
    }

    const updated =
      await client.query(
        `UPDATE accounting_opening_balance_lines
         SET
           account_code_input=$4,
           description=$5,
           raw_debit=$6,
           raw_credit=$7,
           subledger_type=$8,
           subledger_reference=$9,
           subledger_name=$10,
           account_id=NULL,
           debit=NULL,
           credit=NULL,
           validation_status='unchecked',
           validation_messages='[]'::jsonb,
           updated_by=$11,
           updated_at=NOW()
         WHERE company_id=$1
           AND batch_id=$2
           AND id=$3
           AND deleted_at IS NULL
         RETURNING id::text`,
        [
          context.companyId,
          batchId,
          lineId,
          accountCode,
          description ||
            null,
          debit,
          credit,
          subledgerType,
          subledgerReference ||
            null,
          subledgerName ||
            null,
          context.userId,
        ],
      );

    if (
      !updated.rows[
        0
      ]
    ) {
      throw new AccountingInputError(
        "This opening-balance row could not be found.",
      );
    }

    await client.query(
      `UPDATE accounting_opening_balance_batches
       SET
         status='draft',
         validation_summary='{}'::jsonb,
         validated_at=NULL,
         validated_by=NULL,
         updated_by=$3,
         updated_at=NOW()
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL`,
      [
        context.companyId,
        batchId,
        context.userId,
      ],
    );

    await client.query(
      "COMMIT",
    );

    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        "accounting.opening_balance.line_corrected",
      module:
        "accounting",
      resourceType:
        "accounting_opening_balance_lines",
      resourceId:
        lineId,
      summary:
        "Opening-balance migration row corrected before posting",
      result:
        "success",
      metadata: {
        batchId,
        accountCode,
      },
    }).catch(
      error =>
        console.error(
          "[Accounting] Opening-balance row audit delivery failed",
          error,
        ),
    );

    return {
      id:
        lineId,
      batchId,
      status:
        "unchecked",
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        "ROLLBACK",
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function revalidateOpeningBalanceBatch(
  input: unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_opening_balance_batches",
      "edit",
    );

  const body =
    requestBody(
      input,
    );

  assertCompany(
    body,
    context.companyId,
  );

  const batchId =
    accountingId(
      body.batchId,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    const validation =
      await validateBatch(
        client,
        context.companyId,
        context.userId,
        batchId,
      );

    await client.query(
      "COMMIT",
    );

    return validation;
  } catch (
    error
  ) {
    try {
      await client.query(
        "ROLLBACK",
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function postOpeningBalanceBatch(
  input: unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_opening_balance_batches",
      "edit",
    );

  const body =
    requestBody(
      input,
    );

  assertCompany(
    body,
    context.companyId,
  );

  const batchId =
    accountingId(
      body.batchId,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    const batchResult =
      await client.query(
        `SELECT
           id::text,
           name,
           as_of_date::text,
           status,
           posted_journal_id::text
         FROM accounting_opening_balance_batches
         WHERE company_id=$1
           AND id=$2
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [
          context.companyId,
          batchId,
        ],
      );

    const batch =
      batchResult.rows[
        0
      ];

    if (
      !batch
    ) {
      throw new AccountingInputError(
        "This opening-balance batch could not be found.",
      );
    }

    if (
      batch.status ===
        "posted" &&
      batch.posted_journal_id
    ) {
      await client.query(
        "COMMIT",
      );

      return {
        journalId:
          String(
            batch.posted_journal_id,
          ),
        replayed:
          true,
      };
    }

    if (
      batch.status ===
        "cancelled"
    ) {
      throw new AccountingInputError(
        "A cancelled opening-balance batch cannot be posted.",
      );
    }

    const validation =
      await validateBatch(
        client,
        context.companyId,
        context.userId,
        batchId,
      );

    if (
      !validation.ready
    ) {
      throw new AccountingInputError(
        validation.batchErrors[
          0
        ] ||
          "Resolve all opening-balance validation errors before posting.",
      );
    }

    const result =
      await postBalancedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          journalDate:
            String(
              batch.as_of_date,
            ),
          description:
            "Opening balances · " +
            String(
              batch.name,
            ),
          reference:
            "Opening balance migration",
          sourceModule:
            "accounting",
          sourceType:
            "opening_balance_batch",
          sourceId:
            batchId,
          sourceEventKey:
            "accounting:opening-balance:" +
            batchId,
          postingKind:
            "opening",
          journalNumber:
            "OPEN-" +
            String(
              batch.as_of_date,
            ).replaceAll(
              "-",
              "",
            ) +
            "-" +
            batchId
              .slice(
                0,
                8,
              )
              .toUpperCase(),
          lines:
            validation.lines,
        },
      );

    await client.query(
      `UPDATE accounting_opening_balance_batches
       SET
         status='posted',
         posted_at=NOW(),
         posted_by=$3,
         posted_journal_id=$4,
         updated_by=$3,
         updated_at=NOW()
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL`,
      [
        context.companyId,
        batchId,
        context.userId,
        result.journalId,
      ],
    );

    await client.query(
      "COMMIT",
    );

    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        "accounting.opening_balance.posted",
      module:
        "accounting",
      resourceType:
        "accounting_opening_balance_batches",
      resourceId:
        batchId,
      summary:
        "Validated opening balances posted to the authoritative ledger",
      result:
        "success",
      metadata: {
        journalId:
          result.journalId,
        total:
          result.total,
        lineCount:
          validation.lineCount,
      },
    }).catch(
      error =>
        console.error(
          "[Accounting] Opening-balance posting audit delivery failed",
          error,
        ),
    );

    return {
      journalId:
        result.journalId,
      replayed:
        result.reused,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        "ROLLBACK",
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function cancelOpeningBalanceBatch(
  input: unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_opening_balance_batches",
      "edit",
    );

  const body =
    requestBody(
      input,
    );

  assertCompany(
    body,
    context.companyId,
  );

  const batchId =
    accountingId(
      body.batchId,
    );

  const result =
    await context.pool.query(
      `UPDATE accounting_opening_balance_batches
       SET
         status='cancelled',
         cancelled_at=NOW(),
         cancelled_by=$3,
         updated_by=$3,
         updated_at=NOW()
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL
         AND status IN ('draft','validated')
       RETURNING id::text`,
      [
        context.companyId,
        batchId,
        context.userId,
      ],
    );

  if (
    !result.rows[
      0
    ]
  ) {
    throw new AccountingInputError(
      "Only a draft or validated opening-balance batch can be cancelled.",
    );
  }

  await recordWorkspaceAuditEvent({
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    userId:
      context.userId,
    action:
      "accounting.opening_balance.cancelled",
    module:
      "accounting",
    resourceType:
      "accounting_opening_balance_batches",
    resourceId:
      batchId,
    summary:
      "Opening-balance migration batch cancelled",
    result:
      "success",
  }).catch(
    error =>
      console.error(
        "[Accounting] Opening-balance cancellation audit delivery failed",
        error,
      ),
  );

  return {
    id:
      batchId,
    status:
      "cancelled",
  };
}
