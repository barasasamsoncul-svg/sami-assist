import 'server-only';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { AccountingInputError,accountingDate,accountingId } from '@/lib/apps/accounting/validation';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';

type DatasetKey=
  | 'general_ledger'
  | 'trial_balance'
  | 'receivables'
  | 'payables'
  | 'bank_reconciliation'
  | 'budget_variance';

type ColumnDef={
  key:string;
  label:string;
  type:'text'|'date'|'number'|'boolean';
};

const DATASETS:Record<DatasetKey,{label:string;columns:ColumnDef[]}> = {
  general_ledger:{
    label:'General Ledger',
    columns:[
      {key:'journal_date',label:'Date',type:'date'},
      {key:'journal_number',label:'Journal',type:'text'},
      {key:'account_code',label:'Account code',type:'text'},
      {key:'account_name',label:'Account name',type:'text'},
      {key:'reference',label:'Reference',type:'text'},
      {key:'description',label:'Description',type:'text'},
      {key:'debit',label:'Debit',type:'number'},
      {key:'credit',label:'Credit',type:'number'},
      {key:'balance',label:'Signed movement',type:'number'},
    ],
  },
  trial_balance:{
    label:'Trial Balance',
    columns:[
      {key:'account_code',label:'Account code',type:'text'},
      {key:'account_name',label:'Account name',type:'text'},
      {key:'account_type',label:'Account type',type:'text'},
      {key:'debit',label:'Debit',type:'number'},
      {key:'credit',label:'Credit',type:'number'},
      {key:'balance',label:'Balance',type:'number'},
    ],
  },
  receivables:{
    label:'Receivables',
    columns:[
      {key:'invoice_number',label:'Invoice',type:'text'},
      {key:'customer_name',label:'Customer',type:'text'},
      {key:'invoice_date',label:'Invoice date',type:'date'},
      {key:'due_date',label:'Due date',type:'date'},
      {key:'currency',label:'Currency',type:'text'},
      {key:'total_amount',label:'Total',type:'number'},
      {key:'balance_due',label:'Balance due',type:'number'},
      {key:'days_overdue',label:'Days overdue',type:'number'},
      {key:'aging_bucket',label:'Aging bucket',type:'text'},
    ],
  },
  payables:{
    label:'Payables',
    columns:[
      {key:'document_number',label:'Document',type:'text'},
      {key:'vendor_name',label:'Vendor',type:'text'},
      {key:'document_date',label:'Document date',type:'date'},
      {key:'due_date',label:'Due date',type:'date'},
      {key:'currency',label:'Currency',type:'text'},
      {key:'total_amount',label:'Total',type:'number'},
      {key:'open_amount',label:'Open amount',type:'number'},
      {key:'days_overdue',label:'Days overdue',type:'number'},
      {key:'aging_bucket',label:'Aging bucket',type:'text'},
    ],
  },
  bank_reconciliation:{
    label:'Bank Reconciliation',
    columns:[
      {key:'transaction_date',label:'Date',type:'date'},
      {key:'bank_account_name',label:'Bank account',type:'text'},
      {key:'description',label:'Description',type:'text'},
      {key:'external_reference',label:'External reference',type:'text'},
      {key:'currency',label:'Currency',type:'text'},
      {key:'amount',label:'Amount',type:'number'},
      {key:'reconciliation_status',label:'Reconciliation status',type:'text'},
    ],
  },
  budget_variance:{
    label:'Budget Variance',
    columns:[
      {key:'plan_name',label:'Plan',type:'text'},
      {key:'version_name',label:'Version',type:'text'},
      {key:'account_code',label:'Account code',type:'text'},
      {key:'account_name',label:'Account name',type:'text'},
      {key:'period_start',label:'Period start',type:'date'},
      {key:'period_end',label:'Period end',type:'date'},
      {key:'planned_amount',label:'Planned',type:'number'},
      {key:'actual_amount',label:'Actual',type:'number'},
      {key:'variance_amount',label:'Variance',type:'number'},
      {key:'variance_percent',label:'Variance %',type:'number'},
      {key:'favorable',label:'Favorable',type:'boolean'},
    ],
  },
};

function obj(value:unknown) {
  return value&&typeof value==='object'&&!Array.isArray(value)
    ? value as Record<string,unknown>
    : {};
}

