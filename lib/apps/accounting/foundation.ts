import "server-only";
import { requireEnterpriseModuleTableContext } from "@/lib/apps/enterprise/service";
import { recordWorkspaceAuditEvent } from "@/lib/services/workspace-activity";
import { saveBalancedJournalDraft } from "./journal-command";
import {
  AccountingInputError,
  reportFilters,
  validateJournal,
} from "./validation";
import { ACCOUNT_BALANCES_SQL, LEDGER_SQL } from "./queries";

export type AccountBalance = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
  opening: string;
  debit: string;
  credit: string;
  balance: string;
};
export type LedgerLine = {
  id: string;
  journal_id: string;
  journal_number: string;
  journal_date: string;
  reference: string | null;
  description: string;
  code: string;
  name: string;
  debit: string;
  credit: string;
  running_balance: string;
  total_count: number;
};
export type AccountingFoundation = {
  currency: string;
  companyId: string;
  filters: ReturnType<typeof reportFilters>;
  accounts: AccountBalance[];
  ledger: LedgerLine[];
  ledgerCount: number;
  draftCount: number;
  postedCount: number;
  openPeriods: number;
  bankAccounts: number;
  unreconciledBankLines: number;
  recent: {
    id: string;
    journal_number: string;
    journal_date: string;
    description: string;
    status: string;
  }[];
};
export async function getAccountingFoundation(
  input: Parameters<typeof reportFilters>[0] = {},
): Promise<AccountingFoundation> {
  const filters = reportFilters(input);
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "journals",
    "report",
  );
  const client = await context.pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const values = [context.companyId, filters.from, filters.to];
    const balances = await client.query<AccountBalance>(
      ACCOUNT_BALANCES_SQL,
      values,
    );
    const stats = await client.query(
      `SELECT COUNT(*) FILTER (WHERE status='draft')::int AS draft_count,
      COUNT(*) FILTER (WHERE status='posted' AND journal_date BETWEEN $2::date AND $3::date)::int AS posted_count
      FROM journals WHERE company_id=$1 AND deleted_at IS NULL`,
      values,
    );
    const periods = await client.query(
      `SELECT COUNT(*)::int AS count FROM accounting_fiscal_periods WHERE company_id=$1 AND deleted_at IS NULL AND status='open'`,
      [context.companyId],
    );
    const bankStats = await client.query(
      `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM accounting_bank_accounts
            WHERE company_id = $1
              AND deleted_at IS NULL
              AND status = 'active'
          ) AS bank_accounts,
          (
            SELECT COUNT(*)::int
            FROM accounting_bank_statement_lines
            WHERE company_id = $1
              AND deleted_at IS NULL
              AND reconciliation_status IN ('unmatched','suggested')
          ) AS unreconciled_bank_lines
      `,
      [context.companyId],
    );
    const recent = await client.query(
      `SELECT id,journal_number,journal_date::text,description,status FROM journals WHERE company_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 6`,
      [context.companyId],
    );
    const selected = balances.rows.find((row) => row.id === filters.accountId);
    const ledger = selected
      ? await client.query<LedgerLine>(LEDGER_SQL, [
          ...values,
          selected.id,
          (filters.page - 1) * 50,
          selected.opening,
        ])
      : { rows: [] };
    // Keep count accurate when the requested page is past the final row.
    const count = selected
      ? await client.query(
          `SELECT COUNT(*)::int AS count FROM journal_lines l JOIN journals j ON j.id=l.journal_id AND j.company_id=l.company_id WHERE l.company_id=$1 AND l.account_id=$4 AND l.deleted_at IS NULL AND j.deleted_at IS NULL AND j.status='posted' AND j.journal_date BETWEEN $2::date AND $3::date`,
          [...values, selected.id],
        )
      : { rows: [{ count: 0 }] };
    await client.query("COMMIT");
    return {
      currency: context.company.currentCompany.currency,
      companyId: context.companyId,
      filters,
      accounts: balances.rows,
      ledger: ledger.rows,
      ledgerCount: count.rows[0].count,
      draftCount: stats.rows[0].draft_count,
      postedCount: stats.rows[0].posted_count,
      openPeriods: periods.rows[0].count,
      bankAccounts: bankStats.rows[0].bank_accounts,
      unreconciledBankLines: bankStats.rows[0].unreconciled_bank_lines,
      recent: recent.rows,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function createAccountingJournal(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "journals",
    "create",
  );
  if (
    !input ||
    typeof input !== "object" ||
    (input as Record<string, unknown>).expectedCompanyId !== context.companyId
  )
    throw new AccountingInputError(
      "Your company changed. Reload this form before saving.",
    );
  const payload = validateJournal(input);
  const result = await saveBalancedJournalDraft(context.pool, context, payload);
  if (!result.replayed) {
    await recordWorkspaceAuditEvent({
      tenantId: context.tenantId,
      companyId: context.companyId,
      userId: context.userId,
      action: "accounting.journal.created",
      module: "accounting",
      resourceType: "journals",
      resourceId: String(result.id),
      summary: "Balanced manual journal saved as draft",
      result: "success",
      metadata: { lineCount: payload.lines.length },
    }).catch((error) =>
      console.error("[Accounting] Journal audit delivery failed", {
        journalId: result.id,
        error,
      }),
    );
  }
  return result;
}
