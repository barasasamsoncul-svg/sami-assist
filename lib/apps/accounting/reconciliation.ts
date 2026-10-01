import "server-only";

import {
  createHash,
} from "node:crypto";

import type { PoolClient } from "pg";

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
  AccountingReconciliationCandidate,
  AccountingReconciliationWorkspace,
} from "./reconciliation-types";


function bodyOf(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountingInputError("Enter valid reconciliation data.");
  }
  return input as Record<string,unknown>;
}


function shortText(
  value: unknown,
  max: number,
  label: string,
  required = false,
) {
  if (value != null && typeof value !== "string") {
    throw new AccountingInputError(label + " must contain text.");
  }
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) {
    throw new AccountingInputError(label + " is required.");
  }
  if (result.length > max) {
    throw new AccountingInputError(label + " must not exceed " + max + " characters.");
  }
  return result;
}


function requestKey(value: unknown) {
  try {
    return accountingId(value);
  } catch {
    throw new AccountingInputError("A valid reconciliation request key is required.");
  }
}


function requestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}


function signedCents(value: unknown) {
  const raw = String(value ?? "").trim().replace(/,/g,"");
  if (!/^[+-]?\d{1,18}(?:\.\d{1,8})?$/.test(raw)) {
    throw new AccountingInputError("Reconciliation amount is not a valid decimal.");
  }

  const negative = raw.startsWith("-");
  const unsigned =
    raw.startsWith("-") || raw.startsWith("+")
      ? raw.slice(1)
      : raw;

  const [whole,fraction=""] = unsigned.split(".");
  const padded = fraction.padEnd(3,"0");

  let amount =
    BigInt(whole || "0") * BigInt(100) +
    BigInt(padded.slice(0,2) || "0");

  if (Number(padded[2] || "0") >= 5) {
    amount += BigInt(1);
  }

  return negative ? -amount : amount;
}


function absolute(value: bigint) {
  return value < BigInt(0) ? -value : value;
}


function sameDirection(a: bigint,b: bigint) {
  return (a > BigInt(0) && b > BigInt(0)) ||
    (a < BigInt(0) && b < BigInt(0));
}


function integerValue(
  value: unknown,
  label: string,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AccountingInputError(
      label + " must be a whole number from " + min + " to " + max + ".",
    );
  }
  return parsed;
}


function nonNegativeAmount(value: unknown,label: string) {
  const amount = minorUnits(value ?? "0");
  if (amount < BigInt(0)) {
    throw new AccountingInputError(label + " cannot be negative.");
  }
  return amount;
}


function pageValue(value: unknown) {
  const page = Number(value || 1);
  return Number.isInteger(page) && page > 0 ? Math.min(page,100000) : 1;
}


async function nextReconciliationNumber(
  client: PoolClient,
  companyId: string,
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    [companyId + ":accounting_reconciliations"],
  );

  const result = await client.query(
    `SELECT COALESCE(
       MAX(
         NULLIF(
           regexp_replace(reconciliation_number,'\\D','','g'),
           ''
         )::bigint
       ),
       0
     ) + 1 AS next_number
     FROM accounting_reconciliations
     WHERE company_id=$1`,
    [companyId],
  );

  return "REC-" + String(result.rows[0]?.next_number || 1).padStart(6,"0");
}


