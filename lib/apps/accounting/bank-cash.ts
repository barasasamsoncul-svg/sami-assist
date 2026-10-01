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
  reversePostedLedgerJournal,
} from "./ledger-engine";
import {
  AccountingInputError,
  accountingDate,
  accountingId,
  decimalAmount,
  minorUnits,
} from "./validation";
import type {
  AccountingBankCashWorkspace,
  AccountingFinancialAccountType,
} from "./bank-cash-types";


function bodyOf(
  input:
    unknown,
) {
  if (
    !input ||
    typeof input !==
      "object" ||
    Array.isArray(
      input,
    )
  ) {
    throw new AccountingInputError(
      "Enter valid bank, cash or mobile-money data.",
    );
  }

  return input as Record<
    string,
    unknown
  >;
}


function shortText(
  value:
    unknown,
  max:
    number,
  label:
    string,
  required =
    false,
) {
  if (
    value != null &&
    typeof value !==
      "string"
  ) {
    throw new AccountingInputError(
      label +
      " must contain text.",
    );
  }

  const text =
    typeof value ===
      "string"
      ? value.trim()
      : "";

  if (
    required &&
    !text
  ) {
    throw new AccountingInputError(
      label +
      " is required.",
    );
  }

  if (
    text.length >
    max
  ) {
    throw new AccountingInputError(
      label +
      " must not exceed " +
      max +
      " characters.",
    );
  }

  return text;
}


function signedLedgerCents(
  value: unknown,
) {
  const raw = String(value ?? "0").trim();
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;

  if (!/^\d{1,18}(?:\.\d{1,8})?$/.test(unsigned)) {
    throw new AccountingInputError(
      "Financial-account balance is not a valid decimal value.",
    );
  }

  const [whole, fraction = ""] = unsigned.split(".");
  const padded = fraction.padEnd(3, "0");
  let amount =
    BigInt(whole || "0") * BigInt(100) +
    BigInt(padded.slice(0, 2) || "0");

  if (Number(padded[2] || "0") >= 5) {
    amount += BigInt(1);
  }

  return negative ? -amount : amount;
}


function financialAccountType(
  value:
    unknown,
): AccountingFinancialAccountType {
  const type =
    String(
      value ||
      "",
    )
      .trim()
      .toLowerCase();

  if (
    type !==
      "bank" &&
    type !==
      "cash" &&
    type !==
      "mobile_money"
  ) {
    throw new AccountingInputError(
      "Choose bank, cash or mobile money.",
    );
  }

  return type;
}


function booleanValue(
  value:
    unknown,
) {
  return (
    value ===
      true ||
    value ===
      "true" ||
    value ===
      "on" ||
    value ===
      1 ||
    value ===
      "1"
  );
}


function requestKey(
  value:
    unknown,
) {
  try {
    return accountingId(
      value,
    );
  } catch {
    throw new AccountingInputError(
      "A valid transfer request key is required.",
    );
  }
}


function requestHash(
  value:
    unknown,
) {
  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        value,
      ),
    )
    .digest(
      "hex",
    );
}


function pageValue(
  value:
    unknown,
) {
  const page =
    Number(
      value ||
      1,
    );

  return (
    Number.isInteger(
      page,
    ) &&
    page >
      0
  )
    ? Math.min(
        page,
        100000,
      )
    : 1;
}


function lastFour(
  masked:
    string,
) {
  const digits =
    masked.replace(
      /\D/g,
      "",
    );

  return digits.length >=
    4
    ? digits.slice(
        -4,
      )
    : null;
}


