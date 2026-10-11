import 'server-only';

import type { PoolClient } from 'pg';
import { queryControl } from '@/lib/db/control';

import { cleanText, isoDate, nullableText, numberInput, optionalUuid, requireSalesContext, requireUuid, SALES_PERMISSIONS, SalesError } from '@/lib/apps/sales/context';
import { scoreSalesLead } from '@/lib/apps/sales/lead-scoring';
import { chooseBalancedSalesLeadAssignee, selectSalesLeadAssignmentRule } from '@/lib/apps/sales/lead-assignment';

const stageSeed = [
  ['Qualification', 10, 20],
  ['Proposal', 20, 50],
  ['Negotiation', 30, 75],
] as const;

async function ensurePipelineStages(pool: Awaited<ReturnType<typeof requireSalesContext>>['pool'], companyId: string, userId: string) {
  const existing = await pool.query(`SELECT COUNT(*)::int AS count FROM sales_pipeline_stages WHERE company_id = $1`, [companyId]);
  if (Number(existing.rows[0]?.count || 0) === 0) {
    for (const [name, sequence, probability] of stageSeed) {
      await pool.query(`INSERT INTO sales_pipeline_stages (company_id,name,sequence,probability,stage_type,created_by,updated_by) VALUES ($1,$2,$3,$4,'open',$5,$5) ON CONFLICT DO NOTHING`, [companyId,name,sequence,probability,userId]);
    }
  }
  // Terminal stages must exist even when the company already has configured open stages.
  await pool.query(
    `INSERT INTO sales_pipeline_stages (company_id,name,sequence,probability,stage_type,created_by,updated_by)
     VALUES ($1,'Won',90,100,'won',$2,$2),($1,'Lost',100,0,'lost',$2,$2)
     ON CONFLICT DO NOTHING`,
    [companyId, userId],
  );
}

async function nextPipelineNumber(client: PoolClient, companyId:string, userId:string, type:'lead'|'opportunity', prefix:string) {
  await client.query(`INSERT INTO sales_sequences (company_id,document_type,prefix,next_number,padding,format,updated_by) VALUES ($1,$2,$3,1,6,'{prefix}{number}',$4) ON CONFLICT (company_id,document_type) DO NOTHING`,[companyId,type,prefix,userId]);
  const row=await client.query(`SELECT prefix,next_number,padding,format FROM sales_sequences WHERE company_id=$1 AND document_type=$2 FOR UPDATE`,[companyId,type]);
  const x=row.rows[0]; const value=String(x.format).replace('{prefix}',String(x.prefix)).replace('{number}',String(x.next_number).padStart(Number(x.padding), '0'));
  await client.query(`UPDATE sales_sequences SET next_number=next_number+1,updated_by=$3,updated_at=NOW() WHERE company_id=$1 AND document_type=$2`,[companyId,type,userId]);
  return value;
}


async function resolveActiveSalesperson(
  context: Awaited<ReturnType<typeof requireSalesContext>>,
  value: unknown,
) {
  const rawId = cleanText(value, 64);
  if (!rawId) return null;
  const userId = requireUuid(rawId, 'Salesperson');
  const result = await queryControl(
    `SELECT u.id
     FROM tenant_users tu
     INNER JOIN users u ON u.id = tu.user_id
     WHERE tu.tenant_id = $1
       AND tu.user_id = $2
       AND tu.status = 'active'
       AND tu.member_type = 'internal'
       AND tu.deleted_at IS NULL
       AND u.deleted_at IS NULL
     LIMIT 1`,
    [context.tenantId, userId],
  );
  if (!result.rows[0]) {
    throw new SalesError('INVALID_INPUT', 'Choose an active salesperson in this workspace.');
  }
  return userId;
}

function optionalPipelineDate(value: unknown, field: string) {
  const date = cleanText(value, 10);
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new SalesError('INVALID_INPUT', field + ' must be a valid date.');
  }
  const parsed = new Date(date + 'T00:00:00.000Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new SalesError('INVALID_INPUT', field + ' must be a valid date.');
  }
  return date;
}


function normalizeSalesLeadEmail(value: unknown) {
  const email = cleanText(value, 320).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SalesError('INVALID_INPUT', 'Enter a valid lead email address.');
  }
  return email || null;
}

