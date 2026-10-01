import "server-only";

import {
  requireEnterpriseModuleTableContext,
} from "@/lib/apps/enterprise/service";
import {
  recordWorkspaceAuditEvent,
} from "@/lib/services/workspace-activity";
import {
  AccountingInputError,
  accountingDate,
  accountingId,
  decimalAmount,
  minorUnits,
} from "./validation";
import type {
  AccountingPurchasingWorkspace,
} from "./purchasing-types";


function bodyOf(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountingInputError("Enter valid purchasing data.");
  }
  return input as Record<string, unknown>;
}

function text(value: unknown, max: number, label: string, required = false) {
  if (value != null && typeof value !== "string") {
    throw new AccountingInputError(label + " must contain text.");
  }
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw new AccountingInputError(label + " is required.");
  if (result.length > max) throw new AccountingInputError(label + " must not exceed " + max + " characters.");
  return result;
}

function isoCurrency(value: unknown, fallback: string) {
  const result = text(value || fallback, 3, "Currency", true).toUpperCase();
  if (!/^[A-Z]{3}$/.test(result)) throw new AccountingInputError("Currency must use a three-letter ISO code.");
  return result;
}

function positiveQuantity(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,9}(?:\.\d{1,4})?$/.test(raw) || Number(raw) <= 0) {
    throw new AccountingInputError("Quantity must be greater than zero with at most four decimal places.");
  }
  return raw;
}

function nonNegativeMoney(value: unknown, label: string) {
  try {
    return minorUnits(value);
  } catch {
    throw new AccountingInputError(label + " must be a valid non-negative amount.");
  }
}

function percentage(value: unknown, label: string) {
  const raw = String(value ?? "0").trim();
  if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(raw)) throw new AccountingInputError(label + " must be a percentage from 0 to 100.");
  const n = Number(raw);
  if (n < 0 || n > 100) throw new AccountingInputError(label + " must be a percentage from 0 to 100.");
  return raw;
}

function rate(value: unknown) {
  const raw=String(value ?? "1").trim();
  if (!/^\d{1,9}(?:\.\d{1,8})?$/.test(raw) || Number(raw) <= 0) {
    throw new AccountingInputError("Exchange rate must be greater than zero with at most eight decimal places.");
  }
  return raw;
}

function pageValue(value: unknown) {
  const n=Number(value || 1);
  return Number.isInteger(n) && n>0 ? Math.min(n,100000) : 1;
}