async function ledgerAccount(
  client:
    PoolClient,
  companyId:
    string,
  accountId:
    string,
) {
  const result =
    await client.query(
      `SELECT
         id::text,
         code,
         name,
         account_type,
         is_active
       FROM accounts
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL
       LIMIT 1`,
      [
        companyId,
        accountId,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row ||
    !row.is_active
  ) {
    throw new AccountingInputError(
      "Choose an active ledger account from this company.",
    );
  }

  return row;
}


function assertLedgerMatchesType(
  type:
    AccountingFinancialAccountType,
  account:
    Record<
      string,
      unknown
    >,
) {
  const ledgerType =
    String(
      account.account_type ||
      "",
    );

  if (
    type ===
      "cash" &&
    ledgerType !==
      "asset_cash" &&
    !ledgerType.startsWith(
      "asset_cash",
    )
  ) {
    throw new AccountingInputError(
      "Cash tills must use a cash-type asset account.",
    );
  }

  if (
    type ===
      "bank" &&
    ledgerType !==
      "asset_bank" &&
    !ledgerType.startsWith(
      "asset_bank",
    )
  ) {
    throw new AccountingInputError(
      "Bank accounts must use a bank-type asset account.",
    );
  }

  if (
    type ===
      "mobile_money" &&
    ledgerType !==
      "asset_cash" &&
    !ledgerType.startsWith(
      "asset_cash",
    ) &&
    ledgerType !==
      "asset_bank" &&
    !ledgerType.startsWith(
      "asset_bank",
    )
  ) {
    throw new AccountingInputError(
      "Mobile-money wallets must use a cash or bank asset account.",
    );
  }
}


async function financialAccountForUpdate(
  client:
    PoolClient,
  companyId:
    string,
  id:
    string,
) {
  const result =
    await client.query(
      `SELECT
         b.id::text,
         b.name,
         b.account_type,
         b.ledger_account_id::text,
         b.currency,
         b.allow_overdraft,
         b.overdraft_limit::text,
         b.status,
         COALESCE(v.book_balance,0)::text AS book_balance
       FROM accounting_bank_accounts b
       LEFT JOIN accounting_financial_account_balances v
         ON v.company_id=b.company_id
        AND v.bank_account_id=b.id
       WHERE b.company_id=$1
         AND b.id=$2
         AND b.deleted_at IS NULL
       LIMIT 1
       FOR UPDATE OF b`,
      [
        companyId,
        id,
      ],
    );

  const row =
    result.rows[0];

  if (!row) {
    throw new AccountingInputError(
      "Financial account not found.",
    );
  }

  return row;
}


async function nextTransferNumber(
  client:
    PoolClient,
  companyId:
    string,
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    [
      companyId +
      ":accounting_internal_transfers",
    ],
  );

  const result =
    await client.query(
      `SELECT COALESCE(
         MAX(
           NULLIF(
             regexp_replace(transfer_number,'\\D','','g'),
             ''
           )::bigint
         ),
         0
       ) + 1 AS next_number
       FROM accounting_internal_transfers
       WHERE company_id=$1`,
      [
        companyId,
      ],
    );

  return (
    "TRF-" +
    String(
      result.rows[0]
        ?.next_number ||
      1,
    )
      .padStart(
        6,
        "0",
      )
  );
}


export async function getAccountingBankCash(
  input: {
    page?:
      unknown;
  } = {},
): Promise<
  AccountingBankCashWorkspace
