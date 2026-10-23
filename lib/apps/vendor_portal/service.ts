import 'server-only';

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';

import { EnterpriseModuleError, requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import { sendWorkspaceNotificationEmail } from '@/lib/services/email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TOKEN_LENGTH = 200;

type Row = Record<string, unknown>;
type Operation = 'view' | 'create' | 'edit';
type Check = { moduleKey?: 'vendor_portal' | 'purchase'; table: string; operation: Operation };

export class VendorPortalError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'STATE_CONFLICT' | 'EMAIL_DELIVERY_FAILED', message: string) {
    super(message);
    this.name = 'VendorPortalError';
  }
}
export class VendorPortalPublicError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'STATE_CONFLICT', message: string) {
    super(message);
    this.name = 'VendorPortalPublicError';
  }
}

function objectInput(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VendorPortalError('INVALID_INPUT', 'Enter a valid Vendor Portal request.');
  return value as Row;
}
function requiredText(value: unknown, label: string, max = 255): string {
  if (typeof value !== 'string') throw new VendorPortalError('INVALID_INPUT', label + ' is required.');
  const result = value.trim();
  if (!result) throw new VendorPortalError('INVALID_INPUT', label + ' is required.');
  if (result.length > max) throw new VendorPortalError('INVALID_INPUT', label + ' is too long.');
  return result;
}
function optionalText(value: unknown, label: string, max = 255): string | null {
  if (value == null || value === '') return null;
  return requiredText(value, label, max);
}
function requiredUuid(value: unknown, label: string): string {
  const result = requiredText(value, label, 64);
  if (!UUID_RE.test(result)) throw new VendorPortalError('INVALID_INPUT', label + ' is invalid.');
  return result;
}
function requiredDate(value: unknown, label: string): string {
  const result = requiredText(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(result + 'T00:00:00Z'))) {
    throw new VendorPortalError('INVALID_INPUT', label + ' must be a valid date.');
  }
  return result;
}
function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function assertToken(token: string): void {
  if (typeof token !== 'string' || token.length < 48 || token.length > MAX_TOKEN_LENGTH || !/^[a-f0-9]+$/i.test(token)) {
    throw new VendorPortalPublicError('NOT_FOUND', 'This supplier invitation is not available.');
  }
}
async function getContext(checks: Check[]) {
  const contexts = await Promise.all(checks.map(({ moduleKey = 'vendor_portal', table, operation }) =>
    requireEnterpriseModuleTableContext(moduleKey, table, operation),
  ));
  const first = contexts[0];
  if (!first || contexts.some((item) =>
    item.companyId !== first.companyId || item.tenantId !== first.tenantId || item.userId !== first.userId
  )) {
    throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'Your workspace or company changed. Reload Vendor Portal and try again.');
  }
  return first;
}
async function transaction<T>(
  context: Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
const OVERVIEW_CHECKS: Check[] = [
  { table: 'vendor_portal_accounts', operation: 'view' },
  { table: 'vendor_portal_rfqs', operation: 'view' },
  { table: 'vendor_portal_rfq_responses', operation: 'view' },
  { table: 'suppliers', moduleKey: 'purchase', operation: 'view' },
  { table: 'supplier_rfqs', moduleKey: 'purchase', operation: 'view' },
  { table: 'supplier_rfq_responses', moduleKey: 'purchase', operation: 'view' },
  { table: 'purchase_requisitions', moduleKey: 'purchase', operation: 'view' },
  { table: 'purchase_requisition_lines', moduleKey: 'purchase', operation: 'view' },
];

export async function getVendorPortalOverview() {
  const context = await getContext(OVERVIEW_CHECKS);
  const [summary, accountRows, rfqRows, responseRows, availableSuppliers, purchaseRfqs] = await Promise.all([
    context.pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM public.vendor_portal_accounts a WHERE a.company_id=$1 AND a.deleted_at IS NULL) AS accounts,
         (SELECT COUNT(*)::int FROM public.vendor_portal_rfqs r WHERE r.company_id=$1 AND r.deleted_at IS NULL) AS invitations,
         (SELECT COUNT(*)::int FROM public.vendor_portal_rfqs r WHERE r.company_id=$1 AND r.deleted_at IS NULL AND r.status IN ('sent','opened')) AS awaiting_response,
         (SELECT COUNT(*)::int FROM public.vendor_portal_rfq_responses r WHERE r.company_id=$1 AND r.deleted_at IS NULL AND r.status='submitted') AS responses_pending_review,
         (SELECT COUNT(*)::int FROM public.vendor_portal_rfqs r WHERE r.company_id=$1 AND r.deleted_at IS NULL AND r.status='delivery_failed') AS delivery_failures`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT a.id::text, a.vendor_reference::text, a.vendor_name, a.email, a.status, a.last_login_at::text, a.access_expires_at::text, a.created_at::text,
              supplier.name AS supplier_name, supplier.status AS supplier_status
       FROM public.vendor_portal_accounts a
       LEFT JOIN public.suppliers supplier
         ON supplier.id=a.vendor_reference AND supplier.company_id=a.company_id AND supplier.deleted_at IS NULL
       WHERE a.company_id=$1 AND a.deleted_at IS NULL
       ORDER BY a.created_at DESC, a.id DESC LIMIT 100`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT r.id::text, r.vendor_account_id::text, r.purchase_rfq_id::text, r.rfq_number, r.title, r.description,
              r.due_at::text, r.opened_at::text, r.responded_at::text, r.status, r.invitation_email_status,
              r.created_at::text, a.vendor_name, a.email, a.vendor_reference::text, source.currency
       FROM public.vendor_portal_rfqs r
       INNER JOIN public.vendor_portal_accounts a
         ON a.id=r.vendor_account_id AND a.company_id=r.company_id AND a.deleted_at IS NULL
       LEFT JOIN public.supplier_rfqs source
         ON source.id=r.purchase_rfq_id AND source.company_id=r.company_id AND source.deleted_at IS NULL
       WHERE r.company_id=$1 AND r.deleted_at IS NULL
       ORDER BY r.created_at DESC, r.id DESC LIMIT 100`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT response.id::text, response.portal_rfq_id::text, response.amount::text, response.currency, response.promised_date::text,
              response.terms, response.submitted_at::text, response.status, rfq.rfq_number, rfq.title,
              account.vendor_name, account.email, account.vendor_reference::text, rfq.purchase_rfq_id::text
       FROM public.vendor_portal_rfq_responses response
       INNER JOIN public.vendor_portal_rfqs rfq
         ON rfq.id=response.portal_rfq_id AND rfq.company_id=response.company_id AND rfq.deleted_at IS NULL
       INNER JOIN public.vendor_portal_accounts account
         ON account.id=rfq.vendor_account_id AND account.company_id=rfq.company_id AND account.deleted_at IS NULL
       WHERE response.company_id=$1 AND response.deleted_at IS NULL
       ORDER BY response.submitted_at DESC NULLS LAST, response.created_at DESC LIMIT 100`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT supplier.id::text, supplier.name, supplier.email
       FROM public.suppliers supplier
       WHERE supplier.company_id=$1 AND supplier.deleted_at IS NULL
         AND LOWER(COALESCE(supplier.status,'active'))='active'
         AND NOT EXISTS (
           SELECT 1 FROM public.vendor_portal_accounts a
           WHERE a.company_id=supplier.company_id AND a.vendor_reference=supplier.id
             AND a.deleted_at IS NULL
         )
       ORDER BY lower(supplier.name), supplier.id LIMIT 250`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT rfq.id::text, rfq.rfq_number, rfq.currency, rfq.due_at::text, rfq.status,
              requisition.reason, requisition.needed_by::text
       FROM public.supplier_rfqs rfq
       LEFT JOIN public.purchase_requisitions requisition
         ON requisition.id=rfq.requisition_id AND requisition.company_id=rfq.company_id AND requisition.deleted_at IS NULL
       WHERE rfq.company_id=$1 AND rfq.deleted_at IS NULL
         AND LOWER(COALESCE(rfq.status,'')) NOT IN ('cancelled','closed','expired')
       ORDER BY rfq.created_at DESC, rfq.id DESC LIMIT 100`,
      [context.companyId],
    ),
  ]);
  const s = summary.rows[0] || {};
  return {
    summary: {
      accounts: Number(s.accounts || 0),
      invitations: Number(s.invitations || 0),
      awaitingResponse: Number(s.awaiting_response || 0),
      responsesPendingReview: Number(s.responses_pending_review || 0),
      deliveryFailures: Number(s.delivery_failures || 0),
    },
    accounts: accountRows.rows.map((r) => ({
      id: String(r.id), vendorReference: r.vendor_reference == null ? null : String(r.vendor_reference),
      vendorName: String(r.vendor_name), email: String(r.email), status: String(r.status),
      lastLoginAt: r.last_login_at == null ? null : String(r.last_login_at),
      accessExpiresAt: r.access_expires_at == null ? null : String(r.access_expires_at),
      createdAt: String(r.created_at), supplierName: r.supplier_name == null ? null : String(r.supplier_name),
      supplierStatus: r.supplier_status == null ? null : String(r.supplier_status),
    })),
    rfqs: rfqRows.rows.map((r) => ({
      id: String(r.id), vendorAccountId: String(r.vendor_account_id), purchaseRfqId: r.purchase_rfq_id == null ? null : String(r.purchase_rfq_id),
      rfqNumber: String(r.rfq_number), title: String(r.title || r.rfq_number),
      description: r.description == null ? null : String(r.description), dueAt: r.due_at == null ? null : String(r.due_at),
      openedAt: r.opened_at == null ? null : String(r.opened_at), respondedAt: r.responded_at == null ? null : String(r.responded_at),
      status: String(r.status), invitationEmailStatus: String(r.invitation_email_status || 'unknown'),
      createdAt: String(r.created_at), vendorName: String(r.vendor_name), email: String(r.email),
      currency: String(r.currency || 'KES'),
    })),
    responses: responseRows.rows.map((r) => ({
      id: String(r.id), portalRfqId: String(r.portal_rfq_id), amount: String(r.amount), currency: String(r.currency),
      promisedDate: r.promised_date == null ? null : String(r.promised_date), terms: r.terms == null ? null : String(r.terms),
      submittedAt: r.submitted_at == null ? null : String(r.submitted_at), status: String(r.status),
      rfqNumber: String(r.rfq_number), title: String(r.title || r.rfq_number), vendorName: String(r.vendor_name),
      email: String(r.email), vendorReference: r.vendor_reference == null ? null : String(r.vendor_reference),
      purchaseRfqId: String(r.purchase_rfq_id || ''),
    })),
    availableSuppliers: availableSuppliers.rows.map((r) => ({
      id: String(r.id), name: String(r.name), email: r.email == null ? '' : String(r.email),
    })),
    purchaseRfqs: purchaseRfqs.rows.map((r) => ({
      id: String(r.id), rfqNumber: String(r.rfq_number), currency: String(r.currency || 'KES'),
      dueAt: r.due_at == null ? null : String(r.due_at), status: String(r.status),
      description: r.reason == null ? null : String(r.reason), neededBy: r.needed_by == null ? null : String(r.needed_by),
    })),
  };
}

