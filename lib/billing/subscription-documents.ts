import 'server-only';

import {
  renderInvoicePdf,
  type PdfInvoice,
} from '@/lib/apps/invoicing/pdf';

import {
  getControlPool,
  queryControl,
} from '@/lib/db/control';

type DocumentKind = 'invoice' | 'receipt';

type CustomerSnapshot = {
  name: string;
  email: string | null;
  phone: string | null;
};

export type SubscriptionDocumentInput = {
  tenantId: string;
  subscriptionId: string;
  planKey: string;
  planName: string;
  currency: string;
  pricePerUserMonthly: number;
  billableUsers: number;
  periodStart: Date;
  periodEnd: Date;
  dueAt?: Date | null;
};

export type SubscriptionDocumentSummary = {
  id: string;
  documentType: DocumentKind;
  documentNumber: string;
  status: string;
  currency: string;
  totalAmount: number;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  periodStart: string;
  periodEnd: string;
  paymentTransactionId: string | null;
};

type DocumentRow = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  payment_transaction_id: string | null;
  document_type: DocumentKind;
  document_number: string;
  status: string;
  currency: string;
  subtotal: string | number;
  tax_total: string | number;
  total_amount: string | number;
  billing_period_start: Date | string;
  billing_period_end: Date | string;
  issued_at: Date | string;
  due_at: Date | string | null;
  paid_at: Date | string | null;
  snapshot: Record<string, unknown> | string;
};

function money(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Subscription document amount must be a non-negative finite number.');
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseSnapshot(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Treat malformed historical snapshots as unavailable.
    }
  }

  return {};
}

function summarize(row: DocumentRow): SubscriptionDocumentSummary {
  return {
    id: String(row.id),
    documentType: row.document_type,
    documentNumber: String(row.document_number),
    status: String(row.status),
    currency: String(row.currency),
    totalAmount: Number(row.total_amount),
    issuedAt: iso(row.issued_at) || new Date(0).toISOString(),
    dueAt: iso(row.due_at),
    paidAt: iso(row.paid_at),
    periodStart: iso(row.billing_period_start) || new Date(0).toISOString(),
    periodEnd: iso(row.billing_period_end) || new Date(0).toISOString(),
    paymentTransactionId:
      row.payment_transaction_id
        ? String(row.payment_transaction_id)
        : null,
  };
}

function validatePeriod(input: {
  periodStart: Date;
  periodEnd: Date;
}) {
  if (
    !(input.periodStart instanceof Date) ||
    !(input.periodEnd instanceof Date) ||
    Number.isNaN(input.periodStart.getTime()) ||
    Number.isNaN(input.periodEnd.getTime()) ||
    input.periodEnd.getTime() <= input.periodStart.getTime()
  ) {
    throw new Error('Subscription billing document has an invalid billing period.');
  }
}