async function statementForUpdate(
  client: PoolClient,
  companyId: string,
  statementLineId: string,
) {
  const result = await client.query(
    `SELECT
       s.id::text,
       s.bank_account_id::text,
       b.name AS bank_account_name,
       b.ledger_account_id::text,
       b.currency,
       b.status AS bank_account_status,
       s.transaction_date::text,
       s.value_date::text,
       s.description,
       s.external_reference,
       s.counterparty,
       s.amount::text,
       s.reconciliation_status
     FROM accounting_bank_statement_lines s
     JOIN accounting_bank_accounts b
       ON b.company_id=s.company_id
      AND b.id=s.bank_account_id
      AND b.deleted_at IS NULL
     WHERE s.company_id=$1
       AND s.id=$2
       AND s.deleted_at IS NULL
     LIMIT 1
     FOR UPDATE OF s,b`,
    [companyId,statementLineId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new AccountingInputError("Statement line not found.");
  }
  if (!row.ledger_account_id) {
    throw new AccountingInputError(
      "This financial account must be linked to a ledger account before reconciliation.",
    );
  }

  return row;
}


async function targetAccount(
  client: PoolClient,
  companyId: string,
  accountId: string,
) {
  const result = await client.query(
    `SELECT id::text,code,name,account_type,is_active,allow_manual_posting
     FROM accounts
     WHERE company_id=$1
       AND id=$2
       AND deleted_at IS NULL
     LIMIT 1`,
    [companyId,accountId],
  );

  const row = result.rows[0];
  if (!row || !row.is_active) {
    throw new AccountingInputError("Choose an active target account.");
  }
  if (row.allow_manual_posting === false) {
    throw new AccountingInputError(
      "The selected account does not allow reconciliation adjustment posting.",
    );
  }

  return row;
}


function statementText(
  row: Record<string,unknown>,
  field: string,
) {
  if (field === "description") return String(row.description || "");
  if (field === "reference") return String(row.external_reference || "");
  if (field === "counterparty") return String(row.counterparty || "");
  return [
    row.description,
    row.external_reference,
    row.counterparty,
  ].filter(Boolean).join(" ");
}


function ruleMatches(
  rule: Record<string,unknown>,
  statement: Record<string,unknown>,
) {
  const amount = signedCents(statement.amount);
  const absoluteAmount = absolute(amount);
  const direction = String(rule.direction || "any");

  if (direction === "inflow" && amount <= BigInt(0)) return false;
  if (direction === "outflow" && amount >= BigInt(0)) return false;

  if (
    rule.bank_account_id &&
    String(rule.bank_account_id) !== String(statement.bank_account_id)
  ) {
    return false;
  }

  if (
    rule.min_amount != null &&
    absoluteAmount < absolute(signedCents(rule.min_amount))
  ) {
    return false;
  }
  if (
    rule.max_amount != null &&
    absoluteAmount > absolute(signedCents(rule.max_amount))
  ) {
    return false;
  }

  const matchText = String(rule.match_text || "").trim().toLowerCase();
  if (!matchText) return true;

  const candidate = statementText(statement,String(rule.match_field || "any"))
    .trim()
    .toLowerCase();

  const operator = String(rule.match_operator || "contains");

  if (operator === "equals") return candidate === matchText;
  if (operator === "starts_with") return candidate.startsWith(matchText);
  return candidate.includes(matchText);
}


function candidateConfidence(
  statement: Record<string,unknown>,
  candidate: AccountingReconciliationCandidate,
) {
  const statementAmount = signedCents(statement.amount);
  const remaining = signedCents(candidate.remaining_amount);

  if (!sameDirection(statementAmount,remaining)) {
    return 0;
  }

  let score = 20;

  if (absolute(statementAmount) === absolute(remaining)) {
    score += 45;
  } else {
    const delta = Number(
      absolute(absolute(statementAmount)-absolute(remaining)),
    ) / 100;
    if (delta <= 1) score += 25;
    else if (delta <= 10) score += 15;
  }

  const statementDate = new Date(String(statement.transaction_date)+"T00:00:00Z");
  const journalDate = new Date(String(candidate.journal_date)+"T00:00:00Z");
  const days = Math.abs(
    Math.round(
      (statementDate.getTime()-journalDate.getTime()) /
      86400000,
    ),
  );

  if (days === 0) score += 20;
  else if (days <= 3) score += 14;
  else if (days <= 7) score += 8;

  const reference = String(statement.external_reference || "").trim().toLowerCase();
  const journalReference = String(candidate.reference || "").trim().toLowerCase();
  if (reference && journalReference) {
    if (reference === journalReference) score += 15;
    else if (
      reference.includes(journalReference) ||
      journalReference.includes(reference)
    ) {
      score += 8;
    }
  }

  const description = String(statement.description || "").trim().toLowerCase();
  const journalText = [
    candidate.journal_description,
    candidate.line_description,
  ].filter(Boolean).join(" ").toLowerCase();

  if (description && journalText) {
    if (description === journalText) score += 10;
    else if (
      description.includes(journalText) ||
      journalText.includes(description)
    ) {
      score += 5;
    }
  }

  return Math.min(score,100);
}


async function candidatesForStatement(
  client: PoolClient,
  companyId: string,
  statement: Record<string,unknown>,
) {
  const amount = signedCents(statement.amount);
  const rows = await client.query(
    `SELECT
       v.journal_line_id::text,
       v.journal_id::text,
       v.journal_number,
       v.journal_date::text,
       v.reference,
       v.journal_description,
       v.line_description,
       v.journal_amount::text,
       v.reconciled_amount::text,
       v.remaining_amount::text
     FROM accounting_reconciliation_journal_availability v
     WHERE v.company_id=$1
       AND v.account_id=$2
       AND v.remaining_amount <> 0
       AND (
         ($3::numeric > 0 AND v.remaining_amount > 0)
         OR
         ($3::numeric < 0 AND v.remaining_amount < 0)
       )
       AND v.journal_date BETWEEN ($4::date - INTERVAL '45 days')
                              AND ($4::date + INTERVAL '45 days')
     ORDER BY
       ABS(ABS(v.remaining_amount)-ABS($3::numeric)),
       ABS(v.journal_date-$4::date),
       v.journal_date DESC,
       v.journal_line_id
     LIMIT 100`,
    [
      companyId,
      statement.ledger_account_id,
      decimalAmount(amount),
      statement.transaction_date,
    ],
  );

  return rows.rows as AccountingReconciliationCandidate[];
}


export async function getAccountingReconciliation(
  input: {
    statementLineId?: unknown;
    page?: unknown;
  } = {},
): Promise<AccountingReconciliationWorkspace> {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_reconciliations",
    "report",
  );

  const selectedId = input.statementLineId
    ? accountingId(input.statementLineId)
    : null;
  const page = pageValue(input.page);
  const client = await context.pool.connect();

  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const [
      accounts,
      statementLines,
      rules,
      reconciliations,
      targetAccounts,
      metrics,
    ] = await Promise.all([
      client.query(
        `SELECT id::text,name,ledger_account_id::text,account_type,status
         FROM accounting_bank_accounts
         WHERE company_id=$1
           AND deleted_at IS NULL
         ORDER BY status,account_type,name,id`,
        [context.companyId],
      ),
      client.query(
        `SELECT
           s.id::text,
           s.bank_account_id::text,
           b.name AS bank_account_name,
           s.transaction_date::text,
           s.value_date::text,
           s.description,
           s.external_reference,
           s.counterparty,
           s.amount::text,
           s.reconciliation_status,
           s.source_type,
           COUNT(g.id) FILTER (
             WHERE g.status='pending'
               AND g.deleted_at IS NULL
           )::int AS suggestion_count,
           MAX(g.confidence) FILTER (
             WHERE g.status='pending'
               AND g.deleted_at IS NULL
           )::int AS top_confidence
         FROM accounting_bank_statement_lines s
         JOIN accounting_bank_accounts b
           ON b.company_id=s.company_id
          AND b.id=s.bank_account_id
          AND b.deleted_at IS NULL
         LEFT JOIN accounting_reconciliation_suggestions g
           ON g.company_id=s.company_id
          AND g.statement_line_id=s.id
          AND g.deleted_at IS NULL
         WHERE s.company_id=$1
           AND s.deleted_at IS NULL
           AND s.reconciliation_status IN ('unmatched','suggested','excluded')
         GROUP BY s.id,b.name
         ORDER BY
           CASE s.reconciliation_status
             WHEN 'suggested' THEN 0
             WHEN 'unmatched' THEN 1
             ELSE 2
           END,
           s.transaction_date DESC,
           s.created_at DESC,
           s.id DESC
         LIMIT 100 OFFSET $2`,
        [context.companyId,(page-1)*100],
      ),
      client.query(
        `SELECT
           r.id::text,
           r.bank_account_id::text,
           r.name,
           r.match_text,
           r.min_amount::text,
           r.max_amount::text,
           r.target_account_id::text,
           a.code AS target_account_code,
           a.name AS target_account_name,
           r.match_field,
           r.match_operator,
           r.direction,
           r.days_tolerance,
           r.amount_tolerance::text,
           r.auto_apply,
           r.priority,
           r.status
         FROM accounting_reconciliation_rules r
         LEFT JOIN accounts a
           ON a.company_id=r.company_id
          AND a.id=r.target_account_id
          AND a.deleted_at IS NULL
         WHERE r.company_id=$1
           AND r.deleted_at IS NULL
         ORDER BY r.status,r.priority,r.name,r.id`,
        [context.companyId],
      ),
      client.query(
        `SELECT
           r.id::text,
           r.reconciliation_number,
           b.name AS bank_account_name,
           r.statement_line_id::text,
           r.reconciliation_date::text,
           r.method,
           r.statement_amount::text,
           r.matched_amount::text,
           r.difference_amount::text,
           r.status,
           r.adjustment_journal_id::text,
           r.reversal_journal_id::text,
           r.notes
         FROM accounting_reconciliations r
         JOIN accounting_bank_accounts b
           ON b.company_id=r.company_id
          AND b.id=r.bank_account_id
          AND b.deleted_at IS NULL
         WHERE r.company_id=$1
           AND r.deleted_at IS NULL
         ORDER BY r.reconciliation_date DESC,r.created_at DESC,r.id DESC
         LIMIT 100`,
        [context.companyId],
      ),
      client.query(
        `SELECT id::text,code,name,account_type
         FROM accounts
         WHERE company_id=$1
           AND deleted_at IS NULL
           AND is_active=TRUE
           AND allow_manual_posting=TRUE
         ORDER BY code,name`,
        [context.companyId],
      ),
      client.query(
        `SELECT
           COUNT(*) FILTER (
             WHERE reconciliation_status='unmatched'
           )::int AS unmatched,
           COUNT(*) FILTER (
             WHERE reconciliation_status='suggested'
           )::int AS suggested,
           COUNT(*) FILTER (
             WHERE reconciliation_status='excluded'
           )::int AS excluded,
           (
             SELECT COUNT(*)::int
             FROM accounting_reconciliations
             WHERE company_id=$1
               AND deleted_at IS NULL
               AND status='matched'
               AND reconciliation_date >= DATE_TRUNC('month',CURRENT_DATE)::date
           ) AS matched_this_month
         FROM accounting_bank_statement_lines
         WHERE company_id=$1
           AND deleted_at IS NULL`,
        [context.companyId],
      ),
    ]);

    let selectedStatementLine: Record<string,unknown> | null = null;

    if (selectedId) {
      const selected = await client.query(
        `SELECT
           s.id::text,
           s.bank_account_id::text,
           b.name AS bank_account_name,
           b.ledger_account_id::text,
           s.transaction_date::text,
           s.value_date::text,
           s.description,
           s.external_reference,
           s.counterparty,
           s.amount::text,
           s.reconciliation_status,
           s.source_type,
           0::int AS suggestion_count,
           NULL::int AS top_confidence
         FROM accounting_bank_statement_lines s
         JOIN accounting_bank_accounts b
           ON b.company_id=s.company_id
          AND b.id=s.bank_account_id
          AND b.deleted_at IS NULL
         WHERE s.company_id=$1
           AND s.id=$2
           AND s.deleted_at IS NULL
         LIMIT 1`,
        [context.companyId,selectedId],
      );
      selectedStatementLine = selected.rows[0] || null;
    }

    const candidates = selectedStatementLine &&
      selectedStatementLine.reconciliation_status !== "excluded"
      ? await candidatesForStatement(
          client,
          context.companyId,
          selectedStatementLine,
        )
      : [];

    const suggestions = selectedId
      ? await client.query(
          `SELECT
             g.id::text,
             g.statement_line_id::text,
             g.suggestion_type,
             g.journal_line_id::text,
             g.rule_id::text,
             g.confidence,
             g.suggested_amount::text,
             g.reason,
             v.journal_number,
             v.journal_date::text,
             v.journal_description,
             a.code AS target_account_code,
             a.name AS target_account_name
           FROM accounting_reconciliation_suggestions g
           LEFT JOIN accounting_reconciliation_journal_availability v
             ON v.company_id=g.company_id
            AND v.journal_line_id=g.journal_line_id
           LEFT JOIN accounting_reconciliation_rules r
             ON r.company_id=g.company_id
            AND r.id=g.rule_id
            AND r.deleted_at IS NULL
           LEFT JOIN accounts a
             ON a.company_id=r.company_id
            AND a.id=r.target_account_id
            AND a.deleted_at IS NULL
           WHERE g.company_id=$1
             AND g.statement_line_id=$2
             AND g.deleted_at IS NULL
             AND g.status='pending'
           ORDER BY g.confidence DESC,g.created_at,g.id`,
          [context.companyId,selectedId],
        )
      : { rows: [] };

    await client.query("COMMIT");

    const m = metrics.rows[0] || {};

    return {
      companyId:context.companyId,
      currency:context.company.currentCompany.currency,
      accounts:accounts.rows as AccountingReconciliationWorkspace["accounts"],
      statementLines:statementLines.rows as AccountingReconciliationWorkspace["statementLines"],
      selectedStatementLine:
        selectedStatementLine as AccountingReconciliationWorkspace["selectedStatementLine"],
      candidates,
      suggestions:
        suggestions.rows as AccountingReconciliationWorkspace["suggestions"],
      rules:rules.rows as AccountingReconciliationWorkspace["rules"],
      reconciliations:
        reconciliations.rows as AccountingReconciliationWorkspace["reconciliations"],
      targetAccounts:
        targetAccounts.rows as AccountingReconciliationWorkspace["targetAccounts"],
      metrics:{
        unmatched:Number(m.unmatched || 0),
        suggested:Number(m.suggested || 0),
        matchedThisMonth:Number(m.matched_this_month || 0),
        excluded:Number(m.excluded || 0),
      },
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}


export async function generateReconciliationSuggestions(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_reconciliation_suggestions",
    "edit",
  );
  const body = bodyOf(input);
  const statementLineId = accountingId(body.statementLineId);
  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["accounting:statement-reconciliation:"+statementLineId],
    );

    const statement = await statementForUpdate(
      client,
      context.companyId,
      statementLineId,
    );

    if (!["unmatched","suggested"].includes(String(statement.reconciliation_status))) {
      throw new AccountingInputError(
        "Only unmatched statement lines can receive reconciliation suggestions.",
      );
    }

    await client.query(
      `UPDATE accounting_reconciliation_suggestions
       SET status='stale',updated_by=$3,updated_at=NOW()
       WHERE company_id=$1
         AND statement_line_id=$2
         AND deleted_at IS NULL
         AND status='pending'`,
      [context.companyId,statementLineId,context.userId],
    );

    const candidates = await candidatesForStatement(
      client,
      context.companyId,
      statement,
    );

    let inserted = 0;

    for (const candidate of candidates.slice(0,20)) {
      const confidence = candidateConfidence(statement,candidate);
      if (confidence < 45) continue;

      const statementAmount = signedCents(statement.amount);
      const available = signedCents(candidate.remaining_amount);

      if (absolute(available) < absolute(statementAmount)) {
        continue;
      }

      const suggestionAmount = statementAmount;

      await client.query(
        `INSERT INTO accounting_reconciliation_suggestions (
           company_id,statement_line_id,suggestion_type,journal_line_id,
           confidence,suggested_amount,reason,status,created_by,updated_by
         )
         VALUES ($1,$2,'existing',$3,$4,$5,$6,'pending',$7,$7)`,
        [
          context.companyId,
          statementLineId,
          candidate.journal_line_id,
          confidence,
          decimalAmount(suggestionAmount),
          "Posted bank ledger candidate scored by amount, date and reference similarity.",
          context.userId,
        ],
      );
      inserted += 1;
      if (inserted >= 8) break;
    }

    const rules = await client.query(
      `SELECT *
       FROM accounting_reconciliation_rules
       WHERE company_id=$1
         AND deleted_at IS NULL
         AND status='active'
       ORDER BY priority,name,id`,
      [context.companyId],
    );

    for (const rule of rules.rows) {
      if (!rule.target_account_id || !ruleMatches(rule,statement)) continue;

      const tolerance = nonNegativeAmount(rule.amount_tolerance || "0","Amount tolerance");
      const confidence = tolerance === BigInt(0) ? 85 : 75;

      await client.query(
        `INSERT INTO accounting_reconciliation_suggestions (
           company_id,statement_line_id,suggestion_type,rule_id,
           confidence,suggested_amount,reason,status,created_by,updated_by
         )
         VALUES ($1,$2,'rule',$3,$4,$5,$6,'pending',$7,$7)`,
        [
          context.companyId,
          statementLineId,
          rule.id,
          confidence,
          decimalAmount(signedCents(statement.amount)),
          "Active reconciliation rule '" + String(rule.name) + "' matches this statement line.",
          context.userId,
        ],
      );
      inserted += 1;
      if (inserted >= 12) break;
    }

    await client.query(
      `UPDATE accounting_bank_statement_lines
       SET reconciliation_status=$3,updated_by=$4,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [
        context.companyId,
        statementLineId,
        inserted ? "suggested" : "unmatched",
        context.userId,
      ],
    );

    await client.query("COMMIT");

    return {
      statementLineId,
      suggestionCount:inserted,
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}


type AllocationInput = {
  journalLineId: string;
  amount: bigint;
};


function allocationsFrom(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 50) {
    throw new AccountingInputError(
      "Choose between 1 and 50 posted bank journal allocations.",
    );
  }

  const seen = new Set<string>();

  return value.map((raw,index): AllocationInput => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new AccountingInputError("Allocation " + (index+1) + " is invalid.");
    }
    const row = raw as Record<string,unknown>;
    const journalLineId = accountingId(row.journalLineId);
    if (seen.has(journalLineId)) {
      throw new AccountingInputError("Each journal line can appear only once.");
    }
    seen.add(journalLineId);

    const amount = signedCents(row.amount);
    if (amount === BigInt(0)) {
      throw new AccountingInputError("Allocation amount cannot be zero.");
    }

    return { journalLineId,amount };
  });
}


async function insertReconciliation(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    statement: Record<string,unknown>;
    method: "manual" | "suggestion" | "split" | "rule" | "adjustment";
    matchedAmount: bigint;
    ruleId?: string | null;
    adjustmentJournalId?: string | null;
    notes?: string | null;
    allocations: AllocationInput[];
    acceptedSuggestionId?: string | null;
    requestKey: string;
    requestHash: string;
  },
) {
  const statementAmount = signedCents(input.statement.amount);

  if (input.matchedAmount !== statementAmount) {
    throw new AccountingInputError(
      "A statement line can only be marked reconciled when its full signed amount is allocated.",
    );
  }

  const number = await nextReconciliationNumber(client,input.companyId);
  const result = await client.query(
    `INSERT INTO accounting_reconciliations (
       company_id,reconciliation_number,request_key,request_hash,bank_account_id,statement_line_id,
       reconciliation_date,method,rule_id,statement_amount,matched_amount,
       difference_amount,status,adjustment_journal_id,notes,reconciled_by,
       created_by,updated_by
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,'matched',$12,$13,$14,$14,$14
     )
     RETURNING id::text`,
    [
      input.companyId,
      number,
      input.requestKey,
      input.requestHash,
      input.statement.bank_account_id,
      input.statement.id,
      input.statement.transaction_date,
      input.method,
      input.ruleId || null,
      decimalAmount(statementAmount),
      decimalAmount(input.matchedAmount),
      input.adjustmentJournalId || null,
      input.notes || null,
      input.userId,
    ],
  );

  const id = String(result.rows[0].id);

  let sequence = 10;
  for (const allocation of input.allocations) {
    await client.query(
      `INSERT INTO accounting_reconciliation_matches (
         company_id,reconciliation_id,journal_line_id,match_amount,sequence,
         created_by,updated_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$6)`,
      [
        input.companyId,
        id,
        allocation.journalLineId,
        decimalAmount(allocation.amount),
        sequence,
        input.userId,
      ],
    );
    sequence += 10;
  }

  await client.query(
    `UPDATE accounting_bank_statement_lines
     SET
       reconciliation_status='matched',
       matched_journal_line_id=$3,
       excluded_reason=NULL,
       excluded_by=NULL,
       excluded_at=NULL,
       updated_by=$4,
       updated_at=NOW()
     WHERE company_id=$1 AND id=$2`,
    [
      input.companyId,
      input.statement.id,
      input.allocations.length === 1
        ? input.allocations[0].journalLineId
        : null,
      input.userId,
    ],
  );

  if (input.acceptedSuggestionId) {
    await client.query(
      `UPDATE accounting_reconciliation_suggestions
       SET status='accepted',accepted_at=NOW(),accepted_by=$4,
           updated_by=$4,updated_at=NOW()
       WHERE company_id=$1
         AND statement_line_id=$2
         AND id=$3
         AND deleted_at IS NULL
         AND status='pending'`,
      [
        input.companyId,
        input.statement.id,
        input.acceptedSuggestionId,
        input.userId,
      ],
    );
  }

  await client.query(
    `UPDATE accounting_reconciliation_suggestions
     SET status='stale',updated_by=$3,updated_at=NOW()
     WHERE company_id=$1
       AND statement_line_id=$2
       AND deleted_at IS NULL
       AND status='pending'`,
    [input.companyId,input.statement.id,input.userId],
  );

  return { id,reconciliationNumber:number };
}


export async function reconcileStatementLine(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_reconciliations",
    "edit",
  );
  const body = bodyOf(input);
  const statementLineId = accountingId(body.statementLineId);
  const allocations = allocationsFrom(body.allocations);
  const notes = shortText(body.notes,2000,"Notes") || null;
  const suggestionId = body.suggestionId
    ? accountingId(body.suggestionId)
    : null;
  const key = requestKey(body.requestKey);
  const hash = requestHash({
    statementLineId,
    allocations: allocations.map(row => ({
      journalLineId:row.journalLineId,
      amount:decimalAmount(row.amount),
    })),
    notes,
    suggestionId,
  });
  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["accounting:reconciliation-request:"+key],
    );

    const replay = await client.query(
      `SELECT id::text,reconciliation_number,request_hash
       FROM accounting_reconciliations
       WHERE company_id=$1
         AND request_key=$2
         AND deleted_at IS NULL
       LIMIT 1`,
      [context.companyId,key],
    );

    if (replay.rows[0]) {
      if (String(replay.rows[0].request_hash) !== hash) {
        throw new AccountingInputError(
          "This reconciliation request key was already used with different content.",
        );
      }

      await client.query("COMMIT");

      return {
        id:String(replay.rows[0].id),
        reconciliationNumber:String(replay.rows[0].reconciliation_number),
        replayed:true,
      };
    }

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["accounting:statement-reconciliation:"+statementLineId],
    );

    const statement = await statementForUpdate(
      client,
      context.companyId,
      statementLineId,
    );

    if (!["unmatched","suggested"].includes(String(statement.reconciliation_status))) {
      throw new AccountingInputError("This statement line is no longer available to reconcile.");
    }

    const statementAmount = signedCents(statement.amount);
    let sum = BigInt(0);

    for (const id of allocations.map(item=>item.journalLineId).sort()) {
      await client.query(
        `SELECT id FROM journal_lines
         WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
         FOR UPDATE`,
        [context.companyId,id],
      );
    }

    for (const allocation of allocations) {
      const result = await client.query(
        `SELECT journal_line_id::text,account_id::text,remaining_amount::text
         FROM accounting_reconciliation_journal_availability
         WHERE company_id=$1 AND journal_line_id=$2
         LIMIT 1`,
        [context.companyId,allocation.journalLineId],
      );
      const candidate = result.rows[0];

      if (!candidate) {
        throw new AccountingInputError("One selected journal line is not a posted ledger candidate.");
      }
      if (String(candidate.account_id) !== String(statement.ledger_account_id)) {
        throw new AccountingInputError("Every allocation must belong to this financial account's ledger account.");
      }

      const remaining = signedCents(candidate.remaining_amount);

      if (!sameDirection(statementAmount,allocation.amount) ||
          !sameDirection(remaining,allocation.amount)) {
        throw new AccountingInputError("Allocation direction must match both the statement and bank journal line.");
      }

      if (absolute(allocation.amount) > absolute(remaining)) {
        throw new AccountingInputError("An allocation exceeds the remaining unreconciled journal amount.");
      }

      sum += allocation.amount;
    }

    if (sum !== statementAmount) {
      throw new AccountingInputError(
        "Split allocations must add exactly to the signed statement amount.",
      );
    }

    let method: "manual" | "suggestion" | "split" = allocations.length > 1
      ? "split"
      : "manual";

    if (suggestionId) {
      if (allocations.length !== 1) {
        throw new AccountingInputError(
          "A saved suggestion can only accept one suggested journal allocation.",
        );
      }
      const suggestion = await client.query(
        `SELECT id
         FROM accounting_reconciliation_suggestions
         WHERE company_id=$1
           AND id=$2
           AND statement_line_id=$3
           AND suggestion_type='existing'
           AND journal_line_id=$4
           AND suggested_amount=$5
           AND deleted_at IS NULL
           AND status='pending'
         LIMIT 1
         FOR UPDATE`,
        [
          context.companyId,
          suggestionId,
          statementLineId,
          allocations[0].journalLineId,
          decimalAmount(allocations[0].amount),
        ],
      );
      if (!suggestion.rows[0]) {
        throw new AccountingInputError(
          "This reconciliation suggestion is no longer valid.",
        );
      }
      method = "suggestion";
    }

    const reconciliation = await insertReconciliation(client,{
      companyId:context.companyId,
      userId:context.userId,
      statement,
      method,
      matchedAmount:sum,
      notes,
      allocations,
      acceptedSuggestionId:suggestionId,
      requestKey:key,
      requestHash:hash,
    });

    await client.query("COMMIT");

    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      action:"accounting.reconciliation.matched",
      module:"accounting",
      resourceType:"accounting_reconciliations",
      resourceId:reconciliation.id,
      summary:"Bank statement line reconciled to posted ledger movement",
      result:"success",
      metadata:{
        statementLineId,
        method,
        allocationCount:allocations.length,
        amount:decimalAmount(sum),
      },
    }).catch(error =>
      console.error("[Accounting] Reconciliation audit delivery failed",error),
    );

    return reconciliation;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}


export async function createReconciliationRule(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_reconciliation_rules",
    "create",
  );
  const body = bodyOf(input);

  const name = shortText(body.name,160,"Rule name",true);
  const matchText = shortText(body.matchText,255,"Match text") || null;
  const bankAccountId = body.bankAccountId ? accountingId(body.bankAccountId) : null;
  const targetAccountId = accountingId(body.targetAccountId);
  const matchField = String(body.matchField || "any");
  const matchOperator = String(body.matchOperator || "contains");
  const direction = String(body.direction || "any");

  if (!["any","description","reference","counterparty"].includes(matchField)) {
    throw new AccountingInputError("Choose a supported rule match field.");
  }
  if (!["contains","equals","starts_with"].includes(matchOperator)) {
    throw new AccountingInputError("Choose a supported rule match operator.");
  }
  if (!["any","inflow","outflow"].includes(direction)) {
    throw new AccountingInputError("Choose any, inflow or outflow direction.");
  }

  const minAmount = body.minAmount ? nonNegativeAmount(body.minAmount,"Minimum amount") : null;
  const maxAmount = body.maxAmount ? nonNegativeAmount(body.maxAmount,"Maximum amount") : null;
  if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
    throw new AccountingInputError("Minimum amount cannot exceed maximum amount.");
  }

  const daysTolerance = integerValue(body.daysTolerance ?? 7,"Days tolerance",0,365);
  const amountTolerance = nonNegativeAmount(body.amountTolerance ?? "0","Amount tolerance");
  const priority = integerValue(body.priority ?? 100,"Priority",0,999999);
  const autoApply = body.autoApply === true;
  const descriptionTemplate = shortText(
    body.descriptionTemplate,500,"Description template",
  ) || null;

  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");
    await targetAccount(client,context.companyId,targetAccountId);

    if (bankAccountId) {
      const bank = await client.query(
        `SELECT id FROM accounting_bank_accounts
         WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1`,
        [context.companyId,bankAccountId],
      );
      if (!bank.rows[0]) {
        throw new AccountingInputError("Choose a financial account from this company.");
      }
    }

    const result = await client.query(
      `INSERT INTO accounting_reconciliation_rules (
         company_id,bank_account_id,name,match_text,min_amount,max_amount,target_account_id,
         priority,status,match_field,match_operator,direction,days_tolerance,amount_tolerance,
         auto_apply,description_template,created_by,updated_by
       )
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$11,$12,$13,$14,$15,$16,$16
       )
       RETURNING id::text`,
      [
        context.companyId,bankAccountId,name,matchText,
        minAmount===null?null:decimalAmount(minAmount),
        maxAmount===null?null:decimalAmount(maxAmount),
        targetAccountId,priority,matchField,matchOperator,direction,
        daysTolerance,decimalAmount(amountTolerance),autoApply,
        descriptionTemplate,context.userId,
      ],
    );

    await client.query("COMMIT");
    return { id:String(result.rows[0].id) };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}


export async function changeReconciliationRuleStatus(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_reconciliation_rules",
    "edit",
  );
  const body = bodyOf(input);
  const id = accountingId(body.id);
  const status = String(body.status || "");

  if (!["active","inactive"].includes(status)) {
    throw new AccountingInputError("Choose active or inactive.");
  }

  const result = await context.pool.query(
    `UPDATE accounting_reconciliation_rules
     SET status=$3,updated_by=$4,updated_at=NOW()
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
     RETURNING id::text`,
    [context.companyId,id,status,context.userId],
  );

  if (!result.rows[0]) {
    throw new AccountingInputError("Reconciliation rule not found.");
  }

  return { id,status };
}


export async function applyReconciliationRule(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_reconciliations",
    "edit",
  );
  const body = bodyOf(input);
  const statementLineId = accountingId(body.statementLineId);
  const ruleId = accountingId(body.ruleId);
  const suggestionId = body.suggestionId
    ? accountingId(body.suggestionId)
    : null;
  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["accounting:statement-reconciliation:"+statementLineId],
    );

    const statement = await statementForUpdate(
      client,
      context.companyId,
      statementLineId,
    );

    if (!["unmatched","suggested"].includes(String(statement.reconciliation_status))) {
      throw new AccountingInputError("This statement line is no longer available to reconcile.");
    }

    const ruleResult = await client.query(
      `SELECT *
       FROM accounting_reconciliation_rules
       WHERE company_id=$1
         AND id=$2
         AND deleted_at IS NULL
         AND status='active'
       LIMIT 1
       FOR SHARE`,
      [context.companyId,ruleId],
    );
    const rule = ruleResult.rows[0];

    if (!rule || !rule.target_account_id || !ruleMatches(rule,statement)) {
      throw new AccountingInputError("This active reconciliation rule does not match the statement line.");
    }

    if (suggestionId) {
      const suggestion = await client.query(
        `SELECT id
         FROM accounting_reconciliation_suggestions
         WHERE company_id=$1
           AND id=$2
           AND statement_line_id=$3
           AND suggestion_type='rule'
           AND rule_id=$4
           AND deleted_at IS NULL
           AND status='pending'
         LIMIT 1
         FOR UPDATE`,
        [context.companyId,suggestionId,statementLineId,ruleId],
      );
      if (!suggestion.rows[0]) {
        throw new AccountingInputError("This rule suggestion is no longer valid.");
      }
    }

    const target = await targetAccount(
      client,
      context.companyId,
      String(rule.target_account_id),
    );

    if (String(target.id) === String(statement.ledger_account_id)) {
      throw new AccountingInputError("Adjustment target cannot be the same bank ledger account.");
    }

    const amount = signedCents(statement.amount);
    const positive = amount > BigInt(0);
    const absoluteAmount = absolute(amount);
    const description =
      String(rule.description_template || "").trim() ||
      String(statement.description || rule.name);

    const journal = await postBalancedLedgerJournal(client,{
      companyId:context.companyId,
      userId:context.userId,
      journalDate:String(statement.transaction_date),
      description:"Bank reconciliation · " + description,
      reference:String(statement.external_reference || statement.id),
      sourceModule:"accounting",
      sourceType:"bank_reconciliation_adjustment",
      sourceId:statementLineId,
      sourceEventKey:"accounting:bank-reconciliation-rule:"+statementLineId+":"+ruleId,
      postingKind:"system",
      lines: positive
        ? [
            {
              accountId:String(statement.ledger_account_id),
              description,
              debit:decimalAmount(absoluteAmount),
              credit:"0.00",
            },
            {
              accountId:String(target.id),
              description,
              debit:"0.00",
              credit:decimalAmount(absoluteAmount),
            },
          ]
        : [
            {
              accountId:String(target.id),
              description,
              debit:decimalAmount(absoluteAmount),
              credit:"0.00",
            },
            {
              accountId:String(statement.ledger_account_id),
              description,
              debit:"0.00",
              credit:decimalAmount(absoluteAmount),
            },
          ],
    });

    const bankLine = await client.query(
      `SELECT id::text,(debit-credit)::text AS amount
       FROM journal_lines
       WHERE company_id=$1
         AND journal_id=$2
         AND account_id=$3
         AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [
        context.companyId,
        journal.journalId,
        statement.ledger_account_id,
      ],
    );

    if (!bankLine.rows[0]) {
      throw new AccountingInputError("Adjustment journal did not produce a bank ledger line.");
    }

    const allocation: AllocationInput = {
      journalLineId:String(bankLine.rows[0].id),
      amount:signedCents(bankLine.rows[0].amount),
    };

    const reconciliation = await insertReconciliation(client,{
      companyId:context.companyId,
      userId:context.userId,
      statement,
      method:"rule",
      matchedAmount:allocation.amount,
      ruleId,
      adjustmentJournalId:journal.journalId,
      notes:"Created from reconciliation rule " + String(rule.name),
      allocations:[allocation],
      acceptedSuggestionId:suggestionId,
    });

    await client.query("COMMIT");

    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      action:"accounting.reconciliation.rule_applied",
      module:"accounting",
      resourceType:"accounting_reconciliations",
      resourceId:reconciliation.id,
      summary:"Bank statement line reconciled with a rule-generated adjustment journal",
      result:"success",
      metadata:{
        statementLineId,
        ruleId,
        adjustmentJournalId:journal.journalId,
        amount:decimalAmount(amount),
      },
    }).catch(error =>
      console.error("[Accounting] Rule reconciliation audit delivery failed",error),
    );

    return {
      ...reconciliation,
      adjustmentJournalId:journal.journalId,
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}