export async function createVendorPortalAccount(input: unknown) {
  const body = objectInput(input);
  const supplierId = requiredUuid(body.supplierId, 'Supplier');
  const context = await getContext([
    { table: 'vendor_portal_accounts', operation: 'create' },
    { moduleKey: 'purchase', table: 'suppliers', operation: 'view' },
  ]);
  return transaction(context, async (client) => {
    const supplier = await client.query(
      `SELECT id::text, name, email, status FROM public.suppliers
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE`,
      [context.companyId, supplierId],
    );
    if (supplier.rows.length !== 1 || String(supplier.rows[0].status || 'active').toLowerCase() !== 'active') {
      throw new VendorPortalError('NOT_FOUND', 'Choose an active supplier in the current company.');
    }
    const s = supplier.rows[0];
    const email = requiredText(s.email, 'Supplier email', 254).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new VendorPortalError('INVALID_INPUT', 'The supplier needs a valid email address before Vendor Portal access can be created.');
    const existing = await client.query(
      `SELECT id::text FROM public.vendor_portal_accounts
       WHERE company_id=$1 AND vendor_reference=$2 AND deleted_at IS NULL FOR UPDATE`,
      [context.companyId, supplierId],
    );
    if (existing.rows.length) throw new VendorPortalError('STATE_CONFLICT', 'This supplier already has a Vendor Portal account.');
    const saved = await client.query(
      `INSERT INTO public.vendor_portal_accounts
         (company_id, vendor_reference, vendor_name, email, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,'active',$5,$5)
       RETURNING id::text, vendor_reference::text, vendor_name, email, status, created_at::text`,
      [context.companyId, supplierId, String(s.name), email, context.userId],
    );
    const row = saved.rows[0];
    return { id: String(row.id), vendorReference: String(row.vendor_reference), vendorName: String(row.vendor_name), email: String(row.email), status: String(row.status), createdAt: String(row.created_at) };
  });
}

