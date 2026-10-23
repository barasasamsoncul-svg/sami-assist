import 'server-only';

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';

import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_TTL_DAYS = 30;

export type VendorPortalErrorCode =
  | 'INVALID_INPUT'
  | 'ACCESS_NOT_FOUND'
  | 'RFQ_NOT_AVAILABLE'
  | 'RESPONSE_LOCKED';

export class VendorPortalError extends Error {
  readonly code: VendorPortalErrorCode;

  constructor(code: VendorPortalErrorCode, message: string) {
    super(message);
    this.name = 'VendorPortalError';
    this.code = code;
  }
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function requireUuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new VendorPortalError('INVALID_INPUT', label + ' identifier is invalid.');
  }
  return value.trim();
}

function publicToken(value: unknown) {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) {
    throw new VendorPortalError('ACCESS_NOT_FOUND', 'Vendor access is invalid or expired.');
  }
  return value;
}

function responseAmount(value: unknown) {
  const amount = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(amount)) {
    throw new VendorPortalError('INVALID_INPUT', 'Enter a valid non-negative quotation amount (up to four decimal places).');
  }
  return amount;
}

function responseCurrency(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value.trim())) {
    throw new VendorPortalError('INVALID_INPUT', 'Choose a valid three-letter currency code.');
  }
  return value.trim().toUpperCase();
}

function responseDate(value: unknown) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new VendorPortalError('INVALID_INPUT', 'Enter a valid promised delivery date.');
  }
  const date = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new VendorPortalError('INVALID_INPUT', 'Enter a valid promised delivery date.');
  }
  return value;
}

function responseTerms(value: unknown) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 5000) {
    throw new VendorPortalError('INVALID_INPUT', 'Commercial terms must be 5,000 characters or fewer.');
  }
  return value.trim() || null;
}

/** Issue a revocable 30-day bearer link for a known Purchase supplier. */
export async function createVendorPortalAccessLink(input: Record<string, unknown>) {
  const vendorAccountId = requireUuid(input.vendorAccountId, 'Vendor account');
  const context = await requireEnterpriseModuleTableContext('vendor_portal', 'vendor_portal_accounts', 'edit');
  const token = crypto.randomBytes(32).toString('hex');
  const hash = hashToken(token);
  const client = await context.pool.connect();
  let vendorName = '';
  let expiresAt = '';

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      ['vendor-portal-access:' + context.companyId, vendorAccountId],
    );
    const account = await client.query(
      `SELECT account.id, account.vendor_name, account.email
       FROM public.vendor_portal_accounts account
       JOIN public.suppliers supplier
         ON supplier.id = account.vendor_reference
        AND supplier.company_id = account.company_id
        AND supplier.deleted_at IS NULL
        AND supplier.status = 'active'
       WHERE account.id = $1
         AND account.company_id = $2
         AND account.deleted_at IS NULL
         AND account.status = 'active'
         AND (account.access_expires_at IS NULL OR account.access_expires_at > NOW())
       FOR UPDATE OF account`,
      [vendorAccountId, context.companyId],
    );
    if (!account.rows[0]) {
      throw new VendorPortalError('ACCESS_NOT_FOUND', 'An active portal account linked to an active Purchase supplier was not found.');
    }
    vendorName = String(account.rows[0].vendor_name || account.rows[0].email || 'Supplier');
    const updated = await client.query(
      `UPDATE public.vendor_portal_accounts
       SET public_token_hash = $3,
           public_token_created_at = NOW(),
           public_token_expires_at = NOW() + ($4::int * INTERVAL '1 day'),
           public_token_revoked_at = NULL,
           updated_by = $5,
           updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       RETURNING public_token_expires_at::text AS expires_at`,
      [vendorAccountId, context.companyId, hash, TOKEN_TTL_DAYS, context.userId],
    );
    expiresAt = new Date(updated.rows[0].expires_at).toISOString();
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  await recordWorkspaceAuditEvent({
    tenantId: context.tenantId, companyId: context.companyId, userId: context.userId,
    actorType: 'human', action: 'vendor_portal.access_link.issue',
    eventType: 'vendor_portal.access_link.issued', category: 'security', severity: 'info',
    summary: 'Issued an expiring supplier portal access link.',
    resourceType: 'vendor_portal_account', resourceId: vendorAccountId,
    module: 'vendor_portal', result: 'success', metadata: { expiresAt, ttlDays: TOKEN_TTL_DAYS },
  }).catch(() => undefined);

  return {
    vendorAccountId, vendorName, expiresAt, expiresInDays: TOKEN_TTL_DAYS,
    accessUrl: '/vp/' + encodeURIComponent(context.tenantId) + '/' + token,
  };
}

