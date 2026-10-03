import 'server-only';

import { createHash } from 'node:crypto';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import {
  postBalancedLedgerJournal,
  reversePostedLedgerJournal,
} from '@/lib/apps/accounting/ledger-engine';
import {
  AccountingInputError,
  accountingDate,
  accountingId,
  decimalAmount,
} from '@/lib/apps/accounting/validation';

type Context=Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

function bodyOf(input:unknown) {
  if (!input || typeof input!=='object' || Array.isArray(input)) {
    throw new AccountingInputError('Enter valid period-closing data.');
  }
  return input as Record<string,unknown>;
}

function textValue(value:unknown,max:number,label:string,required=false) {
  const text=typeof value==='string'?value.trim():'';
  if ((required && !text) || text.length>max) {
    throw new AccountingInputError(label+(required?' is required.':' is too long.'));
  }
  return text;
}

function signedCents(value:unknown) {
  const raw=String(value ?? '0').trim();
  if (!/^-?\d{1,18}(?:\.\d{1,4})?$/.test(raw)) {
    throw new AccountingInputError('Accounting balance is invalid.');
  }
  const negative=raw.startsWith('-');
  const unsigned=negative?raw.slice(1):raw;
  const [whole,fraction='']=unsigned.split('.');
  const cents=BigInt(whole||'0')*BigInt(100)+BigInt(fraction.padEnd(2,'0').slice(0,2)||'0');
  return negative?-cents:cents;
}

function iso(date:Date) {
  return date.toISOString().slice(0,10);
}

function fiscalYearRange(endDate:string,startMonth:number,startDay:number) {
  const end=new Date(endDate+'T00:00:00Z');
  if (!Number.isFinite(end.getTime())) throw new AccountingInputError('Fiscal period end date is invalid.');
  const year=end.getUTCFullYear();
  const candidate=new Date(Date.UTC(year,startMonth-1,startDay));
  const start=end>=candidate?candidate:new Date(Date.UTC(year-1,startMonth-1,startDay));
  const next=new Date(Date.UTC(start.getUTCFullYear()+1,startMonth-1,startDay));
  const fiscalEnd=new Date(next.getTime()-86400000);
  return {start:iso(start),end:iso(fiscalEnd)};
}

async function audit(context:Context,action:string,id:string,summary:string,metadata:Record<string,unknown>={}) {
  try {
    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      action:'accounting.period_closing.'+action,
      module:'accounting',
      resourceType:'accounting_close_run',
      resourceId:id,
      summary,
      metadata,
    });
  } catch (error) {
    console.error('[Accounting] Period closing audit failed',error);
  }
}

async function selectedChecks(
  context:Context,
  period:{id:string;starts_on:string;ends_on:string;status:string},
) {
  const result=await context.pool.query(
    `SELECT
      (SELECT COUNT(*)::int FROM journals
       WHERE company_id=$1 AND deleted_at IS NULL AND status='draft'
         AND journal_date BETWEEN $2::date AND $3::date) AS draft_journals,
      (SELECT COUNT(*)::int FROM journals
       WHERE company_id=$1 AND deleted_at IS NULL AND status='posted'
         AND journal_date BETWEEN $2::date AND $3::date) AS posted_journals,
      (SELECT COUNT(*)::int FROM accounting_bank_statement_lines
       WHERE company_id=$1 AND deleted_at IS NULL
         AND transaction_date BETWEEN $2::date AND $3::date
         AND reconciliation_status IN ('unmatched','suggested')) AS unreconciled_bank_lines,
      (SELECT COALESCE(SUM(l.debit-l.credit),0)::text
       FROM journals j
       JOIN journal_lines l ON l.company_id=j.company_id AND l.journal_id=j.id AND l.deleted_at IS NULL
       WHERE j.company_id=$1 AND j.deleted_at IS NULL AND j.status='posted'
         AND j.journal_date BETWEEN $2::date AND $3::date) AS trial_difference`,
    [context.companyId,period.starts_on,period.ends_on],
  );
  const row=result.rows[0]||{};
  const trialDifference=String(row.trial_difference||'0');
  const draftJournals=Number(row.draft_journals||0);
  const unreconciledBankLines=Number(row.unreconciled_bank_lines||0);
  return {
    draftJournals,
    postedJournals:Number(row.posted_journals||0),
    unreconciledBankLines,
    trialDifference,
    balanced:signedCents(trialDifference)===BigInt(0),
    canClose:
      period.status==='open' &&
      draftJournals===0 &&
      unreconciledBankLines===0 &&
      signedCents(trialDifference)===BigInt(0),
  };
}

