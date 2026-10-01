import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { requireEnterpriseModuleTableContext } from "@/lib/apps/enterprise/service";
import { recordWorkspaceAuditEvent } from "@/lib/services/workspace-activity";

import {
  postApprovedManualLedgerJournal,
  reversePostedLedgerJournal,
} from "./ledger-engine";
import type {
  AccountingJournalWorkspace,
} from "./journal-types";
import {
  AccountingInputError,
  accountingDate,
  accountingId,
  validateJournal,
} from "./validation";


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
      label + " is required and must not exceed " + max + " characters.",
    );
  }

  return text;
}


function optionalText(
  value: unknown,
  max: number,
  label: string,
) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    throw new AccountingInputError(label + " must contain text.");
  }

  const text = value.trim();

  if (text.length > max) {
    throw new AccountingInputError(
      label + " must not exceed " + max + " characters.",
    );
  }

  return text;
}


function actionBody(
  input: unknown,
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountingInputError("Enter a valid Accounting request.");
  }

  return input as Record<string, unknown>;
}


function assertCompany(
  body: Record<string, unknown>,
  companyId: string,
) {
  if (accountingId(body.expectedCompanyId) !== companyId) {
    throw new AccountingInputError(
      "Your company changed. Reload Accounting before continuing.",
    );
  }
}


