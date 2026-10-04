import "server-only";

import type { PoolClient } from "pg";

import {
  requireEnterpriseModuleTableContext,
} from "@/lib/apps/enterprise/service";
import {
  recordWorkspaceAuditEvent,
} from "@/lib/services/workspace-activity";
import {
  postBalancedLedgerJournal,
  reversePostedLedgerJournal,
} from "./ledger-engine";
import {
  calculateAccountingTaxes,
  type AccountingTaxRule,
} from "./tax-engine";
import {
  AccountingInputError,
  accountingDate,
  accountingId,
  decimalAmount,
  minorUnits,
} from "./validation";
import type {
  AccountingPayablesWorkspace,
  PayablesAgingRow,
  PayablesControlReconciliation,
} from "./payables-types";

const BUCKETS = ["current","1-30","31-60","61-90","90+"] as const;

function bodyOf(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountingInputError("Enter valid payables data.");
  }
  return input as Record<string, unknown>;
}

function text(value: unknown, max: number, label: string, required = false) {
  if (value != null && typeof value !== "string") {
    throw new AccountingInputError(label + " must contain text.");
  }
  const result = typeof value === "string" ? value.trim() : "";
  if ((required && !result) || result.length > max) {
    throw new AccountingInputError(label + (required ? " is required" : "") + " and must not exceed " + max + " characters.");
  }
  return result;
}

function currency(value: unknown, fallback: string) {
  const result = text(value || fallback, 3, "Currency", true).toUpperCase();
  if (!/^[A-Z]{3}$/.test(result)) {
    throw new AccountingInputError("Currency must use a three-letter ISO code.");
  }
  return result;
}

function positiveMoney(value: unknown, label: string) {
  const amount = minorUnits(value);
  if (amount <= BigInt(0)) {
    throw new AccountingInputError(label + " must be greater than zero.");
  }
  return amount;
}

function nonNegativeMoney(value: unknown, label: string) {
  try {
    return minorUnits(value);
  } catch {
    throw new AccountingInputError(label + " must be a valid non-negative amount.");
  }
}

function exchangeRate(value: unknown) {
  const raw=String(value ?? "1").trim();
  if (!/^\d{1,9}(?:\.\d{1,8})?$/.test(raw)) {
    throw new AccountingInputError("Enter a valid exchange rate with at most eight decimal places.");
  }
  const [whole,fraction=""]=raw.split(".");
  const units=BigInt(whole)*BigInt(100000000)+BigInt(fraction.padEnd(8,"0"));
  if (units<=BigInt(0)) throw new AccountingInputError("Exchange rate must be greater than zero.");
  return {
    text: whole+"."+fraction.padEnd(8,"0"),
    units,
  };
}

function quantityUnits(value: unknown) {
  const raw=String(value ?? "1").trim();
  if (!/^\d{1,9}(?:\.\d{1,4})?$/.test(raw)) {
    throw new AccountingInputError("Line quantity must be a positive number with at most four decimal places.");
  }
  const [whole,fraction=""]=raw.split(".");
  const units=BigInt(whole)*BigInt(10000)+BigInt(fraction.padEnd(4,"0"));
  if (units<=BigInt(0)) throw new AccountingInputError("Line quantity must be greater than zero.");
  return { text: whole+"."+fraction.padEnd(4,"0"), units };
}

function multiplyMoneyByQuantity(moneyCents: bigint, quantity: bigint) {
  return (moneyCents*quantity+BigInt(5000))/BigInt(10000);
}

function convertToBase(amountCents: bigint, rateUnits: bigint) {
  return (amountCents*rateUnits+BigInt(50000000))/BigInt(100000000);
}

function pageValue(value: unknown) {
  const n = Number(value || 1);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}

function bucketValue(value: unknown): "" | (typeof BUCKETS)[number] {
  return typeof value === "string" && BUCKETS.includes(value as (typeof BUCKETS)[number])
    ? value as (typeof BUCKETS)[number]
    : "";
}

