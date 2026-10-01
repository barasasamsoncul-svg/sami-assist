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
  AccountingExpenseSettlementMode,
  AccountingExpensesWorkspace,
} from "./expenses-types";


function bodyOf(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountingInputError("Enter valid expense-accounting data.");
  }
  return input as Record<string, unknown>;
}


function text(
  value: unknown,
  max: number,
  label: string,
  required = false,
) {
  if (value != null && typeof value !== "string") {
    throw new AccountingInputError(label + " must contain text.");
  }

  const result =
    typeof value === "string"
      ? value.trim()
      : "";

  if (required && !result) {
    throw new AccountingInputError(label + " is required.");
  }

  if (result.length > max) {
    throw new AccountingInputError(
      label + " must not exceed " + max + " characters.",
    );
  }

  return result;
}


function optionalId(value: unknown) {
  return value
    ? accountingId(value)
    : null;
}


function requestKey(value: unknown) {
  try {
    return accountingId(value);
  } catch {
    throw new AccountingInputError(
      "A valid reimbursement request key is required.",
    );
  }
}


function requestHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}


function ledgerCents(value: unknown) {
  const raw = String(value ?? "0").trim();
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;

  if (!/^\d{1,18}(?:\.\d{1,8})?$/.test(unsigned)) {
    throw new AccountingInputError("Expense amount is not a valid decimal value.");
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


function percentage(value: unknown) {
  const raw = String(value ?? "0").trim();

  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(raw)) {
    throw new AccountingInputError(
      "Recoverable tax percentage must be from 0 to 100.",
    );
  }

  const numeric = Number(raw);

  if (numeric < 0 || numeric > 100) {
    throw new AccountingInputError(
      "Recoverable tax percentage must be from 0 to 100.",
    );
  }

  return numeric.toFixed(2);
}


function settlementMode(
  value: unknown,
): AccountingExpenseSettlementMode {
  const mode =
    String(value || "")
      .trim();

  if (
    mode !== "employee_reimbursement" &&
    mode !== "company_paid" &&
    mode !== "corporate_card"
  ) {
    throw new AccountingInputError(
      "Choose employee reimbursement, company paid or corporate card.",
    );
  }

  return mode;
}


async function expensesTablesAvailable(
  client: PoolClient,
) {
  const result = await client.query(
    `SELECT
       to_regclass('public.expense_categories') AS categories,
       to_regclass('public.expenses') AS expenses,
       to_regclass('public.expense_reports') AS reports,
       to_regclass('public.expense_report_lines') AS lines`,
  );

  const row = result.rows[0] || {};

  return Boolean(
    row.categories &&
    row.expenses &&
    row.reports &&
    row.lines,
  );
}


async function assertExpensesAvailable(
  client: PoolClient,
) {
  if (!(await expensesTablesAvailable(client))) {
    throw new AccountingInputError(
      "Install and initialize the Expenses app before using Accounting expense mappings, posting or reimbursements.",
    );
  }
}


function pageValue(value: unknown) {
  const page = Number(value || 1);

  return Number.isInteger(page) && page > 0
    ? Math.min(page, 100000)
    : 1;
}


async function activeAccount(
  client: PoolClient,
  companyId: string,
  accountId: string,
) {
  const result =
    await client.query(
      `SELECT
         id::text,
         code,
         name,
         account_type,
         system_role,
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

  if (!row || !row.is_active) {
    throw new AccountingInputError(
      "Choose an active account from this company.",
    );
  }

  return row;
}


function assertExpenseAccount(
  account: Record<string, unknown>,
) {
  const type =
    String(
      account.account_type ||
      "",
    );

  if (
    type !== "expense" &&
    !type.startsWith("expense_")
  ) {
    throw new AccountingInputError(
      "Expense-category mappings must use an expense account.",
    );
  }
}


function assertLiabilityAccount(
  account: Record<string, unknown>,
  label: string,
) {
  const type =
    String(
      account.account_type ||
      "",
    );

  if (
    type !== "liability" &&
    !type.startsWith("liability_")
  ) {
    throw new AccountingInputError(
      label + " must use a liability account.",
    );
  }
}


function assertCashAccount(
  account: Record<string, unknown>,
) {
  const type =
    String(
      account.account_type ||
      "",
    );

  if (
    type !== "asset_cash" &&
    !type.startsWith("asset_bank") &&
    !type.startsWith("asset_cash")
  ) {
    throw new AccountingInputError(
      "Reimbursement payments must use an active cash or bank account.",
    );
  }
}


export async function getAccountingExpenses(
  input: {
    page?: unknown;
  } = {},
): Promise<AccountingExpensesWorkspace> {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_expense_report_postings",
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

    const dependencyAvailable =
      await expensesTablesAvailable(
        client,
      );

    if (!dependencyAvailable) {
      const [setupOnly, accountsOnly] =
        await Promise.all([
          client.query(
            `SELECT
               default_expense_account_id::text,
               employee_expense_payable_account_id::text,
               corporate_card_clearing_account_id::text
             FROM accounting_settings
             WHERE company_id=$1
               AND deleted_at IS NULL
             LIMIT 1`,
            [context.companyId],
          ),
          client.query(
            `SELECT
               id::text,
               code,
               name,
               account_type,
               system_role
             FROM accounts
             WHERE company_id=$1
               AND deleted_at IS NULL
               AND is_active=TRUE
             ORDER BY code,name`,
            [context.companyId],
          ),
        ]);

      await client.query("COMMIT");

      const setupRow = setupOnly.rows[0] || {};

      return {
        companyId: context.companyId,
        expensesAvailable: false,
        currency: context.company.currentCompany.currency,
        reports: [],
        lines: [],
        categories: [],
        mappings: [],
        reimbursements: [],
        accounts: accountsOnly.rows as AccountingExpensesWorkspace["accounts"],
        setup: {
          defaultExpenseAccountId:
            setupRow.default_expense_account_id
              ? String(setupRow.default_expense_account_id)
              : null,
          employeeExpensePayableAccountId:
            setupRow.employee_expense_payable_account_id
              ? String(setupRow.employee_expense_payable_account_id)
              : null,
          corporateCardClearingAccountId:
            setupRow.corporate_card_clearing_account_id
              ? String(setupRow.corporate_card_clearing_account_id)
              : null,
        },
        metrics: {
          approvedUnposted: 0,
          postedOutstanding: "0.00",
          reimbursedThisMonth: "0.00",
          policyExceptions: 0,
          missingReceipts: 0,
        },
      };
    }

    const [
      setup,
      categories,
      mappings,
      reports,
      accounts,
      reimbursements,
      metrics,
    ] =
      await Promise.all([
        client.query(
          `SELECT
             default_expense_account_id::text,
             employee_expense_payable_account_id::text,
             corporate_card_clearing_account_id::text
           FROM accounting_settings
           WHERE company_id=$1
             AND deleted_at IS NULL
           LIMIT 1`,
          [
            context.companyId,
          ],
        ),

        client.query(
          `SELECT
             id::text,
             name,
             description
           FROM expense_categories
           WHERE company_id=$1
             AND deleted_at IS NULL
           ORDER BY name,id`,
          [
            context.companyId,
          ],
        ),

        client.query(
          `SELECT
             m.id::text,
             m.category_id::text,
             c.name AS category_name,
             m.expense_account_id::text,
             a.code AS expense_account_code,
             a.name AS expense_account_name,
             m.input_tax_account_id::text,
             m.recoverable_tax_percent::text,
             m.active
           FROM accounting_expense_category_mappings m
           JOIN expense_categories c
             ON c.id=m.category_id
            AND c.company_id=m.company_id
            AND c.deleted_at IS NULL
           JOIN accounts a
             ON a.id=m.expense_account_id
            AND a.company_id=m.company_id
            AND a.deleted_at IS NULL
           WHERE m.company_id=$1
             AND m.deleted_at IS NULL
           ORDER BY c.name,m.id`,
          [
            context.companyId,
          ],
        ),

        client.query(
          `SELECT
             r.id::text,
             r.report_number,
             r.employee_reference::text,
             r.period_start::text,
             r.period_end::text,
             r.total_amount::text,
             r.status,
             r.approved_at::text,
             p.settlement_mode,
             p.posted_journal_id::text,
             p.gross_base_amount::text,
             COALESCE(b.reimbursed_amount,0)::text AS reimbursed_amount,
             COALESCE(b.outstanding_amount,0)::text AS outstanding_amount,
             COUNT(l.id)::int AS line_count,
             COUNT(l.id) FILTER (
               WHERE l.policy_exception=TRUE
             )::int AS exception_count,
             COUNT(l.id) FILTER (
               WHERE l.receipt_file_id IS NULL
             )::int AS missing_receipt_count,
             CASE
               WHEN p.id IS NULL THEN 'unposted'
               WHEN p.status='reversed' THEN 'reversed'
               WHEN p.settlement_mode <> 'employee_reimbursement' THEN 'settled'
               WHEN COALESCE(b.outstanding_amount,0) <= 0 THEN 'reimbursed'
               WHEN COALESCE(b.reimbursed_amount,0) > 0 THEN 'partially_reimbursed'
               ELSE 'outstanding'
             END AS reimbursement_status
           FROM expense_reports r
           LEFT JOIN expense_report_lines l
             ON l.company_id=r.company_id
            AND l.report_id=r.id
            AND l.deleted_at IS NULL
           LEFT JOIN accounting_expense_report_postings p
             ON p.company_id=r.company_id
            AND p.expense_report_id=r.id
            AND p.deleted_at IS NULL
           LEFT JOIN accounting_expense_reimbursement_balances b
             ON b.company_id=r.company_id
            AND b.expense_report_id=r.id
           WHERE r.company_id=$1
             AND r.deleted_at IS NULL
           GROUP BY
             r.id,
             r.report_number,
             r.employee_reference,
             r.period_start,
             r.period_end,
             r.total_amount,
             r.status,
             r.approved_at,
             p.id,
             p.settlement_mode,
             p.status,
             p.posted_journal_id,
             p.gross_base_amount,
             b.reimbursed_amount,
             b.outstanding_amount
           ORDER BY
             CASE r.status
               WHEN 'approved' THEN 0
               WHEN 'submitted' THEN 1
               WHEN 'draft' THEN 2
               ELSE 3
             END,
             r.approved_at DESC NULLS LAST,
             r.created_at DESC,
             r.id DESC
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
             account_type,
             system_role
           FROM accounts
           WHERE company_id=$1
             AND deleted_at IS NULL
             AND is_active=TRUE
           ORDER BY code,name`,
          [
            context.companyId,
          ],
        ),

        client.query(
          `SELECT
             r.id::text,
             r.expense_report_id::text,
             er.report_number,
             r.payment_date::text,
             r.payment_account_id::text,
             a.code AS payment_account_code,
             a.name AS payment_account_name,
             r.amount::text,
             r.status,
             r.posted_journal_id::text,
             r.reversal_journal_id::text,
             r.notes
           FROM accounting_expense_reimbursements r
           JOIN expense_reports er
             ON er.company_id=r.company_id
            AND er.id=r.expense_report_id
            AND er.deleted_at IS NULL
           JOIN accounts a
             ON a.company_id=r.company_id
            AND a.id=r.payment_account_id
            AND a.deleted_at IS NULL
           WHERE r.company_id=$1
             AND r.deleted_at IS NULL
           ORDER BY r.payment_date DESC,r.created_at DESC,r.id DESC
           LIMIT 100`,
          [
            context.companyId,
          ],
        ),

        client.query(
          `SELECT
             (
               SELECT COUNT(*)::int
               FROM expense_reports r
               LEFT JOIN accounting_expense_report_postings p
                 ON p.company_id=r.company_id
                AND p.expense_report_id=r.id
                AND p.deleted_at IS NULL
               WHERE r.company_id=$1
                 AND r.deleted_at IS NULL
                 AND r.status='approved'
                 AND p.id IS NULL
             ) AS approved_unposted,
             COALESCE(
               (
                 SELECT SUM(outstanding_amount)
                 FROM accounting_expense_reimbursement_balances
                 WHERE company_id=$1
               ),
               0
             )::text AS posted_outstanding,
             COALESCE(
               (
                 SELECT SUM(amount)
                 FROM accounting_expense_reimbursements
                 WHERE company_id=$1
                   AND deleted_at IS NULL
                   AND status='posted'
                   AND payment_date >= DATE_TRUNC('month',CURRENT_DATE)::date
               ),
               0
             )::text AS reimbursed_this_month,
             (
               SELECT COUNT(*)::int
               FROM expense_report_lines l
               JOIN expense_reports r
                 ON r.company_id=l.company_id
                AND r.id=l.report_id
                AND r.deleted_at IS NULL
               WHERE l.company_id=$1
                 AND l.deleted_at IS NULL
                 AND r.status IN ('submitted','approved')
                 AND l.policy_exception=TRUE
             ) AS policy_exceptions,
             (
               SELECT COUNT(*)::int
               FROM expense_report_lines l
               JOIN expense_reports r
                 ON r.company_id=l.company_id
                AND r.id=l.report_id
                AND r.deleted_at IS NULL
               WHERE l.company_id=$1
                 AND l.deleted_at IS NULL
                 AND r.status IN ('submitted','approved')
                 AND l.receipt_file_id IS NULL
             ) AS missing_receipts`,
          [
            context.companyId,
          ],
        ),
      ]);

    const reportIds =
      reports.rows.map(
        row =>
          String(
            row.id,
          ),
      );

    const lines =
      reportIds.length
        ? await client.query(
            `SELECT
               l.id::text,
               l.report_id::text AS expense_report_id,
               l.expense_date::text,
               l.category_id::text,
               c.name AS category_name,
               l.description,
               l.amount::text,
               l.currency,
               l.merchant,
               l.receipt_file_id::text,
               l.policy_exception
             FROM expense_report_lines l
             LEFT JOIN expense_categories c
               ON c.id=l.category_id
              AND c.company_id=l.company_id
              AND c.deleted_at IS NULL
             WHERE l.company_id=$1
               AND l.report_id=ANY($2::uuid[])
               AND l.deleted_at IS NULL
             ORDER BY l.report_id,l.expense_date,l.created_at,l.id`,
            [
              context.companyId,
              reportIds,
            ],
          )
        : {
            rows: [],
          };

    await client.query(
      "COMMIT",
    );

    const s =
      setup.rows[0] ||
      {};

    const m =
      metrics.rows[0] ||
      {};

    return {
      companyId:
        context.companyId,
      expensesAvailable:
        true,
      currency:
        context.company
          .currentCompany
          .currency,
      reports:
        reports.rows as AccountingExpensesWorkspace["reports"],
      lines:
        lines.rows as AccountingExpensesWorkspace["lines"],
      categories:
        categories.rows as AccountingExpensesWorkspace["categories"],
      mappings:
        mappings.rows as AccountingExpensesWorkspace["mappings"],
      reimbursements:
        reimbursements.rows as AccountingExpensesWorkspace["reimbursements"],
      accounts:
        accounts.rows as AccountingExpensesWorkspace["accounts"],
      setup: {
        defaultExpenseAccountId:
          s.default_expense_account_id
            ? String(
                s.default_expense_account_id,
              )
            : null,
        employeeExpensePayableAccountId:
          s.employee_expense_payable_account_id
            ? String(
                s.employee_expense_payable_account_id,
              )
            : null,
        corporateCardClearingAccountId:
          s.corporate_card_clearing_account_id
            ? String(
                s.corporate_card_clearing_account_id,
              )
            : null,
      },
      metrics: {
        approvedUnposted:
          Number(
            m.approved_unposted ||
              0,
          ),
        postedOutstanding:
          String(
            m.posted_outstanding ||
              "0.00",
          ),
        reimbursedThisMonth:
          String(
            m.reimbursed_this_month ||
              "0.00",
          ),
        policyExceptions:
          Number(
            m.policy_exceptions ||
              0,
          ),
        missingReceipts:
          Number(
            m.missing_receipts ||
              0,
          ),
      },
    };
  } catch (error) {
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


export async function saveExpenseAccountingSettings(
  input: unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_settings",
      "settings",
    );

  const body =
    bodyOf(
      input,
    );

  const defaultExpenseAccountId =
    accountingId(
      body.defaultExpenseAccountId,
    );

  const employeeExpensePayableAccountId =
    accountingId(
      body.employeeExpensePayableAccountId,
    );

  const corporateCardClearingAccountId =
    accountingId(
      body.corporateCardClearingAccountId,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    const defaultExpense =
      await activeAccount(
        client,
        context.companyId,
        defaultExpenseAccountId,
      );

    assertExpenseAccount(
      defaultExpense,
    );

    const employeePayable =
      await activeAccount(
        client,
        context.companyId,
        employeeExpensePayableAccountId,
      );

    assertLiabilityAccount(
      employeePayable,
      "Employee expense payable",
    );

    const cardClearing =
      await activeAccount(
        client,
        context.companyId,
        corporateCardClearingAccountId,
      );

    assertLiabilityAccount(
      cardClearing,
      "Corporate-card clearing",
    );

    const result =
      await client.query(
        `UPDATE accounting_settings
         SET
           default_expense_account_id=$2,
           employee_expense_payable_account_id=$3,
           corporate_card_clearing_account_id=$4,
           updated_by=$5,
           updated_at=NOW()
         WHERE company_id=$1
           AND deleted_at IS NULL
         RETURNING company_id::text`,
        [
          context.companyId,
          defaultExpenseAccountId,
          employeeExpensePayableAccountId,
          corporateCardClearingAccountId,
          context.userId,
        ],
      );

    if (!result.rows[0]) {
      throw new AccountingInputError(
        "Complete Accounting Setup before configuring expense posting.",
      );
    }

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
        "accounting.expenses.settings_updated",
      module:
        "accounting",
      resourceType:
        "accounting_settings",
      resourceId:
        context.companyId,
      summary:
        "Expense accounting control accounts updated",
      result:
        "success",
    }).catch(
      error =>
        console.error(
          "[Accounting] Expense settings audit delivery failed",
          error,
        ),
    );

    return {
      companyId:
        context.companyId,
    };
  } catch (error) {
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


export async function saveExpenseCategoryMapping(
  input: unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_expense_category_mappings",
      "edit",
    );

  const body =
    bodyOf(
      input,
    );

  const categoryId =
    accountingId(
      body.categoryId,
    );

  const expenseAccountId =
    accountingId(
      body.expenseAccountId,
    );

  const inputTaxAccountId =
    optionalId(
      body.inputTaxAccountId,
    );

  const recoverableTaxPercent =
    percentage(
      body.recoverableTaxPercent,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    await assertExpensesAvailable(
      client,
    );

    const category =
      await client.query(
        `SELECT id::text,name
         FROM expense_categories
         WHERE company_id=$1
           AND id=$2
           AND deleted_at IS NULL
         LIMIT 1`,
        [
          context.companyId,
          categoryId,
        ],
      );

    if (!category.rows[0]) {
      throw new AccountingInputError(
        "Choose an expense category from this company.",
      );
    }

    const expenseAccount =
      await activeAccount(
        client,
        context.companyId,
        expenseAccountId,
      );

    assertExpenseAccount(
      expenseAccount,
    );

    if (inputTaxAccountId) {
      await activeAccount(
        client,
        context.companyId,
        inputTaxAccountId,
      );
    }

    const result =
      await client.query(
        `INSERT INTO accounting_expense_category_mappings (
           company_id,
           category_id,
           expense_account_id,
           input_tax_account_id,
           recoverable_tax_percent,
           active,
           created_by,
           updated_by
         )
         VALUES (
           $1,$2,$3,$4,$5,TRUE,$6,$6
         )
         ON CONFLICT (
           company_id,
           category_id
         )
         WHERE deleted_at IS NULL
         DO UPDATE
         SET
           expense_account_id=EXCLUDED.expense_account_id,
           input_tax_account_id=EXCLUDED.input_tax_account_id,
           recoverable_tax_percent=EXCLUDED.recoverable_tax_percent,
           active=TRUE,
           updated_by=EXCLUDED.updated_by,
           updated_at=NOW()
         RETURNING id::text`,
        [
          context.companyId,
          categoryId,
          expenseAccountId,
          inputTaxAccountId,
          recoverableTaxPercent,
          context.userId,
        ],
      );

    await client.query(
      "COMMIT",
    );

    const mappingId =
      String(
        result.rows[0].id,
      );

    await recordWorkspaceAuditEvent({
      tenantId: context.tenantId,
      companyId: context.companyId,
      userId: context.userId,
      action: "accounting.expenses.category_mapping_saved",
      module: "accounting",
      resourceType: "accounting_expense_category_mappings",
      resourceId: mappingId,
      summary: "Expense category ledger mapping saved",
      result: "success",
      metadata: {
        categoryId,
        expenseAccountId,
        inputTaxAccountId,
        recoverableTaxPercent,
      },
    }).catch(error =>
      console.error(
        "[Accounting] Expense category mapping audit delivery failed",
        error,
      ),
    );

    return {
      id: mappingId,
    };
  } catch (error) {
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


async function reportLinesForPosting(
  client: PoolClient,
  companyId: string,
  reportId: string,
) {
  return client.query(
    `SELECT
       l.id::text,
       l.expense_date::text,
       l.category_id::text,
       c.name AS category_name,
       l.description,
       l.amount::text,
       l.currency,
       l.policy_exception,
       l.receipt_file_id::text,
       m.expense_account_id::text AS mapped_expense_account_id,
       m.input_tax_account_id::text AS mapped_input_tax_account_id,
       m.recoverable_tax_percent::text
     FROM expense_report_lines l
     LEFT JOIN expense_categories c
       ON c.id=l.category_id
      AND c.company_id=l.company_id
      AND c.deleted_at IS NULL
     LEFT JOIN accounting_expense_category_mappings m
       ON m.company_id=l.company_id
      AND m.category_id=l.category_id
      AND m.deleted_at IS NULL
      AND m.active=TRUE
     WHERE l.company_id=$1
       AND l.report_id=$2
       AND l.deleted_at IS NULL
     ORDER BY l.expense_date,l.created_at,l.id
     FOR SHARE OF l`,
    [
      companyId,
      reportId,
    ],
  );
}


export async function postExpenseReport(
  input: unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_expense_report_postings",
      "edit",
    );

  const body =
    bodyOf(
      input,
    );

  const reportId =
    accountingId(
      body.reportId,
    );

  const mode =
    settlementMode(
      body.settlementMode,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    await assertExpensesAvailable(
      client,
    );

    const existing =
      await client.query(
        `SELECT
           id::text,
           status,
           posted_journal_id::text
         FROM accounting_expense_report_postings
         WHERE company_id=$1
           AND expense_report_id=$2
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [
          context.companyId,
          reportId,
        ],
      );

    if (existing.rows[0]) {
      if (
        String(
          existing.rows[0].status,
        ) ===
          "posted"
      ) {
        await client.query(
          "COMMIT",
        );

        return {
          journalId:
            String(
              existing.rows[0]
                .posted_journal_id,
            ),
          replayed:
            true,
        };
      }

      throw new AccountingInputError(
        "A reversed expense posting cannot be reused. Correct the claim through a new expense report.",
      );
    }

    const reportResult =
      await client.query(
        `SELECT
           id::text,
           report_number,
           employee_reference::text,
           period_start::text,
           period_end::text,
           total_amount::text,
           status,
           approved_at::text
         FROM expense_reports
         WHERE company_id=$1
           AND id=$2
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [
          context.companyId,
          reportId,
        ],
      );

    const report =
      reportResult.rows[0];

    if (!report) {
      throw new AccountingInputError(
        "Expense report not found.",
      );
    }

    if (
      String(
        report.status,
      ) !==
        "approved"
    ) {
      throw new AccountingInputError(
        "Approve this expense report in Expenses before posting it to Accounting.",
      );
    }

    const settingsResult =
      await client.query(
        `SELECT
           default_expense_account_id::text,
           employee_expense_payable_account_id::text,
           corporate_card_clearing_account_id::text
         FROM accounting_settings
         WHERE company_id=$1
           AND deleted_at IS NULL
         LIMIT 1
         FOR SHARE`,
        [
          context.companyId,
        ],
      );

    const settings =
      settingsResult.rows[0];

    if (
      !settings ||
      !settings.default_expense_account_id ||
      !settings.employee_expense_payable_account_id ||
      !settings.corporate_card_clearing_account_id
    ) {
      throw new AccountingInputError(
        "Configure expense control accounts before posting expense reports.",
      );
    }

    const linesResult =
      await reportLinesForPosting(
        client,
        context.companyId,
        reportId,
      );

    if (!linesResult.rows.length) {
      throw new AccountingInputError(
        "This expense report has no lines to post.",
      );
    }

    const baseCurrency =
      String(
        context.company
          .currentCompany
          .currency,
      )
        .toUpperCase();

    for (
      const line
      of linesResult.rows
    ) {
      if (
        String(
          line.currency ||
          "",
        )
          .toUpperCase() !==
        baseCurrency
      ) {
        throw new AccountingInputError(
          "Foreign-currency expense lines require the Accounting foreign-currency workflow before posting.",
        );
      }
    }

    const gross =
      linesResult.rows.reduce(
        (
          sum,
          line,
        ) =>
          sum +
          ledgerCents(
            line.amount,
          ),
        BigInt(0),
      );

    if (
      gross !==
      ledgerCents(
        report.total_amount,
      )
    ) {
      throw new AccountingInputError(
        "Expense report total does not match its current lines. Recalculate the report in Expenses before posting.",
      );
    }

    let settlementAccountId:
      string;

    if (
      mode ===
        "employee_reimbursement"
    ) {
      settlementAccountId =
        String(
          settings.employee_expense_payable_account_id,
        );

      const account =
        await activeAccount(
          client,
          context.companyId,
          settlementAccountId,
        );

      assertLiabilityAccount(
        account,
        "Employee expense payable",
      );
    } else if (
      mode ===
        "corporate_card"
    ) {
      settlementAccountId =
        String(
          settings.corporate_card_clearing_account_id,
        );

      const account =
        await activeAccount(
          client,
          context.companyId,
          settlementAccountId,
        );

      assertLiabilityAccount(
        account,
        "Corporate-card clearing",
      );
    } else {
      settlementAccountId =
        accountingId(
          body.paymentAccountId,
        );

      const account =
        await activeAccount(
          client,
          context.companyId,
          settlementAccountId,
        );

      assertCashAccount(
        account,
      );
    }

    const defaultExpenseAccountId =
      String(
        settings.default_expense_account_id,
      );

    const defaultExpense =
      await activeAccount(
        client,
        context.companyId,
        defaultExpenseAccountId,
      );

    assertExpenseAccount(
      defaultExpense,
    );

    const linePostings:
      Array<{
        expenseLineId: string;
        categoryId: string | null;
        expenseAccountId: string;
        inputTaxAccountId: string | null;
        gross: bigint;
        expense: bigint;
        tax: bigint;
        description: string;
      }> =
      [];

    const expenseByAccount =
      new Map<
        string,
        {
          amount: bigint;
          description: string;
        }
      >();

    for (
      const line
      of linesResult.rows
    ) {
      const amount =
        minorUnits(
          line.amount,
        );

      const expenseAccountId =
        line.mapped_expense_account_id
          ? String(
              line.mapped_expense_account_id,
            )
          : defaultExpenseAccountId;

      const account =
        await activeAccount(
          client,
          context.companyId,
          expenseAccountId,
        );

      assertExpenseAccount(
        account,
      );

      /*
       * Expense operational lines do not yet carry a separately calculated
       * recoverable-tax amount. Tax splitting therefore remains zero until
       * the shared Tax-engine roadmap item supplies authoritative tax detail.
       * The category mapping already retains the future input-tax account.
       */
      const tax =
        BigInt(0);

      const expense =
        amount -
        tax;

      linePostings.push({
        expenseLineId:
          String(
            line.id,
          ),
        categoryId:
          line.category_id
            ? String(
                line.category_id,
              )
            : null,
        expenseAccountId,
        inputTaxAccountId:
          line.mapped_input_tax_account_id
            ? String(
                line.mapped_input_tax_account_id,
              )
            : null,
        gross:
          amount,
        expense,
        tax,
        description:
          String(
            line.description ||
            report.report_number,
          ),
      });

      const current =
        expenseByAccount.get(
          expenseAccountId,
        );

      expenseByAccount.set(
        expenseAccountId,
        {
          amount:
            (
              current
                ?.amount ||
              BigInt(0)
            ) +
            expense,
          description:
            current
              ?.description ||
            String(
              line.category_name ||
              "Expense",
            ),
        },
      );
    }

    const postingDate =
      accountingDate(
        body.postingDate ||
          report.period_end ||
          linesResult.rows[
            linesResult.rows.length -
              1
          ].expense_date,
      );

    const debitLines =
      Array.from(
        expenseByAccount.entries(),
      ).map(
        (
          [
            accountId,
            value,
          ],
        ) => ({
          accountId,
          description:
            value.description,
          debit:
            decimalAmount(
              value.amount,
            ),
          credit:
            "0.00",
        }),
      );

    const posting =
      await postBalancedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          journalDate:
            postingDate,
          description:
            "Expense report · " +
            String(
              report.report_number,
            ),
          reference:
            String(
              report.report_number,
            ),
          sourceModule:
            "accounting",
          sourceType:
            "expense_report",
          sourceId:
            reportId,
          sourceEventKey:
            "accounting:expense-report:" +
            reportId,
          postingKind:
            "system",
          lines: [
            ...debitLines,
            {
              accountId:
                settlementAccountId,
              description:
                String(
                  report.report_number,
                ),
              debit:
                "0.00",
              credit:
                decimalAmount(
                  gross,
                ),
            },
          ],
        },
      );

    const inserted =
      await client.query(
        `INSERT INTO accounting_expense_report_postings (
           company_id,
           expense_report_id,
           employee_reference,
           settlement_mode,
           settlement_account_id,
           base_currency,
           gross_base_amount,
           net_expense_base_amount,
           recoverable_tax_base_amount,
           status,
           posting_date,
           posted_journal_id,
           posted_by,
           created_by,
           updated_by
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,$7,$7,0,'posted',$8,$9,$10,$10,$10
         )
         RETURNING id::text`,
        [
          context.companyId,
          reportId,
          report.employee_reference ||
            null,
          mode,
          settlementAccountId,
          baseCurrency,
          decimalAmount(
            gross,
          ),
          postingDate,
          posting.journalId,
          context.userId,
        ],
      );

    const postingId =
      String(
        inserted.rows[0].id,
      );

    for (
      const line
      of linePostings
    ) {
      await client.query(
        `INSERT INTO accounting_expense_line_postings (
           company_id,
           report_posting_id,
           expense_report_line_id,
           category_id,
           expense_account_id,
           input_tax_account_id,
           gross_base_amount,
           expense_base_amount,
           recoverable_tax_base_amount,
           created_by,
           updated_by
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10
         )`,
        [
          context.companyId,
          postingId,
          line.expenseLineId,
          line.categoryId,
          line.expenseAccountId,
          line.inputTaxAccountId,
          decimalAmount(
            line.gross,
          ),
          decimalAmount(
            line.expense,
          ),
          decimalAmount(
            line.tax,
          ),
          context.userId,
        ],
      );
    }

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
        "accounting.expenses.report_posted",
      module:
        "accounting",
      resourceType:
        "accounting_expense_report_postings",
      resourceId:
        postingId,
      summary:
        "Approved expense report posted to the authoritative ledger",
      result:
        "success",
      metadata: {
        expenseReportId:
          reportId,
        journalId:
          posting.journalId,
        settlementMode:
          mode,
        amount:
          decimalAmount(
            gross,
          ),
      },
    }).catch(
      error =>
        console.error(
          "[Accounting] Expense posting audit delivery failed",
          error,
        ),
    );

    return {
      id:
        postingId,
      journalId:
        posting.journalId,
      replayed:
        posting.reused,
    };
  } catch (error) {
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


export async function reverseExpenseReportPosting(
  input: unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_expense_report_postings",
      "edit",
    );

  const body =
    bodyOf(
      input,
    );

  const reportId =
    accountingId(
      body.reportId,
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

    await assertExpensesAvailable(
      client,
    );

    const result =
      await client.query(
        `SELECT
           id::text,
           status,
           posted_journal_id::text,
           reversal_journal_id::text
         FROM accounting_expense_report_postings
         WHERE company_id=$1
           AND expense_report_id=$2
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [
          context.companyId,
          reportId,
        ],
      );

    const posting =
      result.rows[0];

    if (
      !posting ||
      !posting.posted_journal_id
    ) {
      throw new AccountingInputError(
        "Only a posted expense report can be reversed.",
      );
    }

    if (
      posting.reversal_journal_id
    ) {
      await client.query(
        "COMMIT",
      );

      return {
        journalId:
          String(
            posting.reversal_journal_id,
          ),
        replayed:
          true,
      };
    }

    const reimbursement =
      await client.query(
        `SELECT 1
         FROM accounting_expense_reimbursements
         WHERE company_id=$1
           AND report_posting_id=$2
           AND deleted_at IS NULL
           AND status='posted'
         LIMIT 1`,
        [
          context.companyId,
          posting.id,
        ],
      );

    if (
      reimbursement.rows[0]
    ) {
      throw new AccountingInputError(
        "Reverse posted reimbursements before reversing this expense report.",
      );
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
              posting.posted_journal_id,
            ),
          journalDate:
            reversalDate,
          description:
            "Reverse expense report",
          sourceModule:
            "accounting",
          sourceType:
            "expense_report_reversal",
          sourceId:
            reportId,
          sourceEventKey:
            "accounting:expense-report:" +
            reportId +
            ":reverse",
        },
      );

    await client.query(
      `UPDATE accounting_expense_report_postings
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
        posting.id,
        reversal.journalId,
        context.userId,
      ],
    );

    await client.query(
      "COMMIT",
    );

    await recordWorkspaceAuditEvent({
      tenantId: context.tenantId,
      companyId: context.companyId,
      userId: context.userId,
      action: "accounting.expenses.report_reversed",
      module: "accounting",
      resourceType: "accounting_expense_report_postings",
      resourceId: String(posting.id),
      summary: "Expense report ledger posting reversed",
      result: "success",
      metadata: {
        expenseReportId: reportId,
        reversalJournalId: reversal.journalId,
      },
    }).catch(error =>
      console.error(
        "[Accounting] Expense posting reversal audit delivery failed",
        error,
      ),
    );

    return {
      journalId:
        reversal.journalId,
      replayed:
        reversal.reused,
    };
  } catch (error) {
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


export async function reimburseExpenseReport(
  input: unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_expense_reimbursements",
      "edit",
    );

  const body =
    bodyOf(
      input,
    );

  const reportId =
    accountingId(
      body.reportId,
    );

  const key =
    requestKey(
      body.requestKey,
    );

  const paymentDate =
    accountingDate(
      body.paymentDate,
    );

  const paymentAccountId =
    accountingId(
      body.paymentAccountId,
    );

  const amount =
    minorUnits(
      body.amount,
    );

  if (
    amount <=
    BigInt(0)
  ) {
    throw new AccountingInputError(
      "Reimbursement amount must be greater than zero.",
    );
  }

  const notes =
    text(
      body.notes,
      2000,
      "Notes",
    ) ||
    null;

  const hash =
    requestHash({
      reportId,
      paymentDate,
      paymentAccountId,
      amount:
        decimalAmount(
          amount,
        ),
      notes,
    });

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    await assertExpensesAvailable(
      client,
    );

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [
        "accounting:expense-reimbursement:" +
        key,
      ],
    );

    const replay =
      await client.query(
        `SELECT
           id::text,
           request_hash,
           posted_journal_id::text
         FROM accounting_expense_reimbursements
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
          "This reimbursement request key was already used with different content.",
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
        journalId:
          String(
            replay.rows[0]
              .posted_journal_id,
          ),
        replayed:
          true,
      };
    }

    const postingResult =
      await client.query(
        `SELECT
           p.id::text,
           p.status,
           p.settlement_mode,
           p.settlement_account_id::text,
           p.gross_base_amount::text,
           r.report_number,
           r.status AS report_status
         FROM accounting_expense_report_postings p
         JOIN expense_reports r
           ON r.company_id=p.company_id
          AND r.id=p.expense_report_id
          AND r.deleted_at IS NULL
         WHERE p.company_id=$1
           AND p.expense_report_id=$2
           AND p.deleted_at IS NULL
         LIMIT 1
         FOR UPDATE OF p,r`,
        [
          context.companyId,
          reportId,
        ],
      );

    const posting =
      postingResult.rows[0];

    if (
      !posting ||
      posting.status !==
        "posted" ||
      posting.settlement_mode !==
        "employee_reimbursement"
    ) {
      throw new AccountingInputError(
        "Only a posted employee-reimbursement expense report can be reimbursed.",
      );
    }

    const balanceResult =
      await client.query(
        `SELECT
           outstanding_amount::text
         FROM accounting_expense_reimbursement_balances
         WHERE company_id=$1
           AND expense_report_id=$2
         LIMIT 1`,
        [
          context.companyId,
          reportId,
        ],
      );

    const outstanding =
      minorUnits(
        balanceResult.rows[0]
          ?.outstanding_amount ||
          "0",
      );

    if (
      outstanding <=
        BigInt(0) ||
      amount >
        outstanding
    ) {
      throw new AccountingInputError(
        "Reimbursement exceeds the outstanding employee expense balance.",
      );
    }

    const paymentAccount =
      await activeAccount(
        client,
        context.companyId,
        paymentAccountId,
      );

    assertCashAccount(
      paymentAccount,
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
            paymentDate,
          description:
            "Expense reimbursement · " +
            String(
              posting.report_number,
            ),
          reference:
            String(
              posting.report_number,
            ),
          sourceModule:
            "accounting",
          sourceType:
            "expense_reimbursement",
          sourceId:
            reportId,
          sourceEventKey:
            "accounting:expense-reimbursement:" +
            key,
          postingKind:
            "system",
          lines: [
            {
              accountId:
                String(
                  posting.settlement_account_id,
                ),
              description:
                String(
                  posting.report_number,
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
                paymentAccountId,
              description:
                String(
                  posting.report_number,
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
        `INSERT INTO accounting_expense_reimbursements (
           company_id,
           report_posting_id,
           expense_report_id,
           request_key,
           request_hash,
           payment_date,
           payment_account_id,
           amount,
           status,
           posted_journal_id,
           posted_by,
           notes,
           created_by,
           updated_by
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,'posted',$9,$10,$11,$10,$10
         )
         RETURNING id::text`,
        [
          context.companyId,
          posting.id,
          reportId,
          key,
          hash,
          paymentDate,
          paymentAccountId,
          decimalAmount(
            amount,
          ),
          journal.journalId,
          context.userId,
          notes,
        ],
      );

    const remaining =
      outstanding -
      amount;

    if (
      remaining ===
      BigInt(0)
    ) {
      await client.query(
        `UPDATE expense_reports
         SET
           status='reimbursed',
           reimbursed_at=NOW(),
           updated_by=$3,
           updated_at=NOW()
         WHERE company_id=$1
           AND id=$2
           AND deleted_at IS NULL
           AND status='approved'`,
        [
          context.companyId,
          reportId,
          context.userId,
        ],
      );

      await client.query(
        `UPDATE expenses e
         SET
           status='paid',
           updated_by=$3,
           updated_at=NOW()
         WHERE e.company_id=$1
           AND e.deleted_at IS NULL
           AND EXISTS (
             SELECT 1
             FROM expense_report_lines l
             WHERE l.company_id=e.company_id
               AND l.report_id=$2
               AND l.expense_id=e.id
               AND l.deleted_at IS NULL
           )`,
        [
          context.companyId,
          reportId,
          context.userId,
        ],
      );
    }

    await client.query(
      "COMMIT",
    );

    const reimbursementId =
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
        "accounting.expenses.reimbursement_posted",
      module:
        "accounting",
      resourceType:
        "accounting_expense_reimbursements",
      resourceId:
        reimbursementId,
      summary:
        "Employee expense reimbursement posted to the ledger",
      result:
        "success",
      metadata: {
        expenseReportId:
          reportId,
        journalId:
          journal.journalId,
        amount:
          decimalAmount(
            amount,
          ),
        fullyReimbursed:
          remaining ===
          BigInt(0),
      },
    }).catch(
      error =>
        console.error(
          "[Accounting] Expense reimbursement audit delivery failed",
          error,
        ),
    );

    return {
      id:
        reimbursementId,
      journalId:
        journal.journalId,
      outstandingAmount:
        decimalAmount(
          remaining,
        ),
      replayed:
        journal.reused,
    };
  } catch (error) {
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


export async function reverseExpenseReimbursement(
  input: unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "accounting_expense_reimbursements",
      "edit",
    );

  const body =
    bodyOf(
      input,
    );

  const reimbursementId =
    accountingId(
      body.reimbursementId,
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

    await assertExpensesAvailable(
      client,
    );

    const result =
      await client.query(
        `SELECT
           r.id::text,
           r.expense_report_id::text,
           r.status,
           r.posted_journal_id::text,
           r.reversal_journal_id::text,
           er.report_number
         FROM accounting_expense_reimbursements r
         JOIN expense_reports er
           ON er.company_id=r.company_id
          AND er.id=r.expense_report_id
          AND er.deleted_at IS NULL
         WHERE r.company_id=$1
           AND r.id=$2
           AND r.deleted_at IS NULL
         LIMIT 1
         FOR UPDATE OF r,er`,
        [
          context.companyId,
          reimbursementId,
        ],
      );

    const reimbursement =
      result.rows[0];

    if (
      !reimbursement ||
      !reimbursement.posted_journal_id
    ) {
      throw new AccountingInputError(
        "Only a posted reimbursement can be reversed.",
      );
    }

    if (
      reimbursement.reversal_journal_id
    ) {
      await client.query(
        "COMMIT",
      );

      return {
        journalId:
          String(
            reimbursement.reversal_journal_id,
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
              reimbursement.posted_journal_id,
            ),
          journalDate:
            reversalDate,
          description:
            "Reverse expense reimbursement · " +
            String(
              reimbursement.report_number,
            ),
          sourceModule:
            "accounting",
          sourceType:
            "expense_reimbursement_reversal",
          sourceId:
            reimbursementId,
          sourceEventKey:
            "accounting:expense-reimbursement:" +
            reimbursementId +
            ":reverse",
        },
      );

    await client.query(
      `UPDATE accounting_expense_reimbursements
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
        reimbursementId,
        reversal.journalId,
        context.userId,
      ],
    );

    await client.query(
      `UPDATE expense_reports
       SET
         status='approved',
         reimbursed_at=NULL,
         updated_by=$3,
         updated_at=NOW()
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL
         AND status='reimbursed'`,
      [
        context.companyId,
        reimbursement.expense_report_id,
        context.userId,
      ],
    );

    await client.query(
      `UPDATE expenses e
       SET
         status='approved',
         updated_by=$3,
         updated_at=NOW()
       WHERE e.company_id=$1
         AND e.deleted_at IS NULL
         AND e.status='paid'
         AND EXISTS (
           SELECT 1
           FROM expense_report_lines l
           WHERE l.company_id=e.company_id
             AND l.report_id=$2
             AND l.expense_id=e.id
             AND l.deleted_at IS NULL
         )`,
      [
        context.companyId,
        reimbursement.expense_report_id,
        context.userId,
      ],
    );

    await client.query(
      "COMMIT",
    );

    await recordWorkspaceAuditEvent({
      tenantId: context.tenantId,
      companyId: context.companyId,
      userId: context.userId,
      action: "accounting.expenses.reimbursement_reversed",
      module: "accounting",
      resourceType: "accounting_expense_reimbursements",
      resourceId: reimbursementId,
      summary: "Employee expense reimbursement reversed",
      result: "success",
      metadata: {
        expenseReportId: String(reimbursement.expense_report_id),
        reversalJournalId: reversal.journalId,
      },
    }).catch(error =>
      console.error(
        "[Accounting] Expense reimbursement reversal audit delivery failed",
        error,
      ),
    );

    return {
      journalId:
        reversal.journalId,
      replayed:
        reversal.reused,
    };
  } catch (error) {
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