export async function excludeStatementLine(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_bank_statement_lines",
    "edit",
  );
  const body = bodyOf(input);
  const statementLineId = accountingId(body.statementLineId);
  const excluded = body.excluded !== false;
  const reason = excluded
    ? shortText(body.reason,2000,"Exclusion reason",true)
    : null;
  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    const statement = await statementForUpdate(
      client,
      context.companyId,
      statementLineId,
    );

    if (excluded && !["unmatched","suggested"].includes(String(statement.reconciliation_status))) {
      throw new AccountingInputError("Only unmatched statement lines can be excluded.");
    }
    if (!excluded && statement.reconciliation_status !== "excluded") {
      throw new AccountingInputError("Only excluded statement lines can be restored.");
    }

    await client.query(
      `UPDATE accounting_bank_statement_lines
       SET
         reconciliation_status=$3,
         excluded_reason=$4,
         excluded_by=$5,
         excluded_at=$6,
         updated_by=$5,
         updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [
        context.companyId,
        statementLineId,
        excluded ? "excluded" : "unmatched",
        excluded ? reason : null,
        context.userId,
        excluded ? new Date().toISOString() : null,
      ],
    );

    if (excluded) {
      await client.query(
        `UPDATE accounting_reconciliation_suggestions
         SET status='stale',updated_by=$3,updated_at=NOW()
         WHERE company_id=$1
           AND statement_line_id=$2
           AND deleted_at IS NULL
           AND status='pending'`,
        [context.companyId,statementLineId,context.userId],
      );
    }

    await client.query("COMMIT");

    return {
      statementLineId,
      reconciliationStatus:excluded ? "excluded" : "unmatched",
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}


export async function dismissReconciliationSuggestion(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_reconciliation_suggestions",
    "edit",
  );
  const body = bodyOf(input);
  const id = accountingId(body.id);

  const result = await context.pool.query(
    `UPDATE accounting_reconciliation_suggestions
     SET status='dismissed',dismissed_at=NOW(),dismissed_by=$3,
         updated_by=$3,updated_at=NOW()
     WHERE company_id=$1
       AND id=$2
       AND deleted_at IS NULL
       AND status='pending'
     RETURNING id::text,statement_line_id::text`,
    [context.companyId,id,context.userId],
  );

  if (!result.rows[0]) {
    throw new AccountingInputError("Pending reconciliation suggestion not found.");
  }

  return {
    id,
    statementLineId:String(result.rows[0].statement_line_id),
  };
}


export async function reverseReconciliation(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    "accounting",
    "accounting_reconciliations",
    "edit",
  );
  const body = bodyOf(input);
  const id = accountingId(body.id);
  const reversalDate = accountingDate(body.reversalDate);
  const client = await context.pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT
         r.id::text,
         r.statement_line_id::text,
         r.status,
         r.adjustment_journal_id::text,
         r.reversal_journal_id::text,
         r.reconciliation_number
       FROM accounting_reconciliations r
       WHERE r.company_id=$1
         AND r.id=$2
         AND r.deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [context.companyId,id],
    );
    const reconciliation = result.rows[0];

    if (!reconciliation || reconciliation.status !== "matched") {
      if (reconciliation?.reversal_journal_id) {
        await client.query("COMMIT");
        return {
          id,
          reversalJournalId:String(reconciliation.reversal_journal_id),
          replayed:true,
        };
      }
      throw new AccountingInputError("Only an active reconciliation can be reversed.");
    }

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["accounting:statement-reconciliation:"+String(reconciliation.statement_line_id)],
    );

    let reversalJournalId: string | null = null;

    if (reconciliation.adjustment_journal_id) {
      const reversal = await reversePostedLedgerJournal(client,{
        companyId:context.companyId,
        userId:context.userId,
        originalJournalId:String(reconciliation.adjustment_journal_id),
        journalDate:reversalDate,
        description:
          "Reverse bank reconciliation · " +
          String(reconciliation.reconciliation_number),
        sourceModule:"accounting",
        sourceType:"bank_reconciliation_reversal",
        sourceId:id,
        sourceEventKey:"accounting:bank-reconciliation:"+id+":reverse",
      });
      reversalJournalId = reversal.journalId;
    }

    await client.query(
      `UPDATE accounting_reconciliations
       SET
         status='reversed',
         reversal_journal_id=$3,
         reversed_by=$4,
         reversed_at=NOW(),
         updated_by=$4,
         updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,id,reversalJournalId,context.userId],
    );

    await client.query(
      `UPDATE accounting_bank_statement_lines
       SET
         reconciliation_status='unmatched',
         matched_journal_line_id=NULL,
         updated_by=$3,
         updated_at=NOW()
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`,
      [
        context.companyId,
        reconciliation.statement_line_id,
        context.userId,
      ],
    );

    await client.query("COMMIT");

    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      action:"accounting.reconciliation.reversed",
      module:"accounting",
      resourceType:"accounting_reconciliations",
      resourceId:id,
      summary:"Bank reconciliation reversed",
      result:"success",
      metadata:{
        statementLineId:String(reconciliation.statement_line_id),
        reversalJournalId,
      },
    }).catch(error =>
      console.error("[Accounting] Reconciliation reversal audit delivery failed",error),
    );

    return {
      id,
      reversalJournalId,
      replayed:false,
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