function text(value:unknown,max:number,label:string,required=false) {
  const result=typeof value==='string'?value.trim(): '';
  if (required&&!result) throw new AccountingInputError(label+' is required.');
  if (result.length>max) throw new AccountingInputError(label+' is too long.');
  return result;
}

function dataset(value:unknown):DatasetKey {
  if (
    value==='general_ledger'||
    value==='trial_balance'||
    value==='receivables'||
    value==='payables'||
    value==='bank_reconciliation'||
    value==='budget_variance'
  ) return value;
  throw new AccountingInputError('Choose a supported Accounting report dataset.');
}

function validatedColumns(key:DatasetKey,value:unknown) {
  const allowed=new Set(DATASETS[key].columns.map(column=>column.key));
  const requested=Array.isArray(value)
    ? value.filter(item=>typeof item==='string').map(String)
    : [];
  const columns=[...new Set(requested)].filter(item=>allowed.has(item));
  if (!columns.length) return DATASETS[key].columns.map(column=>column.key);
  if (columns.length>30) throw new AccountingInputError('Choose no more than 30 report columns.');
  return columns;
}

function validatedFilters(value:unknown) {
  const input=obj(value);
  const from=input.from?accountingDate(input.from):null;
  const to=input.to?accountingDate(input.to):null;
  if (from&&to&&from>to) throw new AccountingInputError('Report start date must not be after end date.');
  const status=text(input.status,40,'Status');
  const search=text(input.search,120,'Search');
  return {from,to,status,search};
}

