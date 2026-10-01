import 'server-only';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { postBalancedLedgerJournal, reversePostedLedgerJournal } from './ledger-engine';
import { AccountingInputError, accountingDate, accountingId, minorUnits } from './validation';
import { paymentBody, settlementJournalLines, validatePayment } from './payment-validation';
export type PaymentContext = {pool: Pool; companyId: string; userId: string; company: {currentCompany: {currency: string}}};

function companyCheck(context: PaymentContext, value: unknown) {
  if (accountingId(value) !== context.companyId) throw new AccountingInputError('The active company changed. Reload before continuing.');
}
async function lockAccounts(client: PoolClient, context: PaymentContext, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['accounting:financial-account:' + id]);
  }
  const result = await client.query(
    `SELECT b.*,COALESCE(v.book_balance,0)::text AS book_balance
     FROM accounting_bank_accounts b LEFT JOIN accounting_financial_account_balances v
       ON v.company_id=b.company_id AND v.bank_account_id=b.id
     WHERE b.company_id=$1 AND b.id=ANY($2::uuid[]) AND b.deleted_at IS NULL ORDER BY b.id FOR UPDATE OF b`,
    [context.companyId,ids]);
  if (result.rows.length !== new Set(ids).size) throw new AccountingInputError('A financial account could not be found.');
  const currency = context.company.currentCompany.currency.toUpperCase();
  for (const account of result.rows) {
    if (account.status !== 'active' || !account.ledger_account_id || account.currency.toUpperCase() !== currency) {
      throw new AccountingInputError('Payments require active financial accounts in the company base currency.');
    }
  }
  return result.rows;
}
function checkFunds(account: {book_balance: string; allow_overdraft: boolean; overdraft_limit: string}, amount: string) {
  const value = account.book_balance;
  const balance = value.startsWith('-') ? -minorUnits(value.slice(1)) : minorUnits(value);
  const limit = account.allow_overdraft ? minorUnits(account.overdraft_limit) : BigInt(0);
  if (balance - minorUnits(amount) < -limit) throw new AccountingInputError('This payment exceeds the available balance and configured overdraft limit.');
}
async function billsForUpdate(client: PoolClient, context: PaymentContext, allocations: {billId: string; amount: string}[]) {
  if (!allocations.length) return [];
  const rows = await client.query(
    `SELECT d.* FROM accounting_vendor_documents d WHERE d.company_id=$1 AND d.id=ANY($2::uuid[])
     AND d.deleted_at IS NULL ORDER BY d.id FOR UPDATE`,[context.companyId,allocations.map(a=>a.billId)]);
  if (rows.rows.length !== allocations.length) throw new AccountingInputError('A selected bill could not be found.');
  return rows.rows;
}
async function validateBills(client: PoolClient, context: PaymentContext, allocations: {billId: string; amount: string}[]) {
  const bills = await billsForUpdate(client,context,allocations);
  const lines: {accountId: string; debit: string; credit: string}[] = [];
  for (const bill of bills) {
    if (bill.document_type !== 'bill' || !['posted','partially_settled'].includes(bill.status) ||
      bill.currency !== context.company.currentCompany.currency.toUpperCase() || Number(bill.exchange_rate) !== 1) {
      throw new AccountingInputError('Choose open, posted bills in the company base currency.');
    }
    const balance = await client.query(`SELECT ROUND(open_amount,2)::text AS amount FROM accounting_vendor_document_balances WHERE company_id=$1 AND document_id=$2`,[context.companyId,bill.id]);
    const allocation = allocations.find(a=>a.billId===bill.id)!;
    if (!balance.rows[0] || minorUnits(allocation.amount)>minorUnits(balance.rows[0].amount)) throw new AccountingInputError('A payment exceeds the bill’s current outstanding balance. Reload the bills.');
    // The original bill's sole credit is its AP control account. Never use a later changed default mapping.
    const controls = await client.query(
      `SELECT l.account_id::text FROM journal_lines l JOIN journals j ON j.id=l.journal_id AND j.company_id=l.company_id
       WHERE l.company_id=$1 AND l.journal_id=$2 AND l.credit>0 AND l.deleted_at IS NULL
         AND j.status='posted' AND j.deleted_at IS NULL AND j.reversed_by_journal_id IS NULL
         AND j.source_module='accounting' AND j.source_type='vendor_bill' AND j.source_id=$3`,
      [context.companyId,bill.posted_journal_id,bill.id]);
    if (controls.rows.length !== 1) throw new AccountingInputError('The original bill payable account could not be verified.');
    lines.push({accountId: controls.rows[0].account_id,debit:allocation.amount,credit:'0.00'});
  }
  return lines;
}
async function refreshBills(client: PoolClient, context: PaymentContext, ids: string[]) {
  await client.query(
    `UPDATE accounting_vendor_documents d SET status=CASE WHEN b.open_amount=0 THEN 'settled'
       WHEN b.applied_amount>0 THEN 'partially_settled' ELSE 'posted' END,updated_by=$3,updated_at=NOW()
     FROM accounting_vendor_document_balances b WHERE d.company_id=$1 AND d.id=ANY($2::uuid[])
       AND b.company_id=d.company_id AND b.document_id=d.id`,[context.companyId,ids,context.userId]);
}
export async function createPaymentBatchCommand(context: PaymentContext, input: unknown) {
  const data = validatePayment(input); companyCheck(context,data.expectedCompanyId);
  const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[context.companyId + ':payment-request:' + data.requestKey]);
    const existing = await client.query('SELECT id::text,request_hash FROM accounting_payment_batches WHERE company_id=$1 AND request_key=$2',[context.companyId,data.requestKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash!==hash) throw new AccountingInputError('This request key was used with different payment details.');
      await client.query('COMMIT'); return {id:existing.rows[0].id,replayed:true};
    }
    await lockAccounts(client,context,[data.sourceAccountId,...(data.destinationAccountId?[data.destinationAccountId]:[])]);
    await validateBills(client,context,data.allocations);
    if (data.feeAccountId) {
      const fee = await client.query(`SELECT 1 FROM accounts WHERE company_id=$1 AND id=$2 AND is_active=TRUE AND deleted_at IS NULL AND account_type LIKE 'expense%'`,[context.companyId,data.feeAccountId]);
      if (!fee.rows[0]) throw new AccountingInputError('Choose an active expense account for settlement fees.');
    }
    const result = await client.query(
      `INSERT INTO accounting_payment_batches(company_id,request_key,request_hash,kind,reference,payment_date,currency,
       source_account_id,destination_account_id,fee_account_id,gross_amount,fee_amount,net_amount,notes,created_by,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING id::text`,
      [context.companyId,data.requestKey,hash,data.kind,data.reference,data.paymentDate,context.company.currentCompany.currency.toUpperCase(),
        data.sourceAccountId,data.destinationAccountId,data.feeAccountId,data.grossAmount,data.feeAmount,data.netAmount,data.notes,context.userId]);
    const id = result.rows[0].id as string;
    for (const a of data.allocations) await client.query(
      `INSERT INTO accounting_payment_allocations(company_id,batch_id,bill_document_id,amount,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5)`,
      [context.companyId,id,a.billId,a.amount,context.userId]);
    await client.query('COMMIT'); return {id,replayed:false};
  } catch (error) { await client.query('ROLLBACK');
    if ((error as {code?: string}).code==='23505') throw new AccountingInputError('This source account already has a payment or settlement with that reference.');
    throw error;
  } finally {client.release();}
}

