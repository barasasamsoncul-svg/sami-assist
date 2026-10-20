import 'server-only';

import {
  cleanText,
  nullableText,
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type SalesLeadAssignmentRule = {
  id: string;
  name: string;
  sourceMatch: string | null;
  salesTeamId: string;
  salesTeamName: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type SalesLeadAssignmentRuleRow = {
  id: string;
  name: string;
  source_match: string | null;
  sales_team_id: string;
  sales_team_name: string | null;
  priority: number | string;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

const MAX_RULES_PER_WORKSPACE = 100;
const UNIQUE_VIOLATION = '23505';

/* -------------------------------------------------------------------------- */
/*  Mapper                                                                    */
/* -------------------------------------------------------------------------- */

function mapRule(row: SalesLeadAssignmentRuleRow): SalesLeadAssignmentRule {
  return {
    id: String(row.id),
    name: String(row.name),
    sourceMatch: row.source_match ? String(row.source_match) : null,
    salesTeamId: String(row.sales_team_id),
    salesTeamName: row.sales_team_name ? String(row.sales_team_name) : null,
    priority: Number(row.priority),
    isActive: row.is_active === true,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Read                                                                      */
/* -------------------------------------------------------------------------- */

export async function getSalesLeadAssignmentRules(): Promise<SalesLeadAssignmentRule[]> {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);

  const result = await context.pool.query<SalesLeadAssignmentRuleRow>(
    `SELECT rule.id, rule.name, rule.source_match, rule.sales_team_id,
            team.name AS sales_team_name, rule.priority, rule.is_active,
            rule.created_at, rule.updated_at
     FROM sales_lead_assignment_rules rule
     LEFT JOIN sales_teams team
       ON team.id = rule.sales_team_id AND team.company_id = rule.company_id
     WHERE rule.company_id = $1 AND rule.deleted_at IS NULL
     ORDER BY rule.priority ASC, LOWER(rule.name), rule.created_at, rule.id
     LIMIT ${MAX_RULES_PER_WORKSPACE}`,
    [context.companyId],
  );

  return result.rows.map(mapRule);
}

/* -------------------------------------------------------------------------- */
/*  Save                                                                      */
/* -------------------------------------------------------------------------- */

function parsePriority(value: unknown): number {
  const raw =
    value === undefined || value === null || value === '' ? 100 : Number(value);
  if (!Number.isInteger(raw) || raw < 1 || raw > 10_000) {
    throw new SalesError(
      'INVALID_INPUT',
      'Rule priority must be a whole number from 1 to 10000.',
    );
  }
  return raw;
}

function parseIsActive(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === false || value === 'false') return false;
  if (value === true || value === 'true') return true;
  return Boolean(value);
}

export async function saveSalesLeadAssignmentRule(
  input: Record<string, unknown>,
): Promise<SalesLeadAssignmentRule> {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);

  const rawId = cleanText(input.ruleId, 64);
  const ruleId = rawId ? requireUuid(rawId, 'Assignment rule') : null;

  const name = cleanText(input.name, 80);
  if (!name) {
    throw new SalesError('INVALID_INPUT', 'Enter a name for the lead-routing rule.');
  }

  const sourceMatch = nullableText(input.sourceMatch, 120);
  const salesTeamId = requireUuid(input.salesTeamId, 'Sales team');
  const priority = parsePriority(input.priority);
  const isActive = parseIsActive(input.isActive);

  const team = await context.pool.query(
    `SELECT id FROM sales_teams
     WHERE id = $1 AND company_id = $2 AND is_active = TRUE AND deleted_at IS NULL
     LIMIT 1`,
    [salesTeamId, context.companyId],
  );
  if (!team.rows[0]) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose an active Sales team for this rule.',
    );
  }

  try {
    if (ruleId) {
      const updated = await context.pool.query(
        `UPDATE sales_lead_assignment_rules
         SET name = $3,
             source_match = $4,
             sales_team_id = $5,
             priority = $6,
             is_active = $7,
             updated_by = $8,
             updated_at = NOW()
         WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
         RETURNING id`,
        [ruleId, context.companyId, name, sourceMatch, salesTeamId, priority, isActive, context.userId],
      );
      if (!updated.rows[0]) {
        throw new SalesError('INVALID_INPUT', 'The lead-routing rule was not found.');
      }
      const saved = (await getSalesLeadAssignmentRules()).find(
        (rule) => rule.id === ruleId,
      );
      if (!saved) {
        throw new SalesError(
          'INVALID_INPUT',
          'The updated lead-routing rule could not be reloaded.',
        );
      }
      return saved;
    }

    const count = await context.pool.query<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count
       FROM sales_lead_assignment_rules
       WHERE company_id = $1 AND deleted_at IS NULL`,
      [context.companyId],
    );
    if (Number(count.rows[0]?.count || 0) >= MAX_RULES_PER_WORKSPACE) {
      throw new SalesError(
        'INVALID_INPUT',
        `This workspace already has ${MAX_RULES_PER_WORKSPACE} lead-routing rules. Delete an unused rule before adding another.`,
      );
    }

    const inserted = await context.pool.query<{ id: string }>(
      `INSERT INTO sales_lead_assignment_rules
         (company_id, name, source_match, sales_team_id, priority,
          is_active, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
       RETURNING id`,
      [
        context.companyId,
        name,
        sourceMatch,
        salesTeamId,
        priority,
        isActive,
        context.userId,
      ],
    );
    const id = String(inserted.rows[0].id);

    const saved = (await getSalesLeadAssignmentRules()).find(
      (rule) => rule.id === id,
    );
    if (!saved) {
      throw new SalesError(
        'INVALID_INPUT',
        'The saved lead-routing rule could not be reloaded.',
      );
    }
    return saved;
  } catch (error) {
    if (error instanceof SalesError) throw error;
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === UNIQUE_VIOLATION
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'A routing rule with that name or source match already exists.',
      );
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*  Delete                                                                    */
/* -------------------------------------------------------------------------- */

export async function deleteSalesLeadAssignmentRule(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const ruleId = requireUuid(input.ruleId, 'Assignment rule');

  const result = await context.pool.query<{ id: string }>(
    `UPDATE sales_lead_assignment_rules
     SET deleted_at = NOW(), updated_by = $3, updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [ruleId, context.companyId, context.userId],
  );

  if (!result.rows[0]) {
    throw new SalesError('INVALID_INPUT', 'The lead-routing rule was not found.');
  }
  return { id: String(result.rows[0].id) };
}