export async function getAccountingPeriodClosing(input:{periodId?:unknown}={}) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_close_runs','report');
  const [periodsResult,runsResult,settingsResult]=await Promise.all([
    context.pool.query(
      `SELECT id::text,name,starts_on::text,ends_on::text,lock_date::text,status,created_at::text,updated_at::text
       FROM accounting_fiscal_periods
       WHERE company_id=$1 AND deleted_at IS NULL
       ORDER BY starts_on DESC,ends_on DESC LIMIT 60`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT r.id::text,r.fiscal_period_id::text,p.name AS period_name,r.close_type,r.status,
         r.fiscal_year_start::text,r.fiscal_year_end::text,r.closing_journal_id::text,
         r.reversal_journal_id::text,r.checklist_json,r.prepared_at::text,r.completed_at::text,
         r.reopened_at::text,r.reopen_reason
       FROM accounting_close_runs r
       JOIN accounting_fiscal_periods p ON p.id=r.fiscal_period_id AND p.company_id=r.company_id
       WHERE r.company_id=$1 AND r.deleted_at IS NULL
       ORDER BY r.created_at DESC LIMIT 40`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT fiscal_year_start_month,fiscal_year_start_day,retained_earnings_account_id::text,global_lock_date::text
       FROM accounting_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1`,
      [context.companyId],
    ),
  ]);

  const periods=periodsResult.rows.map(row=>({
    ...row,
    id:String(row.id),
    starts_on:String(row.starts_on).slice(0,10),
    ends_on:String(row.ends_on).slice(0,10),
  }));
  let selected=null as (typeof periods)[number] | null;
  if (input.periodId) {
    const id=accountingId(input.periodId);
    selected=periods.find(row=>row.id===id)||null;
  }
  selected=selected||periods.find(row=>row.status==='open')||periods[0]||null;
  const settings=settingsResult.rows[0]||{
    fiscal_year_start_month:1,
    fiscal_year_start_day:1,
    retained_earnings_account_id:null,
    global_lock_date:null,
  };
  const checks=selected?await selectedChecks(context,selected):null;
  const yearRange=selected
    ? fiscalYearRange(
        selected.ends_on,
        Number(settings.fiscal_year_start_month||1),
        Number(settings.fiscal_year_start_day||1),
      )
    : null;

  return {
    companyId:context.companyId,
    currency:context.company.currentCompany.currency,
    periods,
    selectedPeriod:selected,
    checks,
    closeRuns:runsResult.rows,
    settings:{
      fiscalYearStartMonth:Number(settings.fiscal_year_start_month||1),
      fiscalYearStartDay:Number(settings.fiscal_year_start_day||1),
      retainedEarningsAccountId:settings.retained_earnings_account_id?String(settings.retained_earnings_account_id):null,
      globalLockDate:settings.global_lock_date?String(settings.global_lock_date).slice(0,10):null,
    },
    selectedFiscalYear:yearRange,
    selectedIsFiscalYearEnd:Boolean(selected && yearRange && selected.ends_on===yearRange.end),
  };
}

export type AccountingPeriodClosingWorkspace=Awaited<ReturnType<typeof getAccountingPeriodClosing>>;