export async function revokeVendorPortalAccess(input: Record<string, unknown>) {
  const vendorAccountId = requireUuid(input.vendorAccountId, 'Vendor account');
  const context = await requireEnterpriseModuleTableContext('vendor_portal', 'vendor_portal_accounts', 'edit');
  const result = await context.pool.query(
    `UPDATE public.vendor_portal_accounts
     SET public_token_hash = NULL,
         public_token_revoked_at = CASE WHEN public_token_hash IS NOT NULL THEN NOW() ELSE public_token_revoked_at END,
         updated_by = $3, updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
     RETURNING id::text`,
    [vendorAccountId, context.companyId, context.userId],
  );
  if (!result.rows[0]) throw new VendorPortalError('ACCESS_NOT_FOUND', 'Vendor account was not found.');
  await recordWorkspaceAuditEvent({
    tenantId: context.tenantId, companyId: context.companyId, userId: context.userId,
    actorType: 'human', action: 'vendor_portal.access_link.revoke',
    eventType: 'vendor_portal.access_link.revoked', category: 'security', severity: 'info',
    summary: 'Revoked supplier portal access links.',
    resourceType: 'vendor_portal_account', resourceId: vendorAccountId,
    module: 'vendor_portal', result: 'success',
  }).catch(() => undefined);
  return { vendorAccountId, revoked: true };
}

export type VendorPortalPublicRFQ = {
  id: string;
  purchaseRfqId: string | null;
  rfqNumber: string;
  dueAt: string | null;
  status: string;
  openedAt: string | null;
  respondedAt: string | null;
  items: Array<{ id: string; description: string; quantity: string; unitOfMeasure: string }>;
  response: null | {
    amount: string;
    currency: string;
    promisedDate: string | null;
    terms: string | null;
    submittedAt: string | null;
    status: string;
    purchaseResponseId: string | null;
    linePrices: Array<{ rfqLineId: string; unitCost: string; lineTotal: string }>;
  };
};

export type VendorPortalPublicView = {
  tenantId: string; companyName: string; vendorAccountId: string;
  vendorName: string; email: string; accessExpiresAt: string;
  rfqs: VendorPortalPublicRFQ[];
};

async function requirePublicAccount(tenantId: string, tokenInput: unknown, client?: PoolClient) {
  const token = publicToken(tokenInput);
  const pool = client ? null : await getTenantPoolByTenantId(tenantId);
  const queryable = client || pool!;
  const result = await queryable.query(
    `SELECT account.id::text AS id, account.company_id::text AS company_id,
            account.vendor_reference::text AS vendor_reference,
            account.vendor_name, account.email,
            account.public_token_expires_at::text AS public_token_expires_at,
            company.name AS company_name
     FROM public.vendor_portal_accounts account
     JOIN public.companies company ON company.id = account.company_id
     JOIN public.suppliers supplier
       ON supplier.id = account.vendor_reference
      AND supplier.company_id = account.company_id
      AND supplier.deleted_at IS NULL
      AND supplier.status = 'active'
     WHERE account.public_token_hash = $1
       AND account.status = 'active'
       AND account.deleted_at IS NULL
       AND account.public_token_revoked_at IS NULL
       AND account.public_token_expires_at > NOW()
       AND (account.access_expires_at IS NULL OR account.access_expires_at > NOW())
     LIMIT 1`,
    [hashToken(token)],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row || typeof row.id !== 'string') {
    throw new VendorPortalError('ACCESS_NOT_FOUND', 'Vendor access is invalid or expired.');
  }
  return row;
}