async function rowsForDataset(
  pool:import('pg').Pool,
  companyId:string,
  key:DatasetKey,
  filters:{from:string|null;to:string|null;status:string;search:string},
) {
  const from=filters.from||'1900-01-01';
  const to=filters.to||'9999-12-31';
  const search=filters.search.toLowerCase();

  if (key==='general_ledger') {
    const result=await pool.query(
      `SELECT
         j.journal_date::text,j.journal_number,a.code AS account_code,a.name AS account_name,
         COALESCE(j.reference,'') AS reference,
         COALESCE(l.description,j.description,'') AS description,
         l.debit::text,l.credit::text,(l.debit-l.credit)::text AS balance
       FROM journal_lines l
       JOIN journals j ON j.id=l.journal_id AND j.company_id=l.company_id
       JOIN accounts a ON a.id=l.account_id AND a.company_id=l.company_id
       WHERE l.company_id=$1
         AND l.deleted_at IS NULL AND j.deleted_at IS NULL AND a.deleted_at IS NULL
         AND j.status='posted'
         AND j.journal_date BETWEEN $2::date AND $3::date
         AND ($4='' OR LOWER(COALESCE(j.reference,'')||' '||COALESCE(j.description,'')||' '||a.code||' '||a.name||' '||COALESCE(l.description,'')) LIKE '%'||$4||'%')
       ORDER BY j.journal_date,j.journal_number,l.id
       LIMIT 5000`,
      [companyId,from,to,search],
    );
    return result.rows;
  }

  if (key==='trial_balance') {
    const result=await pool.query(
      `SELECT
         a.code AS account_code,a.name AS account_name,a.account_type,
         COALESCE(SUM(l.debit),0)::text AS debit,
         COALESCE(SUM(l.credit),0)::text AS credit,
         COALESCE(SUM(l.debit-l.credit),0)::text AS balance
       FROM accounts a
       LEFT JOIN journal_lines l
         ON l.company_id=a.company_id
        AND l.account_id=a.id
        AND l.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM journals j
          WHERE j.company_id=l.company_id
            AND j.id=l.journal_id
            AND j.deleted_at IS NULL
            AND j.status='posted'
            AND j.journal_date BETWEEN $2::date AND $3::date
        )
       WHERE a.company_id=$1 AND a.deleted_at IS NULL
         AND ($4='' OR LOWER(a.code||' '||a.name) LIKE '%'||$4||'%')
       GROUP BY a.id,a.code,a.name,a.account_type
       ORDER BY a.code
       LIMIT 5000`,
      [companyId,from,to,search],
    );
    return result.rows;
  }

  if (key==='receivables') {
    const result=await pool.query(
      `SELECT
         i.invoice_number,c.name AS customer_name,i.invoice_date::text,a.due_date::text,
         i.currency,i.total_amount::text,a.balance_due::text,a.days_overdue::int,a.aging_bucket
       FROM invoicing_aging_base a
       JOIN invoicing_invoices i ON i.id=a.invoice_id AND i.company_id=a.company_id
       JOIN invoicing_customers c ON c.id=a.customer_id AND c.company_id=a.company_id
       WHERE a.company_id=$1
         AND i.deleted_at IS NULL AND c.deleted_at IS NULL
         AND i.invoice_date BETWEEN $2::date AND $3::date
         AND a.base_balance_due>0
         AND ($4='' OR LOWER(i.invoice_number||' '||c.name) LIKE '%'||$4||'%')
         AND ($5='' OR a.aging_bucket=$5)
       ORDER BY a.due_date,i.invoice_number
       LIMIT 5000`,
      [companyId,from,to,search,filters.status],
    );
    return result.rows;
  }

  if (key==='payables') {
    const result=await pool.query(
      `SELECT
         d.document_number,v.name AS vendor_name,d.document_date::text,d.due_date::text,
         d.currency,d.total_amount::text,b.open_amount::text,
         GREATEST(CURRENT_DATE-d.due_date,0)::int AS days_overdue,
         CASE
           WHEN d.due_date>=CURRENT_DATE THEN 'current'
           WHEN CURRENT_DATE-d.due_date<=30 THEN '1-30'
           WHEN CURRENT_DATE-d.due_date<=60 THEN '31-60'
           WHEN CURRENT_DATE-d.due_date<=90 THEN '61-90'
           ELSE '90+'
         END AS aging_bucket
       FROM accounting_vendor_documents d
       JOIN accounting_vendors v ON v.id=d.vendor_id AND v.company_id=d.company_id
       JOIN accounting_vendor_document_balances b ON b.document_id=d.id AND b.company_id=d.company_id
       WHERE d.company_id=$1
         AND d.deleted_at IS NULL AND v.deleted_at IS NULL
         AND d.document_type='bill' AND b.open_amount>0
         AND d.document_date BETWEEN $2::date AND $3::date
         AND ($4='' OR LOWER(d.document_number||' '||v.name||' '||COALESCE(d.vendor_reference,'')) LIKE '%'||$4||'%')
         AND ($5='' OR (
           CASE
             WHEN d.due_date>=CURRENT_DATE THEN 'current'
             WHEN CURRENT_DATE-d.due_date<=30 THEN '1-30'
             WHEN CURRENT_DATE-d.due_date<=60 THEN '31-60'
             WHEN CURRENT_DATE-d.due_date<=90 THEN '61-90'
             ELSE '90+'
           END
         )=$5)
       ORDER BY d.due_date,d.document_number
       LIMIT 5000`,
      [companyId,from,to,search,filters.status],
    );
    return result.rows;
  }

  if (key==='bank_reconciliation') {
    const result=await pool.query(
      `SELECT
         s.transaction_date::text,b.name AS bank_account_name,s.description,
         COALESCE(s.external_reference,'') AS external_reference,
         s.currency,s.base_amount::text AS amount,s.reconciliation_status
       FROM accounting_bank_statement_lines s
       JOIN accounting_bank_accounts b ON b.id=s.bank_account_id AND b.company_id=s.company_id
       WHERE s.company_id=$1
         AND s.deleted_at IS NULL AND b.deleted_at IS NULL
         AND s.transaction_date BETWEEN $2::date AND $3::date
         AND ($4='' OR LOWER(COALESCE(s.description,'')||' '||COALESCE(s.external_reference,'')||' '||b.name) LIKE '%'||$4||'%')
         AND ($5='' OR s.reconciliation_status=$5)
       ORDER BY s.transaction_date,s.id
       LIMIT 5000`,
      [companyId,from,to,search,filters.status],
    );
    return result.rows;
  }

  const result=await pool.query(
    `SELECT
       p.name AS plan_name,v.name AS version_name,a.code AS account_code,a.name AS account_name,
       s.period_start::text,s.period_end::text,s.planned_amount::text,s.actual_amount::text,
       s.variance_amount::text,s.variance_percent::text,s.favorable
     FROM accounting_budget_variance_snapshots s
     JOIN accounting_budget_plans p ON p.id=s.plan_id AND p.company_id=s.company_id
     JOIN accounting_budget_versions v ON v.id=s.version_id AND v.company_id=s.company_id
     JOIN accounts a ON a.id=s.account_id AND a.company_id=s.company_id
     WHERE s.company_id=$1
       AND s.deleted_at IS NULL
       AND s.period_start<=$3::date AND s.period_end>=$2::date
       AND ($4='' OR LOWER(p.name||' '||v.name||' '||a.code||' '||a.name) LIKE '%'||$4||'%')
     ORDER BY s.period_start,a.code
     LIMIT 5000`,
    [companyId,from,to,search],
  );
  return result.rows;
}