export async function createAccountingFiscalPeriod(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_fiscal_periods','create');
  const name=textValue(body.name,120,'Period name',true);
  const startsOn=accountingDate(body.startsOn);
  const endsOn=accountingDate(body.endsOn);
  if (startsOn>endsOn) throw new AccountingInputError('Period start date must not be after its end date.');

  const overlap=await context.pool.query(
    `SELECT id::text FROM accounting_fiscal_periods
     WHERE company_id=$1 AND deleted_at IS NULL
       AND daterange(starts_on,ends_on,'[]') && daterange($2::date,$3::date,'[]')
     LIMIT 1`,
    [context.companyId,startsOn,endsOn],
  );
  if (overlap.rows[0]) throw new AccountingInputError('This fiscal period overlaps an existing Accounting period.');

  const result=await context.pool.query(
    `INSERT INTO accounting_fiscal_periods(company_id,name,starts_on,ends_on,status,created_by,updated_by)
     VALUES($1,$2,$3,$4,'open',$5,$5) RETURNING id::text`,
    [context.companyId,name,startsOn,endsOn,context.userId],
  );
  return {id:String(result.rows[0].id),status:'open'};
}

export async function closeAccountingPeriod(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_close_runs','edit');
  const periodId=accountingId(body.periodId);
  const requestKey=accountingId(body.requestKey);
  const closeType=body.closeType==='year_end'?'year_end':body.closeType==='month_end'?'month_end':null;
  if (!closeType) throw new AccountingInputError('Choose month-end or year-end closing.');
  const requestHash=createHash('sha256').update(JSON.stringify({periodId,closeType})).digest('hex');
  const client=await context.pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['accounting:period-close:'+periodId]);

    const replay=await client.query(
      `SELECT id::text,request_hash,status FROM accounting_close_runs
       WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [context.companyId,requestKey],
    );
    if (replay.rows[0]) {
      if (String(replay.rows[0].request_hash)!==requestHash) {
        throw new AccountingInputError('This closing request key was already used for another period.');
      }
      await client.query('COMMIT');
      return {id:String(replay.rows[0].id),status:String(replay.rows[0].status),replayed:true};
    }

    const periodResult=await client.query(
      `SELECT id::text,name,starts_on::text,ends_on::text,status
       FROM accounting_fiscal_periods
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [context.companyId,periodId],
    );
    const period=periodResult.rows[0];
    if (!period || String(period.status)!=='open') {
      throw new AccountingInputError('Only an open fiscal period can be closed.');
    }

    const checksResult=await client.query(
      `SELECT
        (SELECT COUNT(*)::int FROM journals WHERE company_id=$1 AND deleted_at IS NULL AND status='draft' AND journal_date BETWEEN $2::date AND $3::date) AS draft_journals,
        (SELECT COUNT(*)::int FROM accounting_bank_statement_lines WHERE company_id=$1 AND deleted_at IS NULL AND transaction_date BETWEEN $2::date AND $3::date AND reconciliation_status IN ('unmatched','suggested')) AS unreconciled_bank_lines,
        (SELECT COALESCE(SUM(l.debit-l.credit),0)::text FROM journals j JOIN journal_lines l ON l.company_id=j.company_id AND l.journal_id=j.id AND l.deleted_at IS NULL WHERE j.company_id=$1 AND j.deleted_at IS NULL AND j.status='posted' AND j.journal_date BETWEEN $2::date AND $3::date) AS trial_difference`,
      [context.companyId,String(period.starts_on).slice(0,10),String(period.ends_on).slice(0,10)],
    );
    const check=checksResult.rows[0]||{};
    const draftJournals=Number(check.draft_journals||0);
    const unreconciledBankLines=Number(check.unreconciled_bank_lines||0);
    const trialDifference=String(check.trial_difference||'0');
    if (draftJournals>0) throw new AccountingInputError('Post or remove all draft journals in this period before closing it.');
    if (unreconciledBankLines>0) throw new AccountingInputError('Reconcile all bank statement lines in this period before closing it.');
    if (signedCents(trialDifference)!==BigInt(0)) throw new AccountingInputError('The selected period is not balanced.');

    const setup=await client.query(
      `SELECT fiscal_year_start_month,fiscal_year_start_day,retained_earnings_account_id::text
       FROM accounting_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [context.companyId],
    );
    const settings=setup.rows[0]||{};
    const yearRange=fiscalYearRange(
      String(period.ends_on).slice(0,10),
      Number(settings.fiscal_year_start_month||1),
      Number(settings.fiscal_year_start_day||1),
    );

    let closingJournalId:null|string=null;
    if (closeType==='year_end') {
      if (String(period.ends_on).slice(0,10)!==yearRange.end) {
        throw new AccountingInputError('Year-end closing can only run on a fiscal period ending on the configured fiscal year end.');
      }
      const retainedId=settings.retained_earnings_account_id?String(settings.retained_earnings_account_id):'';
      if (!retainedId) throw new AccountingInputError('Configure a retained earnings account before year-end closing.');

      const balances=await client.query(
        `SELECT a.id::text,a.code,a.name,COALESCE(SUM(l.debit-l.credit),0)::text AS balance
         FROM accounts a
         JOIN journal_lines l ON l.account_id=a.id AND l.company_id=a.company_id AND l.deleted_at IS NULL
         JOIN journals j ON j.id=l.journal_id AND j.company_id=l.company_id AND j.deleted_at IS NULL AND j.status='posted'
         WHERE a.company_id=$1 AND a.deleted_at IS NULL
           AND (a.account_type='income' OR a.account_type LIKE 'income_%' OR a.account_type='expense' OR a.account_type LIKE 'expense_%')
           AND j.journal_date BETWEEN $2::date AND $3::date
         GROUP BY a.id,a.code,a.name
         HAVING COALESCE(SUM(l.debit-l.credit),0)<>0
         ORDER BY a.code,a.name`,
        [context.companyId,yearRange.start,yearRange.end],
      );

      const lines:Array<{accountId:string;description:string;debit:string;credit:string}>=[];
      let retainedBalance=BigInt(0);
      for (const row of balances.rows) {
        const balance=signedCents(row.balance);
        retainedBalance+=balance;
        lines.push({
          accountId:String(row.id),
          description:'Year-end close · '+String(row.code||'')+' '+String(row.name||''),
          debit:balance<BigInt(0)?decimalAmount(-balance):'0.00',
          credit:balance>BigInt(0)?decimalAmount(balance):'0.00',
        });
      }
      if (retainedBalance!==BigInt(0)) {
        lines.push({
          accountId:retainedId,
          description:'Year-end transfer to retained earnings',
          debit:retainedBalance>BigInt(0)?decimalAmount(retainedBalance):'0.00',
          credit:retainedBalance<BigInt(0)?decimalAmount(-retainedBalance):'0.00',
        });
      }
      if (lines.length>=2) {
        const posting=await postBalancedLedgerJournal(client,{
          companyId:context.companyId,
          userId:context.userId,
          journalDate:yearRange.end,
          description:'Year-end closing '+yearRange.start+' to '+yearRange.end,
          reference:'YEAR-END '+yearRange.end,
          sourceModule:'accounting',
          sourceType:'period_close',
          sourceId:periodId,
          sourceEventKey:'accounting:year-end-close:'+requestKey,
          postingKind:'system',
          lines,
        });
        closingJournalId=posting.journalId;
      }
    }

    const checklist={
      draftJournals,
      unreconciledBankLines,
      trialDifference,
      balanced:true,
      fiscalYearStart:yearRange.start,
      fiscalYearEnd:yearRange.end,
    };
    const inserted=await client.query(
      `INSERT INTO accounting_close_runs(
        company_id,fiscal_period_id,close_type,status,request_key,request_hash,
        fiscal_year_start,fiscal_year_end,closing_journal_id,checklist_json,
        prepared_by,completed_by,prepared_at,completed_at
       ) VALUES($1,$2,$3,'completed',$4,$5,$6,$7,$8,$9::jsonb,$10,$10,NOW(),NOW())
       RETURNING id::text`,
      [
        context.companyId,periodId,closeType,requestKey,requestHash,
        yearRange.start,yearRange.end,closingJournalId,JSON.stringify(checklist),context.userId,
      ],
    );
    const runId=String(inserted.rows[0].id);

    await client.query(
      `UPDATE accounting_fiscal_periods
       SET status='closed',lock_date=ends_on,updated_by=$3,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,periodId,context.userId],
    );
    await client.query(
      `INSERT INTO accounting_settings(company_id,global_lock_date,created_by,updated_by)
       VALUES($1,$2,$3,$3)
       ON CONFLICT(company_id) DO UPDATE SET
         global_lock_date=CASE
           WHEN accounting_settings.global_lock_date IS NULL THEN EXCLUDED.global_lock_date
           WHEN EXCLUDED.global_lock_date>accounting_settings.global_lock_date THEN EXCLUDED.global_lock_date
           ELSE accounting_settings.global_lock_date
         END,
         updated_by=EXCLUDED.updated_by,updated_at=NOW(),deleted_at=NULL`,
      [context.companyId,String(period.ends_on).slice(0,10),context.userId],
    );

    await client.query('COMMIT');
    await audit(context,'completed',runId,(closeType==='year_end'?'Year-end':'Month-end')+' period close completed.',{periodId,closingJournalId});
    return {id:runId,status:'completed',closingJournalId,replayed:false};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function reopenAccountingPeriod(input:unknown) {
  const body=bodyOf(input);
  const runId=accountingId(body.runId);
  const reason=textValue(body.reason,1000,'Reopen reason',true);
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_close_runs','edit');
  const client=await context.pool.connect();

  try {
    await client.query('BEGIN');
    const runResult=await client.query(
      `SELECT r.id::text,r.fiscal_period_id::text,r.close_type,r.status,r.closing_journal_id::text,
         p.ends_on::text,p.status AS period_status
       FROM accounting_close_runs r
       JOIN accounting_fiscal_periods p ON p.id=r.fiscal_period_id AND p.company_id=r.company_id
       WHERE r.company_id=$1 AND r.id=$2 AND r.deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [context.companyId,runId],
    );
    const run=runResult.rows[0];
    if (!run || String(run.status)!=='completed') {
      throw new AccountingInputError('Only a completed period close can be reopened.');
    }

    const laterClosed=await client.query(
      `SELECT id::text FROM accounting_fiscal_periods
       WHERE company_id=$1 AND deleted_at IS NULL AND status='closed'
         AND ends_on>$2::date AND id<>$3
       ORDER BY ends_on DESC LIMIT 1 FOR SHARE`,
      [context.companyId,String(run.ends_on).slice(0,10),String(run.fiscal_period_id)],
    );
    if (laterClosed.rows[0]) {
      throw new AccountingInputError('Reopen later closed periods first so the company lock date remains sequential.');
    }

    await client.query(
      `UPDATE accounting_fiscal_periods
       SET status='open',lock_date=NULL,updated_by=$3,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,String(run.fiscal_period_id),context.userId],
    );

    const previous=await client.query(
      `SELECT MAX(ends_on)::text AS lock_date FROM accounting_fiscal_periods
       WHERE company_id=$1 AND deleted_at IS NULL AND status='closed' AND id<>$2`,
      [context.companyId,String(run.fiscal_period_id)],
    );
    await client.query(
      `UPDATE accounting_settings SET global_lock_date=$2,updated_by=$3,updated_at=NOW()
       WHERE company_id=$1 AND deleted_at IS NULL`,
      [context.companyId,previous.rows[0]?.lock_date||null,context.userId],
    );

    let reversalJournalId:null|string=null;
    if (run.closing_journal_id) {
      const reversal=await reversePostedLedgerJournal(client,{
        companyId:context.companyId,
        userId:context.userId,
        originalJournalId:String(run.closing_journal_id),
        journalDate:String(run.ends_on).slice(0,10),
        description:'Reopen year-end close · '+reason,
        sourceModule:'accounting',
        sourceType:'period_reopen',
        sourceId:runId,
        sourceEventKey:'accounting:period-reopen:'+runId,
      });
      reversalJournalId=reversal.journalId;
    }

    await client.query(
      `UPDATE accounting_close_runs
       SET status='reopened',reversal_journal_id=$3,reopened_by=$4,reopened_at=NOW(),
           reopen_reason=$5,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,runId,reversalJournalId,context.userId,reason],
    );

    await client.query('COMMIT');
    await audit(context,'reopened',runId,'Accounting period reopened.',{reason,reversalJournalId});
    return {id:runId,status:'reopened',reversalJournalId};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}
