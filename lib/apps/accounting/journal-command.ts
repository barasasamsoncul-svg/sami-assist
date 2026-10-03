import "server-only";
import type { Pool } from "pg";
import {
  completeEnterpriseCreateRequest,
  hashEnterpriseCreateRequest,
  reserveEnterpriseCreateRequest,
} from "@/lib/apps/enterprise/idempotency";
import { AccountingInputError, type JournalInput } from "./validation";
import { applyAccountingDimensionRules } from "./dimensions-posting";

/** The caller must resolve trusted company and create permissions before entering this transaction. */
export async function saveBalancedJournalDraft(
  pool: Pool,
  scope: { companyId: string; userId: string },
  input: JournalInput,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const requestHash = hashEnterpriseCreateRequest(
      "accounting",
      "journals",
      new Map(
        Object.entries(input).filter(([key]) => key !== "idempotencyKey"),
      ),
    );
    const reserved = await reserveEnterpriseCreateRequest(client, {
      ...scope,
      moduleKey: "accounting",
      table: "journals",
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (reserved.replayed) {
      await client.query("COMMIT");
      return { ...reserved.response, replayed: true };
    }
    const ids = [...new Set(input.lines.map((line) => line.accountId))];
    const accounts = await client.query(
      `SELECT id,allow_manual_posting FROM accounts WHERE company_id=$1 AND id=ANY($2::uuid[]) AND is_active=TRUE AND deleted_at IS NULL FOR SHARE`,
      [scope.companyId, ids],
    );
    if (accounts.rows.length !== ids.length)
      throw new AccountingInputError(
        "Every line must use an active account belonging to this company.",
      );
    if (
      accounts.rows.some(
        (row) =>
          row.allow_manual_posting ===
          false,
      )
    )
      throw new AccountingInputError(
        "A selected control account only accepts trusted subsystem postings. Choose an account that allows manual journals.",
      );
    const settings = await client.query(
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
      [scope.companyId],
    );

    const policy = settings.rows[0] || {
      global_lock_date: null,
      require_open_period: true,
    };

    if (
      policy.global_lock_date &&
      input.journalDate <= policy.global_lock_date
    )
      throw new AccountingInputError(
        "This journal date is on or before the company Accounting lock date.",
      );

    const periods = await client.query(
      `SELECT id,status,lock_date::text FROM accounting_fiscal_periods WHERE company_id=$1 AND deleted_at IS NULL AND $2::date BETWEEN starts_on AND ends_on FOR SHARE`,
      [scope.companyId, input.journalDate],
    );

    if (
      policy.require_open_period !== false &&
      !periods.rows.length
    )
      throw new AccountingInputError(
        "Create an open fiscal period covering this journal date first.",
      );

    if (
      periods.rows.some(
        (row) =>
          row.status !== "open" ||
          (row.lock_date && input.journalDate <= row.lock_date),
      )
    )
      throw new AccountingInputError(
        "This journal date belongs to a locked or closing fiscal period.",
      );
    // A permanent unique journal number also prevents duplicate inserts after request-history expiry.
    const number =
      "MAN-" + input.idempotencyKey.replaceAll("-", "").toUpperCase();
    const journal = await client.query(
      `INSERT INTO journals (
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
        created_by,
        updated_by
      )
      VALUES (
        $1,$2,$3,$4,$5,'draft',
        'accounting','manual_journal',$6,$6,'manual',$7,$7
      )
      RETURNING id,journal_number,status`,
      [
        scope.companyId,
        number,
        input.journalDate,
        input.reference,
        input.description,
        input.idempotencyKey,
        scope.userId,
      ],
    );
    const row = journal.rows[0];
    for (const line of input.lines) {
      const insertedLine = await client.query(
        `INSERT INTO journal_lines (company_id,journal_id,account_id,description,debit,credit,created_by,updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
        RETURNING id::text`,
        [
          scope.companyId,
          row.id,
          line.accountId,
          line.description,
          line.debit,
          line.credit,
          scope.userId,
        ],
      );
      await applyAccountingDimensionRules(client,{
        companyId: scope.companyId,
        journalLineId: String(insertedLine.rows[0].id),
        accountId: line.accountId,
        sourceModule: 'accounting',
        debit: line.debit,
        credit: line.credit,
        userId: scope.userId,
      });
    }
    await completeEnterpriseCreateRequest(client, {
      companyId: scope.companyId,
      idempotencyKey: input.idempotencyKey,
      recordKey: row.id,
      response: row,
    });
    await client.query("COMMIT");
    return { ...row, replayed: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