async function getCustomerSnapshot(
  tenantId: string,
  runner: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  } = { query: queryControl },
): Promise<CustomerSnapshot> {
  const result = await runner.query(
    `
      SELECT
        t.name AS business_name,
        owner.email,
        owner.phone,
        owner.first_name,
        owner.last_name
      FROM tenants t
      LEFT JOIN LATERAL (
        SELECT
          u.email,
          u.phone,
          u.first_name,
          u.last_name
        FROM tenant_users tu
        INNER JOIN users u
          ON u.id = tu.user_id
        WHERE tu.tenant_id = t.id
          AND tu.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND tu.is_owner = TRUE
          AND LOWER(COALESCE(tu.status, '')) = 'active'
          AND LOWER(COALESCE(tu.member_type, '')) = 'internal'
        ORDER BY tu.created_at ASC, tu.user_id ASC
        LIMIT 1
      ) owner ON TRUE
      WHERE t.id = $1
        AND t.deleted_at IS NULL
      LIMIT 1
    `,
    [tenantId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error('The SaMi workspace was not found while preparing its subscription document.');
  }

  const name =
    typeof row.business_name === 'string' && row.business_name.trim()
      ? row.business_name.trim()
      : 'SaMi Workspace';

  const contactName =
    [row.first_name, row.last_name]
      .filter((value): value is string =>
        typeof value === 'string' && Boolean(value.trim()),
      )
      .join(' ')
      .trim();

  return {
    name: contactName ? `${name} — ${contactName}` : name,
    email:
      typeof row.email === 'string' && row.email.trim()
        ? row.email.trim()
        : null,
    phone:
      typeof row.phone === 'string' && row.phone.trim()
        ? row.phone.trim()
        : null,
  };
}

function makeDocumentSnapshot(input: {
  kind: DocumentKind;
  documentNumber: string;
  documentStatus: string;
  issuedAt: Date;
  dueAt: Date | null;
  paidAt: Date | null;
  input: SubscriptionDocumentInput;
  customer: CustomerSnapshot;
  totalAmount: number;
  paymentReference?: string | null;
  provider?: string | null;
}) {
  const currency = input.input.currency.trim().toUpperCase();
  const unitPrice = money(input.input.pricePerUserMonthly);
  const amount = money(input.totalAmount);

  return {
    kind: input.kind,
    documentNumber: input.documentNumber,
    status: input.documentStatus,
    issuedAt: input.issuedAt.toISOString(),
    dueAt: input.dueAt?.toISOString() || null,
    paidAt: input.paidAt?.toISOString() || null,
    periodStart: input.input.periodStart.toISOString(),
    periodEnd: input.input.periodEnd.toISOString(),
    currency,
    subtotal: amount,
    taxTotal: 0,
    totalAmount: amount,
    paidAmount: input.kind === 'receipt' || input.documentStatus === 'paid'
      ? amount
      : 0,
    balanceDue: input.documentStatus === 'paid' || input.kind === 'receipt'
      ? 0
      : amount,
    tenantId: input.input.tenantId,
    subscriptionId: input.input.subscriptionId,
    planKey: input.input.planKey,
    planName: input.input.planName,
    pricePerUserMonthly: unitPrice,
    billableUsers: input.input.billableUsers,
    paymentReference: input.paymentReference || null,
    paymentProvider: input.provider || null,
    customer: input.customer,
    issuer: {
      name: process.env.SAMI_LEGAL_BUSINESS_NAME?.trim() || 'SaMi Technologies',
      email:
        process.env.EMAIL_REPLY_TO?.trim() ||
        process.env.EMAIL_FROM?.trim() ||
        null,
      phone: process.env.SAMI_BILLING_CONTACT_PHONE?.trim() || null,
      address: process.env.SAMI_LEGAL_BUSINESS_ADDRESS?.trim() || null,
      taxId: process.env.SAMI_LEGAL_TAX_ID?.trim() || null,
      registrationNumber:
        process.env.SAMI_LEGAL_REGISTRATION_NUMBER?.trim() || null,
    },
    notes:
      input.kind === 'receipt'
        ? `Payment received for the SaMi ${input.input.planName} subscription. Retain this receipt for your records.`
        : `SaMi ${input.input.planName} platform subscription for ${input.input.billableUsers} active internal user(s).`,
    terms:
      input.kind === 'receipt'
        ? 'This receipt confirms the payment recorded by SaMi. Provider confirmation and this document are retained in SaMi billing history.'
        : 'Payment is due on the date shown. Plan prices are calculated from the current SaMi server-side price and billable active internal user count. Review Billing for payment options.',
    lines: [{
      description:
        `SaMi ${input.input.planName} platform subscription — ${input.input.billableUsers} active internal user(s)`,
      quantity: input.input.billableUsers,
      unit: 'active user / month',
      unitPrice,
      discountAmount: 0,
      taxName: null,
      taxRate: 0,
      taxAmount: 0,
      lineTotal: amount,
      sku: null,
    }],
  };
}

async function ensureInvoiceWithinTransaction(
  client: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  },
  input: SubscriptionDocumentInput,
  customer: CustomerSnapshot,
  options: {
    issuedAt?: Date;
    totalAmount?: number;
  } = {},
): Promise<DocumentRow> {
  validatePeriod(input);

  if (!Number.isInteger(input.billableUsers) || input.billableUsers < 1) {
    throw new Error('Subscription invoices require at least one billable user.');
  }

  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Subscription invoice currency is invalid.');
  }

  const amount = money(
    options.totalAmount ??
    input.pricePerUserMonthly * input.billableUsers,
  );

  const existing = await client.query(
    `
      SELECT *
      FROM subscription_billing_documents
      WHERE tenant_id = $1
        AND subscription_id = $2
        AND document_type = 'invoice'
        AND billing_period_start = $3
      LIMIT 1
      FOR UPDATE
    `,
    [input.tenantId, input.subscriptionId, input.periodStart],
  );

  if (existing.rows[0]) {
    return existing.rows[0] as DocumentRow;
  }

  const sequence = await client.query(
    `SELECT nextval('sami_subscription_invoice_number_seq') AS serial`,
  );

  const serial = Number(sequence.rows[0]?.serial);
  if (!Number.isSafeInteger(serial) || serial < 1) {
    throw new Error('SaMi could not allocate an invoice number.');
  }

  const issuedAt = options.issuedAt || new Date();
  const documentNumber =
    `SAMI-INV-${issuedAt.getUTCFullYear()}-${String(serial).padStart(6, '0')}`;

  const dueAt = input.dueAt || input.periodStart;
  const snapshot = makeDocumentSnapshot({
    kind: 'invoice',
    documentNumber,
    documentStatus: 'issued',
    issuedAt,
    dueAt,
    paidAt: null,
    input: { ...input, currency },
    customer,
    totalAmount: amount,
  });

  const created = await client.query(
    `
      INSERT INTO subscription_billing_documents (
        tenant_id,
        subscription_id,
        document_type,
        document_number,
        status,
        currency,
        subtotal,
        tax_total,
        total_amount,
        billing_period_start,
        billing_period_end,
        issued_at,
        due_at,
        snapshot,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, 'invoice', $3, 'issued', $4, $5, 0, $5,
        $6, $7, $8, $9, $10::jsonb, NOW(), NOW()
      )
      RETURNING *
    `,
    [
      input.tenantId,
      input.subscriptionId,
      documentNumber,
      currency,
      amount,
      input.periodStart,
      input.periodEnd,
      issuedAt,
      dueAt,
      JSON.stringify(snapshot),
    ],
  );

  return created.rows[0] as DocumentRow;
}

