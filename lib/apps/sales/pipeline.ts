import 'server-only';

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

async function nextPipelineNumber(client:any, companyId:string, userId:string, type:'lead'|'opportunity', prefix:string) {
  await client.query(`INSERT INTO sales_sequences (company_id,document_type,prefix,next_number,padding,format,updated_by) VALUES ($1,$2,$3,1,6,'{prefix}{number}',$4) ON CONFLICT (company_id,document_type) DO NOTHING`,[companyId,type,prefix,userId]);
  const row=await client.query(`SELECT prefix,next_number,padding,format FROM sales_sequences WHERE company_id=$1 AND document_type=$2 FOR UPDATE`,[companyId,type]);
  const x=row.rows[0]; const value=String(x.format).replace('{prefix}',String(x.prefix)).replace('{number}',String(x.next_number).padStart(Number(x.padding), '0'));
  await client.query(`UPDATE sales_sequences SET next_number=next_number+1,updated_by=$3,updated_at=NOW() WHERE company_id=$1 AND document_type=$2`,[companyId,type,userId]);
  return value;
}

export async function getSalesPipelineData() {
  const context=await requireSalesContext(SALES_PERMISSIONS.PIPELINE_VIEW);
  await ensurePipelineStages(context.pool,context.companyId,context.userId);
  const [stages,leads,opportunities]=await Promise.all([
    context.pool.query(`SELECT id,name,sequence,probability,stage_type,is_active FROM sales_pipeline_stages WHERE company_id=$1 AND is_active=TRUE ORDER BY sequence,name`,[context.companyId]),
    context.pool.query(`SELECT id,lead_number,status,name,company_name,contact_name,email,phone,source,salesperson_user_id,sales_team_id,territory_id,created_at FROM sales_leads WHERE company_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 250`,[context.companyId]),
    context.pool.query(`SELECT o.id,o.opportunity_number,o.lead_id,o.stage_id,o.name,o.customer_name,o.contact_name,o.email,o.phone,o.currency,o.expected_value,o.probability,o.expected_close_date,o.salesperson_user_id,o.sales_team_id,o.territory_id,o.source,o.latest_quote_id,o.created_at,s.name AS stage_name,s.stage_type FROM sales_opportunities o JOIN sales_pipeline_stages s ON s.id=o.stage_id WHERE o.company_id=$1 AND o.deleted_at IS NULL ORDER BY s.sequence,o.expected_close_date NULLS LAST,o.created_at DESC LIMIT 500`,[context.companyId]),
  ]);
  return {stages:stages.rows,leads:leads.rows,opportunities:opportunities.rows};
}

export async function createSalesLead(input:Record<string,unknown>) {
  const context=await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const name=cleanText(input.name,255); if(!name) throw new SalesError('INVALID_INPUT','Lead name is required.');
  const client=await context.pool.connect();
  try { await client.query('BEGIN'); const number=await nextPipelineNumber(client,context.companyId,context.userId,'lead','LEAD-');
    const r=await client.query(`INSERT INTO sales_leads (company_id,lead_number,name,company_name,contact_name,email,phone,source,notes,salesperson_user_id,sales_team_id,territory_id,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING id,lead_number,status,name`,[context.companyId,number,name,nullableText(input.companyName,255),nullableText(input.contactName,255),nullableText(input.email,320),nullableText(input.phone,80),nullableText(input.source,120),nullableText(input.notes,4000),optionalUuid(input.salespersonUserId),optionalUuid(input.salesTeamId),optionalUuid(input.territoryId),context.userId]);
    await client.query('COMMIT'); return r.rows[0];
  } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
}

