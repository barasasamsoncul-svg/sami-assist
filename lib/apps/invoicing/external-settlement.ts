import 'server-only';

import crypto from 'node:crypto';

import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import {
  InvoicingError,
  cleanText,
  money,
} from '@/lib/apps/invoicing/context';
import {
  recordInvoicePaymentCore,
} from '@/lib/apps/invoicing/payment-core';
import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

function object(value:unknown) {
  return value&&typeof value==='object'&&!Array.isArray(value)
    ? value as Record<string,unknown>
    : {};
}

export async function recordVerifiedExternalInvoiceSettlement(input:{
  tenantId:string;
  companyId:string;
  userId:string;
  providerKey:string;
  externalEventId:string;
  payload:unknown;
}) {
  const payload=object(input.payload);
  const pool=await getTenantPoolByTenantId(input.tenantId);
  const invoiceId=cleanText(payload.invoiceId,80);
  const invoiceNumber=cleanText(payload.invoiceNumber,160);

  if(!invoiceId&&!invoiceNumber){
    throw new InvoicingError(
      'INVALID_INPUT',
      'Verified payment payload requires invoiceId or invoiceNumber.',
    );
  }

  const settlementStatus=cleanText(
    payload.status??payload.paymentStatus,
    40,
  ).toLowerCase();
  if(!['succeeded','paid','completed','success'].includes(settlementStatus)){
    throw new InvoicingError(
      'INVALID_INPUT',
      'Automatic settlement requires a normalized successful payment status.',
    );
  }

  const invoice=await pool.query(
    invoiceId
      ? `SELECT id::text,invoice_number,currency
         FROM invoicing_invoices
         WHERE company_id=$1 AND id=$2::uuid AND deleted_at IS NULL
         LIMIT 1`
      : `SELECT id::text,invoice_number,currency
         FROM invoicing_invoices
         WHERE company_id=$1 AND invoice_number=$2 AND deleted_at IS NULL
         LIMIT 1`,
    [input.companyId,invoiceId||invoiceNumber],
  );

  if(!invoice.rows[0]){
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Verified payment invoice was not found.',
    );
  }

  const amount=money(payload.amount);
  if(!Number.isFinite(amount)||amount<=0){
    throw new InvoicingError(
      'INVALID_INPUT',
      'Verified payment amount is invalid.',
    );
  }

  const currency=cleanText(payload.currency,12).toUpperCase();
  const invoiceCurrency=String(invoice.rows[0].currency||'').trim().toUpperCase();
  if(!currency||currency!==invoiceCurrency){
    throw new InvoicingError(
      'INVALID_INPUT',
      'Verified payment currency must match the invoice currency before automatic settlement.',
      {paymentCurrency:currency,invoiceCurrency},
    );
  }

  const providerReference=
    cleanText(payload.providerReference,255)||
    cleanText(payload.reference,255)||
    input.externalEventId;

  const idempotencyKey=crypto
    .createHash('sha256')
    .update('gateway:'+input.providerKey+':'+input.externalEventId)
    .digest('hex');

  const result=await recordInvoicePaymentCore({
    tenantId:input.tenantId,
    companyId:input.companyId,
    userId:input.userId,
    pool,
    invoiceId:String(invoice.rows[0].id),
    amount,
    paymentDate:payload.paymentDate,
    method:cleanText(payload.method,50)||input.providerKey,
    reference:providerReference,
    notes:cleanText(payload.notes,3000)||('Verified '+input.providerKey+' payment event.'),
    idempotencyKey,
    source:'gateway',
    sourceProvider:input.providerKey,
    externalEventId:input.externalEventId,
    providerTransactionId:
      cleanText(
        payload.providerTransactionId,
        255,
      ) ||
      null,
  });

  await recordWorkspaceAuditEvent({
    tenantId:input.tenantId,
    companyId:input.companyId,
    userId:input.userId,
    actorType:'system',
    action:'invoicing.gateway.payment_settled',
    module:'invoicing',
    resourceType:'invoicing_payment',
    resourceId:result.paymentId,
    summary:'Verified gateway payment automatically settled an invoice.',
    result:'success',
    metadata:{
      providerKey:input.providerKey,
      externalEventId:input.externalEventId,
      providerTransactionId:
        cleanText(
          payload.providerTransactionId,
          255,
        ) ||
        null,
      invoiceId:String(invoice.rows[0].id),
      invoiceNumber:String(invoice.rows[0].invoice_number),
      amount,
      currency,
      reused:result.reused,
    },
  }).catch(()=>undefined);

  return result;
}