function nextOccurrence(
  current: string,
  frequency: "weekly" | "monthly" | "quarterly" | "yearly",
) {
  const date = new Date(current + "T00:00:00Z");

  if (frequency === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (frequency === "monthly") {
    date.setUTCMonth(date.getUTCMonth() + 1);
  } else if (frequency === "quarterly") {
    date.setUTCMonth(date.getUTCMonth() + 3);
  } else {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  }

  return date.toISOString().slice(0, 10);
}


async function assertRecurringDraftPeriod(
  client: PoolClient,
  companyId: string,
  journalDate: string,
) {
  const settings = await client.query(
    `SELECT global_lock_date::text,require_open_period
       FROM accounting_settings
       WHERE company_id=$1 AND deleted_at IS NULL
       LIMIT 1
       FOR SHARE`,
    [companyId],
  );

  const policy = settings.rows[0] || {
    global_lock_date: null,
    require_open_period: true,
  };

  if (
    policy.global_lock_date &&
    journalDate <= String(policy.global_lock_date)
  ) {
    throw new AccountingInputError(
      "This recurring journal date is on or before the company Accounting lock date.",
    );
  }

  const periods = await client.query(
    `SELECT status,lock_date::text
       FROM accounting_fiscal_periods
       WHERE company_id=$1
         AND deleted_at IS NULL
         AND $2::date BETWEEN starts_on AND ends_on
       FOR SHARE`,
    [companyId, journalDate],
  );

  if (policy.require_open_period !== false && periods.rows.length === 0) {
    throw new AccountingInputError(
      "Create an open fiscal period covering this recurring journal date first.",
    );
  }

  if (
    periods.rows.some(
      row =>
        String(row.status) !== "open" ||
        (row.lock_date && journalDate <= String(row.lock_date)),
    )
  ) {
    throw new AccountingInputError(
      "This recurring journal date belongs to a locked or closing fiscal period.",
    );
  }
}


export async function getAccountingJournals(
  journalId?: string | null,
): Promise<AccountingJournalWorkspace> {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "journals",
    "report",
  );

  const selectedId =
    journalId
      ? accountingId(journalId)
      : null;

  const client = await context.pool.connect();

  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const journals = await client.query(
      `SELECT
         j.id::text,
         j.journal_number,
         j.journal_date::text,
         j.reference,
         COALESCE(j.description,'') AS description,
         j.status,
         j.posting_kind,
         j.source_module,
         j.source_type,
         j.source_id,
         j.posted_at::text,
         j.approved_at::text,
         j.reversed_by_journal_id::text,
         j.reversal_of_journal_id::text,
         COALESCE(SUM(l.debit),0)::text AS debit_total,
         COALESCE(SUM(l.credit),0)::text AS credit_total,
         COUNT(l.id)::int AS line_count
       FROM journals j
       LEFT JOIN journal_lines l
         ON l.company_id=j.company_id
        AND l.journal_id=j.id
        AND l.deleted_at IS NULL
       WHERE j.company_id=$1
         AND j.deleted_at IS NULL
       GROUP BY j.id
       ORDER BY j.journal_date DESC,j.created_at DESC,j.id DESC
       LIMIT 150`,
      [context.companyId],
    );

    let selected = null;

    if (selectedId) {
      const header = await client.query(
        `SELECT
           j.id::text,
           j.journal_number,
           j.journal_date::text,
           j.reference,
           COALESCE(j.description,'') AS description,
           j.status,
           j.posting_kind,
           j.source_module,
           j.source_type,
           j.source_id,
           j.posted_at::text,
           j.approved_at::text,
           j.approval_note,
           j.approved_by::text,
           j.posted_by::text,
           j.created_by::text,
           j.created_at::text,
           j.reversed_by_journal_id::text,
           j.reversal_of_journal_id::text,
           COALESCE(SUM(l.debit),0)::text AS debit_total,
           COALESCE(SUM(l.credit),0)::text AS credit_total,
           COUNT(l.id)::int AS line_count
         FROM journals j
         LEFT JOIN journal_lines l
           ON l.company_id=j.company_id
          AND l.journal_id=j.id
          AND l.deleted_at IS NULL
         WHERE j.company_id=$1
           AND j.id=$2
           AND j.deleted_at IS NULL
         GROUP BY j.id
         LIMIT 1`,
        [context.companyId, selectedId],
      );

      if (!header.rows[0]) {
        throw new AccountingInputError("This journal could not be found.");
      }

      const lines = await client.query(
        `SELECT
           l.id::text,
           l.account_id::text,
           a.code,
           a.name,
           COALESCE(l.description,'') AS description,
           l.debit::text,
           l.credit::text
         FROM journal_lines l
         JOIN accounts a
           ON a.company_id=l.company_id
          AND a.id=l.account_id
          AND a.deleted_at IS NULL
         WHERE l.company_id=$1
           AND l.journal_id=$2
           AND l.deleted_at IS NULL
         ORDER BY l.created_at,l.id`,
        [context.companyId, selectedId],
      );

      selected = {
        ...header.rows[0],
        lines: lines.rows,
      };
    }

    const recurring = await client.query(
      `SELECT
         r.id::text,
         r.name,
         r.frequency,
         r.starts_on::text,
         r.next_run_on::text,
         r.ends_on::text,
         r.reference_prefix,
         r.description,
         r.status,
         r.last_generated_at::text,
         r.last_generated_journal_id::text,
         COUNT(l.id)::int AS line_count,
         COALESCE(SUM(l.debit),0)::text AS debit_total,
         COALESCE(SUM(l.credit),0)::text AS credit_total
       FROM accounting_recurring_journals r
       LEFT JOIN accounting_recurring_journal_lines l
         ON l.company_id=r.company_id
        AND l.recurring_journal_id=r.id
        AND l.deleted_at IS NULL
       WHERE r.company_id=$1
         AND r.deleted_at IS NULL
       GROUP BY r.id
       ORDER BY
         CASE r.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
         r.next_run_on,
         r.name`,
      [context.companyId],
    );

    const accounts = await client.query(
      `SELECT id::text,code,name,allow_manual_posting
       FROM accounts
       WHERE company_id=$1
         AND deleted_at IS NULL
         AND is_active=TRUE
       ORDER BY sequence,code,name`,
      [context.companyId],
    );

    const counts = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='draft')::int AS draft,
         COUNT(*) FILTER (WHERE status='approved')::int AS approved,
         COUNT(*) FILTER (WHERE status='posted')::int AS posted,
         COUNT(*) FILTER (WHERE reversed_by_journal_id IS NOT NULL)::int AS reversed
       FROM journals
       WHERE company_id=$1
         AND deleted_at IS NULL`,
      [context.companyId],
    );

    const recurringCount = recurring.rows.filter(
      row => row.status === "active",
    ).length;

    await client.query("COMMIT");

    return {
      companyId: context.companyId,
      currency: context.company.currentCompany.currency,
      journals: journals.rows,
      selected,
      recurring: recurring.rows,
      accounts: accounts.rows,
      counts: {
        draft: counts.rows[0]?.draft || 0,
        approved: counts.rows[0]?.approved || 0,
        posted: counts.rows[0]?.posted || 0,
        reversed: counts.rows[0]?.reversed || 0,
        recurringActive: recurringCount,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


export async function approveAccountingJournal(
  input: unknown,
) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "journals",
    "edit",
  );

  const body = actionBody(input);
  assertCompany(body, context.companyId);

  const journalId = accountingId(body.journalId);
  const note = optionalText(body.note, 1000, "Approval note");

  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    const journal = await client.query(
      `SELECT id::text,status,posting_kind
       FROM journals
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [context.companyId, journalId],
    );

    const row = journal.rows[0];

    if (!row) {
      throw new AccountingInputError("This journal could not be found.");
    }

    if (row.status === "approved") {
      await client.query("COMMIT");
      return { journalId, status: "approved", replayed: true };
    }

    if (row.status !== "draft") {
      throw new AccountingInputError(
        "Only a draft journal can be approved.",
      );
    }

    if (!["manual", "opening"].includes(String(row.posting_kind))) {
      throw new AccountingInputError(
        "Automatic subsystem journals do not use manual approval.",
      );
    }

    const proof = await client.query(
      `SELECT
         COUNT(*)::int AS line_count,
         COALESCE(SUM(debit),0)::text AS debit_total,
         COALESCE(SUM(credit),0)::text AS credit_total,
         COALESCE(SUM(debit),0) = COALESCE(SUM(credit),0)
           AND COALESCE(SUM(debit),0) > 0
           AND COUNT(*) >= 2 AS balanced
       FROM journal_lines
       WHERE company_id=$1
         AND journal_id=$2
         AND deleted_at IS NULL`,
      [context.companyId, journalId],
    );

    if (proof.rows[0]?.balanced !== true) {
      throw new AccountingInputError(
        "SaMi refused approval because the journal is not a valid balanced entry.",
      );
    }

    await client.query(
      `UPDATE journals
       SET
         status='approved',
         approved_by=$3,
         approved_at=NOW(),
         approval_note=$4,
         updated_by=$3,
         updated_at=NOW()
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL`,
      [context.companyId, journalId, context.userId, note || null],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await recordWorkspaceAuditEvent({
    tenantId: context.tenantId,
    companyId: context.companyId,
    userId: context.userId,
    action: "accounting.journal.approved",
    module: "accounting",
    resourceType: "journals",
    resourceId: journalId,
    summary: "Accounting journal approved for posting",
    result: "success",
    metadata: { note: note || null },
  }).catch((error) =>
    console.error("[Accounting] Approval audit delivery failed", {
      journalId,
      error,
    }),
  );

  return { journalId, status: "approved", replayed: false };
}