export async function ensureSubscriptionBillingInvoice(
  input: SubscriptionDocumentInput,
) {
  validatePeriod(input);
  const pool = getControlPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
      [`sami:subscription-invoice:${input.subscriptionId}:${input.periodStart.toISOString()}`],
    );

    const customer = await getCustomerSnapshot(input.tenantId, client);
    const invoice = await ensureInvoiceWithinTransaction(
      client,
      input,
      customer,
    );

    await client.query('COMMIT');

    return summarize(invoice);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function issueSubscriptionPaymentReceipt(
  input: SubscriptionDocumentInput & {
    paymentTransactionId: string;
    paymentReference: string;
    provider: string;
    amount: number;
    paidAt?: Date;
  },
) {
  validatePeriod(input);

  if (!input.paymentTransactionId.trim() || !input.paymentReference.trim()) {
    throw new Error('A verified payment transaction and reference are required to issue a receipt.');
  }

  const amount = money(input.amount);
  if (amount <= 0) {
    throw new Error('A payment receipt requires a positive verified payment amount.');
  }

  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Subscription receipt currency is invalid.');
  }

  const pool = getControlPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
      [`sami:subscription-receipt:${input.paymentTransactionId}`],
    );

    const existing = await client.query(
      `
        SELECT *
        FROM subscription_billing_documents
        WHERE document_type = 'receipt'
          AND payment_transaction_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [input.paymentTransactionId],
    );

    if (existing.rows[0]) {
      const receipt = existing.rows[0] as DocumentRow;
      await client.query('COMMIT');
      return {
        invoice: null,
        receipt: summarize(receipt),
      };
    }

    const customer = await getCustomerSnapshot(input.tenantId, client);
    const paidAt = input.paidAt || new Date();

    const invoice = await ensureInvoiceWithinTransaction(
      client,
      { ...input, currency },
      customer,
      {
        issuedAt: paidAt,
        totalAmount: amount,
      },
    );

    const invoiceSnapshot = parseSnapshot(invoice.snapshot);
    const paidInvoiceSnapshot = {
      ...invoiceSnapshot,
      status: 'paid',
      paidAt: paidAt.toISOString(),
      paidAmount: amount,
      balanceDue: 0,
      paymentReference: input.paymentReference,
      paymentProvider: input.provider,
    };

    await client.query(
      `
        UPDATE subscription_billing_documents
        SET
          status = 'paid',
          paid_at = COALESCE(paid_at, $2),
          snapshot = $3::jsonb,
          updated_at = NOW()
        WHERE id = $1
          AND document_type = 'invoice'
      `,
      [invoice.id, paidAt, JSON.stringify(paidInvoiceSnapshot)],
    );

    const sequence = await client.query(
      `SELECT nextval('sami_subscription_receipt_number_seq') AS serial`,
    );

    const serial = Number(sequence.rows[0]?.serial);
    if (!Number.isSafeInteger(serial) || serial < 1) {
      throw new Error('SaMi could not allocate a receipt number.');
    }

    const documentNumber =
      `SAMI-RCP-${paidAt.getUTCFullYear()}-${String(serial).padStart(6, '0')}`;

    const snapshot = makeDocumentSnapshot({
      kind: 'receipt',
      documentNumber,
      documentStatus: 'paid',
      issuedAt: paidAt,
      dueAt: input.dueAt || input.periodStart,
      paidAt,
      input: { ...input, currency },
      customer,
      totalAmount: amount,
      paymentReference: input.paymentReference,
      provider: input.provider,
    });

    const created = await client.query(
      `
        INSERT INTO subscription_billing_documents (
          tenant_id,
          subscription_id,
          payment_transaction_id,
          document_type,
          document_number,
          status,
          currency,
          subtotal,
          tax_total,
          total_amount,
          billing_period_start,
          billing_period_end,
          issued_at,
          due_at,
          paid_at,
          snapshot,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, 'receipt', $4, 'paid', $5, $6, 0, $6,
          $7, $8, $9, $10, $9, $11::jsonb, NOW(), NOW()
        )
        RETURNING *
      `,
      [
        input.tenantId,
        input.subscriptionId,
        input.paymentTransactionId,
        documentNumber,
        currency,
        amount,
        input.periodStart,
        input.periodEnd,
        paidAt,
        input.dueAt || input.periodStart,
        JSON.stringify(snapshot),
      ],
    );

    await client.query('COMMIT');

    return {
      invoice: summarize({
        ...invoice,
        status: 'paid',
        paid_at: paidAt,
        snapshot: paidInvoiceSnapshot,
      } as DocumentRow),
      receipt: summarize(created.rows[0] as DocumentRow),
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function listSubscriptionBillingDocuments(
  tenantId: string,
  subscriptionId: string,
) {
  const result = await queryControl(
    `
      SELECT
        id,
        tenant_id,
        subscription_id,
        payment_transaction_id,
        document_type,
        document_number,
        status,
        currency,
        subtotal,
        tax_total,
        total_amount,
        billing_period_start,
        billing_period_end,
        issued_at,
        due_at,
        paid_at,
        snapshot
      FROM subscription_billing_documents
      WHERE tenant_id = $1
        AND subscription_id = $2
      ORDER BY issued_at DESC, id DESC
      LIMIT 100
    `,
    [tenantId, subscriptionId],
  );

  return (result.rows as DocumentRow[]).map(summarize);
}

export async function getSubscriptionBillingDocument(
  tenantId: string,
  documentId: string,
) {
  const result = await queryControl(
    `
      SELECT *
      FROM subscription_billing_documents
      WHERE tenant_id = $1
        AND id = $2
      LIMIT 1
    `,
    [tenantId, documentId],
  );

  return result.rows[0]
    ? result.rows[0] as DocumentRow
    : null;
}

function snapshotToPdf(
  row: DocumentRow,
): PdfInvoice {
  const snapshot = parseSnapshot(row.snapshot);
  const kind =
    snapshot.kind === 'receipt'
      ? 'receipt'
      : 'invoice';

  const customer =
    snapshot.customer && typeof snapshot.customer === 'object'
      ? snapshot.customer as Record<string, unknown>
      : {};
  const issuer =
    snapshot.issuer && typeof snapshot.issuer === 'object'
      ? snapshot.issuer as Record<string, unknown>
      : {};
  const lines =
    Array.isArray(snapshot.lines)
      ? snapshot.lines as Record<string, unknown>[]
      : [];

  const amount = Number(snapshot.totalAmount ?? row.total_amount);
  const currency = String(snapshot.currency || row.currency || 'KES');
  const pricePerUser = Number(snapshot.pricePerUserMonthly || amount);
  const users = Math.max(1, Number(snapshot.billableUsers || 1));
  const startDate = iso(row.billing_period_start) || new Date(0).toISOString();
  const endDate = iso(row.billing_period_end) || startDate;
  const issuedAt = iso(row.issued_at) || new Date(0).toISOString();
  const dueAt = iso(row.due_at) || startDate;
  const paidAt = iso(row.paid_at);

  const pdfLines =
    lines.length > 0
      ? lines.map(line => ({
          description: String(line.description || 'SaMi subscription'),
          sku: typeof line.sku === 'string' ? line.sku : null,
          unit: String(line.unit || 'month'),
          quantity: Number(line.quantity || users),
          unitPrice: Number(line.unitPrice || pricePerUser),
          discountAmount: Number(line.discountAmount || 0),
          taxName: typeof line.taxName === 'string' ? line.taxName : null,
          taxRate: Number(line.taxRate || 0),
          taxAmount: Number(line.taxAmount || 0),
          lineTotal: Number(line.lineTotal || amount),
        }))
      : [{
          description: `SaMi ${String(snapshot.planName || 'platform')} subscription`,
          sku: null,
          unit: 'active user / month',
          quantity: users,
          unitPrice: pricePerUser,
          discountAmount: 0,
          taxName: null,
          taxRate: 0,
          taxAmount: 0,
          lineTotal: amount,
        }];

  return renderInvoicePdf({
    invoiceNumber: String(row.document_number),
    status: kind === 'receipt' ? 'paid' : String(row.status),
    invoiceDate: issuedAt,
    dueDate: dueAt,
    serviceDate: startDate,
    currency,
    reference: `SaMi subscription ${String(row.subscription_id)}`,
    purchaseOrderNumber: null,
    paymentTermsName: kind === 'receipt' ? 'Payment received' : 'Due on billing date',
    taxCalculation: 'exclusive',
    subtotal: Number(snapshot.subtotal ?? row.subtotal),
    discountTotal: 0,
    taxTotal: Number(snapshot.taxTotal ?? row.tax_total),
    shippingTotal: 0,
    roundingAdjustment: 0,
    totalAmount: amount,
    paidAmount: Number(snapshot.paidAmount ?? (kind === 'receipt' ? amount : 0)),
    creditedAmount: 0,
    balanceDue: Number(snapshot.balanceDue ?? (kind === 'receipt' ? 0 : amount)),
    notes: String(snapshot.notes || ''),
    terms: String(snapshot.terms || ''),
    paymentInstructions:
      kind === 'receipt'
        ? `Payment provider: ${String(snapshot.paymentProvider || 'PesaPal')} | Reference: ${String(snapshot.paymentReference || '')}`
        : 'Open SaMi Settings > Billing to complete payment.',
    template: {
      layout: 'modern',
      primaryColor: '#214E8A',
      secondaryColor: '#0F172A',
      fontFamily: 'Arial',
      designVersion: 1,
      density: 'comfortable',
      headerStyle: 'band',
      documentTitle: kind === 'receipt' ? 'Payment Receipt' : 'Subscription Invoice',
      fromLabel: 'Issued by',
      billToLabel: 'Bill to',
      notesLabel: 'Description',
      termsLabel: 'Terms',
      paymentLabel: kind === 'receipt' ? 'Payment details' : 'How to pay',
      footerAlignment: 'left',
      showStatus: true,
      showPageNumbers: true,
      showSku: false,
      showUnit: true,
      showQuantity: true,
      showUnitPrice: true,
      showLineTax: false,
      showLineDiscount: false,
      showCompanyLogo: false,
      showCompanyAddress: true,
      showCompanyContact: true,
      showTaxId: true,
      showPaymentInstructions: true,
      showTaxBreakdown: false,
      showDiscount: false,
      footerText: 'SaMi Technologies — platform subscription document',
      termsText: String(snapshot.terms || ''),
    },
    customer: {
      name: String(customer.name || 'SaMi Workspace'),
      email: typeof customer.email === 'string' ? customer.email : null,
      phone: typeof customer.phone === 'string' ? customer.phone : null,
      taxId: null,
      billingAddress: null,
      shippingAddress: null,
    },
    company: {
      name: String(issuer.name || 'SaMi Technologies'),
      email: typeof issuer.email === 'string' ? issuer.email : null,
      phone: typeof issuer.phone === 'string' ? issuer.phone : null,
      address: typeof issuer.address === 'string' ? issuer.address : null,
      taxId: typeof issuer.taxId === 'string' ? issuer.taxId : null,
      registrationNumber:
        typeof issuer.registrationNumber === 'string'
          ? issuer.registrationNumber
          : null,
    },
    lines: pdfLines,
  });
}

export async function renderSubscriptionBillingDocumentPdf(
  row: DocumentRow,
) {
  return snapshotToPdf(row);
}