function searchValue(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function maybeId(value: unknown) {
  if (!value) return "";
  try { return accountingId(value); } catch { return ""; }
}

function cents(value: unknown) {
  const raw = String(value ?? "0").trim();
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  if (!/^\d{1,18}(?:\.\d{1,8})?$/.test(unsigned)) {
    throw new AccountingInputError("Payables amount is invalid.");
  }
  const [whole, fraction = ""] = unsigned.split(".");
  const padded = fraction.padEnd(3, "0");
  let amount = BigInt(whole || "0") * BigInt(100) + BigInt(padded.slice(0, 2) || "0");
  if (Number(padded[2] || "0") >= 5) amount += BigInt(1);
  return negative ? -amount : amount;
}

function taxRuleFromRow(row:Record<string,unknown>):AccountingTaxRule {
  return {
    id:String(row.id),code:String(row.code),name:String(row.name),
    scope:String(row.scope) as AccountingTaxRule["scope"],
    behavior:String(row.behavior) as AccountingTaxRule["behavior"],
    computation:String(row.computation) as AccountingTaxRule["computation"],
    rate:String(row.rate),fixedAmount:String(row.fixed_amount),
    priceIncluded:Boolean(row.price_included),includeBaseAmount:Boolean(row.include_base_amount),
    recoverablePercent:String(row.recoverable_percent),sequence:Number(row.sequence||100),
  };
}

function controlReconciliation(
  account: { id?: string | null; code?: string | null; name?: string | null } | null,
  gl: unknown,
  subledger: unknown,
): PayablesControlReconciliation {
  const g = cents(gl);
  const s = cents(subledger);
  const d = g - s;
  return {
    accountId: account?.id || null,
    accountCode: account?.code || null,
    accountName: account?.name || null,
    glBalance: decimalAmount(g),
    subledgerBalance: decimalAmount(s),
    difference: decimalAmount(d),
    reconciled: d === BigInt(0),
  };
}

async function payableAccount(client: PoolClient, companyId: string) {
  const r = await client.query(
    `WITH setup AS (
       SELECT default_payable_account_id
       FROM accounting_settings
       WHERE company_id=$1 AND deleted_at IS NULL
       LIMIT 1
     )
     SELECT a.id::text,a.code,a.name
     FROM accounts a
     LEFT JOIN setup s ON TRUE
     WHERE a.company_id=$1
       AND a.deleted_at IS NULL
       AND a.is_active=TRUE
       AND (
         a.id=s.default_payable_account_id
         OR a.system_role='payable_control'
         OR a.account_type='liability_payable'
       )
     ORDER BY
       CASE WHEN a.id=s.default_payable_account_id THEN 0 ELSE 1 END,
       CASE WHEN a.system_role='payable_control' THEN 0 ELSE 1 END,
       a.code
     LIMIT 1`,
    [companyId],
  );
  return r.rows[0]
    ? { id: String(r.rows[0].id), code: String(r.rows[0].code || ""), name: String(r.rows[0].name || "") }
    : null;
}

export async function getAccountingPayables(input: {
  page?: unknown;
  bucket?: unknown;
  vendorId?: unknown;
  search?: unknown;
  documentId?: unknown;
} = {}): Promise<AccountingPayablesWorkspace> {
  const context = await requireEnterpriseModuleTableContext("accounting", "accounting_vendor_documents", "report");
  const filters = {
    page: pageValue(input.page),
    bucket: bucketValue(input.bucket),
    vendorId: maybeId(input.vendorId),
    search: searchValue(input.search),
  };
  const documentId = maybeId(input.documentId);
  const client = await context.pool.connect();

  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const controlAccount = await payableAccount(client, context.companyId);

    const vendors = await client.query(
      `SELECT
         v.id::text,v.vendor_code,v.name,v.email,v.phone,v.tax_number,v.currency,
         v.payment_terms_days,v.status,
         COALESCE(b.outstanding_bills,0)::text AS outstanding_bills,
         COALESCE(b.available_credits,0)::text AS available_credits,
         COALESCE(b.net_payable,0)::text AS net_payable
       FROM accounting_vendors v
       LEFT JOIN accounting_vendor_balances b
         ON b.company_id=v.company_id AND b.vendor_id=v.id
       WHERE v.company_id=$1 AND v.deleted_at IS NULL
       ORDER BY v.name,v.vendor_code`,
      [context.companyId],
    );

    const documentWhere = [
      "d.company_id=$1",
      "d.deleted_at IS NULL",
    ];
    const documentParams: unknown[] = [context.companyId];

    if (filters.vendorId) {
      documentParams.push(filters.vendorId);
      documentWhere.push("d.vendor_id=$" + documentParams.length);
    }
    if (filters.search) {
      documentParams.push("%" + filters.search + "%");
      documentWhere.push(
        "(d.document_number ILIKE $" + documentParams.length +
        " OR COALESCE(d.vendor_reference,'') ILIKE $" + documentParams.length +
        " OR v.name ILIKE $" + documentParams.length + ")",
      );
    }
    if (filters.bucket) {
      documentParams.push(filters.bucket);
      documentWhere.push(
        "d.document_type='bill' AND EXISTS (" +
        "SELECT 1 FROM accounting_payables_aging age " +
        "WHERE age.company_id=d.company_id AND age.document_id=d.id " +
        "AND age.aging_bucket=$" + documentParams.length + ")",
      );
    }

    const documentCountResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM accounting_vendor_documents d
       JOIN accounting_vendors v
         ON v.company_id=d.company_id AND v.id=d.vendor_id AND v.deleted_at IS NULL
       WHERE ${documentWhere.join(" AND ")}`,
      documentParams,
    );

    const pageSize = 50;
    const offset = (filters.page - 1) * pageSize;
    const limitParam =
      "$" + (documentParams.length + 1);
    const offsetParam =
      "$" + (documentParams.length + 2);
    const pagedParams = [...documentParams, pageSize, offset];

    const documents = await client.query(
      `SELECT
         d.id::text,d.vendor_id::text,v.name AS vendor_name,d.document_type,
         d.document_number,d.vendor_reference,d.document_date::text,d.due_date::text,
         d.currency,d.exchange_rate::text,d.base_currency,d.subtotal::text,d.tax_total::text,
         d.total_amount::text,d.status,d.posted_journal_id::text,d.reversed_journal_id::text,
         COALESCE(b.open_amount,0)::text AS open_amount,
         COALESCE(b.base_open_amount,0)::text AS base_open_amount
       FROM accounting_vendor_documents d
       JOIN accounting_vendors v
         ON v.company_id=d.company_id AND v.id=d.vendor_id AND v.deleted_at IS NULL
       LEFT JOIN accounting_vendor_document_balances b
         ON b.company_id=d.company_id AND b.document_id=d.id
       WHERE ${documentWhere.join(" AND ")}
       ORDER BY d.document_date DESC,d.created_at DESC,d.id DESC
       LIMIT ${limitParam}
       OFFSET ${offsetParam}`,
      pagedParams,
    );

    const metrics = await client.query(
      `SELECT
         COALESCE(SUM(base_open_amount) FILTER (WHERE document_type='bill'),0)::text AS outstanding,
         COALESCE(SUM(base_open_amount) FILTER (WHERE document_type='credit_note'),0)::text AS credits,
         COUNT(*) FILTER (WHERE document_type='bill' AND open_amount > 0)::int AS bill_count
       FROM accounting_vendor_document_balances
       WHERE company_id=$1`,
      [context.companyId],
    );

    const agingRows = await client.query(
      `SELECT aging_bucket AS bucket,
              COALESCE(SUM(base_open_amount),0)::text AS amount,
              COUNT(*)::int AS count
       FROM accounting_payables_aging
       WHERE company_id=$1
       GROUP BY aging_bucket`,
      [context.companyId],
    );
    const agingMap = new Map(agingRows.rows.map(row => [String(row.bucket), row]));
    const aging: PayablesAgingRow[] = BUCKETS.map(bucket => ({
      bucket,
      amount: String(agingMap.get(bucket)?.amount || "0.00"),
      count: Number(agingMap.get(bucket)?.count || 0),
    }));

    const overdue = aging
      .filter(row => row.bucket !== "current")
      .reduce((sum, row) => sum + cents(row.amount), BigInt(0));

    const overdueCount = aging
      .filter(row => row.bucket !== "current")
      .reduce((sum, row) => sum + row.count, 0);

    const accounts = await client.query(
      `SELECT id::text,code,name,account_type,is_control_account
       FROM accounts
       WHERE company_id=$1 AND deleted_at IS NULL AND is_active=TRUE
       ORDER BY code,name`,
      [context.companyId],
    );

    const taxCodes = await client.query(
      `SELECT id::text,code,name,scope,behavior,computation,rate::text,fixed_amount::text,
              price_included,include_base_amount,recoverable_percent::text,
              tax_account_id::text,recoverable_account_id::text,jurisdiction_code,reporting_code
       FROM accounting_tax_codes
       WHERE company_id=$1 AND deleted_at IS NULL AND status='active'
         AND scope IN ('purchase','both')
       ORDER BY jurisdiction_code NULLS LAST,sequence,code`,
      [context.companyId],
    );

    const gl = controlAccount
      ? await client.query(
          `SELECT COALESCE(SUM(l.credit-l.debit),0)::text AS balance
           FROM journal_lines l
           JOIN journals j
             ON j.company_id=l.company_id AND j.id=l.journal_id
            AND j.deleted_at IS NULL AND j.status='posted'
           WHERE l.company_id=$1 AND l.account_id=$2 AND l.deleted_at IS NULL`,
          [context.companyId, controlAccount.id],
        )
      : { rows: [{ balance: "0" }] };

    const opening = controlAccount
      ? await client.query(
          `SELECT COALESCE(SUM(COALESCE(l.credit,0)-COALESCE(l.debit,0)),0)::text AS amount
           FROM accounting_opening_balance_lines l
           JOIN accounting_opening_balance_batches b
             ON b.company_id=l.company_id AND b.id=l.batch_id
            AND b.deleted_at IS NULL AND b.status='posted'
           WHERE l.company_id=$1 AND l.account_id=$2 AND l.deleted_at IS NULL`,
          [context.companyId, controlAccount.id],
        )
      : { rows: [{ amount: "0" }] };

    const outstanding = cents(metrics.rows[0]?.outstanding || "0");
    const credits = cents(metrics.rows[0]?.credits || "0");
    const net = outstanding - credits;
    const subledger = net + cents(opening.rows[0]?.amount || "0");

    const counts = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='draft')::int AS draft,
         COUNT(*) FILTER (WHERE status='approved')::int AS approved,
         COUNT(*) FILTER (WHERE status IN ('posted','partially_settled','settled'))::int AS posted,
         COUNT(*) FILTER (WHERE status='reversed')::int AS reversed
       FROM accounting_vendor_documents
       WHERE company_id=$1 AND deleted_at IS NULL`,
      [context.companyId],
    );

    let selected = null;
    let applicationTargets: AccountingPayablesWorkspace["applicationTargets"] = [];
    if (documentId) {
      const detail = await client.query(
        `SELECT
           d.id::text,d.vendor_id::text,v.name AS vendor_name,d.document_type,d.document_number,
           d.vendor_reference,d.document_date::text,d.due_date::text,d.currency,d.exchange_rate::text,
           d.base_currency,d.subtotal::text,d.tax_total::text,d.total_amount::text,d.status,
           d.posted_journal_id::text,d.reversed_journal_id::text,d.approved_at::text,d.posted_at::text,
           d.reversed_at::text,d.created_at::text,
           COALESCE(b.open_amount,0)::text AS open_amount,
           COALESCE(b.base_open_amount,0)::text AS base_open_amount
         FROM accounting_vendor_documents d
         JOIN accounting_vendors v ON v.company_id=d.company_id AND v.id=d.vendor_id
         LEFT JOIN accounting_vendor_document_balances b ON b.company_id=d.company_id AND b.document_id=d.id
         WHERE d.company_id=$1 AND d.id=$2 AND d.deleted_at IS NULL
         LIMIT 1`,
        [context.companyId, documentId],
      );
      if (detail.rows[0]) {
        const lines = await client.query(
          `SELECT l.id::text,l.account_id::text,a.code AS account_code,a.name AS account_name,
                  l.description,l.quantity::text,l.unit_price::text,l.line_subtotal::text,
                  l.tax_amount::text,l.line_total::text,l.tax_code_id::text,
                  l.recoverable_tax_amount::text,l.nonrecoverable_tax_amount::text,
                  t.code AS tax_code,t.name AS tax_name
           FROM accounting_vendor_document_lines l
           JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id
           LEFT JOIN accounting_tax_codes t ON t.company_id=l.company_id AND t.id=l.tax_code_id
           WHERE l.company_id=$1 AND l.document_id=$2 AND l.deleted_at IS NULL
           ORDER BY l.sequence,l.created_at,l.id`,
          [context.companyId, documentId],
        );
        const applications = await client.query(
          `SELECT a.id::text,a.credit_document_id::text,credit.document_number AS credit_document_number,
                  a.bill_document_id::text,bill.document_number AS bill_document_number,
                  a.amount::text,a.application_date::text,a.status
           FROM accounting_vendor_credit_applications a
           JOIN accounting_vendor_documents credit ON credit.company_id=a.company_id AND credit.id=a.credit_document_id
           JOIN accounting_vendor_documents bill ON bill.company_id=a.company_id AND bill.id=a.bill_document_id
           WHERE a.company_id=$1
             AND (a.credit_document_id=$2 OR a.bill_document_id=$2)
             AND a.deleted_at IS NULL
           ORDER BY a.application_date DESC,a.created_at DESC`,
          [context.companyId, documentId],
        );
        selected = { ...detail.rows[0], lines: lines.rows, applications: applications.rows };

        if (String(detail.rows[0].document_type) === "credit_note") {
          const targets = await client.query(
            `SELECT b.document_id::text AS id,b.document_number,b.vendor_reference,b.due_date::text,
                    b.currency,b.exchange_rate::text,b.open_amount::text
             FROM accounting_vendor_document_balances b
             WHERE b.company_id=$1 AND b.vendor_id=$2 AND b.document_type='bill'
               AND b.open_amount > 0 AND b.status IN ('posted','partially_settled')
             ORDER BY b.due_date,b.document_date,b.document_number`,
            [context.companyId, String(detail.rows[0].vendor_id)],
          );
          applicationTargets = targets.rows;
        }
      }
    }

    await client.query("COMMIT");

    return {
      companyId: context.companyId,
      currency: context.company.currentCompany.currency,
      filters,
      documentCount: Number(documentCountResult.rows[0]?.count || 0),
      vendors: vendors.rows,
      documents: documents.rows,
      selected,
      accounts: accounts.rows,
      taxCodes: taxCodes.rows,
      applicationTargets,
      aging,
      control: controlReconciliation(controlAccount, gl.rows[0]?.balance || "0", decimalAmount(subledger)),
      metrics: {
        outstandingBills: decimalAmount(outstanding),
        availableCredits: decimalAmount(credits),
        netPayable: decimalAmount(net),
        overdue: decimalAmount(overdue),
        billCount: Number(metrics.rows[0]?.bill_count || 0),
        overdueBillCount: overdueCount,
        vendorCount: vendors.rows.filter(row => cents(row.net_payable) !== BigInt(0)).length,
      },
      counts: {
        draft: Number(counts.rows[0]?.draft || 0),
        approved: Number(counts.rows[0]?.approved || 0),
        posted: Number(counts.rows[0]?.posted || 0),
        reversed: Number(counts.rows[0]?.reversed || 0),
      },
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function createPayablesVendor(input: unknown) {
  const context = await requireEnterpriseModuleTableContext("accounting", "accounting_vendors", "create");
  const body = bodyOf(input);
  if (accountingId(body.expectedCompanyId) !== context.companyId) {
    throw new AccountingInputError("Your active company changed. Reload Accounting before saving.");
  }
  const code = text(body.vendorCode, 50, "Vendor code", true).toUpperCase();
  const name = text(body.name, 255, "Vendor name", true);
  const result = await context.pool.query(
    `INSERT INTO accounting_vendors (
       company_id,vendor_code,name,email,phone,tax_number,currency,payment_terms_days,status,created_by,updated_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$9)
     RETURNING id::text`,
    [
      context.companyId, code, name,
      text(body.email,255,"Email") || null,
      text(body.phone,50,"Phone") || null,
      text(body.taxNumber,100,"Tax number") || null,
      currency(body.currency, context.company.currentCompany.currency),
      Math.max(0, Math.min(3650, Number(body.paymentTermsDays ?? 30) || 30)),
      context.userId,
    ],
  );
  return { id: String(result.rows[0].id) };
}

export async function createPayablesDocument(input: unknown) {
  const context = await requireEnterpriseModuleTableContext("accounting", "accounting_vendor_documents", "create");
  const body = bodyOf(input);
  if (accountingId(body.expectedCompanyId) !== context.companyId) {
    throw new AccountingInputError("Your active company changed. Reload Accounting before saving.");
  }
  const vendorId = accountingId(body.vendorId);
  const documentType = body.documentType === "credit_note" ? "credit_note" : body.documentType === "bill" ? "bill" : null;
  if (!documentType) throw new AccountingInputError("Choose bill or vendor credit note.");
  const documentNumber = text(body.documentNumber,100,"Document number",true);
  const vendorReference = text(body.vendorReference,160,"Vendor reference") || null;
  const documentDate = accountingDate(body.documentDate);
  const dueDate = documentType === "bill" ? accountingDate(body.dueDate) : (body.dueDate ? accountingDate(body.dueDate) : null);
  const docCurrency = currency(body.currency, context.company.currentCompany.currency);
  const rate = exchangeRate(body.exchangeRate);
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 200) {
    throw new AccountingInputError("A vendor document needs between 1 and 200 lines.");
  }

  const drafts = body.lines.map((raw,index)=>{
    const row=bodyOf(raw);
    const quantity=quantityUnits(row.quantity??"1");
    const unit=nonNegativeMoney(row.unitPrice,"Unit price");
    const grossBase=multiplyMoneyByQuantity(unit,quantity.units);
    return {
      accountId:accountingId(row.accountId),
      taxCodeId:row.taxCodeId?accountingId(row.taxCodeId):null,
      description:text(row.description,500,"Line description",true),
      quantity:quantity.text,
      unitPrice:decimalAmount(unit),
      sourceAmount:decimalAmount(grossBase),
      manualTax:decimalAmount(nonNegativeMoney(row.taxAmount??"0","Tax amount")),
      sequence:(index+1)*10,
    };
  });

  const client = await context.pool.connect();
  try {
    await client.query("BEGIN");
    const validVendor = await client.query(
      `SELECT id FROM accounting_vendors WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND status='active' FOR SHARE`,
      [context.companyId,vendorId],
    );
    if (!validVendor.rows[0]) throw new AccountingInputError("Choose an active vendor.");
    const accountIds=[...new Set(drafts.map(line=>line.accountId))];
    const validAccounts = await client.query(
      `SELECT id::text FROM accounts WHERE company_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL AND is_active=TRUE`,
      [context.companyId,accountIds],
    );
    if (validAccounts.rows.length !== accountIds.length) {
      throw new AccountingInputError("Every vendor document line must use an active company account.");
    }

    const taxIds=[...new Set(drafts.map(line=>line.taxCodeId).filter((id):id is string=>Boolean(id)))];
    const taxResult=taxIds.length
      ? await client.query(
          `SELECT * FROM accounting_tax_codes
           WHERE company_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL AND status='active'
             AND scope IN ('purchase','both')
             AND (effective_from IS NULL OR effective_from<=$3)
             AND (effective_to IS NULL OR effective_to>=$3)
           FOR SHARE`,
          [context.companyId,taxIds,documentDate],
        )
      : {rows:[]};
    if(taxResult.rows.length!==taxIds.length)throw new AccountingInputError("Every selected purchase tax must be active and effective on the document date.");
    const taxById=new Map(taxResult.rows.map(row=>[String(row.id),row]));

    const lines=drafts.map(row=>{
      if(!row.taxCodeId){
        const tax=cents(row.manualTax);
        const subtotal=cents(row.sourceAmount),total=subtotal+tax;
        if(total<=BigInt(0))throw new AccountingInputError("Each vendor document line must have a positive total.");
        return {...row,subtotal:decimalAmount(subtotal),tax:decimalAmount(tax),recoverableTax:"0.00",nonrecoverableTax:decimalAmount(tax),total:decimalAmount(total)};
      }
      const taxRow=taxById.get(row.taxCodeId);
      if(!taxRow)throw new AccountingInputError("Selected purchase tax was not found.");
      const calculated=calculateAccountingTaxes(row.sourceAmount,[taxRuleFromRow(taxRow)]);
      if(calculated.components.length!==1)throw new AccountingInputError("A vendor document line currently supports one Accounting tax code.");
      const component=calculated.components[0];
      return {
        ...row,
        subtotal:calculated.untaxedAmount,
        tax:component.taxAmount,
        recoverableTax:component.recoverableAmount,
        nonrecoverableTax:component.nonrecoverableAmount,
        total:calculated.totalAmount,
      };
    });

    const subtotal=lines.reduce((n,line)=>n+cents(line.subtotal),BigInt(0));
    const taxTotal=lines.reduce((n,line)=>n+cents(line.tax),BigInt(0));
    const total=lines.reduce((n,line)=>n+cents(line.total),BigInt(0));
    const baseTotal=convertToBase(total,rate.units);

    const created = await client.query(
      `INSERT INTO accounting_vendor_documents (
         company_id,vendor_id,document_type,document_number,vendor_reference,document_date,due_date,
         currency,exchange_rate,base_currency,subtotal,tax_total,total_amount,base_total_amount,status,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15,$15)
       RETURNING id::text`,
      [
        context.companyId,vendorId,documentType,documentNumber,vendorReference,documentDate,dueDate,
        docCurrency,rate.text,context.company.currentCompany.currency,decimalAmount(subtotal),decimalAmount(taxTotal),
        decimalAmount(total),decimalAmount(baseTotal),context.userId,
      ],
    );
    const id = String(created.rows[0].id);
    for (const line of lines) {
      await client.query(
        `INSERT INTO accounting_vendor_document_lines (
           company_id,document_id,account_id,description,quantity,unit_price,line_subtotal,tax_amount,line_total,sequence,
           tax_code_id,recoverable_tax_amount,nonrecoverable_tax_amount,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
        [context.companyId,id,line.accountId,line.description,line.quantity,line.unitPrice,line.subtotal,line.tax,line.total,line.sequence,
         line.taxCodeId,line.recoverableTax,line.nonrecoverableTax,context.userId],
      );
    }
    await client.query("COMMIT");
    return { id, status: "draft" };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function approvePayablesDocument(input: unknown) {
  const context = await requireEnterpriseModuleTableContext("accounting", "accounting_vendor_documents", "edit");
  const body = bodyOf(input);
  const documentId = accountingId(body.documentId);
  const result = await context.pool.query(
    `UPDATE accounting_vendor_documents
     SET status='approved',approved_by=$3,approved_at=NOW(),updated_by=$3,updated_at=NOW()
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND status='draft'
     RETURNING id::text`,
    [context.companyId,documentId,context.userId],
  );
  if (!result.rows[0]) throw new AccountingInputError("Only a draft vendor document can be approved.");
  return { id: documentId, status: "approved" };
}

export async function postPayablesDocument(input: unknown) {
  const context = await requireEnterpriseModuleTableContext("accounting", "accounting_vendor_documents", "edit");
  const body = bodyOf(input);
  const documentId = accountingId(body.documentId);
  const client = await context.pool.connect();
  try {
    await client.query("BEGIN");
    const d = await client.query(
      `SELECT id::text,vendor_id::text,document_type,document_number,vendor_reference,document_date::text,
              currency,exchange_rate::text,base_currency,base_total_amount::text,status,posted_journal_id::text,
              purchase_order_id::text,purchase_match_status
       FROM accounting_vendor_documents
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [context.companyId,documentId],
    );
    const doc = d.rows[0];
    if (!doc) throw new AccountingInputError("Vendor document not found.");
    if (doc.status === "posted" && doc.posted_journal_id) {
      await client.query("COMMIT");
      return { journalId: String(doc.posted_journal_id), replayed: true };
    }
    if (doc.status !== "approved") throw new AccountingInputError("Approve this vendor document before posting.");
    if (
      doc.document_type === "bill" &&
      doc.purchase_order_id &&
      !["matched","overridden"].includes(String(doc.purchase_match_status || ""))
    ) {
      throw new AccountingInputError(
        "This purchase-order bill must pass the purchasing match, or have an approved exception override, before posting.",
      );
    }

    const ap = await payableAccount(client, context.companyId);
    if (!ap) throw new AccountingInputError("Map an Accounts Payable control account in Accounting Setup before posting.");

    const l = await client.query(
      `SELECT l.id::text,l.account_id::text,l.description,l.line_subtotal::text,l.tax_amount::text,l.line_total::text,
              l.tax_code_id::text,l.recoverable_tax_amount::text,l.nonrecoverable_tax_amount::text,
              t.recoverable_account_id::text,t.code AS tax_code
       FROM accounting_vendor_document_lines l
       LEFT JOIN accounting_tax_codes t ON t.company_id=l.company_id AND t.id=l.tax_code_id
       WHERE l.company_id=$1 AND l.document_id=$2 AND l.deleted_at IS NULL
       ORDER BY l.sequence,l.created_at,l.id FOR SHARE`,
      [context.companyId,documentId],
    );
    if (!l.rows.length) throw new AccountingInputError("Vendor document has no lines.");

    const rate=exchangeRate(doc.exchange_rate || "1");
    const baseTotal=cents(doc.base_total_amount);
    const postingParts:Array<{accountId:string;description:string;raw:bigint}>=[];
    for(const line of l.rows){
      const expenseRaw=cents(line.line_subtotal)+cents(line.nonrecoverable_tax_amount||"0");
      if(expenseRaw>BigInt(0))postingParts.push({accountId:String(line.account_id),description:String(line.description||doc.document_number),raw:expenseRaw});
      const recoverableRaw=cents(line.recoverable_tax_amount||"0");
      if(recoverableRaw>BigInt(0)){
        if(!line.recoverable_account_id)throw new AccountingInputError("A recoverable purchase tax is missing its Input Tax control account mapping.");
        postingParts.push({accountId:String(line.recoverable_account_id),description:String(line.tax_code||"Recoverable input tax")+" · "+String(doc.document_number),raw:recoverableRaw});
      }
    }
    if(!postingParts.length)throw new AccountingInputError("Vendor document has no accounting value to post.");

    let allocated=BigInt(0);
    const expenseLines=postingParts.map((part,index)=>{
      const converted=index===postingParts.length-1?baseTotal-allocated:convertToBase(part.raw,rate.units);
      allocated+=converted;
      return {
        accountId:part.accountId,description:part.description,
        debit:doc.document_type==="bill"?decimalAmount(converted):"0.00",
        credit:doc.document_type==="credit_note"?decimalAmount(converted):"0.00",
      };
    });
    const controlLine={
      accountId:ap.id,description:String(doc.document_number),
      debit:doc.document_type==="credit_note"?decimalAmount(baseTotal):"0.00",
      credit:doc.document_type==="bill"?decimalAmount(baseTotal):"0.00",
    };
    const posting=await postBalancedLedgerJournal(client,{
      companyId:context.companyId,userId:context.userId,journalDate:String(doc.document_date),
      description:(doc.document_type==="bill"?"Vendor bill · ":"Vendor credit · ")+String(doc.document_number),
      reference:doc.vendor_reference||doc.document_number,sourceModule:"accounting",
      sourceType:"vendor_"+String(doc.document_type),sourceId:documentId,
      sourceEventKey:"accounting:vendor-document:"+documentId,postingKind:"system",
      lines:[...expenseLines,controlLine],
    });

    for(const line of l.rows){
      if(!line.tax_code_id||cents(line.tax_amount)<=BigInt(0))continue;
      const taxableBase=convertToBase(cents(line.line_subtotal),rate.units);
      const taxBase=convertToBase(cents(line.tax_amount),rate.units);
      const recoverableBase=convertToBase(cents(line.recoverable_tax_amount||"0"),rate.units);
      const nonrecoverableBase=taxBase-recoverableBase;
      await client.query(
        `INSERT INTO accounting_tax_ledger_entries(
          company_id,tax_code_id,journal_id,source_module,source_type,source_id,source_event_key,transaction_date,
          taxable_amount,tax_amount,recoverable_amount,nonrecoverable_amount,currency,direction,entry_effect,metadata,created_by
        ) VALUES($1,$2,$3,'accounting',$4,$5,$6,$7,$8,$9,$10,$11,$12,'purchase',$13,$14::jsonb,$15)
        ON CONFLICT(company_id,source_module,source_event_key,tax_code_id) WHERE deleted_at IS NULL DO NOTHING`,
        [context.companyId,String(line.tax_code_id),posting.journalId,"vendor_"+String(doc.document_type),documentId,
         "accounting:vendor-tax:"+documentId+":"+String(line.id),String(doc.document_date),
         decimalAmount(taxableBase),decimalAmount(taxBase),decimalAmount(recoverableBase),decimalAmount(nonrecoverableBase),
         String(doc.base_currency),doc.document_type==="credit_note"?-1:1,
         JSON.stringify({sourceCurrency:doc.currency,exchangeRate:doc.exchange_rate,lineId:line.id,documentNumber:doc.document_number}),context.userId],
      );
    }

    await client.query(
      `UPDATE accounting_vendor_documents
       SET status='posted',posted_journal_id=$3,posted_at=NOW(),updated_by=$4,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,documentId,posting.journalId,context.userId],
    );
    await client.query("COMMIT");
    await recordWorkspaceAuditEvent({
      tenantId: context.tenantId, companyId: context.companyId, userId: context.userId,
      action: "accounting.payables.document_posted", module: "accounting",
      resourceType: "accounting_vendor_documents", resourceId: documentId,
      summary: "Vendor document posted to Accounts Payable", result: "success",
      metadata: { journalId: posting.journalId, documentType: doc.document_type },
    }).catch(()=>{});
    return { journalId: posting.journalId, replayed: posting.reused };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function applyPayablesCredit(input: unknown) {
  const context = await requireEnterpriseModuleTableContext("accounting", "accounting_vendor_credit_applications", "edit");
  const body = bodyOf(input);
  const creditId = accountingId(body.creditDocumentId);
  const billId = accountingId(body.billDocumentId);
  const amount = positiveMoney(body.amount,"Credit application");
  const applicationDate = accountingDate(body.applicationDate);
  const client = await context.pool.connect();
  try {
    await client.query("BEGIN");
    const docs = await client.query(
      `SELECT id::text,vendor_id::text,document_type,currency,exchange_rate::text
       FROM accounting_vendor_documents
       WHERE company_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL
         AND status IN ('posted','partially_settled','settled')
       ORDER BY id FOR UPDATE`,
      [context.companyId,[creditId,billId]],
    );
    const credit = docs.rows.find(r=>String(r.id)===creditId);
    const bill = docs.rows.find(r=>String(r.id)===billId);
    if (!credit || credit.document_type!=="credit_note" || !bill || bill.document_type!=="bill") {
      throw new AccountingInputError("Choose a posted vendor credit and bill.");
    }
    if (String(credit.vendor_id)!==String(bill.vendor_id)) throw new AccountingInputError("Vendor credit and bill must belong to the same vendor.");
    if (String(credit.currency)!==String(bill.currency)) throw new AccountingInputError("Apply vendor credits only to bills in the same currency.");
    if (String(credit.exchange_rate)!==String(bill.exchange_rate)) {
      throw new AccountingInputError("Vendor credits with a different exchange rate require the foreign-currency settlement workflow.");
    }
    const balances = await client.query(
      `SELECT document_id::text,open_amount::text
       FROM accounting_vendor_document_balances
       WHERE company_id=$1 AND document_id=ANY($2::uuid[])`,
      [context.companyId,[creditId,billId]],
    );
    const creditOpen = cents(balances.rows.find(r=>String(r.document_id)===creditId)?.open_amount||"0");
    const billOpen = cents(balances.rows.find(r=>String(r.document_id)===billId)?.open_amount||"0");
    if (amount > creditOpen || amount > billOpen) throw new AccountingInputError("Credit application exceeds the available credit or open bill balance.");
    const created = await client.query(
      `INSERT INTO accounting_vendor_credit_applications (
         company_id,credit_document_id,bill_document_id,amount,application_date,status,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,$5,'posted',$6,$6)
       RETURNING id::text`,
      [context.companyId,creditId,billId,decimalAmount(amount),applicationDate,context.userId],
    );
    await client.query(
      `UPDATE accounting_vendor_documents d
       SET status=CASE
         WHEN COALESCE(b.open_amount,0)<=0 THEN 'settled'
         WHEN COALESCE(b.open_amount,0)<d.total_amount THEN 'partially_settled'
         ELSE 'posted' END,
         updated_by=$3,updated_at=NOW()
       FROM accounting_vendor_document_balances b
       WHERE d.company_id=$1 AND d.id=ANY($2::uuid[])
         AND b.company_id=d.company_id AND b.document_id=d.id`,
      [context.companyId,[creditId,billId],context.userId],
    );
    await client.query("COMMIT");
    return { id: String(created.rows[0].id) };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function reversePayablesDocument(input: unknown) {
  const context = await requireEnterpriseModuleTableContext("accounting", "accounting_vendor_documents", "edit");
  const body = bodyOf(input);
  const documentId = accountingId(body.documentId);
  const reversalDate = accountingDate(body.reversalDate);
  const client = await context.pool.connect();
  try {
    await client.query("BEGIN");
    const d = await client.query(
      `SELECT document_number,status,posted_journal_id::text,reversed_journal_id::text
       FROM accounting_vendor_documents
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [context.companyId,documentId],
    );
    const doc = d.rows[0];
    if (!doc || !doc.posted_journal_id) throw new AccountingInputError("Only a posted vendor document can be reversed.");
    if (doc.reversed_journal_id) {
      await client.query("COMMIT");
      return { journalId: String(doc.reversed_journal_id), replayed: true };
    }
    const apps = await client.query(
      `SELECT 1 FROM accounting_vendor_credit_applications
       WHERE company_id=$1 AND (credit_document_id=$2 OR bill_document_id=$2)
         AND status='posted' AND deleted_at IS NULL LIMIT 1`,
      [context.companyId,documentId],
    );
    if (apps.rows[0]) throw new AccountingInputError("Reverse vendor credit applications before reversing this document.");
    const payments = await client.query(
      `SELECT 1 FROM accounting_payment_allocations a
       JOIN accounting_payment_batches b ON b.company_id=a.company_id AND b.id=a.batch_id
       WHERE a.company_id=$1 AND a.bill_document_id=$2 AND b.status='posted'
         AND a.deleted_at IS NULL AND b.deleted_at IS NULL LIMIT 1`,
      [context.companyId,documentId],
    );
    if (payments.rows[0]) throw new AccountingInputError("Reverse the vendor payment before reversing this bill.");
    const reversal = await reversePostedLedgerJournal(client,{
      companyId: context.companyId,userId: context.userId,
      originalJournalId: String(doc.posted_journal_id),journalDate: reversalDate,
      description: "Reversal · vendor document " + String(doc.document_number),
      sourceModule: "accounting",sourceType: "vendor_document_reversal",
      sourceId: documentId,sourceEventKey: "accounting:vendor-document-reversal:" + documentId,
    });
    await client.query(
      `INSERT INTO accounting_tax_ledger_entries(
         company_id,tax_code_id,journal_id,source_module,source_type,source_id,source_event_key,
         transaction_date,taxable_amount,tax_amount,recoverable_amount,nonrecoverable_amount,
         currency,direction,entry_effect,metadata,created_by
       )
       SELECT company_id,tax_code_id,$3,'accounting','vendor_document_reversal',source_id,
              'accounting:vendor-tax-reversal:'||$2||':'||id::text,$4,
              taxable_amount,tax_amount,recoverable_amount,nonrecoverable_amount,
              currency,direction,(entry_effect * -1),
              jsonb_build_object('reversalOfTaxEntryId',id::text),$5
       FROM accounting_tax_ledger_entries
       WHERE company_id=$1 AND source_module='accounting' AND source_id=$2
         AND source_type IN ('vendor_bill','vendor_credit_note') AND deleted_at IS NULL
       ON CONFLICT(company_id,source_module,source_event_key,tax_code_id) WHERE deleted_at IS NULL DO NOTHING`,
      [context.companyId,documentId,reversal.journalId,reversalDate,context.userId],
    );
    await client.query(
      `UPDATE accounting_vendor_documents
       SET status='reversed',reversed_journal_id=$3,reversed_at=NOW(),updated_by=$4,updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,documentId,reversal.journalId,context.userId],
    );
    await client.query("COMMIT");
    return reversal;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}


export async function cancelPayablesDocument(input: unknown) {
  const context = await requireEnterpriseModuleTableContext("accounting", "accounting_vendor_documents", "edit");
  const body = bodyOf(input);
  const documentId = accountingId(body.documentId);
  const result = await context.pool.query(
    `UPDATE accounting_vendor_documents
     SET status='cancelled',cancelled_by=$3,cancelled_at=NOW(),updated_by=$3,updated_at=NOW()
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND status IN ('draft','approved')
     RETURNING id::text`,
    [context.companyId,documentId,context.userId],
  );
  if (!result.rows[0]) {
    throw new AccountingInputError("Only a draft or approved vendor document can be cancelled.");
  }
  return { id: documentId, status: "cancelled" };
}