/** Every public read revalidates the hashed token, expiry, status, supplier and company. */
export async function getVendorPortalPublicView(tenantIdInput: string, tokenInput: unknown): Promise<VendorPortalPublicView> {
  const tenantId = requireUuid(tenantIdInput, 'Workspace');
  const token = publicToken(tokenInput);
  const pool = await getTenantPoolByTenantId(tenantId);
  const client = await pool.connect();
  let account: Record<string, unknown>;
  try {
    await client.query('BEGIN');
    account = await requirePublicAccount(tenantId, token, client);
    await client.query(
      `UPDATE public.vendor_portal_accounts
       SET last_login_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'active' AND deleted_at IS NULL`,
      [account.id, account.company_id],
    );
    await client.query(
      `UPDATE public.vendor_portal_rfqs
       SET status = 'opened', opened_at = COALESCE(opened_at, NOW()), updated_at = NOW()
       WHERE company_id = $1 AND vendor_account_id = $2
         AND status = 'sent' AND deleted_at IS NULL
         AND (due_at IS NULL OR due_at > NOW())`,
      [account.company_id, account.id],
    );
    const rfqs = await client.query(
      `SELECT rfq.id::text AS id, rfq.purchase_rfq_id::text AS purchase_rfq_id,
              rfq.rfq_number, rfq.due_at::text AS due_at, rfq.status,
              rfq.opened_at::text AS opened_at, rfq.responded_at::text AS responded_at,
              COALESCE(request_items.items, '[]'::jsonb) AS request_items,
              response.amount::text AS response_amount, response.currency AS response_currency,
              response.promised_date::text AS response_promised_date, response.terms AS response_terms,
              response.submitted_at::text AS response_submitted_at, response.status AS response_status,
              response.purchase_response_id::text AS purchase_response_id,
              COALESCE(response.line_prices, '[]'::jsonb) AS response_line_prices
       FROM public.vendor_portal_rfqs rfq
       LEFT JOIN LATERAL (
         SELECT candidate.amount, candidate.currency, candidate.promised_date,
                candidate.terms, candidate.submitted_at, candidate.status,
                candidate.purchase_response_id,
                (
                  SELECT jsonb_agg(jsonb_build_object(
                    'rfqLineId', priced.rfq_line_id::text,
                    'unitCost', priced.unit_cost::text,
                    'lineTotal', priced.line_total::text
                  ) ORDER BY priced.rfq_line_id)
                  FROM public.supplier_rfq_response_lines priced
                  WHERE priced.company_id = candidate.company_id
                    AND priced.rfq_id = candidate.purchase_rfq_id
                    AND priced.response_id = candidate.purchase_response_id
                    AND priced.deleted_at IS NULL
                ) AS line_prices
         FROM public.vendor_portal_rfq_responses candidate
         WHERE candidate.company_id = rfq.company_id
           AND candidate.portal_rfq_id = rfq.id AND candidate.deleted_at IS NULL
         ORDER BY candidate.updated_at DESC, candidate.id DESC LIMIT 1
       ) response ON TRUE
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'id', source_line.id::text,
           'description', source_line.description,
           'quantity', source_line.quantity::text,
           'unitOfMeasure', source_line.unit_of_measure
         ) ORDER BY source_line.created_at, source_line.id) AS items
         FROM public.supplier_rfq_lines source_line
         WHERE source_line.company_id = rfq.company_id
           AND source_line.rfq_id = rfq.purchase_rfq_id
           AND source_line.deleted_at IS NULL
       ) request_items ON TRUE
       WHERE rfq.company_id = $1 AND rfq.vendor_account_id = $2 AND rfq.deleted_at IS NULL
       ORDER BY rfq.due_at ASC NULLS LAST, rfq.created_at DESC LIMIT 100`,
      [account.company_id, account.id],
    );
    await client.query('COMMIT');
    return {
      tenantId,
      companyName: String(account.company_name || 'Supplier workspace'),
      vendorAccountId: String(account.id),
      vendorName: String(account.vendor_name || 'Supplier'),
      email: String(account.email || ''),
      accessExpiresAt: new Date(String(account.public_token_expires_at)).toISOString(),
      rfqs: rfqs.rows.map((row): VendorPortalPublicRFQ => {
        const items = Array.isArray(row.request_items) ? row.request_items as Array<Record<string, unknown>> : [];
        const linePrices = Array.isArray(row.response_line_prices) ? row.response_line_prices as Array<Record<string, unknown>> : [];
        return {
          id: String(row.id),
          purchaseRfqId: row.purchase_rfq_id == null ? null : String(row.purchase_rfq_id),
          rfqNumber: String(row.rfq_number || ''),
          dueAt: row.due_at ? new Date(String(row.due_at)).toISOString() : null,
          status: String(row.status || ''),
          openedAt: row.opened_at ? new Date(String(row.opened_at)).toISOString() : null,
          respondedAt: row.responded_at ? new Date(String(row.responded_at)).toISOString() : null,
          items: items.map((item) => ({
            id: String(item.id),
            description: String(item.description || ''),
            quantity: String(item.quantity || '0'),
            unitOfMeasure: String(item.unitOfMeasure || 'unit'),
          })),
          response: row.response_status == null ? null : {
            amount: String(row.response_amount ?? '0'),
            currency: String(row.response_currency || 'KES'),
            promisedDate: row.response_promised_date ? String(row.response_promised_date).slice(0, 10) : null,
            terms: row.response_terms == null ? null : String(row.response_terms),
            submittedAt: row.response_submitted_at ? new Date(String(row.response_submitted_at)).toISOString() : null,
            status: String(row.response_status),
            purchaseResponseId: row.purchase_response_id == null ? null : String(row.purchase_response_id),
            linePrices: linePrices.map((item) => ({
              rfqLineId: String(item.rfqLineId),
              unitCost: String(item.unitCost),
              lineTotal: String(item.lineTotal),
            })),
          },
        };
      }),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function submitVendorPortalRFQResponse(
  tenantIdInput: string,
  tokenInput: unknown,
  input: Record<string, unknown>,
) {
  const tenantId = requireUuid(tenantIdInput, 'Workspace');
  const token = publicToken(tokenInput);
  const rfqId = requireUuid(input.rfqId, 'RFQ');
  const currency = responseCurrency(input.currency);
  const promisedDate = responseDate(input.promisedDate);
  const terms = responseTerms(input.terms);

  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 500) {
    throw new VendorPortalError('INVALID_INPUT', 'Provide a unit price for every requested quotation line.');
  }

  const linePrices = input.lines.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new VendorPortalError('INVALID_INPUT', 'Quotation line ' + (index + 1) + ' is invalid.');
    }
    const item = value as Record<string, unknown>;
    return {
      rfqLineId: requireUuid(item.rfqLineId, 'Quotation line'),
      unitCost: responseAmount(item.unitCost),
    };
  });
  const lineIds = linePrices.map((line) => line.rfqLineId);
  if (new Set(lineIds).size !== lineIds.length) {
    throw new VendorPortalError('INVALID_INPUT', 'Each requested quotation line must appear exactly once.');
  }

  const pool = await getTenantPoolByTenantId(tenantId);
  const client = await pool.connect();
  let account: Record<string, unknown>;
  let rfqNumber = '';
  let responseId = '';
  let totalAmount = '0.00';

  try {
    await client.query('BEGIN');
    account = await requirePublicAccount(tenantId, token, client);
    const companyId = String(account.company_id);
    const supplierId = requireUuid(account.vendor_reference, 'Supplier');

    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      ['vendor-portal-rfq-response:' + companyId, rfqId],
    );

    const rfq = await client.query(
      `SELECT portal.id::text AS id,
              portal.rfq_number,
              portal.status AS portal_status,
              portal.purchase_rfq_id::text AS purchase_rfq_id,
              purchase_rfq.status AS purchase_status
       FROM public.vendor_portal_rfqs portal
       JOIN public.supplier_rfqs purchase_rfq
         ON purchase_rfq.id = portal.purchase_rfq_id
        AND purchase_rfq.company_id = portal.company_id
        AND purchase_rfq.deleted_at IS NULL
       WHERE portal.id = $1
         AND portal.company_id = $2
         AND portal.vendor_account_id = $3
         AND portal.deleted_at IS NULL
         AND portal.status IN ('sent','opened','responded')
         AND (portal.due_at IS NULL OR portal.due_at > NOW())
         AND purchase_rfq.status = 'sent'
         AND (purchase_rfq.response_due_at IS NULL OR purchase_rfq.response_due_at > NOW())
       FOR UPDATE OF portal, purchase_rfq`,
      [rfqId, companyId, account.id],
    );

    if (!rfq.rows[0]) {
      throw new VendorPortalError('RFQ_NOT_AVAILABLE', 'This quotation invitation is not available or its deadline has passed.');
    }

    const purchaseRfqId = String(rfq.rows[0].purchase_rfq_id);
    rfqNumber = String(rfq.rows[0].rfq_number || '');

    const sourceLines = await client.query(
      `SELECT id::text AS id, quantity::text AS quantity
       FROM public.supplier_rfq_lines
       WHERE company_id = $1 AND rfq_id = $2 AND deleted_at IS NULL
       ORDER BY id
       FOR SHARE`,
      [companyId, purchaseRfqId],
    );

    const sourceIds = sourceLines.rows.map((row) => String(row.id));
    if (
      sourceIds.length === 0 ||
      sourceIds.length !== lineIds.length ||
      sourceIds.some((id) => !lineIds.includes(id))
    ) {
      throw new VendorPortalError('INVALID_INPUT', 'The quotation must price every current Purchase RFQ line exactly once.');
    }

    const pricingJson = JSON.stringify(linePrices.map((line) => ({
      rfq_line_id: line.rfqLineId,
      unit_cost: line.unitCost,
    })));

    const total = await client.query(
      `SELECT ROUND(COALESCE(SUM(source_line.quantity * submitted.unit_cost), 0), 2)::text AS total
       FROM jsonb_to_recordset($3::jsonb) AS submitted(rfq_line_id UUID, unit_cost NUMERIC(19,4))
       JOIN public.supplier_rfq_lines source_line
         ON source_line.id = submitted.rfq_line_id
        AND source_line.company_id = $1
        AND source_line.rfq_id = $2
        AND source_line.deleted_at IS NULL`,
      [companyId, purchaseRfqId, pricingJson],
    );
    totalAmount = String(total.rows[0]?.total || '0.00');

    const existingPurchaseResponse = await client.query(
      `SELECT id::text, status
       FROM public.supplier_rfq_responses
       WHERE company_id = $1 AND rfq_id = $2 AND supplier_id = $3 AND deleted_at IS NULL
       FOR UPDATE`,
      [companyId, purchaseRfqId, supplierId],
    );

    const currentPurchaseResponse = existingPurchaseResponse.rows[0] as Record<string, unknown> | undefined;
    if (currentPurchaseResponse && ['accepted', 'rejected'].includes(String(currentPurchaseResponse.status))) {
      throw new VendorPortalError('RESPONSE_LOCKED', 'The procurement team has already decided on this supplier response.');
    }

    if (currentPurchaseResponse) {
      const updated = await client.query(
        `UPDATE public.supplier_rfq_responses
         SET currency = $4,
             quoted_total = $5,
             payment_terms = $6,
             notes = $7,
             status = 'submitted',
             submitted_at = NOW(),
             updated_by = NULL,
             updated_at = NOW()
         WHERE id = $1 AND company_id = $2 AND rfq_id = $3 AND deleted_at IS NULL
         RETURNING id::text`,
        [currentPurchaseResponse.id, companyId, purchaseRfqId, currency, totalAmount, terms, promisedDate ? 'Promised delivery: ' + promisedDate : null],
      );
      responseId = String(updated.rows[0]?.id || currentPurchaseResponse.id);
    } else {
      const inserted = await client.query(
        `INSERT INTO public.supplier_rfq_responses
           (company_id, rfq_id, supplier_id, currency, quoted_total, payment_terms, notes, submitted_at, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'submitted', NULL, NULL)
         RETURNING id::text`,
        [companyId, purchaseRfqId, supplierId, currency, totalAmount, terms, promisedDate ? 'Promised delivery: ' + promisedDate : null],
      );
      responseId = String(inserted.rows[0].id);
    }

    await client.query(
      `UPDATE public.supplier_rfq_response_lines
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE company_id = $1 AND rfq_id = $2 AND response_id = $3 AND deleted_at IS NULL`,
      [companyId, purchaseRfqId, responseId],
    );

    const insertedLines = await client.query(
      `INSERT INTO public.supplier_rfq_response_lines
         (company_id, rfq_id, response_id, rfq_line_id, quantity, unit_cost, line_total, notes, created_by, updated_by)
       SELECT $1, $2, $3, source_line.id, source_line.quantity,
              submitted.unit_cost,
              ROUND(source_line.quantity * submitted.unit_cost, 2),
              NULL, NULL, NULL
       FROM jsonb_to_recordset($4::jsonb) AS submitted(rfq_line_id UUID, unit_cost NUMERIC(19,4))
       JOIN public.supplier_rfq_lines source_line
         ON source_line.id = submitted.rfq_line_id
        AND source_line.company_id = $1
        AND source_line.rfq_id = $2
        AND source_line.deleted_at IS NULL
       RETURNING id`,
      [companyId, purchaseRfqId, responseId, pricingJson],
    );
    if (insertedLines.rowCount !== linePrices.length) {
      throw new VendorPortalError('INVALID_INPUT', 'The quotation lines changed before submission. Refresh the invitation and try again.');
    }

    const currentPortalResponse = await client.query(
      `SELECT id::text, status
       FROM public.vendor_portal_rfq_responses
       WHERE company_id = $1 AND portal_rfq_id = $2 AND deleted_at IS NULL
       ORDER BY updated_at DESC, id DESC
       LIMIT 1
       FOR UPDATE`,
      [companyId, rfqId],
    );
    const currentPortal = currentPortalResponse.rows[0] as Record<string, unknown> | undefined;
    if (currentPortal && ['accepted', 'rejected'].includes(String(currentPortal.status))) {
      throw new VendorPortalError('RESPONSE_LOCKED', 'The procurement team has already decided on this portal response.');
    }

    if (currentPortal) {
      await client.query(
        `UPDATE public.vendor_portal_rfq_responses
         SET amount = $3, currency = $4, promised_date = $5, terms = $6,
             purchase_rfq_id = $7, purchase_response_id = $8,
             status = 'submitted', submitted_at = NOW(),
             updated_by = NULL, updated_at = NOW()
         WHERE id = $1 AND company_id = $2 AND portal_rfq_id = $9 AND deleted_at IS NULL`,
        [currentPortal.id, companyId, totalAmount, currency, promisedDate, terms, purchaseRfqId, responseId, rfqId],
      );
    } else {
      await client.query(
        `INSERT INTO public.vendor_portal_rfq_responses
           (company_id, portal_rfq_id, purchase_rfq_id, purchase_response_id, amount, currency, promised_date, terms, submitted_at, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'submitted', NULL, NULL)`,
        [companyId, rfqId, purchaseRfqId, responseId, totalAmount, currency, promisedDate, terms],
      );
    }

    await client.query(
      `UPDATE public.vendor_portal_rfqs
       SET status = 'responded',
           opened_at = COALESCE(opened_at, NOW()),
           responded_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND vendor_account_id = $3 AND deleted_at IS NULL`,
      [rfqId, companyId, account.id],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  await recordWorkspaceAuditEvent({
    tenantId,
    companyId: String(account.company_id),
    actorType: 'integration',
    action: 'vendor_portal.rfq_response.submit',
    eventType: 'vendor_portal.rfq_response.submitted',
    category: 'procurement',
    severity: 'info',
    summary: 'Supplier submitted a quotation response into the Purchase RFQ and response ledger.',
    resourceType: 'supplier_rfq_response',
    resourceId: responseId,
    module: 'vendor_portal',
    result: 'success',
    metadata: { rfqNumber, totalAmount },
  }).catch(() => undefined);

  return { responseId, rfqId, rfqNumber, totalAmount, status: 'submitted' as const };
}
