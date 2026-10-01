import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { validatePayment, settlementJournalLines } from '../lib/apps/accounting/payment-validation.ts';
import { createPaymentBatchCommand, transitionPaymentBatchCommand } from '../lib/apps/accounting/payment-command.ts';
import { ACCOUNTING_PAYMENTS_SQL } from '../lib/apps/accounting/payments-schema.ts';
import { postBalancedLedgerJournal } from '../lib/apps/accounting/ledger-engine.ts';
const company=randomUUID(), otherCompany=randomUUID(), user=randomUUID();
const bank=randomUUID(), clearing=randomUUID(), fee=randomUUID(), payable=randomUUID(), expense=randomUUID(), equity=randomUUID();
const bankAccount=randomUUID(), clearingAccount=randomUUID(), vendor=randomUUID(), bill=randomUUID();
const draft=(overrides={})=>({expectedCompanyId:company,requestKey:randomUUID(),kind:'settlement',paymentDate:'2026-06-15',sourceAccountId:clearingAccount,destinationAccountId:bankAccount,grossAmount:'100.00',feeAmount:'3.00',feeAccountId:fee,reference:randomUUID(),...overrides});
test('payment validation preserves pennies, caps totals and rejects ambiguous allocations',()=>{
  assert.equal(validatePayment(draft()).netAmount,'97.00');
  assert.equal(validatePayment(draft({grossAmount:'0.30',feeAmount:'0.10'})).netAmount,'0.20');
  for (const patch of [{feeAmount:'100.00'},{feeAmount:'-1'},{grossAmount:'0.001'},{grossAmount:'0'},{reference:' '},{expectedCompanyId:'bad'},{destinationAccountId:clearingAccount},{allocations:[{}]}]) assert.throws(()=>validatePayment(draft(patch)));
  const vendorInput=draft({kind:'vendor_payment',destinationAccountId:null,feeAccountId:null,feeAmount:'0',allocations:[{billId:bill,amount:'0.10'},{billId:randomUUID(),amount:'0.20'}]});
  assert.equal(validatePayment(vendorInput).grossAmount,'0.30');
  for (const allocations of [[],[{billId:bill,amount:'0'}],[{billId:bill,amount:'1'},{billId:bill,amount:'2'}],[{billId:bill,amount:'9999999999999.99'},{billId:randomUUID(),amount:'1'}]]) assert.throws(()=>validatePayment({...vendorInput,allocations}));
  assert.throws(()=>validatePayment({...vendorInput,feeAmount:'1'}));
  const lines=settlementJournalLines({sourceLedgerId:clearing,destinationLedgerId:bank,feeAccountId:fee,grossAmount:'100.00',netAmount:'97.00',feeAmount:'3.00'});
  assert.deepEqual(lines.map(l=>[l.debit,l.credit]),[['0.00','100.00'],['97.00','0.00'],['3.00','0.00']]);
  assert.throws(()=>settlementJournalLines({sourceLedgerId:bank,destinationLedgerId:bank,feeAccountId:fee,grossAmount:'100.00',netAmount:'97.00',feeAmount:'3.00'}));
});
test('payment batches post atomically, settle bills and reverse without losing history',{skip:!process.env.TEST_DATABASE_URL&&!process.env.PGLITE_TEST_MODULE},async()=>{
  let pool,embedded,admin;
  const schema='payment_test_'+randomUUID().replaceAll('-','');
  if (process.env.PGLITE_TEST_MODULE) {
    const {PGlite}=await import(process.env.PGLITE_TEST_MODULE);embedded=new PGlite();
    pool={query:(...a)=>embedded.query(...a),connect:async()=>({query:(...a)=>embedded.query(...a),release:()=>{}})};
  } else {
    admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
    pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});
  }
  try {
      const statements = [
        `CREATE TABLE accounts (id uuid PRIMARY KEY,company_id uuid NOT NULL,code text NOT NULL,name text NOT NULL,account_type text NOT NULL,is_active boolean DEFAULT true,allow_manual_posting boolean NOT NULL DEFAULT true,deleted_at timestamptz)`,
        `CREATE TABLE journals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,journal_number varchar(100) NOT NULL,journal_date date,reference text,description text,status text,source_module text,source_type text,source_id text,source_event_key text,posting_kind text DEFAULT 'manual',posted_at timestamptz,posted_by uuid,approved_by uuid,approved_at timestamptz,approval_note text,reversal_of_journal_id uuid,reversed_by_journal_id uuid,created_by uuid,updated_by uuid,updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),deleted_at timestamptz)`,
        `CREATE TABLE journal_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,journal_id uuid REFERENCES journals(id),account_id uuid REFERENCES accounts(id),description text CHECK(description <> 'FAIL'),debit numeric(15,2),credit numeric(15,2),created_by uuid,updated_by uuid,updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),deleted_at timestamptz,CHECK(debit >= 0 AND credit >= 0),CHECK((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)))`,
        `CREATE TABLE accounting_fiscal_periods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,name text,starts_on date,ends_on date,lock_date date,status text,deleted_at timestamptz)`,
        `CREATE TABLE accounting_settings(company_id uuid PRIMARY KEY,global_lock_date date,require_open_period boolean NOT NULL DEFAULT true,deleted_at timestamptz)`,
        `CREATE UNIQUE INDEX uq_test_journals_company_number ON journals(company_id,journal_number) WHERE deleted_at IS NULL`,
        `CREATE UNIQUE INDEX uq_test_journals_source_event ON journals(company_id,source_module,source_event_key) WHERE deleted_at IS NULL AND source_module IS NOT NULL AND source_event_key IS NOT NULL`,
        `CREATE TABLE sami_enterprise_idempotency(company_id uuid,idempotency_key uuid,module_key text,table_key text,request_hash text,created_by uuid,created_at timestamptz,updated_at timestamptz,record_key text,response_json jsonb,PRIMARY KEY(company_id,idempotency_key))`,
      ];

    for(const sql of statements) await pool.query(sql);
    for(const sql of [
      `CREATE TABLE companies(id uuid PRIMARY KEY)`,
      `CREATE TABLE accounting_bank_accounts(id uuid PRIMARY KEY,company_id uuid,name text,ledger_account_id uuid,currency text,status text,allow_overdraft boolean DEFAULT false,overdraft_limit numeric(15,2) DEFAULT 0,deleted_at timestamptz)`,
      `CREATE VIEW accounting_financial_account_balances AS SELECT b.company_id,b.id AS bank_account_id,COALESCE(SUM(l.debit-l.credit) FILTER(WHERE j.status='posted' AND j.deleted_at IS NULL AND l.deleted_at IS NULL),0)::numeric(19,2) AS book_balance FROM accounting_bank_accounts b LEFT JOIN journal_lines l ON l.company_id=b.company_id AND l.account_id=b.ledger_account_id LEFT JOIN journals j ON j.company_id=l.company_id AND j.id=l.journal_id GROUP BY b.id`,
      `CREATE TABLE accounting_vendor_documents(id uuid PRIMARY KEY,company_id uuid,vendor_id uuid,document_type text,document_number text,vendor_reference text,document_date date,due_date date,currency text,exchange_rate numeric(18,8),base_currency text,total_amount numeric(19,4),base_total_amount numeric(19,2),status text,posted_journal_id uuid,updated_by uuid,updated_at timestamptz,deleted_at timestamptz)`,
      `CREATE TABLE accounting_vendor_credit_applications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,bill_document_id uuid,credit_document_id uuid,amount numeric(19,4),status text,deleted_at timestamptz)`,
      `CREATE TABLE accounting_reconciliations(id uuid PRIMARY KEY,company_id uuid,status text,deleted_at timestamptz)`,
      `CREATE TABLE accounting_reconciliation_matches(id uuid PRIMARY KEY,company_id uuid,reconciliation_id uuid,journal_line_id uuid,deleted_at timestamptz)`,
    ]) await pool.query(sql);
    // Test the actual migration SQL, scoped to an isolated test schema on PostgreSQL.
    const sql=ACCOUNTING_PAYMENTS_SQL.replaceAll('public.',embedded?'public.':schema+'.');
    if(embedded) await embedded.exec(sql); else await pool.query(sql);
    // Reapplying must preserve the schema and its dependent balances view.
    if(embedded) await embedded.exec(sql); else await pool.query(sql);
    await pool.query('INSERT INTO companies(id) VALUES($1),($2)',[company,otherCompany]);
    for(const [id,code,type] of [[bank,'1000','asset_cash'],[clearing,'1100','asset_cash'],[fee,'5000','expense'],[expense,'5100','expense'],[payable,'2000','liability_payable'],[equity,'3000','equity']]) await pool.query('INSERT INTO accounts(id,company_id,code,name,account_type) VALUES($1,$2,$3,$3,$4)',[id,company,code,type]);
    await pool.query(`INSERT INTO accounting_bank_accounts(id,company_id,name,ledger_account_id,currency,status) VALUES($1,$3,'Bank',$4,'KES','active'),($2,$3,'Clearing',$5,'KES','active')`,[bankAccount,clearingAccount,company,bank,clearing]);
    await pool.query(`INSERT INTO accounting_fiscal_periods(company_id,name,starts_on,ends_on,status) VALUES($1,'2026','2026-01-01','2026-12-31','open')`,[company]);
    const context={pool,companyId:company,userId:user,company:{currentCompany:{currency:'KES'}}};
    async function journal(input) {
      const client=await pool.connect();
      try {await client.query('BEGIN');const result=await postBalancedLedgerJournal(client,{companyId:company,userId:user,journalDate:'2026-06-01',description:'Test source',sourceModule:'accounting',sourceType:'seed',sourceId:randomUUID(),sourceEventKey:randomUUID(),...input});await client.query('COMMIT');return result;} catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
    }
    await journal({lines:[{accountId:bank,debit:'1000',credit:'0'},{accountId:clearing,debit:'500',credit:'0'},{accountId:equity,debit:'0',credit:'1500'}]});
    const billJournal=await journal({sourceType:'vendor_bill',sourceId:bill,lines:[{accountId:expense,debit:'200',credit:'0'},{accountId:payable,debit:'0',credit:'200'}]});
    await pool.query(`INSERT INTO accounting_vendor_documents(id,company_id,vendor_id,document_type,document_number,document_date,due_date,currency,exchange_rate,base_currency,total_amount,base_total_amount,status,posted_journal_id) VALUES($1,$2,$3,'bill','BILL-1','2026-06-01','2026-06-30','KES',1,'KES',200,200,'posted',$4)`,[bill,company,vendor,billJournal.journalId]);
    const create=input=>createPaymentBatchCommand(context,input);
    const transition=(id,action,extra={})=>transitionPaymentBatchCommand(context,{expectedCompanyId:company,batchId:id,action,...extra});
    const balance=async()=> (await pool.query('SELECT open_amount::text FROM accounting_vendor_document_balances WHERE document_id=$1',[bill])).rows[0].open_amount;
    const input=draft();const settlement=await create(input);
    assert.equal((await create(input)).id,settlement.id);
    await assert.rejects(()=>create({...input,grossAmount:'101'}),/different payment details/);
    await assert.rejects(()=>create(draft({reference:input.reference})),/already has/);
    await assert.rejects(()=>create(draft({expectedCompanyId:otherCompany})),/active company/);
    await assert.rejects(()=>create(draft({sourceAccountId:randomUUID()})),/could not be found/);
    await assert.rejects(()=>transition(settlement.id,'post'),/Approve/);
    await transition(settlement.id,'approve');await transition(settlement.id,'post');
    assert.equal((await transition(settlement.id,'post')).replayed,true);
    assert.equal((await pool.query('SELECT book_balance::text FROM accounting_financial_account_balances WHERE bank_account_id=$1',[bankAccount])).rows[0].book_balance,'1097.00');
    assert.equal((await pool.query('SELECT SUM(debit-credit)::text AS n FROM journal_lines WHERE account_id=$1',[fee])).rows[0].n,'3.00');
    const vendorInput=draft({kind:'vendor_payment',sourceAccountId:bankAccount,destinationAccountId:null,feeAccountId:null,feeAmount:'0',allocations:[{billId:bill,amount:'50'}]});
    const payment=await create(vendorInput);await transition(payment.id,'approve');
    assert.equal(await balance(),'200.0000','drafts and approvals do not settle bills');
    await transition(payment.id,'post');assert.equal(await balance(),'150.0000');
    assert.equal((await pool.query('SELECT status FROM accounting_vendor_documents WHERE id=$1',[bill])).rows[0].status,'partially_settled');
    const remaining=await create({...vendorInput,requestKey:randomUUID(),reference:randomUUID(),allocations:[{billId:bill,amount:'150'}]});
    await transition(remaining.id,'approve');await transition(remaining.id,'post');assert.equal(await balance(),'0.0000');
    assert.equal((await pool.query('SELECT status FROM accounting_vendor_documents WHERE id=$1',[bill])).rows[0].status,'settled');
    await transition(remaining.id,'reverse',{reversalDate:'2026-06-16'});assert.equal(await balance(),'150.0000');
    assert.equal((await transition(remaining.id,'reverse',{reversalDate:'2026-06-16'})).replayed,true);
    // A stale approved batch must re-read balances inside the posting transaction.
    const stale=await create({...vendorInput,requestKey:randomUUID(),reference:randomUUID(),allocations:[{billId:bill,amount:'150'}]});await transition(stale.id,'approve');
    await pool.query(`INSERT INTO accounting_vendor_credit_applications(company_id,bill_document_id,amount,status) VALUES($1,$2,20,'posted')`,[company,bill]);
    await assert.rejects(()=>transition(stale.id,'post'),/outstanding/);
    assert.equal((await pool.query('SELECT status,posted_journal_id FROM accounting_payment_batches WHERE id=$1',[stale.id])).rows[0].status,'approved');
    assert.equal(await balance(),'130.0000');
    const tooMuch=await create(draft({grossAmount:'9000'}));await transition(tooMuch.id,'approve');await assert.rejects(()=>transition(tooMuch.id,'post'),/available balance/);
    const closed=await create(draft({paymentDate:'2027-01-01'}));await transition(closed.id,'approve');await assert.rejects(()=>transition(closed.id,'post'),/period/i);
    const matchedId=randomUUID();
    await pool.query(`INSERT INTO accounting_reconciliations(id,company_id,status) VALUES($1,$2,'matched')`,[matchedId,company]);
    await pool.query(`INSERT INTO accounting_reconciliation_matches(id,company_id,reconciliation_id,journal_line_id) SELECT $1,$2,$3,l.id FROM journal_lines l JOIN accounting_payment_batches b ON b.posted_journal_id=l.journal_id WHERE b.id=$4 AND l.account_id=$5`,[randomUUID(),company,matchedId,payment.id,bank]);
    await assert.rejects(()=>transition(payment.id,'reverse',{reversalDate:'2026-06-16'}),/reconciliation matches/);
    await pool.query(`UPDATE accounting_reconciliations SET status='reversed' WHERE id=$1`,[matchedId]);
    await transition(payment.id,'reverse',{reversalDate:'2026-06-16'});assert.equal(await balance(),'180.0000');
    await transition(settlement.id,'reverse',{reversalDate:'2026-06-16'});
    assert.equal((await pool.query('SELECT book_balance::text FROM accounting_financial_account_balances WHERE bank_account_id=$1',[bankAccount])).rows[0].book_balance,'1000.00');
    assert.equal((await pool.query('SELECT SUM(debit-credit)::text AS n FROM journal_lines WHERE account_id=$1',[fee])).rows[0].n,'0.00');
    const cancelled=await create(draft());await transition(cancelled.id,'cancel');await assert.rejects(()=>transition(cancelled.id,'approve'),/no longer/);
    // Row/advisory locks protect simultaneous replay on real PostgreSQL.
    if (!embedded) {
      const retry=draft();const results=await Promise.all([create(retry),create(retry)]);assert.equal(results[0].id,results[1].id);
      await transition(results[0].id,'approve');await Promise.all([transition(results[0].id,'post'),transition(results[0].id,'post')]);
      assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM journals WHERE source_event_key=$1`,['accounting:payment:'+results[0].id])).rows[0].n,1);
      const makeBillBatch=()=>create({...vendorInput,requestKey:randomUUID(),reference:randomUUID(),allocations:[{billId:bill,amount:'100'}]});
      const competing=await Promise.all([makeBillBatch(),makeBillBatch()]);
      for(const b of competing) await transition(b.id,'approve');
      const posted=await Promise.allSettled(competing.map(b=>transition(b.id,'post')));
      assert.equal(posted.filter(r=>r.status==='fulfilled').length,1,'competing batches cannot overpay a bill');
      assert.equal(await balance(),'80.0000');
      const withdrawals=await Promise.all([create(draft({grossAmount:'300'})),create(draft({grossAmount:'300'}))]);
      for(const b of withdrawals) await transition(b.id,'approve');
      const paid=await Promise.allSettled(withdrawals.map(b=>transition(b.id,'post')));
      assert.equal(paid.filter(r=>r.status==='fulfilled').length,1,'competing withdrawals respect source balance');

    }
  } finally {
    if (embedded) await embedded.close();
    else {await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
  }
});