export async function issueVendorPortalRfq(input: unknown) {
  const body = objectInput(input);
  const accountId = requiredUuid(body.vendorAccountId, 'Supplier account');
  const purchaseRfqId = requiredUuid(body.purchaseRfqId, 'Purchase RFQ');
  const titleInput = optionalText(body.title, 'RFQ title', 255);
  const description = optionalText(body.description, 'RFQ description', 3000);
  const context = await getContext([
    { table: 'vendor_portal_rfqs', operation: 'create' },
    { table: 'vendor_portal_accounts', operation: 'view' },
    { moduleKey: 'purchase', table: 'supplier_rfqs', operation: 'view' },
    { moduleKey: 'purchase', table: 'suppliers', operation: 'view' },
  ]);
  const source = await context.pool.query(
    `SELECT id::text, rfq_number, currency, due_at::text, status
     FROM public.supplier_rfqs
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`,
    [context.companyId, purchaseRfqId],
  );
  if (source.rows.length !== 1 || ['cancelled','closed','expired'].includes(String(source.rows[0]?.status || '').toLowerCase())) {
    throw new VendorPortalError('NOT_FOUND', 'Choose an open Purchase RFQ in the current company.');
  }
  const sourceRfq = source.rows[0];
  const contextRow = await context.pool.query(
    `SELECT account.id::text, account.vendor_reference::text, account.vendor_name, account.email
     FROM public.vendor_portal_accounts account
     INNER JOIN public.suppliers supplier
       ON supplier.id=account.vendor_reference AND supplier.company_id=account.company_id AND supplier.deleted_at IS NULL
     WHERE account.id=$1 AND account.company_id=$2 AND account.deleted_at IS NULL AND account.status='active'
       AND LOWER(COALESCE(supplier.status,'active'))='active'`,
    [accountId, context.companyId],
  );
  if (contextRow.rows.length !== 1) throw new VendorPortalError('NOT_FOUND', 'Choose an active supplier account in the current company.');
  const account = contextRow.rows[0];
  const email = String(account.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new VendorPortalError('INVALID_INPUT', 'The supplier account needs a valid email address.');
  const dueAtRaw = body.expiresAt == null || body.expiresAt === '' ? sourceRfq.due_at : body.expiresAt;
  const expiry = dueAtRaw ? new Date(String(dueAtRaw)) : new Date(Date.now() + 7 * 86400000);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new VendorPortalError('INVALID_INPUT', 'Set an invitation expiry in the future.');
  const token = crypto.randomBytes(32).toString('hex');
  const tokenDigest = tokenHash(token);
  const rfqNumber = String(sourceRfq.rfq_number);
  const title = titleInput || ('Request for quotation ' + rfqNumber);
  const created = await transaction(context, async (client) => {
    const duplicate = await client.query(
      `SELECT id::text, status FROM public.vendor_portal_rfqs
       WHERE company_id=$1 AND purchase_rfq_id=$2 AND vendor_account_id=$3 AND deleted_at IS NULL
         AND status NOT IN ('cancelled','delivery_failed','expired')
       FOR UPDATE`,
      [context.companyId, purchaseRfqId, accountId],
    );
    if (duplicate.rows.length) throw new VendorPortalError('STATE_CONFLICT', 'An active invitation already exists for this supplier and Purchase RFQ. Cancel it before sending another.');
    const inserted = await client.query(
      `INSERT INTO public.vendor_portal_rfqs
         (company_id, vendor_account_id, purchase_rfq_id, rfq_number, title, description, due_at,
          status, public_token_hash, public_token_expires_at, invitation_email_status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'delivery_pending',$8,$7,'pending',$9,$9)
       RETURNING id::text`,
      [context.companyId, accountId, purchaseRfqId, rfqNumber, title, description, expiry.toISOString(), tokenDigest, context.userId],
    );
    return String(inserted.rows[0].id);
  });
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) {
    await context.pool.query(
      `UPDATE public.vendor_portal_rfqs SET status='delivery_failed', public_token_hash=NULL, invitation_email_status='failed', updated_by=$3, updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL`,
      [created, context.companyId, context.userId],
    );
    throw new VendorPortalError('EMAIL_DELIVERY_FAILED', 'APP_URL is not configured, so the supplier invitation could not be delivered.');
  }
  let actionHref: string;
  try {
    const origin = new URL(appUrl);
    if (!['https:', 'http:'].includes(origin.protocol)) throw new Error('Invalid protocol');
    actionHref = new URL('/vendor/rfq/' + encodeURIComponent(context.tenantId) + '/' + encodeURIComponent(token), origin.toString()).toString();
  } catch {
    await context.pool.query(
      `UPDATE public.vendor_portal_rfqs SET status='delivery_failed', public_token_hash=NULL, invitation_email_status='failed', updated_by=$3, updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL`,
      [created, context.companyId, context.userId],
    );
    throw new VendorPortalError('EMAIL_DELIVERY_FAILED', 'The application URL is invalid, so the supplier invitation could not be delivered.');
  }
  try {
    await sendWorkspaceNotificationEmail(email, String(account.vendor_name), {
      title: 'Request for quotation: ' + rfqNumber,
      message: 'Your business has been invited to respond to a supplier request in SaMi Vendor Portal. Review the request, enter your quotation, and submit it before the deadline.',
      actionHref,
      actionLabel: 'Respond to RFQ',
      status: 'info',
      details: [
        { label: 'RFQ number', value: rfqNumber },
        { label: 'Supplier', value: String(account.vendor_name) },
        { label: 'Currency', value: String(sourceRfq.currency || 'KES') },
        { label: 'Response due', value: expiry.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' },
      ],
    });
  } catch {
    await context.pool.query(
      `UPDATE public.vendor_portal_rfqs SET status='delivery_failed', public_token_hash=NULL, public_token_expires_at=NOW(), invitation_email_status='failed', updated_by=$3, updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL`,
      [created, context.companyId, context.userId],
    );
    throw new VendorPortalError('EMAIL_DELIVERY_FAILED', 'The supplier invitation was not delivered. Check SaMi email settings and retry.');
  }
  await context.pool.query(
    `UPDATE public.vendor_portal_rfqs SET status='sent', invitation_email_status='delivered', updated_by=$3, updated_at=NOW()
     WHERE id=$1 AND company_id=$2 AND status='delivery_pending' AND deleted_at IS NULL`,
    [created, context.companyId, context.userId],
  );
  return { id: created, rfqNumber, title, vendorName: String(account.vendor_name), status: 'sent', dueAt: expiry.toISOString() };
}

export async function cancelVendorPortalRfq(input: unknown) {
  const body = objectInput(input);
  const rfqId = requiredUuid(body.rfqId, 'RFQ invitation');
  const context = await getContext([
    { table: 'vendor_portal_rfqs', operation: 'edit' },
    { table: 'vendor_portal_rfq_responses', operation: 'view' },
  ]);
  return transaction(context, async (client) => {
    const row = await client.query(
      `SELECT id::text, status FROM public.vendor_portal_rfqs
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [rfqId, context.companyId],
    );
    if (row.rows.length !== 1) throw new VendorPortalError('NOT_FOUND', 'RFQ invitation was not found.');
    const status = String(row.rows[0].status);
    if (!['sent','opened','delivery_failed','delivery_pending'].includes(status)) throw new VendorPortalError('STATE_CONFLICT', 'Only invitations awaiting a supplier response can be cancelled.');
    await client.query(
      `UPDATE public.vendor_portal_rfqs SET status='cancelled', public_token_hash=NULL, public_token_expires_at=NOW(),
         updated_by=$3, updated_at=NOW() WHERE id=$1 AND company_id=$2`,
      [rfqId, context.companyId, context.userId],
    );
    return { id: rfqId, status: 'cancelled' };
  });
}

export async function decideVendorPortalResponse(input: unknown) {
  const body = objectInput(input);
  const responseId = requiredUuid(body.responseId, 'Supplier response');
  const decision = requiredText(body.decision, 'Decision', 24);
  if (decision !== 'accepted' && decision !== 'rejected') throw new VendorPortalError('INVALID_INPUT', 'Choose accept or reject.');
  const context = await getContext([
    { table: 'vendor_portal_rfq_responses', operation: 'edit' },
    { table: 'vendor_portal_rfqs', operation: 'edit' },
    { moduleKey: 'purchase', table: 'supplier_rfq_responses', operation: 'edit' },
  ]);
  return transaction(context, async (client) => {
    const response = await client.query(
      `SELECT response.id::text, response.portal_rfq_id::text, response.status,
              rfq.company_id::text, rfq.purchase_rfq_id::text, account.vendor_reference::text
       FROM public.vendor_portal_rfq_responses response
       INNER JOIN public.vendor_portal_rfqs rfq ON rfq.id=response.portal_rfq_id AND rfq.company_id=response.company_id
       INNER JOIN public.vendor_portal_accounts account ON account.id=rfq.vendor_account_id AND account.company_id=rfq.company_id
       WHERE response.id=$1 AND response.company_id=$2 AND response.deleted_at IS NULL AND rfq.deleted_at IS NULL
       FOR UPDATE OF response, rfq`,
      [responseId, context.companyId],
    );
    if (response.rows.length !== 1) throw new VendorPortalError('NOT_FOUND', 'Supplier response was not found.');
    const row = response.rows[0];
    if (String(row.status) !== 'submitted') throw new VendorPortalError('STATE_CONFLICT', 'Only a submitted supplier response can be accepted or rejected.');
    await client.query(
      `UPDATE public.vendor_portal_rfq_responses SET status=$3, updated_by=$4, updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND status='submitted'`,
      [responseId, context.companyId, decision, context.userId],
    );
    await client.query(
      `UPDATE public.vendor_portal_rfqs SET status=$3, public_token_hash=NULL, public_token_expires_at=NOW(),
         updated_by=$4, updated_at=NOW() WHERE id=$1 AND company_id=$2`,
      [String(row.portal_rfq_id), context.companyId, decision, context.userId],
    );
    if (row.purchase_rfq_id && row.vendor_reference) {
      await client.query(
        `UPDATE public.supplier_rfq_responses
         SET status=$4, updated_by=$5, updated_at=NOW()
         WHERE company_id=$1 AND rfq_id=$2 AND supplier_id=$3 AND deleted_at IS NULL`,
        [context.companyId, String(row.purchase_rfq_id), String(row.vendor_reference), decision, context.userId],
      );
    }
    return { id: responseId, status: decision };
  });
}

export async function getPublicVendorPortalRfq(tenantId: string, token: string) {
  assertToken(token);
  if (!UUID_RE.test(tenantId)) throw new VendorPortalPublicError('NOT_FOUND', 'This supplier invitation is not available.');
  const pool = await getTenantPoolByTenantId(tenantId);
  const digest = tokenHash(token);
  const found = await pool.query(
    `SELECT rfq.id::text, rfq.company_id::text, rfq.purchase_rfq_id::text, rfq.rfq_number,
            rfq.title, rfq.description, rfq.due_at::text, rfq.status, rfq.opened_at::text,
            account.vendor_name, source.currency, source.requisition_id::text,
            requisition.reason AS purchase_reason, requisition.needed_by::text
     FROM public.vendor_portal_rfqs rfq
     INNER JOIN public.vendor_portal_accounts account
       ON account.id=rfq.vendor_account_id AND account.company_id=rfq.company_id
     LEFT JOIN public.supplier_rfqs source
       ON source.id=rfq.purchase_rfq_id AND source.company_id=rfq.company_id AND source.deleted_at IS NULL
     LEFT JOIN public.purchase_requisitions requisition
       ON requisition.id=source.requisition_id AND requisition.company_id=rfq.company_id AND requisition.deleted_at IS NULL
     WHERE rfq.public_token_hash=$1 AND rfq.public_token_expires_at>NOW()
       AND rfq.status IN ('sent','opened','responded')
       AND rfq.deleted_at IS NULL AND account.deleted_at IS NULL AND account.status='active'
     LIMIT 1`,
    [digest],
  );
  if (found.rows.length !== 1) throw new VendorPortalPublicError('NOT_FOUND', 'This supplier invitation has expired or is no longer available.');
  const rfq = found.rows[0];
  const [lineRows, responseRows] = await Promise.all([
    rfq.requisition_id ? pool.query(
      `SELECT line.id::text, line.description, line.quantity::text, product.name AS product_name, product.sku
       FROM public.purchase_requisition_lines line
       LEFT JOIN public.products product
         ON product.id=line.product_reference AND product.company_id=line.company_id AND product.deleted_at IS NULL
       WHERE line.company_id=$1 AND line.requisition_id=$2 AND line.deleted_at IS NULL
       ORDER BY line.created_at, line.id LIMIT 100`,
      [rfq.company_id, rfq.requisition_id],
    ) : Promise.resolve({ rows: [] as Row[] }),
    pool.query(
      `SELECT id::text, amount::text, currency, promised_date::text, terms, submitted_at::text, status
       FROM public.vendor_portal_rfq_responses
       WHERE company_id=$1 AND portal_rfq_id=$2 AND deleted_at IS NULL LIMIT 1`,
      [rfq.company_id, rfq.id],
    ),
  ]);
  await pool.query(
    `UPDATE public.vendor_portal_rfqs
     SET opened_at=COALESCE(opened_at,NOW()), status=CASE WHEN status='sent' THEN 'opened' ELSE status END, updated_at=NOW()
     WHERE id=$1 AND company_id=$2 AND public_token_hash=$3 AND deleted_at IS NULL`,
    [rfq.id, rfq.company_id, digest],
  );
  const existing = responseRows.rows[0];
  return {
    id: String(rfq.id), rfqNumber: String(rfq.rfq_number), title: String(rfq.title || rfq.rfq_number),
    description: rfq.description == null ? (rfq.purchase_reason == null ? null : String(rfq.purchase_reason)) : String(rfq.description),
    dueAt: rfq.due_at == null ? null : String(rfq.due_at), currency: String(rfq.currency || 'KES'),
    status: String(rfq.status), vendorName: String(rfq.vendor_name),
    lines: lineRows.rows.map((line) => ({ id: String(line.id), description: String(line.product_name || line.description), quantity: String(line.quantity), sku: line.sku == null ? null : String(line.sku) })),
    response: existing ? { amount: String(existing.amount), currency: String(existing.currency), promisedDate: existing.promised_date == null ? null : String(existing.promised_date), terms: existing.terms == null ? null : String(existing.terms), submittedAt: existing.submitted_at == null ? null : String(existing.submitted_at), status: String(existing.status) } : null,
    acceptingResponses: ['sent','opened'].includes(String(rfq.status)) && !existing
      && (!rfq.due_at || new Date(String(rfq.due_at)).getTime() >= Date.now()),
  };
}

export async function submitPublicVendorPortalResponse(tenantId: string, token: string, input: unknown) {
  assertToken(token);
  if (!UUID_RE.test(tenantId)) throw new VendorPortalPublicError('NOT_FOUND', 'This supplier invitation is not available.');
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Row : {};
  const amountRaw = String(body.amount ?? '').trim();
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,4})?$/.test(amountRaw) || !Number.isFinite(Number(amountRaw)) || Number(amountRaw) < 0) {
    throw new VendorPortalPublicError('INVALID_INPUT', 'Enter a valid non-negative quotation total.');
  }
  const currency = String(body.currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new VendorPortalPublicError('INVALID_INPUT', 'Choose a valid three-letter currency.');
  const promisedDate = body.promisedDate == null || body.promisedDate === '' ? null : String(body.promisedDate).trim();
  if (promisedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(promisedDate) || Number.isNaN(Date.parse(promisedDate + 'T00:00:00Z')))) {
    throw new VendorPortalPublicError('INVALID_INPUT', 'Promised delivery date is invalid.');
  }
  const terms = body.terms == null || body.terms === '' ? null : String(body.terms).trim();
  if (terms && terms.length > 4000) throw new VendorPortalPublicError('INVALID_INPUT', 'Quotation terms are too long.');
  const pool = await getTenantPoolByTenantId(tenantId);
  const digest = tokenHash(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invitation = await client.query(
      `SELECT rfq.id::text, rfq.company_id::text, rfq.purchase_rfq_id::text, rfq.vendor_account_id::text,
              account.vendor_reference::text, source.currency, rfq.status, rfq.due_at
       FROM public.vendor_portal_rfqs rfq
       INNER JOIN public.vendor_portal_accounts account
         ON account.id=rfq.vendor_account_id AND account.company_id=rfq.company_id AND account.deleted_at IS NULL
       LEFT JOIN public.supplier_rfqs source
         ON source.id=rfq.purchase_rfq_id AND source.company_id=rfq.company_id AND source.deleted_at IS NULL
       WHERE rfq.public_token_hash=$1 AND rfq.public_token_expires_at>NOW()
         AND rfq.deleted_at IS NULL AND account.status='active'
       FOR UPDATE OF rfq`,
      [digest],
    );
    if (invitation.rows.length !== 1) throw new VendorPortalPublicError('NOT_FOUND', 'This supplier invitation has expired or is no longer available.');
    const row = invitation.rows[0];
    if (!['sent','opened'].includes(String(row.status))) throw new VendorPortalPublicError('STATE_CONFLICT', 'This request is no longer accepting quotations.');
    const expectedCurrency = String(row.currency || 'KES').trim().toUpperCase();
    if (currency !== expectedCurrency) throw new VendorPortalPublicError('INVALID_INPUT', 'Use the currency specified on this Purchase RFQ (' + expectedCurrency + ').');
    if (row.due_at && new Date(String(row.due_at)).getTime() < Date.now()) throw new VendorPortalPublicError('STATE_CONFLICT', 'The response deadline has passed.');
    if (!row.vendor_reference || !row.purchase_rfq_id) throw new VendorPortalPublicError('STATE_CONFLICT', 'This RFQ is not linked to a valid Purchase supplier record.');
    const supplier = await client.query(
      `SELECT id::text FROM public.suppliers
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND LOWER(COALESCE(status,'active'))='active'`,
      [String(row.vendor_reference), String(row.company_id)],
    );
    if (supplier.rows.length !== 1) throw new VendorPortalPublicError('STATE_CONFLICT', 'The linked supplier is not active.');
    const saved = await client.query(
      `INSERT INTO public.vendor_portal_rfq_responses
         (company_id, portal_rfq_id, amount, currency, promised_date, terms, submitted_at, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),'submitted',NULL,NULL)
       ON CONFLICT (company_id, portal_rfq_id) WHERE deleted_at IS NULL
       DO UPDATE SET amount=EXCLUDED.amount, currency=EXCLUDED.currency, promised_date=EXCLUDED.promised_date,
         terms=EXCLUDED.terms, submitted_at=NOW(), status='submitted', updated_at=NOW()
       WHERE vendor_portal_rfq_responses.status='draft'
       RETURNING id::text`,
      [String(row.company_id), String(row.id), amountRaw, currency, promisedDate, terms],
    );
    if (saved.rows.length !== 1) throw new VendorPortalPublicError('STATE_CONFLICT', 'A quotation has already been submitted for this request.');
    const existingPurchaseResponse = await client.query(
      `SELECT id::text FROM public.supplier_rfq_responses
       WHERE company_id=$1 AND rfq_id=$2 AND supplier_id=$3 AND deleted_at IS NULL
       ORDER BY created_at, id LIMIT 1 FOR UPDATE`,
      [String(row.company_id), String(row.purchase_rfq_id), String(row.vendor_reference)],
    );
    if (existingPurchaseResponse.rows.length) {
      await client.query(
        `UPDATE public.supplier_rfq_responses
         SET total_amount=$4, promised_date=$5, terms=$6, submitted_at=NOW(), status='submitted',
             updated_by=NULL, updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND rfq_id=$3 AND deleted_at IS NULL`,
        [String(existingPurchaseResponse.rows[0].id), String(row.company_id), String(row.purchase_rfq_id), amountRaw, promisedDate, terms],
      );
    } else {
      await client.query(
        `INSERT INTO public.supplier_rfq_responses
           (company_id, rfq_id, supplier_id, total_amount, promised_date, terms, submitted_at, status, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),'submitted',NULL,NULL)`,
        [String(row.company_id), String(row.purchase_rfq_id), String(row.vendor_reference), amountRaw, promisedDate, terms],
      );
    }
    await client.query(
      `UPDATE public.vendor_portal_rfqs SET status='responded', responded_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND public_token_hash=$3`,
      [String(row.id), String(row.company_id), digest],
    );
    await client.query('COMMIT');
    return { responseId: String(saved.rows[0].id), status: 'submitted' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