export async function convertSalesLeadToOpportunity(input:Record<string,unknown>) {
  const context=await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE); await ensurePipelineStages(context.pool,context.companyId,context.userId);
  const leadId=requireUuid(input.leadId,'Lead'); const client=await context.pool.connect();
  try {await client.query('BEGIN');
    const lead=await client.query(`SELECT * FROM sales_leads WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE`,[leadId,context.companyId]);
    if(!lead.rows[0]) throw new SalesError('INVALID_INPUT','Lead was not found.');
    if(lead.rows[0].status==='converted') throw new SalesError('INVALID_INPUT','Lead is already converted.');
    const stage=await client.query(`SELECT * FROM sales_pipeline_stages WHERE company_id=$1 AND stage_type='open' AND is_active=TRUE ORDER BY sequence LIMIT 1`,[context.companyId]);
    if(!stage.rows[0]) throw new SalesError('INVALID_INPUT','Configure an open pipeline stage first.');
    const number=await nextPipelineNumber(client,context.companyId,context.userId,'opportunity','OPP-');
    const value=numberInput(input.expectedValue ?? 0,'Expected value',{min:0});
    const probability=input.probability===undefined?Number(stage.rows[0].probability):numberInput(input.probability,'Probability',{min:0,max:100});
    const r=await client.query(`INSERT INTO sales_opportunities (company_id,opportunity_number,lead_id,stage_id,name,customer_name,contact_name,email,phone,currency,expected_value,probability,expected_close_date,salesperson_user_id,sales_team_id,territory_id,source,notes,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) RETURNING id,opportunity_number,name`,[context.companyId,number,leadId,stage.rows[0].id,cleanText(input.name,255)||lead.rows[0].name,lead.rows[0].company_name||lead.rows[0].name,lead.rows[0].contact_name,lead.rows[0].email,lead.rows[0].phone,cleanText(input.currency,3).toUpperCase()||'KES',value,probability,input.expectedCloseDate?isoDate(input.expectedCloseDate):null,lead.rows[0].salesperson_user_id,lead.rows[0].sales_team_id,lead.rows[0].territory_id,lead.rows[0].source,lead.rows[0].notes,context.userId]);
    await client.query(`UPDATE sales_leads SET status='converted',converted_opportunity_id=$3,updated_by=$4,updated_at=NOW() WHERE id=$1 AND company_id=$2`,[leadId,context.companyId,r.rows[0].id,context.userId]);
    await client.query(`INSERT INTO sales_opportunity_stage_history (company_id,opportunity_id,to_stage_id,probability,reason,changed_by) VALUES ($1,$2,$3,$4,'Lead converted',$5)`,[context.companyId,r.rows[0].id,stage.rows[0].id,probability,context.userId]);
    await client.query('COMMIT'); return r.rows[0];
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

export async function moveSalesOpportunity(input:Record<string,unknown>) {
  const context=await requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE);
  const opportunityId=requireUuid(input.opportunityId,'Opportunity'), stageId=requireUuid(input.stageId,'Stage'); const client=await context.pool.connect();
  try{await client.query('BEGIN');
    const current=await client.query(`SELECT * FROM sales_opportunities WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE`,[opportunityId,context.companyId]);
    const stage=await client.query(`SELECT * FROM sales_pipeline_stages WHERE id=$1 AND company_id=$2 AND is_active=TRUE`,[stageId,context.companyId]);
    if(!current.rows[0]||!stage.rows[0]) throw new SalesError('INVALID_INPUT','Opportunity or pipeline stage was not found.');
    const probability=input.probability===undefined?Number(stage.rows[0].probability):numberInput(input.probability,'Probability',{min:0,max:100});
    await client.query(`UPDATE sales_opportunities SET stage_id=$3,probability=$4,won_at=CASE WHEN $5='won' THEN COALESCE(won_at,NOW()) ELSE NULL END,lost_at=CASE WHEN $5='lost' THEN COALESCE(lost_at,NOW()) ELSE NULL END,lost_reason=CASE WHEN $5='lost' THEN $6 ELSE NULL END,updated_by=$7,updated_at=NOW() WHERE id=$1 AND company_id=$2`,[opportunityId,context.companyId,stageId,probability,stage.rows[0].stage_type,nullableText(input.reason,2000),context.userId]);
    await client.query(`INSERT INTO sales_opportunity_stage_history (company_id,opportunity_id,from_stage_id,to_stage_id,probability,reason,changed_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[context.companyId,opportunityId,current.rows[0].stage_id,stageId,probability,nullableText(input.reason,2000),context.userId]);
    await client.query('COMMIT'); return {id:opportunityId,stageId,probability};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
