import 'server-only';

import type { PoolClient } from 'pg';

function cents(value: string | number) {
  const text = String(value ?? '0').trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return BigInt(0);
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole,fraction=''] = unsigned.split('.');
  const result = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2,'0'));
  return negative ? -result : result;
}

function decimal(value: bigint) {
  const negative = value < BigInt(0);
  const amount = negative ? -value : value;
  return `${negative ? '-' : ''}${amount / BigInt(100)}.${String(amount % BigInt(100)).padStart(2,'0')}`;
}

async function dimensionsAvailable(client: Pick<PoolClient,'query'>) {
  const result = await client.query(
    "SELECT to_regclass('public.accounting_journal_line_dimensions') IS NOT NULL AS allocations_present,to_regclass('public.accounting_dimension_rules') IS NOT NULL AS rules_present",
  );
  return result.rows[0]?.allocations_present === true && result.rows[0]?.rules_present === true;
}

export async function applyAccountingDimensionRules(
  client: PoolClient,
  input: {
    companyId: string;
    journalLineId: string;
    accountId: string;
    sourceModule: string;
    debit: string;
    credit: string;
    userId: string;
  },
) {
  if (!(await dimensionsAvailable(client))) return { applied: 0 };

  const settings = await client.query(
    "SELECT enabled,auto_apply_rules FROM accounting_dimension_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1",
    [input.companyId],
  );
  if (settings.rows[0]?.enabled === false || settings.rows[0]?.auto_apply_rules === false) {
    return { applied: 0 };
  }

  const rules = await client.query(
    `SELECT r.id::text,r.department_id::text,r.analytic_project_id::text,r.basis_points
       FROM accounting_dimension_rules r
       LEFT JOIN departments d ON d.id=r.department_id AND d.company_id=r.company_id
       LEFT JOIN accounting_analytic_projects p ON p.id=r.analytic_project_id AND p.company_id=r.company_id
       WHERE r.company_id=$1
         AND r.deleted_at IS NULL
         AND r.enabled=TRUE
         AND (r.account_id IS NULL OR r.account_id=$2)
         AND (r.source_module IS NULL OR LOWER(r.source_module)=LOWER($3))
         AND (r.department_id IS NULL OR d.is_active=TRUE)
         AND (r.analytic_project_id IS NULL OR (p.deleted_at IS NULL AND p.status='open'))
       ORDER BY
         (CASE WHEN r.account_id IS NULL THEN 0 ELSE 2 END +
          CASE WHEN r.source_module IS NULL THEN 0 ELSE 1 END) DESC,
         r.priority ASC,
         r.created_at ASC,
         r.id ASC
       LIMIT 20`,
    [input.companyId,input.accountId,input.sourceModule],
  );

  if (!rules.rows.length) return { applied: 0 };

  const allocationSetId = crypto.randomUUID();
  const lineNet = cents(input.debit) - cents(input.credit);
  let remaining = 10000;
  let remainingAmount = lineNet;
  let applied = 0;

  for (let index=0; index<rules.rows.length && remaining>0; index += 1) {
    const rule = rules.rows[index];
    const requested = Math.max(1,Math.min(10000,Number(rule.basis_points || 0)));
    const basisPoints = Math.min(remaining,requested);
    if (!basisPoints) continue;
    const allocationAmount =
      basisPoints === remaining
        ? remainingAmount
        : (lineNet * BigInt(basisPoints)) / BigInt(10000);

    await client.query(
      `INSERT INTO accounting_journal_line_dimensions(
        company_id,journal_line_id,allocation_set_id,revision_number,
        department_id,analytic_project_id,basis_points,line_net_amount,
        allocation_amount,origin,rule_id,active,created_by
      ) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,'rule',$9,TRUE,$10)`,
      [
        input.companyId,
        input.journalLineId,
        allocationSetId,
        rule.department_id || null,
        rule.analytic_project_id || null,
        basisPoints,
        decimal(lineNet),
        decimal(allocationAmount),
        rule.id,
        input.userId,
      ],
    );
    remaining -= basisPoints;
    remainingAmount -= allocationAmount;
    applied += 1;
  }

  return { applied };
}

export async function copyAccountingDimensionsForReversal(
  client: PoolClient,
  input: {
    companyId: string;
    originalJournalId: string;
    reversalJournalId: string;
    userId: string;
  },
) {
  if (!(await dimensionsAvailable(client))) return { copied: 0 };

  const original = await client.query(
    "SELECT id::text,row_number() OVER(ORDER BY created_at,id)::int AS ordinal FROM journal_lines WHERE company_id=$1 AND journal_id=$2 AND deleted_at IS NULL ORDER BY created_at,id",
    [input.companyId,input.originalJournalId],
  );
  const reversal = await client.query(
    "SELECT id::text,row_number() OVER(ORDER BY created_at,id)::int AS ordinal,debit::text,credit::text FROM journal_lines WHERE company_id=$1 AND journal_id=$2 AND deleted_at IS NULL ORDER BY created_at,id",
    [input.companyId,input.reversalJournalId],
  );
  if (original.rows.length !== reversal.rows.length) return { copied: 0 };

  let copied = 0;
  for (let index=0; index<original.rows.length; index += 1) {
    const source = original.rows[index];
    const target = reversal.rows[index];
    const allocations = await client.query(
      "SELECT department_id::text,analytic_project_id::text,basis_points FROM accounting_journal_line_dimensions WHERE company_id=$1 AND journal_line_id=$2 AND active=TRUE ORDER BY created_at,id",
      [input.companyId,source.id],
    );
    if (!allocations.rows.length) continue;

    const lineNet = cents(target.debit) - cents(target.credit);
    let remainingAmount = lineNet;
    const allocationSetId = crypto.randomUUID();

    for (let position=0; position<allocations.rows.length; position += 1) {
      const row = allocations.rows[position];
      const bps = Number(row.basis_points);
      const allocationAmount =
        position === allocations.rows.length - 1
          ? remainingAmount
          : (lineNet * BigInt(bps)) / BigInt(10000);
      remainingAmount -= allocationAmount;

      await client.query(
        `INSERT INTO accounting_journal_line_dimensions(
          company_id,journal_line_id,allocation_set_id,revision_number,
          department_id,analytic_project_id,basis_points,line_net_amount,
          allocation_amount,origin,active,created_by
        ) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,'reversal',TRUE,$9)`,
        [input.companyId,target.id,allocationSetId,row.department_id || null,row.analytic_project_id || null,bps,decimal(lineNet),decimal(allocationAmount),input.userId],
      );
      copied += 1;
    }
  }
  return { copied };
}
