import 'server-only';

import type { PoolClient } from 'pg';
import { queryControl } from '@/lib/db/control';

import { cleanText, isoDate, nullableText, numberInput, optionalUuid, requireSalesContext, requireUuid, SALES_PERMISSIONS, SalesError } from '@/lib/apps/sales/context';

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
    await pool.query(`INSERT INTO sales_pipeline_stages (company_id,name,sequence,probability,stage_type,created_by,updated_by) VALUES ($1,'Won',90,100,'won',$2,$2),($1,'Lost',100,0,'lost',$2,$2) ON CONFLICT DO NOTHING`, [companyId,userId]);
  }
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
  const [stages, leads, opportunities, activities, salespeople] = await Promise.all([
    context.pool.query(
      `SELECT id,name,sequence,probability,stage_type,is_active
       FROM sales_pipeline_stages
       WHERE company_id=$1 AND is_active=TRUE
       ORDER BY sequence,name`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT id,lead_number,status,name,company_name,contact_name,email,phone,source,notes,
              salesperson_user_id,sales_team_id,territory_id,disqualification_reason,created_at
       FROM sales_leads
       WHERE company_id=$1 AND deleted_at IS NULL
       ORDER BY created_at DESC
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
  ]);
  return {
    stages: stages.rows,
    leads: leads.rows,
    opportunities: opportunities.rows,
    activities: activities.rows,
    salespeople: salespeople.rows,
  };
}

export async function createSalesLead(input:Record<string,unknown>) {
  const context=await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const name=cleanText(input.name,255);
  if(!name) throw new SalesError('INVALID_INPUT','Lead name is required.');
  const email=normalizeSalesLeadEmail(input.email);
  const phone=nullableText(input.phone,80);
  const salespersonUserId=await resolveActiveSalesperson(context,input.salespersonUserId);
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
    const number=await nextPipelineNumber(client,context.companyId,context.userId,'lead','LEAD-');
    const r=await client.query(
      `INSERT INTO sales_leads
        (company_id,lead_number,name,company_name,contact_name,email,phone,source,notes,
         salesperson_user_id,sales_team_id,territory_id,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
       RETURNING id,lead_number,status,name`,
      [context.companyId,number,name,nullableText(input.companyName,255),nullableText(input.contactName,255),
       email,phone,nullableText(input.source,120),nullableText(input.notes,4000),salespersonUserId,
       optionalUuid(input.salesTeamId),optionalUuid(input.territoryId),context.userId],
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
  const companyName = nullableText(input.companyName, 255);
  const contactName = nullableText(input.contactName, 255);
  const phone = nullableText(input.phone, 80);
  const source = nullableText(input.source, 120);
  const notes = nullableText(input.notes, 4000);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT status FROM sales_leads
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL
       FOR UPDATE`,
      [leadId, context.companyId],
    );
    if (!current.rows[0]) throw new SalesError('INVALID_INPUT', 'Lead was not found.');
    if (current.rows[0].status === 'converted') {
      throw new SalesError('INVALID_INPUT', 'A converted lead cannot be edited; update its opportunity instead.');
    }
    const updated = await client.query(
      `UPDATE sales_leads
       SET name=$3,company_name=$4,contact_name=$5,email=$6,phone=$7,source=$8,notes=$9,
           salesperson_user_id=$10,updated_by=$11,updated_at=NOW()
       WHERE id=$1 AND company_id=$2
       RETURNING id,lead_number,status,name,salesperson_user_id`,
      [leadId, context.companyId, name, companyName, contactName, email, phone, source, notes, salespersonUserId, context.userId],
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