async function nextNumber(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  companyId: string,
  table: string,
  column: string,
  prefix: string,
) {
  const r=await client.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(${column}, '^.*-', ''), '')::int),0)::int + 1 AS n
     FROM ${table}
     WHERE company_id=$1 AND ${column} LIKE $2 AND deleted_at IS NULL`,
    [companyId,prefix+"%"],
  );
  return prefix+String(Number(r.rows[0]?.n || 1)).padStart(6,"0");
}

export async function getAccountingPurchasing(input: { page?: unknown } = {}): Promise<AccountingPurchasingWorkspace> {
  const context=await requireEnterpriseModuleTableContext("accounting","accounting_purchase_orders","report");
  const page=pageValue(input.page);
  const client=await context.pool.connect();

  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const [policies,requisitions,orders,exceptions,counts]=await Promise.all([
      client.query(
        `SELECT id::text,name,min_amount::text,max_amount::text,approver_role,approver_user_id::text,
                require_receipt,require_three_way_match,quantity_tolerance_percent::text,
                price_tolerance_percent::text,amount_tolerance::text,active
         FROM accounting_purchase_policies
         WHERE company_id=$1 AND deleted_at IS NULL
         ORDER BY active DESC,min_amount,name`,
        [context.companyId],
      ),
      client.query(
        `SELECT id::text,requisition_number,requested_by::text,requested_on::text,needed_by::text,
                department,cost_center,purpose,currency,estimated_total::text,status
         FROM accounting_purchase_requisitions
         WHERE company_id=$1 AND deleted_at IS NULL
         ORDER BY created_at DESC,id DESC
         LIMIT 50 OFFSET $2`,
        [context.companyId,(page-1)*50],
      ),
      client.query(
        `SELECT po.id::text,po.purchase_order_number,po.requisition_id::text,po.vendor_id::text,
                v.name AS vendor_name,po.order_date::text,po.expected_date::text,po.currency,
                po.total_amount::text,po.base_total_amount::text,po.status,po.approval_policy_id::text,
                COALESCE(rt.ordered_quantity,0)::text AS ordered_quantity,
                COALESCE(rt.accepted_quantity,0)::text AS accepted_quantity
         FROM accounting_purchase_orders po
         JOIN accounting_vendors v
           ON v.company_id=po.company_id AND v.id=po.vendor_id AND v.deleted_at IS NULL
         LEFT JOIN accounting_purchase_order_receipt_totals rt
           ON rt.company_id=po.company_id AND rt.purchase_order_id=po.id
         WHERE po.company_id=$1 AND po.deleted_at IS NULL
         ORDER BY po.order_date DESC,po.created_at DESC,po.id DESC
         LIMIT 50 OFFSET $2`,
        [context.companyId,(page-1)*50],
      ),
      client.query(
        `SELECT id::text,vendor_document_id::text,purchase_order_id::text,match_type,
                ordered_amount::text,received_amount::text,invoiced_amount::text,
                amount_variance::text,quantity_variance_percent::text,price_variance_percent::text,
                result,override_reason
         FROM accounting_purchase_matches
         WHERE company_id=$1 AND deleted_at IS NULL AND result='exception'
         ORDER BY checked_at DESC NULLS LAST,created_at DESC
         LIMIT 50`,
        [context.companyId],
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*) FROM accounting_purchase_requisitions WHERE company_id=$1 AND deleted_at IS NULL AND status='draft')::int AS draft_requisitions,
           (SELECT COUNT(*) FROM accounting_purchase_requisitions WHERE company_id=$1 AND deleted_at IS NULL AND status='submitted')::int AS submitted_requisitions,
           (SELECT COUNT(*) FROM accounting_purchase_orders WHERE company_id=$1 AND deleted_at IS NULL AND status='submitted')::int AS orders_awaiting_approval,
           (SELECT COUNT(*) FROM accounting_purchase_orders WHERE company_id=$1 AND deleted_at IS NULL AND status IN ('approved','partially_received'))::int AS orders_awaiting_receipt,
           (SELECT COUNT(*) FROM accounting_purchase_matches WHERE company_id=$1 AND deleted_at IS NULL AND result='exception')::int AS match_exceptions`,
        [context.companyId],
      ),
    ]);

    await client.query("COMMIT");

    return {
      companyId: context.companyId,
      currency: context.company.currentCompany.currency,
      policies: policies.rows as AccountingPurchasingWorkspace["policies"],
      requisitions: requisitions.rows as AccountingPurchasingWorkspace["requisitions"],
      orders: orders.rows as AccountingPurchasingWorkspace["orders"],
      exceptions: exceptions.rows as AccountingPurchasingWorkspace["exceptions"],
      counts: {
        draftRequisitions: Number(counts.rows[0]?.draft_requisitions || 0),
        submittedRequisitions: Number(counts.rows[0]?.submitted_requisitions || 0),
        ordersAwaitingApproval: Number(counts.rows[0]?.orders_awaiting_approval || 0),
        ordersAwaitingReceipt: Number(counts.rows[0]?.orders_awaiting_receipt || 0),
        matchExceptions: Number(counts.rows[0]?.match_exceptions || 0),
      },
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function createPurchasePolicy(input: unknown) {
  const context=await requireEnterpriseModuleTableContext("accounting","accounting_purchase_policies","edit");
  const body=bodyOf(input);
  const name=text(body.name,160,"Policy name",true);
  const min=nonNegativeMoney(body.minAmount || "0","Minimum amount");
  const max=body.maxAmount ? nonNegativeMoney(body.maxAmount,"Maximum amount") : null;
  if (max !== null && max < min) throw new AccountingInputError("Maximum amount cannot be below the minimum amount.");
  const approverRole=text(body.approverRole,80,"Approver role");
  const approverUserId=body.approverUserId ? accountingId(body.approverUserId) : null;
  if (!approverRole && !approverUserId) throw new AccountingInputError("Choose an approver role or a specific approver.");
  const quantityTolerance=percentage(body.quantityTolerancePercent,"Quantity tolerance");
  const priceTolerance=percentage(body.priceTolerancePercent,"Price tolerance");
  const amountTolerance=nonNegativeMoney(body.amountTolerance || "0","Amount tolerance");

  const r=await context.pool.query(
    `INSERT INTO accounting_purchase_policies (
       company_id,name,min_amount,max_amount,approver_role,approver_user_id,
       require_receipt,require_three_way_match,quantity_tolerance_percent,
       price_tolerance_percent,amount_tolerance,active,created_by,updated_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,$12)
     RETURNING id::text`,
    [
      context.companyId,name,decimalAmount(min),max===null?null:decimalAmount(max),
      approverRole||null,approverUserId,body.requireReceipt!==false,body.requireThreeWayMatch!==false,
      quantityTolerance,priceTolerance,decimalAmount(amountTolerance),context.userId,
    ],
  );
  return { id:String(r.rows[0].id) };
}

export async function createPurchaseRequisition(input: unknown) {
  const context=await requireEnterpriseModuleTableContext("accounting","accounting_purchase_requisitions","edit");
  const body=bodyOf(input);
  const purpose=text(body.purpose,2000,"Purpose",true);
  const requestedOn=accountingDate(body.requestedOn);
  const neededBy=body.neededBy ? accountingDate(body.neededBy) : null;
  if (neededBy && neededBy < requestedOn) throw new AccountingInputError("Needed-by date cannot be before the request date.");
  const currency=isoCurrency(body.currency,context.company.currentCompany.currency);
  const lines=Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length || lines.length>200) throw new AccountingInputError("Add between 1 and 200 requisition lines.");

  const normalized=lines.map((raw,index)=>{
    const line=bodyOf(raw);
    const quantity=positiveQuantity(line.quantity);
    const unit=nonNegativeMoney(line.estimatedUnitPrice || "0","Estimated unit price");
    const qtyUnits=BigInt(quantity.replace(".","").padEnd(quantity.includes(".")?quantity.split(".")[0].length+4:quantity.length+4,"0"));
    const total=(unit*qtyUnits+BigInt(5000))/BigInt(10000);
    return {
      description:text(line.description,2000,"Line "+(index+1)+" description",true),
      quantity,
      unit:decimalAmount(unit),
      total:decimalAmount(total),
      preferredVendorId:line.preferredVendorId ? accountingId(line.preferredVendorId) : null,
      expenseAccountId:line.expenseAccountId ? accountingId(line.expenseAccountId) : null,
      sequence:(index+1)*10,
    };
  });
  const estimated=normalized.reduce((sum,line)=>sum+minorUnits(line.total),BigInt(0));
  const client=await context.pool.connect();

  try {
    await client.query("BEGIN");
    const number=await nextNumber(client,context.companyId,"accounting_purchase_requisitions","requisition_number","PR-");
    const r=await client.query(
      `INSERT INTO accounting_purchase_requisitions (
         company_id,requisition_number,requested_by,requested_on,needed_by,department,cost_center,
         purpose,currency,estimated_total,status,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$3,$3)
       RETURNING id::text`,
      [
        context.companyId,number,context.userId,requestedOn,neededBy,
        text(body.department,160,"Department")||null,text(body.costCenter,160,"Cost center")||null,
        purpose,currency,decimalAmount(estimated),
      ],
    );
    const id=String(r.rows[0].id);
    for (const line of normalized) {
      await client.query(
        `INSERT INTO accounting_purchase_requisition_lines (
           company_id,requisition_id,description,quantity,estimated_unit_price,estimated_total,
           preferred_vendor_id,expense_account_id,sequence,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
        [context.companyId,id,line.description,line.quantity,line.unit,line.total,line.preferredVendorId,line.expenseAccountId,line.sequence,context.userId],
      );
    }
    await client.query("COMMIT");
    return { id, requisitionNumber:number, status:"draft" };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function transitionPurchaseRequisition(input: unknown) {
  const context=await requireEnterpriseModuleTableContext("accounting","accounting_purchase_requisitions","edit");
  const body=bodyOf(input);
  const id=accountingId(body.requisitionId);
  const action=text(body.action,20,"Action",true);
  const map: Record<string,{from:string;to:string;extra:string}> = {
    submit:{from:"draft",to:"submitted",extra:"submitted_at=NOW()"},
    approve:{from:"submitted",to:"approved",extra:"approved_by=$4,approved_at=NOW()"},
    reject:{from:"submitted",to:"rejected",extra:"rejected_by=$4,rejected_at=NOW(),rejection_reason=$5"},
    cancel:{from:"draft",to:"cancelled",extra:"updated_at=NOW()"},
  };
  const t=map[action];
  if (!t) throw new AccountingInputError("Choose submit, approve, reject or cancel.");
  const reason=action==="reject" ? text(body.reason,2000,"Rejection reason",true) : null;
  const r=await context.pool.query(
    `UPDATE accounting_purchase_requisitions
     SET status=$3,${t.extra},updated_by=$4,updated_at=NOW()
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND status=$6
     RETURNING id::text`,
    [context.companyId,id,t.to,context.userId,reason,t.from],
  );
  if (!r.rows[0]) throw new AccountingInputError("This requisition is no longer in the required workflow state.");
  return { id,status:t.to };
}

export async function createPurchaseOrder(input: unknown) {
  const context=await requireEnterpriseModuleTableContext("accounting","accounting_purchase_orders","edit");
  const body=bodyOf(input);
  const vendorId=accountingId(body.vendorId);
  const orderDate=accountingDate(body.orderDate);
  const expectedDate=body.expectedDate ? accountingDate(body.expectedDate) : null;
  const currency=isoCurrency(body.currency,context.company.currentCompany.currency);
  const exchange=rate(body.exchangeRate);
  const requisitionId=body.requisitionId ? accountingId(body.requisitionId) : null;
  const lines=Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length || lines.length>200) throw new AccountingInputError("Add between 1 and 200 purchase-order lines.");

  const normalized=lines.map((raw,index)=>{
    const line=bodyOf(raw);
    const quantity=positiveQuantity(line.quantity);
    const unit=nonNegativeMoney(line.unitPrice || "0","Unit price");
    const tax=nonNegativeMoney(line.taxAmount || "0","Tax amount");
    const [whole,frac=""]=quantity.split(".");
    const qtyUnits=BigInt(whole)*BigInt(10000)+BigInt(frac.padEnd(4,"0"));
    const subtotal=(unit*qtyUnits+BigInt(5000))/BigInt(10000);
    return {
      requisitionLineId:line.requisitionLineId ? accountingId(line.requisitionLineId) : null,
      description:text(line.description,2000,"Line "+(index+1)+" description",true),
      quantity,unit:decimalAmount(unit),subtotal:decimalAmount(subtotal),tax:decimalAmount(tax),
      total:decimalAmount(subtotal+tax),
      expenseAccountId:line.expenseAccountId ? accountingId(line.expenseAccountId) : null,
      sequence:(index+1)*10,
    };
  });
  const subtotal=normalized.reduce((s,l)=>s+minorUnits(l.subtotal),BigInt(0));
  const tax=normalized.reduce((s,l)=>s+minorUnits(l.tax),BigInt(0));
  const total=subtotal+tax;
  const rateUnits=BigInt(exchange.replace(".","").padEnd(exchange.includes(".")?exchange.split(".")[0].length+8:exchange.length+8,"0"));
  const base=(total*rateUnits+BigInt(50000000))/BigInt(100000000);
  const client=await context.pool.connect();

  try {
    await client.query("BEGIN");
    const vendor=await client.query(
      `SELECT id::text,status FROM accounting_vendors
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1 FOR SHARE`,
      [context.companyId,vendorId],
    );
    if (!vendor.rows[0] || vendor.rows[0].status!=="active") throw new AccountingInputError("Choose an active vendor.");

    if (requisitionId) {
      const req=await client.query(
        `SELECT status FROM accounting_purchase_requisitions
         WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
        [context.companyId,requisitionId],
      );
      if (!req.rows[0] || req.rows[0].status!=="approved") throw new AccountingInputError("Only an approved requisition can be converted to a purchase order.");
    }

    const policy=await client.query(
      `SELECT id::text FROM accounting_purchase_policies
       WHERE company_id=$1 AND deleted_at IS NULL AND active=TRUE
         AND min_amount <= $2
         AND (max_amount IS NULL OR max_amount >= $2)
       ORDER BY min_amount DESC LIMIT 1`,
      [context.companyId,decimalAmount(base)],
    );
    if (!policy.rows[0]) throw new AccountingInputError("Create an active purchasing approval policy covering this order amount.");

    const number=await nextNumber(client,context.companyId,"accounting_purchase_orders","purchase_order_number","PO-");
    const r=await client.query(
      `INSERT INTO accounting_purchase_orders (
         company_id,purchase_order_number,requisition_id,vendor_id,order_date,expected_date,currency,
         exchange_rate,subtotal,tax_total,total_amount,base_total_amount,status,approval_policy_id,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',$13,$14,$14)
       RETURNING id::text`,
      [context.companyId,number,requisitionId,vendorId,orderDate,expectedDate,currency,exchange,
       decimalAmount(subtotal),decimalAmount(tax),decimalAmount(total),decimalAmount(base),String(policy.rows[0].id),context.userId],
    );
    const id=String(r.rows[0].id);
    for (const line of normalized) {
      await client.query(
        `INSERT INTO accounting_purchase_order_lines (
           company_id,purchase_order_id,requisition_line_id,description,quantity,unit_price,line_subtotal,
           tax_amount,line_total,expense_account_id,sequence,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [context.companyId,id,line.requisitionLineId,line.description,line.quantity,line.unit,line.subtotal,line.tax,line.total,line.expenseAccountId,line.sequence,context.userId],
      );
    }
    if (requisitionId) {
      await client.query(
        `UPDATE accounting_purchase_requisitions SET status='converted',updated_by=$3,updated_at=NOW()
         WHERE company_id=$1 AND id=$2`,
        [context.companyId,requisitionId,context.userId],
      );
    }
    await client.query("COMMIT");
    return { id,purchaseOrderNumber:number,status:"draft" };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function transitionPurchaseOrder(input: unknown) {
  const context=await requireEnterpriseModuleTableContext("accounting","accounting_purchase_orders","edit");
  const body=bodyOf(input);
  const id=accountingId(body.purchaseOrderId);
  const action=text(body.action,20,"Action",true);
  const client=await context.pool.connect();

  try {
    await client.query("BEGIN");
    const r=await client.query(
      `SELECT po.status,po.base_total_amount::text,p.approver_user_id::text,p.approver_role
       FROM accounting_purchase_orders po
       JOIN accounting_purchase_policies p
         ON p.company_id=po.company_id AND p.id=po.approval_policy_id AND p.deleted_at IS NULL
       WHERE po.company_id=$1 AND po.id=$2 AND po.deleted_at IS NULL
       LIMIT 1 FOR UPDATE OF po`,
      [context.companyId,id],
    );
    const po=r.rows[0];
    if (!po) throw new AccountingInputError("Purchase order not found.");

    if (action==="submit") {
      if (po.status!=="draft") throw new AccountingInputError("Only a draft purchase order can be submitted.");
      await client.query(
        `UPDATE accounting_purchase_orders SET status='submitted',submitted_at=NOW(),updated_by=$3,updated_at=NOW()
         WHERE company_id=$1 AND id=$2`,
        [context.companyId,id,context.userId],
      );
    } else if (action==="approve") {
      if (po.status!=="submitted") throw new AccountingInputError("Only a submitted purchase order can be approved.");
      if (po.approver_user_id && String(po.approver_user_id)!==context.userId) {
        throw new AccountingInputError("This purchase order requires its assigned approver.");
      }
      await client.query(
        `UPDATE accounting_purchase_orders SET status='approved',approved_by=$3,approved_at=NOW(),updated_by=$3,updated_at=NOW()
         WHERE company_id=$1 AND id=$2`,
        [context.companyId,id,context.userId],
      );
    } else if (action==="cancel") {
      if (!["draft","submitted","approved"].includes(String(po.status))) throw new AccountingInputError("This purchase order can no longer be cancelled.");
      const receipts=await client.query(
        `SELECT 1 FROM accounting_goods_receipts
         WHERE company_id=$1 AND purchase_order_id=$2 AND deleted_at IS NULL AND status='confirmed' LIMIT 1`,
        [context.companyId,id],
      );
      if (receipts.rows[0]) throw new AccountingInputError("Reverse or resolve confirmed receipts before cancelling this purchase order.");
      await client.query(
        `UPDATE accounting_purchase_orders SET status='cancelled',cancelled_by=$3,cancelled_at=NOW(),
                cancellation_reason=$4,updated_by=$3,updated_at=NOW()
         WHERE company_id=$1 AND id=$2`,
        [context.companyId,id,context.userId,text(body.reason,2000,"Cancellation reason",true)],
      );
    } else {
      throw new AccountingInputError("Choose submit, approve or cancel.");
    }

    await client.query("COMMIT");
    return { id,status:action==="submit"?"submitted":action==="approve"?"approved":"cancelled" };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function createGoodsReceipt(input: unknown) {
  const context=await requireEnterpriseModuleTableContext("accounting","accounting_goods_receipts","edit");
  const body=bodyOf(input);
  const purchaseOrderId=accountingId(body.purchaseOrderId);
  const receivedOn=accountingDate(body.receivedOn);
  const lines=Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length || lines.length>200) throw new AccountingInputError("Add receipt quantities for at least one purchase-order line.");
  const normalized=lines.map((raw,index)=>{
    const line=bodyOf(raw);
    const qty=positiveQuantity(line.quantityReceived);
    const accepted=String(line.acceptedQuantity ?? qty).trim();
    const rejected=String(line.rejectedQuantity ?? "0").trim();
    if (!/^\d{1,9}(?:\.\d{1,4})?$/.test(accepted) || !/^\d{1,9}(?:\.\d{1,4})?$/.test(rejected)) {
      throw new AccountingInputError("Receipt quantities must use at most four decimal places.");
    }
    if (Math.abs(Number(accepted)+Number(rejected)-Number(qty))>0.00005) {
      throw new AccountingInputError("Accepted plus rejected quantity must equal received quantity on line "+(index+1)+".");
    }
    return {
      purchaseOrderLineId:accountingId(line.purchaseOrderLineId),
      quantityReceived:qty,acceptedQuantity:accepted,rejectedQuantity:rejected,
      rejectionReason:text(line.rejectionReason,2000,"Rejection reason")||null,sequence:(index+1)*10,
    };
  });
  const client=await context.pool.connect();

  try {
    await client.query("BEGIN");
    const po=await client.query(
      `SELECT status FROM accounting_purchase_orders
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [context.companyId,purchaseOrderId],
    );
    if (!po.rows[0] || !["approved","partially_received"].includes(String(po.rows[0].status))) {
      throw new AccountingInputError("Goods can only be received against an approved open purchase order.");
    }

    for (const line of normalized) {
      const cap=await client.query(
        `SELECT pol.quantity::text,
                COALESCE(SUM(grl.accepted_quantity) FILTER (WHERE gr.status='confirmed'),0)::text AS received
         FROM accounting_purchase_order_lines pol
         LEFT JOIN accounting_goods_receipt_lines grl
           ON grl.company_id=pol.company_id AND grl.purchase_order_line_id=pol.id AND grl.deleted_at IS NULL
         LEFT JOIN accounting_goods_receipts gr
           ON gr.company_id=grl.company_id AND gr.id=grl.receipt_id AND gr.deleted_at IS NULL
         WHERE pol.company_id=$1 AND pol.purchase_order_id=$2 AND pol.id=$3 AND pol.deleted_at IS NULL
         GROUP BY pol.id,pol.quantity`,
        [context.companyId,purchaseOrderId,line.purchaseOrderLineId],
      );
      if (!cap.rows[0]) throw new AccountingInputError("A receipt line does not belong to this purchase order.");
      if (Number(cap.rows[0].received)+Number(line.acceptedQuantity)>Number(cap.rows[0].quantity)+0.00005) {
        throw new AccountingInputError("Accepted receipt quantity exceeds the remaining purchase-order quantity.");
      }
    }

    const number=await nextNumber(client,context.companyId,"accounting_goods_receipts","receipt_number","GRN-");
    const r=await client.query(
      `INSERT INTO accounting_goods_receipts (
         company_id,receipt_number,purchase_order_id,received_on,received_by,delivery_reference,notes,
         status,confirmed_at,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmed',NOW(),$5,$5)
       RETURNING id::text`,
      [context.companyId,number,purchaseOrderId,receivedOn,context.userId,
       text(body.deliveryReference,160,"Delivery reference")||null,text(body.notes,4000,"Notes")||null],
    );
    const id=String(r.rows[0].id);
    for (const line of normalized) {
      await client.query(
        `INSERT INTO accounting_goods_receipt_lines (
           company_id,receipt_id,purchase_order_line_id,quantity_received,accepted_quantity,rejected_quantity,
           rejection_reason,sequence,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
        [context.companyId,id,line.purchaseOrderLineId,line.quantityReceived,line.acceptedQuantity,line.rejectedQuantity,line.rejectionReason,line.sequence,context.userId],
      );
    }
    const totals=await client.query(
      `SELECT ordered_quantity::text,accepted_quantity::text
       FROM accounting_purchase_order_receipt_totals
       WHERE company_id=$1 AND purchase_order_id=$2`,
      [context.companyId,purchaseOrderId],
    );
    const complete=Number(totals.rows[0]?.accepted_quantity||0)>=Number(totals.rows[0]?.ordered_quantity||0)-0.00005;
    await client.query(
      `UPDATE accounting_purchase_orders
       SET status=$3,updated_by=$4,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,purchaseOrderId,complete?"received":"partially_received",context.userId],
    );
    await client.query("COMMIT");
    return { id,receiptNumber:number,purchaseOrderStatus:complete?"received":"partially_received" };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function matchVendorBillToPurchaseOrder(input: unknown) {
  const context=await requireEnterpriseModuleTableContext("accounting","accounting_purchase_matches","edit");
  const body=bodyOf(input);
  const documentId=accountingId(body.documentId);
  const purchaseOrderId=accountingId(body.purchaseOrderId);
  const client=await context.pool.connect();

  try {
    await client.query("BEGIN");
    const bill=await client.query(
      `SELECT id::text,vendor_id::text,document_type,status,base_total_amount::text
       FROM accounting_vendor_documents
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [context.companyId,documentId],
    );
    const po=await client.query(
      `SELECT po.id::text,po.vendor_id::text,po.base_total_amount::text,po.status,
              p.require_receipt,p.require_three_way_match,p.quantity_tolerance_percent::text,
              p.price_tolerance_percent::text,p.amount_tolerance::text
       FROM accounting_purchase_orders po
       JOIN accounting_purchase_policies p
         ON p.company_id=po.company_id AND p.id=po.approval_policy_id AND p.deleted_at IS NULL
       WHERE po.company_id=$1 AND po.id=$2 AND po.deleted_at IS NULL LIMIT 1 FOR UPDATE OF po`,
      [context.companyId,purchaseOrderId],
    );
    if (!bill.rows[0] || bill.rows[0].document_type!=="bill" || !["draft","approved"].includes(String(bill.rows[0].status))) {
      throw new AccountingInputError("Only a draft or approved vendor bill can be matched.");
    }
    if (!po.rows[0] || !["approved","partially_received","received","closed"].includes(String(po.rows[0].status))) {
      throw new AccountingInputError("Choose an approved purchase order.");
    }
    if (String(bill.rows[0].vendor_id)!==String(po.rows[0].vendor_id)) throw new AccountingInputError("Vendor bill and purchase order must belong to the same vendor.");

    const receipt=await client.query(
      `SELECT
         COALESCE(SUM(pol.line_total * LEAST(COALESCE(r.accepted,0),pol.quantity) / pol.quantity),0)::numeric(19,2)::text AS received_amount,
         COALESCE(SUM(pol.quantity),0)::numeric(19,4)::text AS ordered_quantity,
         COALESCE(SUM(COALESCE(r.accepted,0)),0)::numeric(19,4)::text AS received_quantity
       FROM accounting_purchase_order_lines pol
       LEFT JOIN LATERAL (
         SELECT SUM(grl.accepted_quantity)::numeric(19,4) AS accepted
         FROM accounting_goods_receipt_lines grl
         JOIN accounting_goods_receipts gr
           ON gr.company_id=grl.company_id AND gr.id=grl.receipt_id
          AND gr.deleted_at IS NULL AND gr.status='confirmed'
         WHERE grl.company_id=pol.company_id AND grl.purchase_order_line_id=pol.id AND grl.deleted_at IS NULL
       ) r ON TRUE
       WHERE pol.company_id=$1 AND pol.purchase_order_id=$2 AND pol.deleted_at IS NULL`,
      [context.companyId,purchaseOrderId],
    );

    const ordered=minorUnits(po.rows[0].base_total_amount);
    const invoiced=minorUnits(bill.rows[0].base_total_amount);
    const received=minorUnits(receipt.rows[0]?.received_amount||"0");
    const amountVariance=invoiced-ordered;
    const absAmount=amountVariance<0n?-amountVariance:amountVariance;
    const quantityVariance=Math.max(0,Number(receipt.rows[0]?.ordered_quantity||0)-Number(receipt.rows[0]?.received_quantity||0));
    const quantityVariancePct=Number(receipt.rows[0]?.ordered_quantity||0)>0
      ? quantityVariance/Number(receipt.rows[0].ordered_quantity)*100
      : 0;
    const priceVariancePct=ordered>0n ? Math.abs(Number(invoiced-ordered)/Number(ordered))*100 : 0;
    const receiptRequired=Boolean(po.rows[0].require_receipt || po.rows[0].require_three_way_match);
    const matched=
      (!receiptRequired || Number(receipt.rows[0]?.received_quantity||0)>0) &&
      quantityVariancePct<=Number(po.rows[0].quantity_tolerance_percent||0)+0.000001 &&
      priceVariancePct<=Number(po.rows[0].price_tolerance_percent||0)+0.000001 &&
      absAmount<=minorUnits(po.rows[0].amount_tolerance||"0");
    const result=matched?"matched":"exception";

    const existing=await client.query(
      `SELECT id::text FROM accounting_purchase_matches
       WHERE company_id=$1 AND vendor_document_id=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [context.companyId,documentId],
    );
    let id:string;
    if (existing.rows[0]) {
      id=String(existing.rows[0].id);
      await client.query(
        `UPDATE accounting_purchase_matches
         SET purchase_order_id=$3,match_type=$4,ordered_amount=$5,received_amount=$6,invoiced_amount=$7,
             amount_variance=$8,quantity_variance_percent=$9,price_variance_percent=$10,result=$11,
             checked_at=NOW(),updated_by=$12,updated_at=NOW()
         WHERE company_id=$1 AND id=$2`,
        [context.companyId,id,purchaseOrderId,po.rows[0].require_three_way_match?"three_way":"two_way",
         decimalAmount(ordered),decimalAmount(received),decimalAmount(invoiced),decimalAmount(amountVariance),
         quantityVariancePct.toFixed(4),priceVariancePct.toFixed(4),result,context.userId],
      );
    } else {
      const inserted=await client.query(
        `INSERT INTO accounting_purchase_matches (
           company_id,vendor_document_id,purchase_order_id,match_type,ordered_amount,received_amount,invoiced_amount,
           amount_variance,quantity_variance_percent,price_variance_percent,result,checked_at,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12,$12)
         RETURNING id::text`,
        [context.companyId,documentId,purchaseOrderId,po.rows[0].require_three_way_match?"three_way":"two_way",
         decimalAmount(ordered),decimalAmount(received),decimalAmount(invoiced),decimalAmount(amountVariance),
         quantityVariancePct.toFixed(4),priceVariancePct.toFixed(4),result,context.userId],
      );
      id=String(inserted.rows[0].id);
    }

    await client.query(
      `UPDATE accounting_vendor_documents
       SET purchase_order_id=$3,purchase_match_status=$4,updated_by=$5,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,documentId,purchaseOrderId,result,context.userId],
    );
    await client.query("COMMIT");

    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,companyId:context.companyId,userId:context.userId,
      action:"accounting.purchasing.bill_matched",module:"accounting",
      resourceType:"accounting_purchase_matches",resourceId:id,
      summary:result==="matched"?"Vendor bill passed purchasing match":"Vendor bill has purchasing match exceptions",
      result:"success",metadata:{documentId,purchaseOrderId,matchResult:result},
    }).catch(()=>{});

    return { id,result,amountVariance:decimalAmount(amountVariance),quantityVariancePercent:quantityVariancePct.toFixed(4),priceVariancePercent:priceVariancePct.toFixed(4) };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function overridePurchaseMatch(input: unknown) {
  const context=await requireEnterpriseModuleTableContext("accounting","accounting_purchase_matches","edit");
  const body=bodyOf(input);
  const matchId=accountingId(body.matchId);
  const reason=text(body.reason,2000,"Override reason",true);
  const client=await context.pool.connect();
  try {
    await client.query("BEGIN");
    const r=await client.query(
      `UPDATE accounting_purchase_matches
       SET result='overridden',override_reason=$3,overridden_by=$4,overridden_at=NOW(),updated_by=$4,updated_at=NOW()
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND result='exception'
       RETURNING vendor_document_id::text`,
      [context.companyId,matchId,reason,context.userId],
    );
    if (!r.rows[0]) throw new AccountingInputError("Only a current match exception can be overridden.");
    await client.query(
      `UPDATE accounting_vendor_documents
       SET purchase_match_status='overridden',updated_by=$3,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,String(r.rows[0].vendor_document_id),context.userId],
    );
    await client.query("COMMIT");
    return { id:matchId,result:"overridden" };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}