export async function postAccountingJournal(
  input: unknown,
) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "journals",
    "edit",
  );

  const body = actionBody(input);
  assertCompany(body, context.companyId);
  const journalId = accountingId(body.journalId);

  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    const result = await postApprovedManualLedgerJournal(
      client,
      {
        companyId: context.companyId,
        userId: context.userId,
        journalId,
      },
    );

    await client.query("COMMIT");

    await recordWorkspaceAuditEvent({
      tenantId: context.tenantId,
      companyId: context.companyId,
      userId: context.userId,
      action: "accounting.journal.posted",
      module: "accounting",
      resourceType: "journals",
      resourceId: journalId,
      summary: "Approved Accounting journal posted",
      result: "success",
      metadata: {
        total: result.total,
        replayed: result.reused,
      },
    }).catch((error) =>
      console.error("[Accounting] Posting audit delivery failed", {
        journalId,
        error,
      }),
    );

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


export async function reverseAccountingJournal(
  input: unknown,
) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "journals",
    "edit",
  );

  const body = actionBody(input);
  assertCompany(body, context.companyId);

  const journalId = accountingId(body.journalId);
  const reversalDate = accountingDate(body.reversalDate);
  const description =
    optionalText(body.description, 1000, "Reversal description") ||
    "Reversal of Accounting journal";

  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    const result = await reversePostedLedgerJournal(
      client,
      {
        companyId: context.companyId,
        userId: context.userId,
        originalJournalId: journalId,
        journalDate: reversalDate,
        description,
        sourceModule: "accounting",
        sourceType: "manual_journal_reversal",
        sourceId: journalId,
        sourceEventKey:
          "accounting:journal:" + journalId + ":reverse",
      },
    );

    await client.query("COMMIT");

    await recordWorkspaceAuditEvent({
      tenantId: context.tenantId,
      companyId: context.companyId,
      userId: context.userId,
      action: "accounting.journal.reversed",
      module: "accounting",
      resourceType: "journals",
      resourceId: journalId,
      summary: "Posted Accounting journal reversed with a compensating entry",
      result: "success",
      metadata: {
        reversalJournalId: result.journalId,
        reversalDate,
      },
    }).catch((error) =>
      console.error("[Accounting] Reversal audit delivery failed", {
        journalId,
        error,
      }),
    );

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