export async function transitionPaymentBatchCommand(context: PaymentContext, input: unknown) {
  const body = paymentBody(input); companyCheck(context,body.expectedCompanyId);
  const id=accountingId(body.batchId), action=body.action;
  if (!['approve','post','reverse','cancel'].includes(String(action))) throw new AccountingInputError('Choose a supported payment action.');
  const reversalDate=action==='reverse'?accountingDate(body.reversalDate):null;
  const client=await context.pool.connect();
  try {
    await client.query('BEGIN');
    const result=await client.query('SELECT * FROM accounting_payment_batches WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE',[context.companyId,id]);
    const batch=result.rows[0]; if (!batch) throw new AccountingInputError('Payment batch not found.');
    if (batch.fx_managed) throw new AccountingInputError('This foreign-currency payment is managed from Accounting → Foreign Currency. Use that workspace to reverse or inspect it.');
    if ((action==='approve' && batch.status==='approved') || (action==='post' && batch.status==='posted') ||
      (action==='reverse' && batch.status==='reversed') || (action==='cancel' && batch.status==='cancelled')) {
      await client.query('COMMIT'); return {id,replayed:true};
    }
    const allocations=(await client.query(`SELECT bill_document_id::text AS "billId",amount::text FROM accounting_payment_allocations WHERE company_id=$1 AND batch_id=$2 AND deleted_at IS NULL ORDER BY bill_document_id`,[context.companyId,id])).rows as {billId:string;amount:string}[];
    if (action==='approve' || action==='cancel') {
      if (action==='approve' ? batch.status!=='draft' : !['draft','approved'].includes(batch.status)) throw new AccountingInputError('This payment can no longer be approved or cancelled.');
      if (action==='approve') await validateBills(client,context,allocations);
      await client.query(`UPDATE accounting_payment_batches SET status=$3::varchar,approved_by=CASE WHEN $3::varchar='approved' THEN $4 ELSE approved_by END,
        approved_at=CASE WHEN $3::varchar='approved' THEN NOW() ELSE approved_at END,updated_by=$4,updated_at=NOW() WHERE company_id=$1 AND id=$2`,[context.companyId,id,action==='approve'?'approved':'cancelled',context.userId]);
    } else {
      if (action==='post' ? batch.status!=='approved' : batch.status!=='posted') throw new AccountingInputError(action==='post'?'Approve the batch before recording payment.':'Only a posted payment can be reversed.');
      if (batch.currency!==context.company.currentCompany.currency.toUpperCase()) throw new AccountingInputError('Payment currency no longer matches the company base currency.');
      const accounts=await lockAccounts(client,context,[batch.source_account_id,...(batch.destination_account_id?[batch.destination_account_id]:[])]);
      const source=accounts.find(a=>a.id===batch.source_account_id)!;
      const destination=accounts.find(a=>a.id===batch.destination_account_id);
      if (action==='post') {
        checkFunds(source,batch.gross_amount);
        let lines;
        if (batch.kind==='vendor_payment') {
          if (!allocations.length || allocations.reduce((sum,a)=>sum+minorUnits(a.amount),BigInt(0))!==minorUnits(batch.gross_amount)) throw new AccountingInputError('Payment allocations do not match the batch total.');
          lines=await validateBills(client,context,allocations);
          lines.push({accountId:source.ledger_account_id,debit:'0.00',credit:batch.gross_amount});
        } else {
          if (!destination) throw new AccountingInputError('Settlement destination is missing.');
          if (batch.fee_account_id) {
            const fee=await client.query(`SELECT 1 FROM accounts WHERE company_id=$1 AND id=$2 AND is_active=TRUE AND deleted_at IS NULL AND account_type LIKE 'expense%'`,[context.companyId,batch.fee_account_id]);
            if (!fee.rows[0]) throw new AccountingInputError('The settlement fee account must be an active expense account.');
          }
          lines=settlementJournalLines({sourceLedgerId:source.ledger_account_id,destinationLedgerId:destination.ledger_account_id,feeAccountId:batch.fee_account_id,
            grossAmount:batch.gross_amount,feeAmount:batch.fee_amount,netAmount:batch.net_amount});
        }
        const journal=await postBalancedLedgerJournal(client,{companyId:context.companyId,userId:context.userId,
          journalDate:typeof batch.payment_date==='string'?batch.payment_date.slice(0,10):batch.payment_date.toISOString().slice(0,10),
          description:(batch.kind==='settlement'?'Settlement · ':'Vendor payment · ')+batch.reference,reference:batch.reference,
          sourceModule:'accounting',sourceType:'payment_batch',sourceId:id,sourceEventKey:'accounting:payment:'+id,postingKind:'system',lines});
        await client.query(`UPDATE accounting_payment_batches SET status='posted',posted_journal_id=$3,posted_by=$4,posted_at=NOW(),updated_by=$4,updated_at=NOW() WHERE company_id=$1 AND id=$2`,[context.companyId,id,journal.journalId,context.userId]);
      } else {
        await billsForUpdate(client,context,allocations);
        // Serialize with reconciliation, which locks each journal line before matching.
        await client.query('SELECT id FROM journal_lines WHERE company_id=$1 AND journal_id=$2 ORDER BY id FOR UPDATE',[context.companyId,batch.posted_journal_id]);
        const matched=await client.query(`SELECT 1 FROM accounting_reconciliation_matches m JOIN accounting_reconciliations r ON r.company_id=m.company_id AND r.id=m.reconciliation_id
          JOIN journal_lines l ON l.company_id=m.company_id AND l.id=m.journal_line_id
          WHERE m.company_id=$1 AND l.journal_id=$2 AND r.status='matched' AND r.deleted_at IS NULL AND m.deleted_at IS NULL LIMIT 1`,[context.companyId,batch.posted_journal_id]);
        if (matched.rows[0]) throw new AccountingInputError('Reverse bank reconciliation matches before reversing this payment.');
        if (destination) checkFunds(destination,batch.net_amount);
        const journal=await reversePostedLedgerJournal(client,{companyId:context.companyId,userId:context.userId,originalJournalId:batch.posted_journal_id,
          journalDate:reversalDate!,description:'Payment reversal · '+batch.reference,sourceModule:'accounting',sourceType:'payment_batch_reversal',sourceId:id,sourceEventKey:'accounting:payment-reversal:'+id});
        await client.query(`UPDATE accounting_payment_batches SET status='reversed',reversal_journal_id=$3,reversed_by=$4,reversed_at=NOW(),updated_by=$4,updated_at=NOW() WHERE company_id=$1 AND id=$2`,[context.companyId,id,journal.journalId,context.userId]);
      }
      await refreshBills(client,context,allocations.map(a=>a.billId));
    }
    await client.query('COMMIT'); return {id,replayed:false};
  } catch(error) {await client.query('ROLLBACK'); throw error;} finally {client.release();}
}