function normalizeSalesLeadPhone(value: unknown) {
  const digits = cleanText(value, 80).replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

async function findSalesLeadDuplicates(
  context: Awaited<ReturnType<typeof requireSalesContext>>,
  email: string | null,
  phoneDigits: string | null,
) {
  if (!email && !phoneDigits) return [];
  const result = await context.pool.query(
    `SELECT id,lead_number,status,name,company_name,contact_name,email,phone,
            salesperson_user_id,created_at,
            CASE
              WHEN $2::text IS NOT NULL
                   AND $3::text IS NOT NULL
                   AND LOWER(BTRIM(COALESCE(email,'')))=$2
                   AND REGEXP_REPLACE(COALESCE(phone,''),'[^0-9]','','g')=$3
                THEN 'email_and_phone'
              WHEN $2::text IS NOT NULL
                   AND LOWER(BTRIM(COALESCE(email,'')))=$2
                THEN 'email'
              ELSE 'phone'
            END AS match_reason
     FROM sales_leads
     WHERE company_id=$1
       AND deleted_at IS NULL
       AND (
         ($2::text IS NOT NULL AND LOWER(BTRIM(COALESCE(email,'')))=$2)
         OR (
           $3::text IS NOT NULL
           AND REGEXP_REPLACE(COALESCE(phone,''),'[^0-9]','','g')=$3
         )
       )
     ORDER BY created_at DESC
     LIMIT 10`,
    [context.companyId, email, phoneDigits],
  );
  return result.rows;
}

export async function getSalesPipelineData() {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_VIEW);
  await ensurePipelineStages(context.pool, context.companyId, context.userId);
  const [stages, leads, opportunities, activities, salespeople, salesTeams, opportunityActivities, opportunityHistory] = await Promise.all([
    context.pool.query(
      `SELECT id,name,sequence,probability,stage_type,is_active
       FROM sales_pipeline_stages
       WHERE company_id=$1 AND is_active=TRUE
       ORDER BY sequence,name`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT l.id,l.lead_number,l.status,l.name,l.company_name,l.contact_name,l.email,l.phone,l.source,l.notes,
              l.salesperson_user_id,l.sales_team_id,l.territory_id,l.assignment_rule_id,assignment_rule.name AS assignment_rule_name,l.disqualification_reason,l.created_at,
              COALESCE(engagement.completed_engagement_count,0)::int AS completed_engagement_count,
              engagement.last_completed_engagement_at
       FROM sales_leads l
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (
                  WHERE a.status='completed' AND a.activity_type IN ('call','email','meeting')
                )::int AS completed_engagement_count,
                MAX(a.completed_at) FILTER (
                  WHERE a.status='completed' AND a.activity_type IN ('call','email','meeting')
                ) AS last_completed_engagement_at
         FROM sales_lead_activities a
         WHERE a.company_id=l.company_id
           AND a.lead_id=l.id
           AND a.deleted_at IS NULL
       ) engagement ON TRUE
       LEFT JOIN sales_lead_assignment_rules assignment_rule
         ON assignment_rule.id=l.assignment_rule_id AND assignment_rule.company_id=l.company_id
       WHERE l.company_id=$1 AND l.deleted_at IS NULL
       ORDER BY l.created_at DESC
       LIMIT 250`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT o.id,o.opportunity_number,o.lead_id,o.billing_customer_id,o.stage_id,o.name,
              o.customer_name,o.contact_name,o.email,o.phone,o.currency,o.expected_value,o.probability,
              o.expected_close_date,o.salesperson_user_id,o.sales_team_id,o.territory_id,o.source,o.notes,
              o.won_at,o.lost_at,o.lost_reason,o.latest_quote_id,o.created_at,
              s.name AS stage_name,s.stage_type
       FROM sales_opportunities o
       JOIN sales_pipeline_stages s ON s.id=o.stage_id AND s.company_id=o.company_id
       WHERE o.company_id=$1 AND o.deleted_at IS NULL
       ORDER BY CASE WHEN s.stage_type='open' THEN 0 WHEN s.stage_type='won' THEN 1 ELSE 2 END,
                s.sequence,o.expected_close_date NULLS LAST,o.created_at DESC
       LIMIT 500`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT a.id,a.lead_id,a.activity_type,a.subject,a.description,a.due_date,a.status,a.assigned_user_id,
              a.completed_at,a.created_at,
              l.name AS lead_name,l.lead_number,l.company_name AS lead_company_name,l.contact_name AS lead_contact_name
       FROM sales_lead_activities a
       INNER JOIN sales_leads l ON l.id=a.lead_id AND l.company_id=a.company_id AND l.deleted_at IS NULL
       WHERE a.company_id=$1 AND a.deleted_at IS NULL
       ORDER BY CASE WHEN a.status='planned' THEN 0 ELSE 1 END,a.due_date NULLS LAST,a.created_at DESC
       LIMIT 1000`,
      [context.companyId],
    ),
    queryControl(
      `SELECT u.id,
              COALESCE(
                NULLIF(BTRIM(COALESCE(u.full_name,'')),''),
                NULLIF(BTRIM(CONCAT_WS(' ',u.first_name,u.last_name)),''),
                u.email
              ) AS name,
              u.email
       FROM tenant_users tu
       INNER JOIN users u ON u.id=tu.user_id
       WHERE tu.tenant_id=$1
         AND tu.status='active'
         AND tu.member_type='internal'
         AND tu.deleted_at IS NULL
         AND u.deleted_at IS NULL
       ORDER BY LOWER(COALESCE(NULLIF(BTRIM(u.full_name),''),u.email)),u.id`,
      [context.tenantId],
    ),
    context.pool.query(
      `SELECT team.id,team.name,team.territory_id,
              COALESCE(
                ARRAY_AGG(member.user_id::text) FILTER (
                  WHERE member.user_id IS NOT NULL
                    AND member.is_active=TRUE
                    AND member.left_at IS NULL
                ),
                ARRAY[]::text[]
              ) AS member_user_ids
       FROM sales_teams team
       LEFT JOIN sales_team_members member
         ON member.company_id=team.company_id
        AND member.team_id=team.id
       WHERE team.company_id=$1
         AND team.is_active=TRUE
         AND team.deleted_at IS NULL
       GROUP BY team.id,team.name,team.territory_id
       ORDER BY LOWER(team.name),team.id`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT a.id,a.opportunity_id,a.activity_type,a.subject,a.description,a.due_date,a.status,a.assigned_user_id,
              a.completed_at,a.created_at,o.opportunity_number,o.name AS opportunity_name,
              o.customer_name AS opportunity_customer_name,o.contact_name AS opportunity_contact_name
       FROM sales_opportunity_activities a
       INNER JOIN sales_opportunities o
         ON o.id=a.opportunity_id AND o.company_id=a.company_id AND o.deleted_at IS NULL
       WHERE a.company_id=$1 AND a.deleted_at IS NULL
       ORDER BY CASE WHEN a.status='planned' THEN 0 ELSE 1 END,a.due_date NULLS LAST,a.created_at DESC
       LIMIT 1000`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT h.id,h.opportunity_id,h.from_stage_id,h.to_stage_id,h.probability,h.reason,h.changed_by,h.created_at,
              old_stage.name AS from_stage_name,new_stage.name AS to_stage_name
       FROM sales_opportunity_stage_history h
       INNER JOIN sales_opportunities o
         ON o.id=h.opportunity_id AND o.company_id=h.company_id AND o.deleted_at IS NULL
       LEFT JOIN sales_pipeline_stages old_stage
         ON old_stage.id=h.from_stage_id AND old_stage.company_id=h.company_id
       INNER JOIN sales_pipeline_stages new_stage
         ON new_stage.id=h.to_stage_id AND new_stage.company_id=h.company_id
       WHERE h.company_id=$1
       ORDER BY h.created_at DESC
       LIMIT 2000`,
      [context.companyId],
    ),
  ]);
  return {
    stages: stages.rows,
    leads: leads.rows.map(lead => {
      const score = scoreSalesLead(lead);
      return {
        ...lead,
        lead_score: score.score,
        lead_score_band: score.band,
        lead_score_factors: score.factors,
      };
    }),
    opportunities: opportunities.rows,
    activities: activities.rows,
    opportunityActivities: opportunityActivities.rows,
    salespeople: salespeople.rows,
    salesTeams: salesTeams.rows,
    opportunityHistory: opportunityHistory.rows,
  };
}

export async function getSalesLeadAssignmentHistory(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_VIEW);
  const leadId = requireUuid(input.leadId, 'Lead');
  const lead = await context.pool.query(
    `SELECT id FROM sales_leads
     WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL
     LIMIT 1`,
    [leadId, context.companyId],
  );
  if (!lead.rows[0]) throw new SalesError('INVALID_INPUT', 'Lead was not found.');

  const history = await context.pool.query(
    `SELECT id,lead_id,previous_salesperson_user_id,new_salesperson_user_id,
            previous_sales_team_id,new_sales_team_id,previous_territory_id,new_territory_id,
            changed_by,reason,created_at
     FROM sales_lead_assignment_history
     WHERE company_id=$1 AND lead_id=$2
     ORDER BY created_at DESC,id DESC
     LIMIT 50`,
    [context.companyId, leadId],
  );
  return history.rows;
}


export async function createSalesLead(input:Record<string,unknown>) {
  const context=await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const name=cleanText(input.name,255);
  if(!name) throw new SalesError('INVALID_INPUT','Lead name is required.');
  const email=normalizeSalesLeadEmail(input.email);
  const phone=nullableText(input.phone,80);
  const requestedSalespersonUserId = await resolveActiveSalesperson(context, input.salespersonUserId);
  const requestedSalesTeamId = optionalUuid(input.salesTeamId);
  const requestedTerritoryId = optionalUuid(input.territoryId);
  const duplicates=await findSalesLeadDuplicates(context,email,normalizeSalesLeadPhone(phone));
  if(duplicates.length && input.confirmDuplicates !== true) {
    throw new SalesError(
      'LEAD_DUPLICATE_CONFIRMATION_REQUIRED',
      'Possible duplicate leads were found. Review the matches before creating this lead.',
      {duplicates},
    );
  }
  const client=await context.pool.connect();
  try {
    await client.query('BEGIN');
    let salespersonUserId = requestedSalespersonUserId;
    let salesTeamId = requestedSalesTeamId;
    let assignmentRuleId: string | null = null;
    let territoryId = requestedTerritoryId;

    if (!salesTeamId && !salespersonUserId) {
      const ruleResult = await client.query(
        `SELECT rule.id,rule.sales_team_id,rule.source_match,rule.priority,rule.created_at
         FROM sales_lead_assignment_rules rule
         INNER JOIN sales_teams team
           ON team.id=rule.sales_team_id AND team.company_id=rule.company_id
          AND team.is_active=TRUE AND team.deleted_at IS NULL
         WHERE rule.company_id=$1 AND rule.is_active=TRUE AND rule.deleted_at IS NULL
         ORDER BY rule.priority ASC,LENGTH(BTRIM(COALESCE(rule.source_match,''))) DESC,rule.created_at,rule.id`,
        [context.companyId],
      );
      const matchingRule = selectSalesLeadAssignmentRule(ruleResult.rows.map(row => ({
        id: String(row.id),
        salesTeamId: String(row.sales_team_id),
        sourceMatch: row.source_match ? String(row.source_match) : null,
        priority: Number(row.priority),
        createdAt: row.created_at,
      })), input.source);
      if (matchingRule) {
        salesTeamId = matchingRule.salesTeamId;
        assignmentRuleId = matchingRule.id;
      }
    }

    if (salesTeamId) {
      // Lock the team row so concurrent creations are balanced serially.
      const teamResult = await client.query(
        `SELECT id,territory_id FROM sales_teams
         WHERE id=$1 AND company_id=$2 AND is_active=TRUE AND deleted_at IS NULL
         FOR UPDATE`,
        [salesTeamId, context.companyId],
      );
      const team = teamResult.rows[0];
      if (!team) throw new SalesError('INVALID_INPUT', 'Choose an active Sales team.');
      territoryId = team.territory_id ? String(team.territory_id) : null;

      if (salespersonUserId) {
        const membership = await client.query(
          `SELECT 1 FROM sales_team_members
           WHERE company_id=$1 AND team_id=$2 AND user_id=$3
             AND is_active=TRUE AND left_at IS NULL
           LIMIT 1`,
          [context.companyId, salesTeamId, salespersonUserId],
        );
        if (!membership.rows[0]) {
          throw new SalesError('INVALID_INPUT', 'The selected salesperson must be an active member of the chosen team.');
        }
      } else {
        const memberResult = await client.query(
          `SELECT user_id FROM sales_team_members
           WHERE company_id=$1 AND team_id=$2 AND is_active=TRUE AND left_at IS NULL
           ORDER BY user_id`,
          [context.companyId, salesTeamId],
        );
        const teamMemberIds = memberResult.rows.map(row => String(row.user_id));
        const activeUsers = teamMemberIds.length
          ? await queryControl(
              `SELECT tu.user_id::text AS user_id,
                      COALESCE(
                        NULLIF(BTRIM(COALESCE(u.full_name,'')),''),
                        NULLIF(BTRIM(CONCAT_WS(' ',u.first_name,u.last_name)),''),
                        u.email
                      ) AS name
               FROM tenant_users tu
               INNER JOIN users u ON u.id=tu.user_id
               WHERE tu.tenant_id=$1 AND tu.user_id=ANY($2::uuid[])
                 AND tu.status='active' AND tu.member_type='internal'
                 AND tu.deleted_at IS NULL AND u.deleted_at IS NULL
               ORDER BY LOWER(COALESCE(NULLIF(BTRIM(u.full_name),''),u.email)),u.id`,
              [context.tenantId, teamMemberIds],
            )
          : { rows: [] as { user_id: string; name: string }[] };
        const eligibleIds = activeUsers.rows.map(row => String(row.user_id));
        if (eligibleIds.length === 0) {
          throw new SalesError('INVALID_INPUT', 'This team has no active internal members available for automatic lead assignment.');
        }

        const workload = await client.query(
          `SELECT member.user_id::text AS user_id,
                  COALESCE(workload.active_lead_count,0)::int AS active_lead_count,
                  workload.last_assigned_at
           FROM sales_team_members member
           LEFT JOIN LATERAL (
             SELECT COUNT(*) FILTER (WHERE lead.status NOT IN ('converted','disqualified'))::int AS active_lead_count,
                    MAX(lead.created_at) AS last_assigned_at
             FROM sales_leads lead
             WHERE lead.company_id=member.company_id AND lead.sales_team_id=member.team_id
               AND lead.salesperson_user_id=member.user_id AND lead.deleted_at IS NULL
           ) workload ON TRUE
           WHERE member.company_id=$1 AND member.team_id=$2
             AND member.is_active=TRUE AND member.left_at IS NULL
             AND member.user_id=ANY($3::uuid[])
           ORDER BY workload.active_lead_count ASC, workload.last_assigned_at ASC NULLS FIRST, member.user_id`,
          [context.companyId, salesTeamId, eligibleIds],
        );
        const names = new Map(activeUsers.rows.map(row => [String(row.user_id), String(row.name || 'Salesperson')]));
        const selected = chooseBalancedSalesLeadAssignee(workload.rows.map(row => ({
          userId: String(row.user_id),
          name: names.get(String(row.user_id)) || 'Salesperson',
          activeLeadCount: Number(row.active_lead_count || 0),
          lastAssignedAt: row.last_assigned_at ?? null,
        })));
        if (!selected) {
          throw new SalesError('INVALID_INPUT', 'No active team member could be selected for automatic lead assignment.');
        }
        salespersonUserId = selected.userId;
      }
    }

    const number=await nextPipelineNumber(client,context.companyId,context.userId,'lead','LEAD-');
    const r=await client.query(
      `INSERT INTO sales_leads
        (company_id,lead_number,name,company_name,contact_name,email,phone,source,notes,
         salesperson_user_id,sales_team_id,territory_id,assignment_rule_id,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
       RETURNING id,lead_number,status,name,salesperson_user_id,sales_team_id,territory_id,assignment_rule_id`,
      [context.companyId,number,name,nullableText(input.companyName,255),nullableText(input.contactName,255),
       email,phone,nullableText(input.source,120),nullableText(input.notes,4000),salespersonUserId,
       salesTeamId,territoryId,assignmentRuleId,context.userId],
    );
    await client.query('COMMIT');
    return r.rows[0];
  } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
}


export async function updateSalesLead(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const leadId = requireUuid(input.leadId, 'Lead');
  const name = cleanText(input.name, 255);
  if (!name) throw new SalesError('INVALID_INPUT', 'Lead name is required.');
  const email = nullableText(input.email, 320);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SalesError('INVALID_INPUT', 'Enter a valid lead email address.');
  }
  const salespersonUserId = await resolveActiveSalesperson(context, input.salespersonUserId);
  const requestedSalesTeamId = input.salesTeamId === undefined
    ? undefined
    : optionalUuid(input.salesTeamId);
  const assignmentReason = cleanText(input.assignmentReason, 1000);
  const companyName = nullableText(input.companyName, 255);
  const contactName = nullableText(input.contactName, 255);
  const phone = nullableText(input.phone, 80);
  const source = nullableText(input.source, 120);
  const notes = nullableText(input.notes, 4000);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
`SELECT status,salesperson_user_id,sales_team_id,territory_id FROM sales_leads
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL
       FOR UPDATE`,
      [leadId, context.companyId],
    );
    if (!current.rows[0]) throw new SalesError('INVALID_INPUT', 'Lead was not found.');
    if (current.rows[0].status === 'converted') {
      throw new SalesError('INVALID_INPUT', 'A converted lead cannot be edited; update its opportunity instead.');
    }
    const currentSalespersonUserId = current.rows[0].salesperson_user_id
      ? String(current.rows[0].salesperson_user_id)
      : null;
    const currentSalesTeamId = current.rows[0].sales_team_id
      ? String(current.rows[0].sales_team_id)
      : null;
    const currentTerritoryId = current.rows[0].territory_id
      ? String(current.rows[0].territory_id)
      : null;
    const salesTeamId = requestedSalesTeamId === undefined
      ? currentSalesTeamId
      : requestedSalesTeamId;
    let territoryId = currentTerritoryId;

    if (requestedSalesTeamId !== undefined) {
      if (salesTeamId) {
        const team = await client.query(
          `SELECT id,territory_id
           FROM sales_teams
           WHERE id=$1 AND company_id=$2 AND is_active=TRUE AND deleted_at IS NULL
           LIMIT 1`,
          [salesTeamId, context.companyId],
        );
        if (!team.rows[0]) throw new SalesError('INVALID_INPUT', 'Choose an active Sales team.');
        territoryId = team.rows[0].territory_id ? String(team.rows[0].territory_id) : null;
      } else {
        territoryId = null;
      }
    }

    const assignmentChanged =
      currentSalespersonUserId !== salespersonUserId ||
      currentSalesTeamId !== salesTeamId ||
      currentTerritoryId !== territoryId;
    if (assignmentChanged && !assignmentReason) {
      throw new SalesError('INVALID_INPUT', 'Enter a reason when changing a lead owner or team.');
    }

    if (assignmentChanged && salespersonUserId && salesTeamId) {
      const membership = await client.query(
        `SELECT 1 FROM sales_team_members
         WHERE company_id=$1 AND team_id=$2 AND user_id=$3
           AND is_active=TRUE AND left_at IS NULL
         LIMIT 1`,
        [context.companyId, salesTeamId, salespersonUserId],
      );
      if (!membership.rows[0]) {
        throw new SalesError('INVALID_INPUT', 'The selected salesperson must be an active member of the chosen team.');
      }
    }

    const updated = await client.query(
      `UPDATE sales_leads
       SET name=$3,company_name=$4,contact_name=$5,email=$6,phone=$7,source=$8,notes=$9,
           salesperson_user_id=$10,sales_team_id=$11,territory_id=$12,updated_by=$13,updated_at=NOW()
       WHERE id=$1 AND company_id=$2
       RETURNING id,lead_number,status,name,salesperson_user_id,sales_team_id,territory_id`,
      [leadId, context.companyId, name, companyName, contactName, email, phone, source, notes,
       salespersonUserId, salesTeamId, territoryId, context.userId],
    );

    if (assignmentChanged) {
      await client.query(
        `INSERT INTO sales_lead_assignment_history
           (company_id,lead_id,previous_salesperson_user_id,new_salesperson_user_id,
            previous_sales_team_id,new_sales_team_id,previous_territory_id,new_territory_id,
            changed_by,reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          context.companyId, leadId, currentSalespersonUserId, salespersonUserId,
          currentSalesTeamId, salesTeamId, currentTerritoryId, territoryId,
          context.userId, assignmentReason,
        ],
      );
    }
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function bulkReassignSalesLeads(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  if (!Array.isArray(input.leadIds)) {
    throw new SalesError('INVALID_INPUT', 'Select leads to reassign.');
  }
  const leadIds = [...new Set(input.leadIds.map(value => requireUuid(value, 'Lead')))];
  if (leadIds.length === 0) throw new SalesError('INVALID_INPUT', 'Select at least one lead.');
  if (leadIds.length > 100) throw new SalesError('INVALID_INPUT', 'Reassign at most 100 leads at a time.');

  const salespersonUserId = await resolveActiveSalesperson(context, input.salespersonUserId);
  const salesTeamId = optionalUuid(input.salesTeamId);
  const reason = cleanText(input.reason, 1000);
  if (!salesTeamId) throw new SalesError('INVALID_INPUT', 'Choose a Sales team for bulk lead reassignment.');
  if (!reason) throw new SalesError('INVALID_INPUT', 'A reason is required for bulk lead reassignment.');

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');

    let territoryId: string | null = null;
    if (salesTeamId) {
      const team = await client.query(
        `SELECT id,territory_id
         FROM sales_teams
         WHERE id=$1 AND company_id=$2 AND is_active=TRUE AND deleted_at IS NULL
         FOR UPDATE`,
        [salesTeamId, context.companyId],
      );
      if (!team.rows[0]) throw new SalesError('INVALID_INPUT', 'Choose an active Sales team.');
      territoryId = team.rows[0].territory_id ? String(team.rows[0].territory_id) : null;

      if (salespersonUserId) {
        const membership = await client.query(
          `SELECT 1 FROM sales_team_members
           WHERE company_id=$1 AND team_id=$2 AND user_id=$3
             AND is_active=TRUE AND left_at IS NULL
           LIMIT 1`,
          [context.companyId, salesTeamId, salespersonUserId],
        );
        if (!membership.rows[0]) {
          throw new SalesError('INVALID_INPUT', 'The selected salesperson must be an active member of the chosen team.');
        }
      }
    }

    const current = await client.query(
      `SELECT id,status,salesperson_user_id,sales_team_id,territory_id
       FROM sales_leads
       WHERE company_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL
       FOR UPDATE`,
      [context.companyId, leadIds],
    );
    if (current.rows.length !== leadIds.length) {
      throw new SalesError('INVALID_INPUT', 'One or more selected leads were not found in this workspace.');
    }
    if (current.rows.some(row => row.status === 'converted')) {
      throw new SalesError('INVALID_INPUT', 'Converted leads cannot be reassigned. Remove them from the selection and try again.');
    }

    const changed = current.rows.filter(row =>
      String(row.salesperson_user_id || '') !== String(salespersonUserId || '') ||
      String(row.sales_team_id || '') !== String(salesTeamId || '') ||
      String(row.territory_id || '') !== String(territoryId || '')
    );
    if (changed.length === 0) {
      throw new SalesError('INVALID_INPUT', 'The selected leads already have this team and salesperson.');
    }

    const changedIds = changed.map(row => String(row.id));
    await client.query(
      `UPDATE sales_leads
       SET salesperson_user_id=$3,sales_team_id=$4,territory_id=$5,
           updated_by=$6,updated_at=NOW()
       WHERE company_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL`,
      [context.companyId, changedIds, salespersonUserId, salesTeamId, territoryId, context.userId],
    );

    for (const row of changed) {
      await client.query(
        `INSERT INTO sales_lead_assignment_history
           (company_id,lead_id,previous_salesperson_user_id,new_salesperson_user_id,
            previous_sales_team_id,new_sales_team_id,previous_territory_id,new_territory_id,
            changed_by,reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          context.companyId,
          String(row.id),
          row.salesperson_user_id ? String(row.salesperson_user_id) : null,
          salespersonUserId,
          row.sales_team_id ? String(row.sales_team_id) : null,
          salesTeamId,
          row.territory_id ? String(row.territory_id) : null,
          territoryId,
          context.userId,
          reason,
        ],
      );
    }

    await client.query('COMMIT');
    return { updatedCount: changed.length, leadIds: changedIds };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


export async function bulkUpdateSalesLeadStatus(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  if (!Array.isArray(input.leadIds)) {
    throw new SalesError('INVALID_INPUT', 'Select leads for the bulk action.');
  }
  const leadIds = [...new Set(input.leadIds.map(value => requireUuid(value, 'Lead')))];
  if (leadIds.length === 0) throw new SalesError('INVALID_INPUT', 'Select at least one lead.');
  if (leadIds.length > 100) throw new SalesError('INVALID_INPUT', 'Process at most 100 leads at a time.');

  const mode = cleanText(input.mode, 20);
  if (mode !== 'disqualify' && mode !== 'reopen') {
    throw new SalesError('INVALID_INPUT', 'Choose whether to disqualify or reopen the selected leads.');
  }
  const reason = cleanText(input.reason, 2000);
  if (!reason) {
    throw new SalesError('INVALID_INPUT', 'A reason is required for this bulk lead action.');
  }

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id,status
       FROM sales_leads
       WHERE company_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL
       FOR UPDATE`,
      [context.companyId, leadIds],
    );
    if (current.rows.length !== leadIds.length) {
      throw new SalesError('INVALID_INPUT', 'One or more selected leads were not found in this workspace.');
    }

    if (mode === 'disqualify' && current.rows.some(row => row.status === 'converted')) {
      throw new SalesError('INVALID_INPUT', 'Converted leads cannot be disqualified. Remove them from the selection and try again.');
    }

    const eligible = mode === 'disqualify'
      ? current.rows.filter(row => row.status !== 'disqualified')
      : current.rows.filter(row => row.status === 'disqualified');
    if (eligible.length === 0) {
      throw new SalesError(
        'INVALID_INPUT',
        mode === 'disqualify'
          ? 'All selected leads are already disqualified.'
          : 'No selected leads are disqualified and ready to reopen.',
      );
    }

    const eligibleIds = eligible.map(row => String(row.id));
    if (mode === 'disqualify') {
      await client.query(
        `UPDATE sales_leads
         SET status='disqualified',disqualification_reason=$3,updated_by=$4,updated_at=NOW()
         WHERE company_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL`,
        [context.companyId, eligibleIds, reason, context.userId],
      );
    } else {
      await client.query(
        `UPDATE sales_leads
         SET status='new',disqualification_reason=NULL,updated_by=$3,updated_at=NOW()
         WHERE company_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL AND status='disqualified'`,
        [context.companyId, eligibleIds, context.userId],
      );
    }

    for (const lead of eligible) {
      const isDisqualification = mode === 'disqualify';
      await client.query(
        `INSERT INTO sales_lead_activities
           (company_id,lead_id,activity_type,subject,description,status,completed_at,created_by,updated_by)
         VALUES ($1,$2,'note',$3,$4,'completed',NOW(),$5,$5)`,
        [
          context.companyId,
          String(lead.id),
          isDisqualification ? 'Lead disqualified in bulk action' : 'Lead reopened in bulk action',
          reason,
          context.userId,
        ],
      );
    }

    await client.query('COMMIT');
    return {
      mode,
      updatedCount: eligible.length,
      skippedCount: leadIds.length - eligible.length,
      leadIds: eligibleIds,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


export async function disqualifySalesLead(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const leadId = requireUuid(input.leadId, 'Lead');
  const reason = cleanText(input.reason, 2000);
  if (!reason) throw new SalesError('INVALID_INPUT', 'A reason is required to disqualify a lead.');
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE sales_leads
       SET status='disqualified',disqualification_reason=$3,updated_by=$4,updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status <> 'converted'
       RETURNING id,status`,
      [leadId, context.companyId, reason, context.userId],
    );
    if (!updated.rows[0]) {
      const exists = await client.query(
        `SELECT status FROM sales_leads WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL`,
        [leadId, context.companyId],
      );
      if (!exists.rows[0]) throw new SalesError('INVALID_INPUT', 'Lead was not found.');
      throw new SalesError('INVALID_INPUT', 'A converted lead cannot be disqualified.');
    }
    await client.query(
      `INSERT INTO sales_lead_activities
         (company_id,lead_id,activity_type,subject,description,status,completed_at,created_by,updated_by)
       VALUES ($1,$2,'note','Lead disqualified',$3,'completed',NOW(),$4,$4)`,
      [context.companyId, leadId, reason, context.userId],
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reopenSalesLead(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const leadId = requireUuid(input.leadId, 'Lead');
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE sales_leads
       SET status='new',disqualification_reason=NULL,updated_by=$3,updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='disqualified'
       RETURNING id,status`,
      [leadId, context.companyId, context.userId],
    );
    if (!updated.rows[0]) {
      const exists = await client.query(
        `SELECT status FROM sales_leads WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL`,
        [leadId, context.companyId],
      );
      if (!exists.rows[0]) throw new SalesError('INVALID_INPUT', 'Lead was not found.');
      throw new SalesError('INVALID_INPUT', 'Only a disqualified lead can be reopened.');
    }
    await client.query(
      `INSERT INTO sales_lead_activities
         (company_id,lead_id,activity_type,subject,description,status,completed_at,created_by,updated_by)
       VALUES ($1,$2,'note','Lead reopened','Lead returned to the new status.', 'completed',NOW(),$3,$3)`,
      [context.companyId, leadId, context.userId],
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function bulkCreateSalesLeadActivities(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  if (!Array.isArray(input.leadIds)) {
    throw new SalesError('INVALID_INPUT', 'Select leads for bulk follow-up scheduling.');
  }
  const leadIds = [...new Set(input.leadIds.map(value => requireUuid(value, 'Lead')))];
  if (leadIds.length === 0) throw new SalesError('INVALID_INPUT', 'Select at least one lead.');
  if (leadIds.length > 100) throw new SalesError('INVALID_INPUT', 'Schedule follow-ups for at most 100 leads at a time.');

  const activityType = cleanText(input.activityType, 20).toLowerCase();
  if (!['call', 'email', 'meeting', 'task', 'note'].includes(activityType)) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid follow-up activity type.');
  }
  const subject = cleanText(input.subject, 255);
  if (!subject) throw new SalesError('INVALID_INPUT', 'Activity subject is required.');
  const description = nullableText(input.description, 4000);
  const dueDate = optionalPipelineDate(input.dueDate, 'Due date');
  const assignedUserId = await resolveActiveSalesperson(context, input.assignedUserId);

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const leads = await client.query(
      `SELECT id,status
       FROM sales_leads
       WHERE company_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL
       FOR UPDATE`,
      [context.companyId, leadIds],
    );
    if (leads.rows.length !== leadIds.length) {
      throw new SalesError('INVALID_INPUT', 'One or more selected leads were not found in this workspace.');
    }

    const eligible = leads.rows.filter(row => row.status !== 'converted' && row.status !== 'disqualified');
    if (eligible.length === 0) {
      throw new SalesError('INVALID_INPUT', 'No selected leads are active and eligible for follow-up scheduling.');
    }

    const createdIds: string[] = [];
    for (const lead of eligible) {
      const created = await client.query(
        `INSERT INTO sales_lead_activities
           (company_id,lead_id,activity_type,subject,description,due_date,assigned_user_id,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         RETURNING id`,
        [
          context.companyId,
          String(lead.id),
          activityType,
          subject,
          description,
          dueDate,
          assignedUserId,
          context.userId,
        ],
      );
      createdIds.push(String(created.rows[0].id));
    }

    await client.query('COMMIT');
    return {
      createdCount: createdIds.length,
      skippedCount: leadIds.length - eligible.length,
      activityIds: createdIds,
      leadIds: eligible.map(row => String(row.id)),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


export async function createSalesLeadActivity(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const leadId = requireUuid(input.leadId, 'Lead');
  const activityType = cleanText(input.activityType, 20).toLowerCase();
  if (!['call', 'email', 'meeting', 'task', 'note'].includes(activityType)) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid follow-up activity type.');
  }
  const subject = cleanText(input.subject, 255);
  if (!subject) throw new SalesError('INVALID_INPUT', 'Activity subject is required.');
  const description = nullableText(input.description, 4000);
  const dueDate = optionalPipelineDate(input.dueDate, 'Due date');
  const assignedUserId = await resolveActiveSalesperson(context, input.assignedUserId);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const lead = await client.query(
      `SELECT status FROM sales_leads
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL
       FOR UPDATE`,
      [leadId, context.companyId],
    );
    if (!lead.rows[0]) throw new SalesError('INVALID_INPUT', 'Lead was not found.');
    if (lead.rows[0].status === 'converted' || lead.rows[0].status === 'disqualified') {
      throw new SalesError('INVALID_INPUT', 'Follow-up activities can only be added to active leads.');
    }
    const created = await client.query(
      `INSERT INTO sales_lead_activities
         (company_id,lead_id,activity_type,subject,description,due_date,assigned_user_id,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
       RETURNING id,lead_id,activity_type,subject,description,due_date,status,assigned_user_id,created_at`,
      [context.companyId, leadId, activityType, subject, description, dueDate, assignedUserId, context.userId],
    );
    await client.query('COMMIT');
    return created.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateSalesLeadActivity(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const activityId = requireUuid(input.activityId, 'Activity');
  const status = cleanText(input.status, 20).toLowerCase();
  if (status !== 'completed' && status !== 'cancelled') {
    throw new SalesError('INVALID_INPUT', 'Activity status must be completed or cancelled.');
  }
  const updated = await context.pool.query(
    `UPDATE sales_lead_activities
     SET status=$3,completed_at=CASE WHEN $3='completed' THEN COALESCE(completed_at,NOW()) ELSE NULL END,
         updated_by=$4,updated_at=NOW()
     WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='planned'
     RETURNING id,lead_id,status,completed_at`,
    [activityId, context.companyId, status, context.userId],
  );
  if (!updated.rows[0]) throw new SalesError('INVALID_INPUT', 'Planned activity was not found.');
  return updated.rows[0];
}


export async function editSalesLeadActivity(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const activityId = requireUuid(input.activityId, 'Activity');
  const activityType = cleanText(input.activityType, 20).toLowerCase();
  if (!['call', 'email', 'meeting', 'task', 'note'].includes(activityType)) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid follow-up activity type.');
  }
  const subject = cleanText(input.subject, 255);
  if (!subject) throw new SalesError('INVALID_INPUT', 'Activity subject is required.');
  const description = nullableText(input.description, 4000);
  const dueDate = optionalPipelineDate(input.dueDate, 'Due date');
  const assignedUserId = await resolveActiveSalesperson(context, input.assignedUserId);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT status FROM sales_lead_activities
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL
       FOR UPDATE`,
      [activityId, context.companyId],
    );
    if (!current.rows[0]) {
      throw new SalesError('INVALID_INPUT', 'Follow-up activity was not found.');
    }
    if (current.rows[0].status !== 'planned') {
      throw new SalesError('INVALID_INPUT', 'Only planned follow-up activities can be edited.');
    }
    const updated = await client.query(
      `UPDATE sales_lead_activities
       SET activity_type=$3,subject=$4,description=$5,due_date=$6,assigned_user_id=$7,
           updated_by=$8,updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='planned'
       RETURNING id,lead_id,activity_type,subject,description,due_date,status,assigned_user_id,updated_at`,
      [activityId, context.companyId, activityType, subject, description, dueDate, assignedUserId, context.userId],
    );
    if (!updated.rows[0]) {
      throw new SalesError('INVALID_INPUT', 'Only planned follow-up activities can be edited.');
    }
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}



export async function createSalesOpportunityActivity(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const opportunityId = requireUuid(input.opportunityId, 'Opportunity');
  const activityType = cleanText(input.activityType, 20).toLowerCase();
  if (!['call', 'email', 'meeting', 'task', 'note'].includes(activityType)) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid follow-up activity type.');
  }
  const subject = cleanText(input.subject, 255);
  if (!subject) throw new SalesError('INVALID_INPUT', 'Activity subject is required.');
  const description = nullableText(input.description, 4000);
  const dueDate = optionalPipelineDate(input.dueDate, 'Due date');
  const assignedUserId = await resolveActiveSalesperson(context, input.assignedUserId);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const opportunity = await client.query(
      `SELECT s.stage_type
       FROM sales_opportunities o
       INNER JOIN sales_pipeline_stages s ON s.id=o.stage_id AND s.company_id=o.company_id
       WHERE o.id=$1 AND o.company_id=$2 AND o.deleted_at IS NULL
       FOR UPDATE OF o`,
      [opportunityId, context.companyId],
    );
    if (!opportunity.rows[0]) {
      throw new SalesError('INVALID_INPUT', 'Opportunity was not found.');
    }
    if (opportunity.rows[0].stage_type !== 'open') {
      throw new SalesError('INVALID_INPUT', 'Follow-up activities can only be scheduled on open opportunities.');
    }
    const created = await client.query(
      `INSERT INTO sales_opportunity_activities
         (company_id,opportunity_id,activity_type,subject,description,due_date,assigned_user_id,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
       RETURNING id,opportunity_id,activity_type,subject,description,due_date,status,assigned_user_id,created_at`,
      [context.companyId, opportunityId, activityType, subject, description, dueDate, assignedUserId, context.userId],
    );
    await client.query('COMMIT');
    return created.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateSalesOpportunityActivity(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const activityId = requireUuid(input.activityId, 'Activity');
  const status = cleanText(input.status, 20).toLowerCase();
  if (status !== 'completed' && status !== 'cancelled') {
    throw new SalesError('INVALID_INPUT', 'Activity status must be completed or cancelled.');
  }
  const updated = await context.pool.query(
    `UPDATE sales_opportunity_activities
     SET status=$3,completed_at=CASE WHEN $3='completed' THEN COALESCE(completed_at,NOW()) ELSE NULL END,
         updated_by=$4,updated_at=NOW()
     WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='planned'
     RETURNING id,opportunity_id,status,completed_at`,
    [activityId, context.companyId, status, context.userId],
  );
  if (!updated.rows[0]) throw new SalesError('INVALID_INPUT', 'Planned opportunity activity was not found.');
  return updated.rows[0];
}

export async function editSalesOpportunityActivity(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const activityId = requireUuid(input.activityId, 'Activity');
  const activityType = cleanText(input.activityType, 20).toLowerCase();
  if (!['call', 'email', 'meeting', 'task', 'note'].includes(activityType)) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid follow-up activity type.');
  }
  const subject = cleanText(input.subject, 255);
  if (!subject) throw new SalesError('INVALID_INPUT', 'Activity subject is required.');
  const description = nullableText(input.description, 4000);
  const dueDate = optionalPipelineDate(input.dueDate, 'Due date');
  const assignedUserId = await resolveActiveSalesperson(context, input.assignedUserId);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT status FROM sales_opportunity_activities
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL
       FOR UPDATE`,
      [activityId, context.companyId],
    );
    if (!current.rows[0]) {
      throw new SalesError('INVALID_INPUT', 'Opportunity follow-up activity was not found.');
    }
    if (current.rows[0].status !== 'planned') {
      throw new SalesError('INVALID_INPUT', 'Only planned opportunity activities can be edited.');
    }
    const updated = await client.query(
      `UPDATE sales_opportunity_activities
       SET activity_type=$3,subject=$4,description=$5,due_date=$6,assigned_user_id=$7,
           updated_by=$8,updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='planned'
       RETURNING id,opportunity_id,activity_type,subject,description,due_date,status,assigned_user_id,updated_at`,
      [activityId, context.companyId, activityType, subject, description, dueDate, assignedUserId, context.userId],
    );
    if (!updated.rows[0]) {
      throw new SalesError('INVALID_INPUT', 'Only planned opportunity activities can be edited.');
    }
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


export async function convertSalesLeadToOpportunity(input:Record<string,unknown>) {
  const context=await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE); await ensurePipelineStages(context.pool,context.companyId,context.userId);
  const leadId=requireUuid(input.leadId,'Lead'); const client=await context.pool.connect();
  try {await client.query('BEGIN');
    const lead=await client.query(`SELECT * FROM sales_leads WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE`,[leadId,context.companyId]);
    if(!lead.rows[0]) throw new SalesError('INVALID_INPUT','Lead was not found.');
    if(lead.rows[0].status==='converted') throw new SalesError('INVALID_INPUT','Lead is already converted.');
    if(lead.rows[0].status==='disqualified') throw new SalesError('INVALID_INPUT','A disqualified lead cannot be qualified.');
    const stage=await client.query(`SELECT * FROM sales_pipeline_stages WHERE company_id=$1 AND stage_type='open' AND is_active=TRUE ORDER BY sequence LIMIT 1`,[context.companyId]);
    if(!stage.rows[0]) throw new SalesError('INVALID_INPUT','Configure an open pipeline stage first.');
    const number=await nextPipelineNumber(client,context.companyId,context.userId,'opportunity','OPP-');
    const value=numberInput(input.expectedValue ?? 0,'Expected value',{min:0});
    const currency=cleanText(input.currency,3).toUpperCase() || cleanText(context.company.currentCompany.currency,3).toUpperCase() || 'KES';
    if (!/^[A-Z]{3}$/.test(currency)) throw new SalesError('INVALID_INPUT','Currency must be a three-letter code.');
    const probability=input.probability===undefined?Number(stage.rows[0].probability):numberInput(input.probability,'Probability',{min:0,max:100});
    const r=await client.query(`INSERT INTO sales_opportunities (company_id,opportunity_number,lead_id,stage_id,name,customer_name,contact_name,email,phone,currency,expected_value,probability,expected_close_date,salesperson_user_id,sales_team_id,territory_id,source,notes,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) RETURNING id,opportunity_number,name`,[context.companyId,number,leadId,stage.rows[0].id,cleanText(input.name,255)||lead.rows[0].name,lead.rows[0].company_name||lead.rows[0].name,lead.rows[0].contact_name,lead.rows[0].email,lead.rows[0].phone,currency,value,probability,input.expectedCloseDate?isoDate(input.expectedCloseDate):null,lead.rows[0].salesperson_user_id,lead.rows[0].sales_team_id,lead.rows[0].territory_id,lead.rows[0].source,lead.rows[0].notes,context.userId]);
    await client.query(`UPDATE sales_leads SET status='converted',converted_opportunity_id=$3,updated_by=$4,updated_at=NOW() WHERE id=$1 AND company_id=$2`,[leadId,context.companyId,r.rows[0].id,context.userId]);
    await client.query(`INSERT INTO sales_opportunity_stage_history (company_id,opportunity_id,to_stage_id,probability,reason,changed_by) VALUES ($1,$2,$3,$4,'Lead converted',$5)`,[context.companyId,r.rows[0].id,stage.rows[0].id,probability,context.userId]);
    await client.query('COMMIT'); return r.rows[0];
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

export async function updateSalesOpportunity(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const opportunityId = requireUuid(input.opportunityId, 'Opportunity');
  const name = cleanText(input.name, 255);
  if (!name) throw new SalesError('INVALID_INPUT', 'Opportunity name is required.');
  const expectedValue = numberInput(input.expectedValue, 'Expected value', { min: 0 });
  const currency = cleanText(input.currency, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new SalesError('INVALID_INPUT', 'Currency must be a valid three-letter code.');
  }
  const email = normalizeSalesLeadEmail(input.email);
  const expectedCloseDate = optionalPipelineDate(input.expectedCloseDate, 'Expected close date');
  const salespersonUserId = await resolveActiveSalesperson(context, input.salespersonUserId);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT o.id,s.stage_type
       FROM sales_opportunities o
       INNER JOIN sales_pipeline_stages s ON s.id=o.stage_id AND s.company_id=o.company_id
       WHERE o.id=$1 AND o.company_id=$2 AND o.deleted_at IS NULL
       FOR UPDATE OF o`,
      [opportunityId, context.companyId],
    );
    if (!current.rows[0]) {
      throw new SalesError('INVALID_INPUT', 'Opportunity was not found.');
    }
    if (current.rows[0].stage_type !== 'open') {
      throw new SalesError('INVALID_INPUT', 'Reopen a won or lost opportunity before editing its commercial details.');
    }
    const updated = await client.query(
      `UPDATE sales_opportunities
       SET name=$3,customer_name=$4,contact_name=$5,email=$6,phone=$7,
           expected_value=$8,currency=$9,expected_close_date=$10,source=$11,notes=$12,
           salesperson_user_id=$13,updated_by=$14,updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL
       RETURNING id,opportunity_number,name,customer_name,contact_name,email,phone,
                 expected_value,currency,expected_close_date,source,notes,salesperson_user_id`,
      [
        opportunityId, context.companyId, name,
        nullableText(input.customerName, 255), nullableText(input.contactName, 255),
        email, nullableText(input.phone, 80), expectedValue, currency, expectedCloseDate,
        nullableText(input.source, 120), nullableText(input.notes, 4000),
        salespersonUserId, context.userId,
      ],
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function moveSalesOpportunity(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const opportunityId = requireUuid(input.opportunityId, 'Opportunity');
  const stageId = requireUuid(input.stageId, 'Stage');
  const reason = nullableText(input.reason, 2000);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT * FROM sales_opportunities
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL
       FOR UPDATE`,
      [opportunityId, context.companyId],
    );
    const stage = await client.query(
      `SELECT * FROM sales_pipeline_stages
       WHERE id=$1 AND company_id=$2 AND is_active=TRUE`,
      [stageId, context.companyId],
    );
    if (!current.rows[0] || !stage.rows[0]) {
      throw new SalesError('INVALID_INPUT', 'Opportunity or pipeline stage was not found.');
    }
    if (current.rows[0].stage_id === stageId) {
      throw new SalesError('INVALID_INPUT', 'Opportunity is already in that stage.');
    }
    if (stage.rows[0].stage_type === 'lost' && !reason) {
      throw new SalesError('INVALID_INPUT', 'A reason is required to mark an opportunity as lost.');
    }
    const probability = input.probability === undefined
      ? Number(stage.rows[0].probability)
      : numberInput(input.probability, 'Probability', { min: 0, max: 100 });
    await client.query(
      `UPDATE sales_opportunities
       SET stage_id=$3,probability=$4,
           won_at=CASE WHEN $5='won' THEN COALESCE(won_at,NOW()) ELSE NULL END,
           lost_at=CASE WHEN $5='lost' THEN COALESCE(lost_at,NOW()) ELSE NULL END,
           lost_reason=CASE WHEN $5='lost' THEN $6 ELSE NULL END,
           updated_by=$7,updated_at=NOW()
       WHERE id=$1 AND company_id=$2`,
      [opportunityId, context.companyId, stageId, probability, stage.rows[0].stage_type, reason, context.userId],
    );
    await client.query(
      `INSERT INTO sales_opportunity_stage_history
        (company_id,opportunity_id,from_stage_id,to_stage_id,probability,reason,changed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [context.companyId, opportunityId, current.rows[0].stage_id, stageId, probability, reason, context.userId],
    );
    await client.query('COMMIT');
    return { id: opportunityId, stageId, probability, stageType: stage.rows[0].stage_type };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