export async function getAccountingCustomReports() {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_custom_reports',
    'report',
  );
  const reports=await context.pool.query(
    `SELECT id::text,name,description,dataset,columns,filters,group_by,sort_spec,status,updated_at::text
     FROM accounting_custom_reports
     WHERE company_id=$1 AND deleted_at IS NULL
     ORDER BY status,name,id`,
    [context.companyId],
  );
  const runs=await context.pool.query(
    `SELECT r.id::text,r.report_id::text,r.status,r.row_count,r.request_snapshot,r.generated_at::text,
            c.name AS report_name
     FROM accounting_custom_report_runs r
     JOIN accounting_custom_reports c ON c.id=r.report_id AND c.company_id=r.company_id
     WHERE r.company_id=$1
     ORDER BY r.generated_at DESC,r.id DESC
     LIMIT 50`,
    [context.companyId],
  );

  return {
    companyId:context.companyId,
    datasets:Object.entries(DATASETS).map(([key,value])=>({
      key,
      label:value.label,
      columns:value.columns,
    })),
    reports:reports.rows,
    runs:runs.rows,
  };
}

export async function saveAccountingCustomReport(input:unknown) {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_custom_reports',
    'settings',
  );
  const body=obj(input);
  const id=body.id?accountingId(body.id):null;
  const key=dataset(body.dataset);
  const name=text(body.name,180,'Report name',true);
  const description=text(body.description,2000,'Description');
  const columns=validatedColumns(key,body.columns);
  const filters=validatedFilters(body.filters);
  const groupBy=text(body.groupBy,80,'Group by');
  const allowedColumns=new Set(DATASETS[key].columns.map(column=>column.key));
  if (groupBy&&!allowedColumns.has(groupBy)) {
    throw new AccountingInputError('Group-by field must be one of the selected dataset columns.');
  }

  const sortInput=Array.isArray(body.sort)?body.sort:[];
  const sort=sortInput.slice(0,3).map(raw=>{
    const item=obj(raw);
    const column=text(item.column,80,'Sort column',true);
    if (!allowedColumns.has(column)) throw new AccountingInputError('Sort column is not available in this dataset.');
    return {column,direction:item.direction==='desc'?'desc':'asc'};
  });

  const result=id
    ? await context.pool.query(
        `UPDATE accounting_custom_reports
         SET name=$3,description=$4,dataset=$5,columns=$6::jsonb,filters=$7::jsonb,
             group_by=$8,sort_spec=$9::jsonb,updated_by=$10,updated_at=NOW()
         WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
         RETURNING id::text,status`,
        [
          context.companyId,id,name,description||null,key,
          JSON.stringify(columns),JSON.stringify(filters),groupBy||null,JSON.stringify(sort),context.userId,
        ],
      )
    : await context.pool.query(
        `INSERT INTO accounting_custom_reports(
           company_id,name,description,dataset,columns,filters,group_by,sort_spec,status,created_by,updated_by
         ) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,'active',$9,$9)
         RETURNING id::text,status`,
        [
          context.companyId,name,description||null,key,
          JSON.stringify(columns),JSON.stringify(filters),groupBy||null,JSON.stringify(sort),context.userId,
        ],
      );

  if (!result.rows[0]) throw new AccountingInputError('Custom report could not be saved.');

  await recordWorkspaceAuditEvent({
    tenantId:context.tenantId,
    companyId:context.companyId,
    userId:context.userId,
    action:id?'accounting.custom_report.updated':'accounting.custom_report.created',
    module:'accounting',
    resourceType:'accounting_custom_reports',
    resourceId:String(result.rows[0].id),
    summary:id?'Accounting custom report updated.':'Accounting custom report created.',
    result:'success',
    metadata:{dataset:key,columns},
  }).catch(()=>undefined);

  return result.rows[0];
}

