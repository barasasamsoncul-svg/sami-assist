import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError, requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 8 * 1024;

class AccountMergeError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'AccountMergeError';
    this.code = code;
    this.status = status;
  }
}
function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
  });
}
function sameOrigin(request: NextRequest) {
  if (request.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
}
function cleanText(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, maximum) : '';
}
async function parseBody(request: NextRequest) {
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new AccountMergeError('REQUEST_TOO_LARGE', 'The account merge request is too large.', 413);
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new AccountMergeError('INVALID_INPUT', 'A valid account merge request is required.');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AccountMergeError) throw error;
    throw new AccountMergeError('INVALID_INPUT', 'Send a valid JSON request.');
  }
}
function textOrNull(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}
function handleError(error: unknown) {
  if (error instanceof AccountMergeError) return json({ success: false, code: error.code, error: error.message }, error.status);
  if (error instanceof EnterpriseModuleError) {
    const status = error.code === 'MODULE_PERMISSION_REQUIRED' || error.code === 'TABLE_NOT_ALLOWED'
      ? 403
      : error.code === 'MODULE_NOT_INSTALLED' || error.code === 'RECORD_NOT_FOUND'
        ? 404
        : error.code === 'WORKSPACE_SUSPENDED'
          ? 402
          : error.code === 'WORKSPACE_CONTEXT_CHANGED'
            ? 409
            : error.code === 'TABLE_NOT_READY' ? 503 : 400;
    return json({ success: false, code: error.code, error: error.message }, status);
  }
  if (error instanceof CompanyContextError || error instanceof TenantContextError) {
    const status = error.code === 'UNAUTHENTICATED' ? 401
      : error.code === 'WORKSPACE_DATABASE_UNAVAILABLE' ? 503 : 403;
    return json({ success: false, code: error.code, error: error.message }, status);
  }
  const databaseCode = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code) : '';
  if (databaseCode === '23505') {
    return json({ success: false, code: 'MERGE_CONSTRAINT_CONFLICT', error: 'This merge conflicts with a CRM uniqueness rule. Refresh the duplicate list and resolve the conflicting fields first.' }, 409);
  }
  console.error('[SaMi CRM account merge] request failed:', error);
  return json({ success: false, code: 'CRM_ACCOUNT_MERGE_FAILED', error: 'SaMi could not merge these accounts.' }, 500);
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return json({ success: false, code: 'CROSS_ORIGIN_REQUEST', error: 'This action must come from the SaMi workspace.' }, 403);
  }
  let client: PoolClient | null = null;
  try {
    const body = await parseBody(request);
    const survivorId = cleanText(body.survivorAccountId, 64);
    const sourceId = cleanText(body.sourceAccountId, 64);
    const confirmSourceName = cleanText(body.confirmSourceAccountName, 255);
    if (!UUID_RE.test(survivorId) || !UUID_RE.test(sourceId) || survivorId === sourceId) {
      throw new AccountMergeError('INVALID_ACCOUNT_IDS', 'Choose two different, valid CRM accounts.');
    }
    if (!confirmSourceName) throw new AccountMergeError('CONFIRMATION_REQUIRED', 'Type the duplicate account name to confirm the merge.');

    const [accountContext, contactContext, interactionContext] = await Promise.all([
      requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'edit'),
      requireEnterpriseModuleTableContext('crm', 'crm_contacts', 'edit'),
      requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'edit'),
    ]);
    if (
      accountContext.tenantId !== contactContext.tenantId ||
      accountContext.companyId !== contactContext.companyId ||
      accountContext.userId !== contactContext.userId ||
      accountContext.tenantId !== interactionContext.tenantId ||
      accountContext.companyId !== interactionContext.companyId ||
      accountContext.userId !== interactionContext.userId
    ) {
      throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'The CRM workspace context changed. Refresh and try again.');
    }

    client = await accountContext.pool.connect();
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT id, account_name, account_type, lifecycle_stage, source, website, industry,
              email, phone, invoicing_customer_id, employee_count, annual_revenue,
              owner_user_id, notes, created_at, updated_at
       FROM public.crm_accounts
       WHERE company_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL
       ORDER BY id
       FOR UPDATE`,
      [accountContext.companyId, [survivorId, sourceId]],
    );
    if (selected.rows.length !== 2) {
      throw new AccountMergeError('CRM_ACCOUNT_NOT_FOUND', 'One or both accounts are no longer active in this company. Refresh the duplicate list.', 404);
    }
    const survivor = selected.rows.find((row: Record<string, unknown>) => String(row.id) === survivorId) as Record<string, unknown> | undefined;
    const source = selected.rows.find((row: Record<string, unknown>) => String(row.id) === sourceId) as Record<string, unknown> | undefined;
    if (!survivor || !source) throw new AccountMergeError('CRM_ACCOUNT_NOT_FOUND', 'The selected account was not found.', 404);
    if (String(source.account_name) !== confirmSourceName) {
      throw new AccountMergeError('SOURCE_NAME_CONFIRMATION_MISMATCH', 'The confirmation text does not exactly match the duplicate account name. No records were changed.', 409);
    }

    const sharedEmail = Boolean(textOrNull(survivor.email)) &&
      String(survivor.email).trim().toLowerCase() === String(source.email || '').trim().toLowerCase();
    const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
    const survivorPhone = digits(survivor.phone);
    const sourcePhone = digits(source.phone);
    const normalizedName = (value: unknown) => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const sharedPhone = Boolean(survivorPhone) && survivorPhone === sourcePhone;
    const sharedName = Boolean(normalizedName(survivor.account_name)) && normalizedName(survivor.account_name) === normalizedName(source.account_name);
    if (!sharedEmail && !sharedPhone && !sharedName) {
      throw new AccountMergeError('ACCOUNTS_NOT_DUPLICATES', 'These accounts no longer match the duplicate-detection rules. Refresh and review the records.', 409);
    }

    const survivorBillingId = textOrNull(survivor.invoicing_customer_id);
    const sourceBillingId = textOrNull(source.invoicing_customer_id);
    if (survivorBillingId && sourceBillingId && survivorBillingId !== sourceBillingId) {
      throw new AccountMergeError('BILLING_IDENTITY_CONFLICT', 'Both accounts are linked to different Invoicing customers. Merge is blocked; resolve the billing identity first.', 409);
    }

    await client.query(
      'SELECT id FROM public.crm_contacts WHERE company_id = $1 AND account_id = $2 AND deleted_at IS NULL ORDER BY id FOR UPDATE',
      [accountContext.companyId, sourceId],
    );
    await client.query(
      'SELECT id FROM public.crm_interactions WHERE company_id = $1 AND account_id = $2 AND deleted_at IS NULL ORDER BY id FOR UPDATE',
      [accountContext.companyId, sourceId],
    );

    const contactsCount = await client.query(
      'SELECT COUNT(*)::int AS count FROM public.crm_contacts WHERE company_id = $1 AND account_id = $2 AND deleted_at IS NULL',
      [accountContext.companyId, sourceId],
    );
    const interactionsCount = await client.query(
      'SELECT COUNT(*)::int AS count FROM public.crm_interactions WHERE company_id = $1 AND account_id = $2 AND deleted_at IS NULL',
      [accountContext.companyId, sourceId],
    );
    const movedContactCount = Number(contactsCount.rows[0]?.count || 0);
    const movedInteractionCount = Number(interactionsCount.rows[0]?.count || 0);
    const contactSnapshotsResult = await client.query(
      "SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'account_id', account_id, 'is_primary', is_primary, 'updated_at', updated_at, 'updated_by', updated_by) ORDER BY id), '[]'::jsonb) AS snapshots FROM public.crm_contacts WHERE company_id = $1 AND account_id = $2 AND deleted_at IS NULL",
      [accountContext.companyId, sourceId],
    );
    const interactionSnapshotsResult = await client.query(
      "SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'account_id', account_id, 'updated_at', updated_at, 'updated_by', updated_by) ORDER BY id), '[]'::jsonb) AS snapshots FROM public.crm_interactions WHERE company_id = $1 AND account_id = $2 AND deleted_at IS NULL",
      [accountContext.companyId, sourceId],
    );
    const movedContactSnapshots = contactSnapshotsResult.rows[0]?.snapshots || [];
    const movedInteractionSnapshots = interactionSnapshotsResult.rows[0]?.snapshots || [];
    const hasPrimaryContact = await client.query(
      'SELECT 1 FROM public.crm_contacts WHERE company_id = $1 AND account_id = $2 AND deleted_at IS NULL AND is_primary = TRUE LIMIT 1',
      [accountContext.companyId, survivorId],
    );
    const mergedNotes = [
      String(survivor.notes || '').trim(),
      String(source.notes || '').trim()
        ? '[Notes retained from merged duplicate account "' + String(source.account_name).replace(/"/g, '\\"') + '"]\n' + String(source.notes).trim()
        : '',
    ].filter(Boolean).join('\n\n') || null;
    const mergedOwnerId = textOrNull(survivor.owner_user_id) || textOrNull(source.owner_user_id);

    await client.query(
      `UPDATE public.crm_contacts
       SET account_id = $3,
           is_primary = CASE WHEN $4::boolean THEN FALSE ELSE is_primary END,
           updated_by = $5,
           updated_at = NOW()
       WHERE company_id = $1 AND account_id = $2 AND deleted_at IS NULL`,
      [accountContext.companyId, sourceId, survivorId, hasPrimaryContact.rows.length > 0, accountContext.userId],
    );
    await client.query(
      `UPDATE public.crm_interactions
       SET account_id = $3, updated_by = $4, updated_at = NOW()
       WHERE company_id = $1 AND account_id = $2 AND deleted_at IS NULL`,
      [accountContext.companyId, sourceId, survivorId, accountContext.userId],
    );

    await client.query(
      `UPDATE public.crm_accounts
       SET deleted_at = NOW(), updated_by = $3, updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [sourceId, accountContext.companyId, accountContext.userId],
    );
    await client.query(
      `UPDATE public.crm_accounts SET
         source = COALESCE(NULLIF(BTRIM(source), ''), $3),
         website = COALESCE(NULLIF(BTRIM(website), ''), $4),
         industry = COALESCE(NULLIF(BTRIM(industry), ''), $5),
         email = COALESCE(NULLIF(BTRIM(email), ''), $6),
         phone = COALESCE(NULLIF(BTRIM(phone), ''), $7),
         invoicing_customer_id = COALESCE(invoicing_customer_id, $8::uuid),
         employee_count = COALESCE(employee_count, $9::integer),
         annual_revenue = CASE WHEN COALESCE(annual_revenue, 0) <= 0 THEN COALESCE($10::numeric, 0) ELSE annual_revenue END,
         owner_user_id = COALESCE(owner_user_id, $11::uuid),
         notes = $12,
         updated_by = $13,
         updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [
        survivorId, accountContext.companyId,
        textOrNull(survivor.source) || textOrNull(source.source),
        textOrNull(survivor.website) || textOrNull(source.website),
        textOrNull(survivor.industry) || textOrNull(source.industry),
        textOrNull(survivor.email) || textOrNull(source.email),
        textOrNull(survivor.phone) || textOrNull(source.phone),
        sourceBillingId,
        survivor.employee_count ?? source.employee_count,
        source.annual_revenue,
        mergedOwnerId,
        mergedNotes,
        accountContext.userId,
      ],
    );

    await client.query(
      `INSERT INTO public.crm_account_merge_history (
         company_id, survivor_account_id, source_account_id,
         survivor_snapshot, source_snapshot, moved_contact_count,
         moved_interaction_count, moved_contact_snapshots, moved_interaction_snapshots,
         recovery_snapshot_version, merged_by
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, 1, $10)`,
      [
        accountContext.companyId, survivorId, sourceId,
        JSON.stringify(survivor), JSON.stringify(source),
        movedContactCount, movedInteractionCount,
        JSON.stringify(movedContactSnapshots), JSON.stringify(movedInteractionSnapshots), accountContext.userId,
      ],
    );

    await client.query('COMMIT');
    return json({
      success: true,
      survivorAccountId: survivorId,
      mergedAccountId: sourceId,
      movedContactCount,
      movedInteractionCount,
      ownerPreserved: Boolean(mergedOwnerId),
      message: 'Accounts merged. CRM contacts and interactions now belong to the surviving account; Sales data was not modified.',
    });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
    }
    return handleError(error);
  } finally {
    client?.release();
  }
}
