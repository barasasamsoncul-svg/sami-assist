import 'server-only';
import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import { AccountingInputError } from './validation';
import { paymentBody } from './payment-validation';
import { createPaymentBatchCommand, transitionPaymentBatchCommand } from './payment-command';
type Context = Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;
async function audit(context: Context, id: string, action: string) {
  try {
    await recordWorkspaceAuditEvent({ tenantId: context.tenantId, companyId: context.companyId, userId: context.userId,
      action: 'accounting.payment.' + action, module: 'accounting', resourceType: 'accounting_payment_batches', resourceId: id, summary: 'Payment batch ' + action, metadata: { action } });
  } catch (error) { console.error('[Accounting] Payment audit event failed', error); }
}

export async function createPaymentBatch(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_payment_batches','create');
  const result=await createPaymentBatchCommand(context,input);
  if (!result.replayed) await audit(context,result.id,'created');
  return result;
}
export async function transitionPaymentBatch(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_payment_batches','transition');
  const result=await transitionPaymentBatchCommand(context,input);
  if (!result.replayed) await audit(context,result.id,String(paymentBody(input).action));
  return result;
}

export async function getAccountingPayments(pageInput?: string) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_payment_batches','view');
  if (pageInput && !/^[1-9]\d{0,5}$/.test(pageInput)) throw new AccountingInputError('Choose a valid page.');
  const page=Number(pageInput||1), currency=context.company.currentCompany.currency.toUpperCase();
  const [batches,accounts,bills,fees]=await Promise.all([
    context.pool.query(`SELECT b.id::text,b.kind,b.reference,b.payment_date::text,b.currency,b.gross_amount::text,b.fee_amount::text,b.net_amount::text,
      b.status,b.notes,b.posted_journal_id::text,b.reversal_journal_id::text,s.name AS source_name,d.name AS destination_name,
      COALESCE((SELECT json_agg(json_build_object('billNumber',v.document_number,'vendor',n.name,'amount',a.amount::text))
        FROM accounting_payment_allocations a JOIN accounting_vendor_documents v ON v.company_id=a.company_id AND v.id=a.bill_document_id
        JOIN accounting_vendors n ON n.company_id=v.company_id AND n.id=v.vendor_id WHERE a.company_id=b.company_id AND a.batch_id=b.id AND a.deleted_at IS NULL),'[]'::json) AS allocations
      FROM accounting_payment_batches b JOIN accounting_bank_accounts s ON s.company_id=b.company_id AND s.id=b.source_account_id
      LEFT JOIN accounting_bank_accounts d ON d.company_id=b.company_id AND d.id=b.destination_account_id
      WHERE b.company_id=$1 AND b.deleted_at IS NULL ORDER BY b.created_at DESC,b.id DESC LIMIT 26 OFFSET $2`,[context.companyId,(page-1)*25]),
    context.pool.query(`SELECT b.id::text,b.name,b.currency,COALESCE(v.book_balance,0)::text AS balance FROM accounting_bank_accounts b
      LEFT JOIN accounting_financial_account_balances v ON v.company_id=b.company_id AND v.bank_account_id=b.id
      WHERE b.company_id=$1 AND b.deleted_at IS NULL AND b.status='active' AND b.currency=$2 ORDER BY b.name`,[context.companyId,currency]),
    context.pool.query(`SELECT b.document_id::text AS id,b.document_number,v.name AS vendor,b.due_date::text,ROUND(b.open_amount,2)::text AS open_amount
      FROM accounting_vendor_document_balances b JOIN accounting_vendors v ON v.company_id=b.company_id AND v.id=b.vendor_id
      WHERE b.company_id=$1 AND b.document_type='bill' AND b.open_amount>0 AND b.currency=$2 AND b.exchange_rate=1
      ORDER BY b.due_date,b.document_number LIMIT 500`,[context.companyId,currency]),
    context.pool.query(`SELECT id::text,code,name FROM accounts WHERE company_id=$1 AND deleted_at IS NULL AND is_active=TRUE AND account_type LIKE 'expense%' ORDER BY code`,[context.companyId]),
  ]);
  return {companyId:context.companyId,currency,page,hasMore:batches.rows.length>25,batches:batches.rows.slice(0,25),accounts:accounts.rows,bills:bills.rows,feeAccounts:fees.rows};
}
export type AccountingPaymentsWorkspace = Awaited<ReturnType<typeof getAccountingPayments>>;