export async function runAccountingCustomReport(input:unknown) {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_custom_report_runs',
    'report',
  );
  const body=obj(input);
  const reportId=accountingId(body.reportId);
  const reportResult=await context.pool.query(
    `SELECT id::text,name,dataset,columns,filters,group_by,sort_spec
     FROM accounting_custom_reports
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND status='active'
     LIMIT 1`,
    [context.companyId,reportId],
  );
  if (!reportResult.rows[0]) throw new AccountingInputError('Choose an active custom report.');
  const report=reportResult.rows[0];
  const key=dataset(report.dataset);
  const savedFilters=validatedFilters(report.filters);
  const override=obj(body.filters);
  const filters=validatedFilters({
    from:override.from||savedFilters.from,
    to:override.to||savedFilters.to,
    status:override.status??savedFilters.status,
    search:override.search??savedFilters.search,
  });
  const columns=validatedColumns(key,report.columns);
  const selectedDefs=DATASETS[key].columns.filter(column=>columns.includes(column.key));
  const rawRows=await rowsForDataset(context.pool,context.companyId,key,filters);
  const groupBy=report.group_by?String(report.group_by):null;

  let outputColumns:ColumnDef[]=selectedDefs;
  let rows:Array<Record<string,unknown>>;

  if(groupBy){
    const groupDef=DATASETS[key].columns.find(column=>column.key===groupBy);
    if(!groupDef){
      throw new AccountingInputError('Saved report group-by field is no longer available.');
    }
    const numericDefs=selectedDefs.filter(column=>column.type==='number'&&column.key!==groupBy);
    const grouped=new Map<string,Record<string,unknown>>();
    for(const row of rawRows){
      const value=row[groupBy]??null;
      const mapKey=JSON.stringify(value);
      let target=grouped.get(mapKey);
      if(!target){
        target={[groupBy]:value,row_count:0};
        for(const def of numericDefs)target[def.key]=0;
        grouped.set(mapKey,target);
      }
      target.row_count=Number(target.row_count||0)+1;
      for(const def of numericDefs){
        const amount=Number(row[def.key]??0);
        if(Number.isFinite(amount)){
          target[def.key]=Number(target[def.key]||0)+amount;
        }
      }
    }
    rows=[...grouped.values()];
    outputColumns=[
      groupDef,
      {key:'row_count',label:'Rows',type:'number'},
      ...numericDefs,
    ];
  }else{
    rows=rawRows.map(row=>{
      const projected:Record<string,unknown>={};
      for(const column of columns)projected[column]=row[column]??null;
      return projected;
    });
  }

  const sortSpec=Array.isArray(report.sort_spec)?report.sort_spec:[];
  for(const sort of [...sortSpec].reverse()) {
    const spec=obj(sort);
    const column=typeof spec.column==='string'?spec.column:'';
    const direction=spec.direction==='desc'?-1:1;
    if (!columns.includes(column)) continue;
    rows.sort((a,b)=>{
      const av=a[column]??'';
      const bv=b[column]??'';
      const an=Number(av),bn=Number(bv);
      if (Number.isFinite(an)&&Number.isFinite(bn)) return (an-bn)*direction;
      return String(av).localeCompare(String(bv))*direction;
    });
  }

  const run=await context.pool.query(
    `INSERT INTO accounting_custom_report_runs(
       company_id,report_id,status,row_count,request_snapshot,generated_by,generated_at,created_at
     ) VALUES($1,$2,'completed',$3,$4::jsonb,$5,NOW(),NOW())
     RETURNING id::text,generated_at::text`,
    [
      context.companyId,reportId,rows.length,
      JSON.stringify({dataset:key,columns,filters,groupBy:report.group_by||null}),
      context.userId,
    ],
  );

  return {
    runId:String(run.rows[0].id),
    generatedAt:String(run.rows[0].generated_at),
    reportId,
    name:String(report.name),
    dataset:key,
    datasetLabel:DATASETS[key].label,
    columns:outputColumns,
    groupBy,
    filters,
    rows,
    truncated:rawRows.length>=5000,
  };
}

export async function archiveAccountingCustomReport(input:unknown) {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_custom_reports',
    'settings',
  );
  const body=obj(input);
  const id=accountingId(body.id);
  const result=await context.pool.query(
    `UPDATE accounting_custom_reports
     SET status='archived',updated_by=$3,updated_at=NOW()
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND status='active'
     RETURNING id::text,status`,
    [context.companyId,id,context.userId],
  );
  if (!result.rows[0]) throw new AccountingInputError('Custom report is already archived or unavailable.');
  return result.rows[0];
}
