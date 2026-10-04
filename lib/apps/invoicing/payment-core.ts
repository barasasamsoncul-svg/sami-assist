import 'server-only';

import type { Pool } from 'pg';

import {
  cleanText,
  InvoicingError,
  isoDate,
  money,
  nextDocumentNumber,
  nullableText,
  recordInvoicingActivity,
} from '@/lib/apps/invoicing/context';
import {
  postInvoicePaymentAllocationToAccounting,
  postInvoicePaymentToAccounting,
} from '@/lib/apps/invoicing/accounting';

async function advisoryLock(
  client:import('pg').PoolClient,
  key:string,
){
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    [key],
  );
}

export type InvoicingPaymentCoreResult={
  paymentId:string;
  paymentNumber:string;
  invoiceId:string;
  status:string;
  remainingBalance:number;
  allocatedAmount:number;
  unappliedAmount:number;
  refundedAmount?:number;
  reconciled?:boolean;
  reused:boolean;
};

export async function recordInvoicePaymentCore(input:{
  tenantId:string;
  companyId:string;
  userId:string;
  pool:Pool;
  invoiceId:string;
  amount:number;
  paymentDate?:unknown;
  method?:unknown;
  reference?:unknown;
  notes?:unknown;
  idempotencyKey?:unknown;
  source?:'manual'|'gateway'|'bank_feed'|'automation';
  sourceProvider?:string|null;
  externalEventId?:string|null;
  providerTransactionId?:string|null;
}):Promise<InvoicingPaymentCoreResult>{
  const paymentAmount=money(input.amount);
  if(!Number.isFinite(paymentAmount)||paymentAmount<=0){
    throw new InvoicingError('INVALID_INPUT','Payment amount is invalid.');
  }

  const paymentMethod=cleanText(input.method,50)||'other';
  const paymentReference=cleanText(input.reference,255);
  const idempotencyKey=cleanText(input.idempotencyKey,160)||null;
  const paymentDate=isoDate(input.paymentDate,new Date());
  const client=await input.pool.connect();

  try{
    await client.query('BEGIN');

    const locked=await client.query(
      `SELECT id,invoice_number,customer_id,currency,exchange_rate,total_amount,status
       FROM invoicing_invoices
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL
       FOR UPDATE`,
      [input.invoiceId,input.companyId],
    );
    if(locked.rows.length!==1){
      throw new InvoicingError('INVOICE_NOT_FOUND','Invoice was not found.');
    }

    const aging=await client.query(
      `SELECT balance_due,effective_status
       FROM invoicing_aging
       WHERE invoice_id=$1 AND company_id=$2
       LIMIT 1`,
      [input.invoiceId,input.companyId],
    );

    const invoice={...locked.rows[0],...(aging.rows[0]||{})};
    const effectiveStatus=String(invoice.effective_status||invoice.status);
    const balance=money(invoice.balance_due);

    if(idempotencyKey){
      await advisoryLock(
        client,
        ['invoicing-payment-idempotency',input.companyId,idempotencyKey].join(':'),
      );
      const previous=await client.query(
        `SELECT
           p.id,p.payment_number,p.status,
           b.allocated_amount,b.refunded_amount,b.unapplied_amount
         FROM invoicing_payments p
         INNER JOIN invoicing_payment_balances b
           ON b.payment_id=p.id AND b.company_id=p.company_id
         WHERE p.company_id=$1
           AND p.idempotency_key=$2
           AND p.deleted_at IS NULL
         LIMIT 1`,
        [input.companyId,idempotencyKey],
      );
      if(previous.rows[0]){
        await client.query('COMMIT');
        return {
          paymentId:String(previous.rows[0].id),
          paymentNumber:String(previous.rows[0].payment_number),
          invoiceId:input.invoiceId,
          status:String(previous.rows[0].status),
          remainingBalance:balance,
          allocatedAmount:money(previous.rows[0].allocated_amount),
          refundedAmount:money(previous.rows[0].refunded_amount),
          unappliedAmount:money(previous.rows[0].unapplied_amount),
          reconciled:false,
          reused:true,
        };
      }
    }

    if(['draft','pending_approval','rejected','cancelled','void','written_off','paid'].includes(effectiveStatus)){
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Payments can only be recorded against an open confirmed or sent invoice.',
      );
    }

    const allocationAmount=money(Math.min(paymentAmount,balance));
    const unappliedAmount=money(Math.max(paymentAmount-allocationAmount,0));

    const settings=await client.query(
      `SELECT allow_partial_payments
       FROM invoicing_settings
       WHERE company_id=$1
       LIMIT 1`,
      [input.companyId],
    );
    if(settings.rows[0]?.allow_partial_payments===false&&allocationAmount<balance-0.0001){
      throw new InvoicingError(
        'INVALID_INPUT',
        'Partial payments are disabled for this company. Record the full outstanding balance.',
        {balance},
      );
    }

    if(paymentReference){
      await advisoryLock(
        client,
        [
          'invoicing-payment-reference',
          input.companyId,
          paymentMethod.toLowerCase(),
          paymentReference.toLowerCase(),
        ].join(':'),
      );
      const duplicate=await client.query(
        `SELECT id,payment_number
         FROM invoicing_payments
         WHERE company_id=$1
           AND deleted_at IS NULL
           AND LOWER(BTRIM(COALESCE(method,'')))=$2
           AND LOWER(BTRIM(COALESCE(reference,'')))=$3
         LIMIT 1`,
        [input.companyId,paymentMethod.toLowerCase(),paymentReference.toLowerCase()],
      );
      if(duplicate.rows[0]){
        throw new InvoicingError(
          'INVALID_INPUT',
          'This payment reference has already been posted as '+String(duplicate.rows[0].payment_number)+'.',
          {existingPaymentId:String(duplicate.rows[0].id)},
        );
      }
    }

    const paymentNumber=await nextDocumentNumber(
      client,input.companyId,input.userId,'payment',
    );

    const payment=await client.query(
      `INSERT INTO invoicing_payments(
         company_id,payment_number,customer_id,payment_date,amount,currency,
         exchange_rate,method,reference,idempotency_key,accounting_model,status,
         notes,metadata,created_by,updated_by
       )
       VALUES(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         'customer_credit','posted',$11,$12::jsonb,$13,$13
       )
       RETURNING id`,
      [
        input.companyId,
        paymentNumber,
        invoice.customer_id,
        paymentDate,
        paymentAmount,
        String(invoice.currency),
        Number(invoice.exchange_rate||1),
        paymentMethod,
        paymentReference||null,
        idempotencyKey,
        nullableText(input.notes,3000),
        JSON.stringify({
          source:
            input.source ||
            'manual',
          sourceProvider:
            input.sourceProvider ||
            null,
          externalEventId:
            input.externalEventId ||
            null,
          providerTransactionId:
            input.providerTransactionId ||
            null,
        }),
        input.userId,
      ],
    );

    const paymentId=String(payment.rows[0].id);
    const allocation=await client.query(
      `INSERT INTO invoicing_payment_allocations(
         company_id,payment_id,invoice_id,amount,payment_amount,invoice_amount,
         payment_exchange_rate,invoice_exchange_rate,base_payment_amount,
         base_invoice_amount,realized_fx_amount,status,operation_key,created_by
       )
       VALUES(
         $1,$2,$3,$4,$4,$4,$5,$5,
         ROUND(($4::numeric * $5::numeric),4),
         ROUND(($4::numeric * $5::numeric),4),
         0,'posted','initial:'||gen_random_uuid()::text,$6
       )
       RETURNING id,operation_key`,
      [
        input.companyId,
        paymentId,
        input.invoiceId,
        allocationAmount,
        Number(invoice.exchange_rate||1),
        input.userId,
      ],
    );

    const allocationId=String(allocation.rows[0].id);
    const operationKey=String(allocation.rows[0].operation_key);
    const remaining=money(balance-allocationAmount);
    const nextStatus=remaining<=0.0001?'paid':'partially_paid';

    await client.query(
      `UPDATE invoicing_invoices
       SET status=$3::varchar(30),
           paid_at=CASE WHEN $3::varchar(30)='paid' THEN NOW() ELSE NULL END,
           updated_by=$4,updated_at=NOW()
       WHERE id=$1 AND company_id=$2`,
      [input.invoiceId,input.companyId,nextStatus,input.userId],
    );

    await client.query(
      `INSERT INTO invoicing_status_history(
         invoice_id,company_id,from_status,to_status,reason,changed_by
       ) VALUES($1,$2,$3,$4,$5,$6)`,
      [
        input.invoiceId,
        input.companyId,
        String(invoice.status),
        nextStatus,
        'Payment '+paymentNumber+' recorded',
        input.userId,
      ],
    );

    await postInvoicePaymentToAccounting(client,{
      companyId:input.companyId,
      userId:input.userId,
      invoiceId:input.invoiceId,
      paymentId,
      paymentNumber,
      paymentDate,
      amount:paymentAmount,
      exchangeRate:Number(invoice.exchange_rate||1),
    });

    await postInvoicePaymentAllocationToAccounting(client,{
      companyId:input.companyId,
      userId:input.userId,
      allocationId,
      operationKey,
      paymentId,
      paymentNumber,
      invoiceId:input.invoiceId,
      invoiceNumber:String(invoice.invoice_number),
      allocationDate:paymentDate,
      paymentAmount:allocationAmount,
      invoiceAmount:allocationAmount,
      paymentExchangeRate:Number(invoice.exchange_rate||1),
      invoiceExchangeRate:Number(invoice.exchange_rate||1),
    });

    const autoReconciled =
      input.source === 'gateway' &&
      unappliedAmount <= 0.0001;

    if(autoReconciled){
      await client.query(
        `UPDATE invoicing_payments
         SET reconciled_at=NOW(),
             reconciled_by=$3,
             reconciliation_reference=COALESCE(NULLIF($4,''),reference),
             reconciliation_notes=$5,
             metadata=COALESCE(metadata,'{}'::jsonb) ||
               jsonb_build_object(
                 'autoReconciled',TRUE,
                 'autoReconciledAt',NOW(),
                 'autoReconciledProvider',$6::text
               ),
             updated_by=$3,
             updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND status='posted'`,
        [
          paymentId,
          input.companyId,
          input.userId,
          paymentReference,
          'Automatically reconciled after provider-verified payment detection.',
          input.sourceProvider||paymentMethod,
        ],
      );
    }

    await recordInvoicingActivity(client,{
      companyId:input.companyId,
      userId:input.userId,
      invoiceId:input.invoiceId,
      type:'invoice.payment_recorded',
      content:'Payment '+paymentNumber+' recorded against invoice '+String(invoice.invoice_number)+'.',
      metadata:{
        paymentId,
        paymentNumber,
        amount:paymentAmount,
        allocatedAmount:allocationAmount,
        unappliedAmount,
        remainingBalance:remaining,
        source:input.source||'manual',
        sourceProvider:input.sourceProvider||null,
        externalEventId:input.externalEventId||null,
        autoReconciled,
      },
    });

    await client.query('COMMIT');

    return {
      paymentId,
      paymentNumber,
      invoiceId:input.invoiceId,
      status:nextStatus,
      remainingBalance:remaining,
      allocatedAmount:allocationAmount,
      unappliedAmount,
      reconciled:autoReconciled,
      reused:false,
    };
  }catch(error){
    try{await client.query('ROLLBACK');}catch{}
    throw error;
  }finally{
    client.release();
  }
}