> {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_bank_accounts",
      "report",
    );

  const page =
    pageValue(
      input.page,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );

    const [
      accounts,
      transfers,
      ledgerAccounts,
      metrics,
    ] =
      await Promise.all([
        client.query(
          `SELECT
             b.id::text,
             b.ledger_account_id::text,
             a.code AS ledger_code,
             a.name AS ledger_name,
             b.name,
             b.account_type,
             COALESCE(b.institution_name,b.bank_name) AS institution_name,
             b.branch_name,
             b.account_holder_name,
             COALESCE(
               b.account_reference_masked,
               CASE
                 WHEN b.account_number_last4 IS NOT NULL
                   THEN '••••' || b.account_number_last4
                 ELSE NULL
               END
             ) AS account_reference_masked,
             b.mobile_money_provider,
             b.currency,
             b.allow_overdraft,
             b.overdraft_limit::text,
             b.status,
             COALESCE(v.book_balance,0)::text AS book_balance,
             COALESCE(v.foreign_balance,0)::text AS foreign_balance,
             (
               SELECT COUNT(*)::int
               FROM accounting_bank_statement_lines s
               WHERE s.company_id=b.company_id
                 AND s.bank_account_id=b.id
                 AND s.deleted_at IS NULL
                 AND s.reconciliation_status IN ('unmatched','suggested')
             ) AS unreconciled_count
           FROM accounting_bank_accounts b
           LEFT JOIN accounts a
             ON a.company_id=b.company_id
            AND a.id=b.ledger_account_id
            AND a.deleted_at IS NULL
           LEFT JOIN accounting_financial_account_balances v
             ON v.company_id=b.company_id
            AND v.bank_account_id=b.id
           WHERE b.company_id=$1
             AND b.deleted_at IS NULL
           ORDER BY
             CASE b.status
               WHEN 'active' THEN 0
               WHEN 'inactive' THEN 1
               ELSE 2
             END,
             b.account_type,
             b.name,
             b.id`,
          [
            context.companyId,
          ],
        ),

        client.query(
          `SELECT
             t.id::text,
             t.transfer_number,
             t.transfer_date::text,
             t.source_bank_account_id::text,
             s.name AS source_name,
             t.destination_bank_account_id::text,
             d.name AS destination_name,
             t.currency,
             t.amount::text,
             t.reference,
             t.notes,
             t.status,
             t.posted_journal_id::text,
             t.reversal_journal_id::text
           FROM accounting_internal_transfers t
           JOIN accounting_bank_accounts s
             ON s.company_id=t.company_id
            AND s.id=t.source_bank_account_id
            AND s.deleted_at IS NULL
           JOIN accounting_bank_accounts d
             ON d.company_id=t.company_id
            AND d.id=t.destination_bank_account_id
            AND d.deleted_at IS NULL
           WHERE t.company_id=$1
             AND t.deleted_at IS NULL
           ORDER BY t.transfer_date DESC,t.created_at DESC,t.id DESC
           LIMIT 50 OFFSET $2`,
          [
            context.companyId,
            (
              page -
              1
            ) *
              50,
          ],
        ),

        client.query(
          `SELECT
             id::text,
             code,
             name,
             account_type
           FROM accounts
           WHERE company_id=$1
             AND deleted_at IS NULL
             AND is_active=TRUE
             AND (
               account_type='asset_cash'
               OR account_type LIKE 'asset_cash%'
               OR account_type='asset_bank'
               OR account_type LIKE 'asset_bank%'
             )
           ORDER BY code,name`,
          [
            context.companyId,
          ],
        ),

        client.query(
          `SELECT
             COALESCE(
               SUM(v.book_balance) FILTER (
                 WHERE b.account_type='bank'
                   AND b.status='active'
               ),
               0
             )::text AS bank_balance,
             COALESCE(
               SUM(v.book_balance) FILTER (
                 WHERE b.account_type='cash'
                   AND b.status='active'
               ),
               0
             )::text AS cash_balance,
             COALESCE(
               SUM(v.book_balance) FILTER (
                 WHERE b.account_type='mobile_money'
                   AND b.status='active'
               ),
               0
             )::text AS mobile_money_balance,
             COUNT(*) FILTER (
               WHERE b.status='active'
             )::int AS active_accounts,
             COALESCE(
               SUM(
                 (
                   SELECT COUNT(*)
                   FROM accounting_bank_statement_lines s
                   WHERE s.company_id=b.company_id
                     AND s.bank_account_id=b.id
                     AND s.deleted_at IS NULL
                     AND s.reconciliation_status IN ('unmatched','suggested')
                 )
               ),
               0
             )::int AS unreconciled_lines
           FROM accounting_bank_accounts b
           LEFT JOIN accounting_financial_account_balances v
             ON v.company_id=b.company_id
            AND v.bank_account_id=b.id
           WHERE b.company_id=$1
             AND b.deleted_at IS NULL`,
          [
            context.companyId,
          ],
        ),
      ]);

    await client.query(
      "COMMIT",
    );

    const m =
      metrics.rows[0] ||
      {};

    return {
      companyId:
        context.companyId,
      currency:
        context.company
          .currentCompany
          .currency,
      accounts:
        accounts.rows as AccountingBankCashWorkspace["accounts"],
      transfers:
        transfers.rows as AccountingBankCashWorkspace["transfers"],
      ledgerAccounts:
        ledgerAccounts.rows as AccountingBankCashWorkspace["ledgerAccounts"],
      metrics: {
        bankBalance:
          String(
            m.bank_balance ||
            "0.00",
          ),
        cashBalance:
          String(
            m.cash_balance ||
            "0.00",
          ),
        mobileMoneyBalance:
          String(
            m.mobile_money_balance ||
            "0.00",
          ),
        activeAccounts:
          Number(
            m.active_accounts ||
            0,
          ),
        unreconciledLines:
          Number(
            m.unreconciled_lines ||
            0,
          ),
      },
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


export async function createFinancialAccount(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_bank_accounts",
      "create",
    );

  const body =
    bodyOf(
      input,
    );

  const type =
    financialAccountType(
      body.accountType,
    );

  const name =
    shortText(
      body.name,
      160,
      "Account name",
      true,
    );

  const ledgerAccountId =
    accountingId(
      body.ledgerAccountId,
    );

  const institutionName =
    shortText(
      body.institutionName,
      160,
      "Institution",
    ) ||
    null;

  const branchName =
    shortText(
      body.branchName,
      160,
      "Branch",
    ) ||
    null;

  const accountHolderName =
    shortText(
      body.accountHolderName,
      200,
      "Account holder",
    ) ||
    null;

  const maskedReference =
    shortText(
      body.accountReferenceMasked,
      80,
      "Masked account reference",
    ) ||
    null;

  const mobileMoneyProvider =
    shortText(
      body.mobileMoneyProvider,
      80,
      "Mobile-money provider",
    ) ||
    null;

  const currency =
    shortText(
      body.currency,
      3,
      "Currency",
      true,
    )
      .toUpperCase();

  const allowOverdraft =
    booleanValue(
      body.allowOverdraft,
    );

  const overdraftLimit =
    minorUnits(
      body.overdraftLimit ||
      "0",
    );

  const companyCurrency =
    String(context.company.currentCompany.currency).toUpperCase();

  if (currency !== companyCurrency) {
    const enabledCurrency = await context.pool.query(
      `SELECT 1 FROM accounting_fx_currencies
       WHERE company_id=$1 AND code=$2 AND is_active=TRUE
       LIMIT 1`,
      [context.companyId,currency],
    );
    if (!enabledCurrency.rows[0]) {
      throw new AccountingInputError(
        "Enable this currency in Accounting → Foreign Currency before creating a foreign financial account.",
      );
    }
  }

  if (
    !allowOverdraft &&
    overdraftLimit >
      BigInt(0)
  ) {
    throw new AccountingInputError(
      "Enable overdraft before setting an overdraft limit.",
    );
  }

  if (
    type ===
      "bank" &&
    !institutionName
  ) {
    throw new AccountingInputError(
      "Bank accounts require an institution name.",
    );
  }

  if (
    type ===
      "mobile_money" &&
    !mobileMoneyProvider
  ) {
    throw new AccountingInputError(
      "Mobile-money wallets require a provider.",
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    const account =
      await ledgerAccount(
        client,
        context.companyId,
        ledgerAccountId,
      );

    assertLedgerMatchesType(
      type,
      account,
    );

    const duplicate =
      await client.query(
        `SELECT id
         FROM accounting_bank_accounts
         WHERE company_id=$1
           AND ledger_account_id=$2
           AND deleted_at IS NULL
           AND status <> 'closed'
         LIMIT 1
         FOR SHARE`,
        [
          context.companyId,
          ledgerAccountId,
        ],
      );

    if (
      duplicate.rows[0]
    ) {
      throw new AccountingInputError(
        "This ledger account is already linked to an active financial account.",
      );
    }

    const result =
      await client.query(
        `INSERT INTO accounting_bank_accounts (
           company_id,
           ledger_account_id,
           name,
           bank_name,
           account_number_last4,
           currency,
           opening_balance,
           status,
           account_type,
           institution_name,
           branch_name,
           account_holder_name,
           account_reference_masked,
           mobile_money_provider,
           country_code,
           allow_overdraft,
           overdraft_limit,
           created_by,
           updated_by
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,0,'active',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16
         )
         RETURNING id::text`,
        [
          context.companyId,
          ledgerAccountId,
          name,
          institutionName,
          maskedReference
            ? lastFour(
                maskedReference,
              )
            : null,
          currency,
          type,
          institutionName,
          branchName,
          accountHolderName,
          maskedReference,
          mobileMoneyProvider,
          shortText(
            body.countryCode,
            3,
            "Country code",
          )
            .toUpperCase() ||
            null,
          allowOverdraft,
          decimalAmount(
            overdraftLimit,
          ),
          context.userId,
        ],
      );

    await client.query(
      "COMMIT",
    );

    const id =
      String(
        result.rows[0].id,
      );

    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        "accounting.financial_account.created",
      module:
        "accounting",
      resourceType:
        "accounting_bank_accounts",
      resourceId:
        id,
      summary:
        "Bank, cash or mobile-money financial account created",
      result:
        "success",
      metadata: {
        accountType:
          type,
        ledgerAccountId,
      },
    }).catch(
      error =>
        console.error(
          "[Accounting] Financial account audit delivery failed",
          error,
        ),
    );

    return {
      id,
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


export async function updateFinancialAccount(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_bank_accounts",
      "edit",
    );

  const body =
    bodyOf(
      input,
    );

  const id =
    accountingId(
      body.id,
    );

  const name =
    shortText(
      body.name,
      160,
      "Account name",
      true,
    );

  const institutionName =
    shortText(
      body.institutionName,
      160,
      "Institution",
    ) ||
    null;

  const branchName =
    shortText(
      body.branchName,
      160,
      "Branch",
    ) ||
    null;

  const accountHolderName =
    shortText(
      body.accountHolderName,
      200,
      "Account holder",
    ) ||
    null;

  const maskedReference =
    shortText(
      body.accountReferenceMasked,
      80,
      "Masked account reference",
    ) ||
    null;

  const mobileMoneyProvider =
    shortText(
      body.mobileMoneyProvider,
      80,
      "Mobile-money provider",
    ) ||
    null;

  const allowOverdraft =
    booleanValue(
      body.allowOverdraft,
    );

  const overdraftLimit =
    minorUnits(
      body.overdraftLimit ||
      "0",
    );

  if (
    !allowOverdraft &&
    overdraftLimit >
      BigInt(0)
  ) {
    throw new AccountingInputError(
      "Enable overdraft before setting an overdraft limit.",
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    const existing =
      await financialAccountForUpdate(
        client,
        context.companyId,
        id,
      );

    const type =
      financialAccountType(
        existing.account_type,
      );

    if (
      type ===
        "bank" &&
      !institutionName
    ) {
      throw new AccountingInputError(
        "Bank accounts require an institution name.",
      );
    }

    if (
      type ===
        "mobile_money" &&
      !mobileMoneyProvider
    ) {
      throw new AccountingInputError(
        "Mobile-money wallets require a provider.",
      );
    }

    await client.query(
      `UPDATE accounting_bank_accounts
       SET
         name=$3,
         bank_name=$4,
         account_number_last4=$5,
         institution_name=$4,
         branch_name=$6,
         account_holder_name=$7,
         account_reference_masked=$8,
         mobile_money_provider=$9,
         allow_overdraft=$10,
         overdraft_limit=$11,
         updated_by=$12,
         updated_at=NOW()
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL`,
      [
        context.companyId,
        id,
        name,
        institutionName,
        maskedReference
          ? lastFour(
              maskedReference,
            )
          : null,
        branchName,
        accountHolderName,
        maskedReference,
        mobileMoneyProvider,
        allowOverdraft,
        decimalAmount(
          overdraftLimit,
        ),
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
        "accounting.financial_account.updated",
      module:
        "accounting",
      resourceType:
        "accounting_bank_accounts",
      resourceId:
        id,
      summary:
        "Financial account details updated",
      result:
        "success",
    }).catch(
      error =>
        console.error(
          "[Accounting] Financial account update audit delivery failed",
          error,
        ),
    );

    return {
      id,
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


export async function changeFinancialAccountStatus(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_bank_accounts",
      "edit",
    );

  const body =
    bodyOf(
      input,
    );

  const id =
    accountingId(
      body.id,
    );

  const status =
    String(
      body.status ||
      "",
    )
      .trim();

  if (
    status !==
      "active" &&
    status !==
      "inactive" &&
    status !==
      "closed"
  ) {
    throw new AccountingInputError(
      "Choose active, inactive or closed.",
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    const account =
      await financialAccountForUpdate(
        client,
        context.companyId,
        id,
      );

    if (
      status ===
        "closed"
    ) {
      if (
        signedLedgerCents(
          account.book_balance,
        ) !==
        BigInt(0)
      ) {
        throw new AccountingInputError(
          "Bring the linked ledger account to zero before closing this financial account.",
        );
      }

      const unresolved =
        await client.query(
          `SELECT 1
           FROM accounting_bank_statement_lines
           WHERE company_id=$1
             AND bank_account_id=$2
             AND deleted_at IS NULL
             AND reconciliation_status IN ('unmatched','suggested')
           LIMIT 1`,
          [
            context.companyId,
            id,
          ],
        );

      if (
        unresolved.rows[0]
      ) {
        throw new AccountingInputError(
          "Resolve or exclude outstanding statement lines before closing this account.",
        );
      }
    }

    await client.query(
      `UPDATE accounting_bank_accounts
       SET
         status=$3,
         updated_by=$4,
         updated_at=NOW()
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL`,
      [
        context.companyId,
        id,
        status,
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
        "accounting.financial_account.status_changed",
      module:
        "accounting",
      resourceType:
        "accounting_bank_accounts",
      resourceId:
        id,
      summary:
        "Financial account status changed to " +
        status,
      result:
        "success",
      metadata: {
        previousStatus:
          account.status,
        status,
      },
    }).catch(
      error =>
        console.error(
          "[Accounting] Financial account status audit delivery failed",
          error,
        ),
    );

    return {
      id,
      status,
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


export async function createInternalTransfer(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_internal_transfers",
      "edit",
    );

  const body =
    bodyOf(
      input,
    );

  const key =
    requestKey(
      body.requestKey,
    );

  const transferDate =
    accountingDate(
      body.transferDate,
    );

  const sourceId =
    accountingId(
      body.sourceAccountId,
    );

  const destinationId =
    accountingId(
      body.destinationAccountId,
    );

  if (
    sourceId ===
    destinationId
  ) {
    throw new AccountingInputError(
      "Choose two different financial accounts.",
    );
  }

  const amount =
    minorUnits(
      body.amount,
    );

  if (
    amount <=
    BigInt(0)
  ) {
    throw new AccountingInputError(
      "Transfer amount must be greater than zero.",
    );
  }

  const reference =
    shortText(
      body.reference,
      255,
      "Reference",
    ) ||
    null;

  const notes =
    shortText(
      body.notes,
      2000,
      "Notes",
    ) ||
    null;

  const hash =
    requestHash({
      transferDate,
      sourceId,
      destinationId,
      amount:
        decimalAmount(
          amount,
        ),
      reference,
      notes,
    });

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [
        "accounting:internal-transfer:" +
        key,
      ],
    );

    const replay =
      await client.query(
        `SELECT
           id::text,
           transfer_number,
           request_hash,
           posted_journal_id::text
         FROM accounting_internal_transfers
         WHERE company_id=$1
           AND request_key=$2
           AND deleted_at IS NULL
         LIMIT 1`,
        [
          context.companyId,
          key,
        ],
      );

    if (
      replay.rows[0]
    ) {
      if (
        String(
          replay.rows[0]
            .request_hash,
        ) !==
        hash
      ) {
        throw new AccountingInputError(
          "This transfer request key was already used with different content.",
        );
      }

      await client.query(
        "COMMIT",
      );

      return {
        id:
          String(
            replay.rows[0].id,
          ),
        transferNumber:
          String(
            replay.rows[0]
              .transfer_number,
          ),
        journalId:
          String(
            replay.rows[0]
              .posted_journal_id,
          ),
        replayed:
          true,
      };
    }

    for (const lockId of [sourceId,destinationId].sort()) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        ["accounting:financial-account:" + lockId],
      );
    }

    const [
      source,
      destination,
    ] =
      await Promise.all([
        financialAccountForUpdate(
          client,
          context.companyId,
          sourceId,
        ),
        financialAccountForUpdate(
          client,
          context.companyId,
          destinationId,
        ),
      ]);

    if (
      source.status !==
        "active" ||
      destination.status !==
        "active"
    ) {
      throw new AccountingInputError(
        "Internal transfers require two active financial accounts.",
      );
    }

    if (
      !source.ledger_account_id ||
      !destination.ledger_account_id
    ) {
      throw new AccountingInputError(
        "Both financial accounts must be linked to ledger accounts.",
      );
    }

    const companyCurrency =
      String(
        context.company
          .currentCompany
          .currency,
      )
        .toUpperCase();

    if (
      String(
        source.currency,
      )
        .toUpperCase() !==
        companyCurrency ||
      String(
        destination.currency,
      )
        .toUpperCase() !==
        companyCurrency
    ) {
      throw new AccountingInputError(
        "Cross-currency internal transfers will be enabled with foreign-currency accounting.",
      );
    }

    const sourceBalance =
      signedLedgerCents(
        source.book_balance,
      );

    const resultingBalance =
      sourceBalance -
      amount;

    const allowedNegative =
      source.allow_overdraft
        ? minorUnits(
            source.overdraft_limit ||
            "0",
          )
        : BigInt(0);

    if (
      resultingBalance <
      -allowedNegative
    ) {
      throw new AccountingInputError(
        "This transfer exceeds the available balance and configured overdraft limit.",
      );
    }

    const number =
      await nextTransferNumber(
        client,
        context.companyId,
      );

    const journal =
      await postBalancedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          journalDate:
            transferDate,
          description:
            "Internal transfer · " +
            number,
          reference:
            reference ||
            number,
          sourceModule:
            "accounting",
          sourceType:
            "internal_transfer",
          sourceId:
            key,
          sourceEventKey:
            "accounting:internal-transfer:" +
            key,
          postingKind:
            "system",
          lines: [
            {
              accountId:
                String(
                  destination.ledger_account_id,
                ),
              description:
                "Transfer from " +
                String(
                  source.name,
                ),
              debit:
                decimalAmount(
                  amount,
                ),
              credit:
                "0.00",
            },
            {
              accountId:
                String(
                  source.ledger_account_id,
                ),
              description:
                "Transfer to " +
                String(
                  destination.name,
                ),
              debit:
                "0.00",
              credit:
                decimalAmount(
                  amount,
                ),
            },
          ],
        },
      );

    const inserted =
      await client.query(
        `INSERT INTO accounting_internal_transfers (
           company_id,
           transfer_number,
           request_key,
           request_hash,
           transfer_date,
           source_bank_account_id,
           destination_bank_account_id,
           currency,
           amount,
           reference,
           notes,
           status,
           posted_journal_id,
           posted_by,
           created_by,
           updated_by
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'posted',$12,$13,$13,$13
         )
         RETURNING id::text`,
        [
          context.companyId,
          number,
          key,
          hash,
          transferDate,
          sourceId,
          destinationId,
          companyCurrency,
          decimalAmount(
            amount,
          ),
          reference,
          notes,
          journal.journalId,
          context.userId,
        ],
      );

    await client.query(
      "COMMIT",
    );

    const id =
      String(
        inserted.rows[0].id,
      );

    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        "accounting.internal_transfer.posted",
      module:
        "accounting",
      resourceType:
        "accounting_internal_transfers",
      resourceId:
        id,
      summary:
        "Internal bank, cash or mobile-money transfer posted",
      result:
        "success",
      metadata: {
        transferNumber:
          number,
        sourceAccountId:
          sourceId,
        destinationAccountId:
          destinationId,
        amount:
          decimalAmount(
            amount,
          ),
        journalId:
          journal.journalId,
      },
    }).catch(
      error =>
        console.error(
          "[Accounting] Internal transfer audit delivery failed",
          error,
        ),
    );

    return {
      id,
      transferNumber:
        number,
      journalId:
        journal.journalId,
      replayed:
        journal.reused,
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


export async function reverseInternalTransfer(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_internal_transfers",
      "edit",
    );

  const body =
    bodyOf(
      input,
    );

  const id =
    accountingId(
      body.id,
    );

  const reversalDate =
    accountingDate(
      body.reversalDate,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    const result =
      await client.query(
        `SELECT
           id::text,
           transfer_number,
           status,
           posted_journal_id::text,
           reversal_journal_id::text
         FROM accounting_internal_transfers
         WHERE company_id=$1
           AND id=$2
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [
          context.companyId,
          id,
        ],
      );

    const transfer =
      result.rows[0];

    if (
      !transfer ||
      !transfer.posted_journal_id
    ) {
      throw new AccountingInputError(
        "Only a posted internal transfer can be reversed.",
      );
    }

    if (
      transfer.reversal_journal_id
    ) {
      await client.query(
        "COMMIT",
      );

      return {
        journalId:
          String(
            transfer.reversal_journal_id,
          ),
        replayed:
          true,
      };
    }

    const reversal =
      await reversePostedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          originalJournalId:
            String(
              transfer.posted_journal_id,
            ),
          journalDate:
            reversalDate,
          description:
            "Reverse internal transfer · " +
            String(
              transfer.transfer_number,
            ),
          sourceModule:
            "accounting",
          sourceType:
            "internal_transfer_reversal",
          sourceId:
            id,
          sourceEventKey:
            "accounting:internal-transfer:" +
            id +
            ":reverse",
        },
      );

    await client.query(
      `UPDATE accounting_internal_transfers
       SET
         status='reversed',
         reversal_journal_id=$3,
         reversed_by=$4,
         reversed_at=NOW(),
         updated_by=$4,
         updated_at=NOW()
       WHERE company_id=$1
         AND id=$2`,
      [
        context.companyId,
        id,
        reversal.journalId,
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
        "accounting.internal_transfer.reversed",
      module:
        "accounting",
      resourceType:
        "accounting_internal_transfers",
      resourceId:
        id,
      summary:
        "Internal transfer reversed with a compensating journal",
      result:
        "success",
      metadata: {
        reversalJournalId:
          reversal.journalId,
      },
    }).catch(
      error =>
        console.error(
          "[Accounting] Internal transfer reversal audit delivery failed",
          error,
        ),
    );

    return {
      journalId:
        reversal.journalId,
      replayed:
        reversal.reused,
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