export async function createRecurringAccountingJournal(
  input: unknown,
) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "journals",
    "create",
  );

  const body = actionBody(input);
  assertCompany(body, context.companyId);

  const name = requiredText(body.name, 160, "Recurring journal name");
  const frequency =
    body.frequency === "weekly" ||
    body.frequency === "monthly" ||
    body.frequency === "quarterly" ||
    body.frequency === "yearly"
      ? body.frequency
      : null;

  if (!frequency) {
    throw new AccountingInputError("Choose a supported recurrence frequency.");
  }

  const startsOn = accountingDate(body.startsOn);
  const endsOn =
    body.endsOn
      ? accountingDate(body.endsOn)
      : null;

  if (endsOn && endsOn < startsOn) {
    throw new AccountingInputError(
      "Recurring journal end date cannot be before its start date.",
    );
  }

  const validated = validateJournal({
    idempotencyKey: randomUUID(),
    journalDate: startsOn,
    description: body.description,
    reference: body.referencePrefix,
    lines: body.lines,
  });

  const referencePrefix = optionalText(
    body.referencePrefix,
    80,
    "Reference prefix",
  );

  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    const accountIds = [
      ...new Set(validated.lines.map(line => line.accountId)),
    ];

    const accounts = await client.query(
      `SELECT id::text,allow_manual_posting
       FROM accounts
       WHERE company_id=$1
         AND id=ANY($2::uuid[])
         AND is_active=TRUE
         AND deleted_at IS NULL
       FOR SHARE`,
      [context.companyId, accountIds],
    );

    if (accounts.rows.length !== accountIds.length) {
      throw new AccountingInputError(
        "Every recurring journal line must use an active company account.",
      );
    }

    if (accounts.rows.some(row => row.allow_manual_posting === false)) {
      throw new AccountingInputError(
        "Recurring manual journals cannot use system-only control accounts.",
      );
    }

    const created = await client.query(
      `INSERT INTO accounting_recurring_journals (
         company_id,
         name,
         frequency,
         starts_on,
         next_run_on,
         ends_on,
         reference_prefix,
         description,
         status,
         created_by,
         updated_by
       )
       VALUES ($1,$2,$3,$4,$4,$5,$6,$7,'active',$8,$8)
       RETURNING id::text`,
      [
        context.companyId,
        name,
        frequency,
        startsOn,
        endsOn,
        referencePrefix || null,
        validated.description,
        context.userId,
      ],
    );

    const recurringId = String(created.rows[0].id);

    for (const [index, line] of validated.lines.entries()) {
      await client.query(
        `INSERT INTO accounting_recurring_journal_lines (
           company_id,
           recurring_journal_id,
           account_id,
           description,
           debit,
           credit,
           sequence,
           created_by,
           updated_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [
          context.companyId,
          recurringId,
          line.accountId,
          line.description,
          line.debit,
          line.credit,
          (index + 1) * 10,
          context.userId,
        ],
      );
    }

    await client.query("COMMIT");

    await recordWorkspaceAuditEvent({
      tenantId: context.tenantId,
      companyId: context.companyId,
      userId: context.userId,
      action: "accounting.recurring_journal.created",
      module: "accounting",
      resourceType: "accounting_recurring_journals",
      resourceId: recurringId,
      summary: "Recurring Accounting journal template created",
      result: "success",
      metadata: { frequency, startsOn, endsOn },
    }).catch((error) =>
      console.error("[Accounting] Recurring journal audit delivery failed", {
        recurringId,
        error,
      }),
    );

    return { id: recurringId, status: "active" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


export async function generateRecurringAccountingJournal(
  input: unknown,
) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "journals",
    "create",
  );

  const body = actionBody(input);
  assertCompany(body, context.companyId);

  const recurringId = accountingId(body.recurringId);

  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    const templateResult = await client.query(
      `SELECT
         id::text,
         name,
         frequency,
         next_run_on::text,
         ends_on::text,
         reference_prefix,
         description,
         status
       FROM accounting_recurring_journals
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [context.companyId, recurringId],
    );

    const template = templateResult.rows[0];

    if (!template) {
      throw new AccountingInputError(
        "This recurring journal template could not be found.",
      );
    }

    if (template.status !== "active") {
      throw new AccountingInputError(
        "Only an active recurring journal can generate a draft.",
      );
    }

    const occurrenceDate = accountingDate(template.next_run_on);

    if (template.ends_on && occurrenceDate > String(template.ends_on)) {
      await client.query(
        `UPDATE accounting_recurring_journals
         SET status='ended',updated_by=$3,updated_at=NOW()
         WHERE company_id=$1 AND id=$2`,
        [context.companyId, recurringId, context.userId],
      );
      await client.query("COMMIT");
      throw new AccountingInputError(
        "This recurring journal has reached its end date.",
      );
    }

    await assertRecurringDraftPeriod(
      client,
      context.companyId,
      occurrenceDate,
    );

    const lines = await client.query(
      `SELECT
         l.account_id::text,
         l.description,
         l.debit::text,
         l.credit::text,
         a.allow_manual_posting
       FROM accounting_recurring_journal_lines l
       JOIN accounts a
         ON a.company_id=l.company_id
        AND a.id=l.account_id
        AND a.deleted_at IS NULL
        AND a.is_active=TRUE
       WHERE l.company_id=$1
         AND l.recurring_journal_id=$2
         AND l.deleted_at IS NULL
       ORDER BY l.sequence,l.id
       FOR SHARE`,
      [context.companyId, recurringId],
    );

    const validated = validateJournal({
      idempotencyKey: randomUUID(),
      journalDate: occurrenceDate,
      description: template.description,
      reference:
        (template.reference_prefix
          ? String(template.reference_prefix) + " "
          : "") + occurrenceDate,
      lines: lines.rows.map(line => ({
        accountId: line.account_id,
        description: line.description,
        debit: line.debit,
        credit: line.credit,
      })),
    });

    if (lines.rows.some(line => line.allow_manual_posting === false)) {
      throw new AccountingInputError(
        "A recurring journal line now points to a system-only control account.",
      );
    }

    const sourceEventKey =
      "recurring:" + recurringId + ":" + occurrenceDate;

    const existing = await client.query(
      `SELECT id::text,status
       FROM journals
       WHERE company_id=$1
         AND source_module='accounting'
         AND source_event_key=$2
         AND deleted_at IS NULL
       LIMIT 1`,
      [context.companyId, sourceEventKey],
    );

    if (existing.rows[0]) {
      await client.query("COMMIT");
      return {
        journalId: String(existing.rows[0].id),
        status: String(existing.rows[0].status),
        replayed: true,
      };
    }

    const number =
      "REC-" +
      occurrenceDate.replaceAll("-", "") +
      "-" +
      recurringId.slice(0, 8).toUpperCase();

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
         'accounting','recurring_journal',$6,$7,'manual',$8,$8
       )
       RETURNING id::text,status`,
      [
        context.companyId,
        number,
        occurrenceDate,
        validated.reference,
        validated.description,
        recurringId,
        sourceEventKey,
        context.userId,
      ],
    );

    const journalId = String(journal.rows[0].id);

    for (const line of validated.lines) {
      await client.query(
        `INSERT INTO journal_lines (
           company_id,
           journal_id,
           account_id,
           description,
           debit,
           credit,
           created_by,
           updated_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
        [
          context.companyId,
          journalId,
          line.accountId,
          line.description,
          line.debit,
          line.credit,
          context.userId,
        ],
      );
    }

    const nextRunOn = nextOccurrence(
      occurrenceDate,
      template.frequency,
    );

    const ended =
      Boolean(template.ends_on) &&
      nextRunOn > String(template.ends_on);

    await client.query(
      `UPDATE accounting_recurring_journals
       SET
         next_run_on=$3,
         status=$4,
         last_generated_at=NOW(),
         last_generated_journal_id=$5,
         updated_by=$6,
         updated_at=NOW()
       WHERE company_id=$1
         AND id=$2`,
      [
        context.companyId,
        recurringId,
        nextRunOn,
        ended ? "ended" : "active",
        journalId,
        context.userId,
      ],
    );

    await client.query("COMMIT");

    await recordWorkspaceAuditEvent({
      tenantId: context.tenantId,
      companyId: context.companyId,
      userId: context.userId,
      action: "accounting.recurring_journal.generated",
      module: "accounting",
      resourceType: "journals",
      resourceId: journalId,
      summary: "Recurring Accounting journal generated as a reviewable draft",
      result: "success",
      metadata: { recurringId, occurrenceDate },
    }).catch((error) =>
      console.error("[Accounting] Recurring generation audit delivery failed", {
        journalId,
        recurringId,
        error,
      }),
    );

    return {
      journalId,
      status: "draft",
      replayed: false,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
