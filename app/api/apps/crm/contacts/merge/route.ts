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

class ContactMergeError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ContactMergeError';
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
function textOrNull(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}
function contactName(row: Record<string, unknown>) {
  return [textOrNull(row.first_name), textOrNull(row.last_name)].filter(Boolean).join(' ') || 'Unnamed contact';
}
function normalizedName(value: unknown) {
  return typeof value === 'string' ? value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '';
}
function normalizedEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}
function normalizedPhone(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}
function handleError(error: unknown) {
  if (error instanceof ContactMergeError) return json({ success: false, code: error.code, error: error.message }, error.status);
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
    const statuses: Record<string, number> = {
      UNAUTHENTICATED: 401, NO_WORKSPACE_SELECTED: 409, WORKSPACE_ACCESS_DENIED: 403,
      WORKSPACE_DATABASE_UNAVAILABLE: 503, NO_COMPANY_ACCESS: 403, INVALID_COMPANY_ID: 400,
      COMPANY_ACCESS_DENIED: 403, EMPTY_COMPANY_SELECTION: 400, TOO_MANY_COMPANIES: 400,
      SESSION_UPDATE_FAILED: 500,
    };
    return json({ success: false, code: error.code, error: error.message }, statuses[error.code] ?? 500);
  }
  const databaseCode = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code) : '';
  if (databaseCode === '23505') {
    return json({ success: false, code: 'MERGE_CONSTRAINT_CONFLICT', error: 'This merge conflicts with an active CRM uniqueness rule. Refresh the duplicate list and resolve the conflicting record first.' }, 409);
  }
  console.error('[SaMi CRM contact merge] request failed:', error);
  return json({ success: false, code: 'CRM_CONTACT_MERGE_FAILED', error: 'SaMi could not merge these contacts.' }, 500);
}
async function parseBody(request: NextRequest) {
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new ContactMergeError('REQUEST_TOO_LARGE', 'The contact merge request is too large.', 413);
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ContactMergeError('INVALID_INPUT', 'A valid contact merge request is required.');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ContactMergeError) throw error;
    throw new ContactMergeError('INVALID_INPUT', 'Send a valid JSON request.');
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return json({ success: false, code: 'CROSS_ORIGIN_REQUEST', error: 'This action must come from the SaMi workspace.' }, 403);
  }

  let client: PoolClient | null = null;
  try {
    const body = await parseBody(request);
    const survivorId = cleanText(body.survivorContactId, 64);
    const sourceId = cleanText(body.sourceContactId, 64);
    const confirmation = cleanText(body.confirmSourceContactName, 320);
    if (!UUID_RE.test(survivorId) || !UUID_RE.test(sourceId) || survivorId === sourceId) {
      throw new ContactMergeError('INVALID_CONTACT_IDS', 'Choose two different, valid CRM contacts.');
    }
    if (!confirmation) {
      throw new ContactMergeError('CONFIRMATION_REQUIRED', 'Type the duplicate contact name to confirm the merge.');
    }

    const [contactContext, interactionContext] = await Promise.all([
      requireEnterpriseModuleTableContext('crm', 'crm_contacts', 'edit'),
      requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'edit'),
    ]);
    if (
      contactContext.tenantId !== interactionContext.tenantId ||
      contactContext.companyId !== interactionContext.companyId ||
      contactContext.userId !== interactionContext.userId
    ) {
      throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'The CRM workspace context changed. Refresh and try again.');
    }

    client = await contactContext.pool.connect();
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT id, account_id, first_name, last_name, job_title, department, email,
              phone, mobile, contact_role, preferred_channel, is_primary, do_not_contact,
              owner_user_id, notes, created_at, updated_at
       FROM public.crm_contacts
       WHERE company_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL
       ORDER BY id
       FOR UPDATE`,
      [contactContext.companyId, [survivorId, sourceId]],
    );
    if (selected.rows.length !== 2) {
      throw new ContactMergeError('CRM_CONTACT_NOT_FOUND', 'One or both contacts are no longer active in this company. Refresh the duplicate list.', 404);
    }

    const survivor = selected.rows.find((row: Record<string, unknown>) => String(row.id) === survivorId) as Record<string, unknown> | undefined;
    const source = selected.rows.find((row: Record<string, unknown>) => String(row.id) === sourceId) as Record<string, unknown> | undefined;
    if (!survivor || !source) {
      throw new ContactMergeError('CRM_CONTACT_NOT_FOUND', 'The selected contact was not found.', 404);
    }
    if (contactName(source) !== confirmation) {
      throw new ContactMergeError('SOURCE_NAME_CONFIRMATION_MISMATCH', 'The confirmation text does not exactly match the duplicate contact name. No records were changed.', 409);
    }

    const survivorEmail = normalizedEmail(survivor.email);
    const sourceEmail = normalizedEmail(source.email);
    const survivorPhone = normalizedPhone(textOrNull(survivor.phone) || textOrNull(survivor.mobile));
    const sourcePhone = normalizedPhone(textOrNull(source.phone) || textOrNull(source.mobile));
    const survivorName = normalizedName([survivor.first_name, survivor.last_name].filter(Boolean).join(' '));
    const sourceName = normalizedName([source.first_name, source.last_name].filter(Boolean).join(' '));
    const sharedEmail = Boolean(survivorEmail) && survivorEmail === sourceEmail;
    const sharedPhone = Boolean(survivorPhone) && survivorPhone === sourcePhone;
    const sameAccountName = Boolean(survivor.account_id) &&
      String(survivor.account_id) === String(source.account_id) &&
      Boolean(survivorName) && survivorName === sourceName;
    if (!sharedEmail && !sharedPhone && !sameAccountName) {
      throw new ContactMergeError('CONTACTS_NOT_DUPLICATES', 'These contacts no longer match the duplicate-detection rules. Refresh and review the records.', 409);
    }

    const survivorAccountId = textOrNull(survivor.account_id);
    const sourceAccountId = textOrNull(source.account_id);
    if (survivorAccountId && sourceAccountId && survivorAccountId !== sourceAccountId) {
      throw new ContactMergeError('CONTACT_ACCOUNT_CONFLICT', 'These contacts belong to different CRM accounts. Resolve the account relationship first; no contact or interaction was changed.', 409);
    }
    const mergedAccountId = survivorAccountId || sourceAccountId;

    if (mergedAccountId) {
      const activeAccount = await client.query(
        'SELECT id FROM public.crm_accounts WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL LIMIT 1',
        [mergedAccountId, contactContext.companyId],
      );
      if (activeAccount.rows.length !== 1) {
        throw new ContactMergeError('CONTACT_ACCOUNT_NOT_ACTIVE', 'The linked account is no longer active. Reassign the contact before merging.', 409);
      }
    }

    const relationshipConflicts = await client.query(
      `SELECT account_id::text AS account_id
       FROM public.crm_interactions
       WHERE company_id = $1
         AND contact_id = ANY($2::uuid[])
         AND deleted_at IS NULL
         AND account_id IS NOT NULL
         AND ($3::uuid IS NULL OR account_id <> $3::uuid)
       LIMIT 1`,
      [contactContext.companyId, [survivorId, sourceId], mergedAccountId],
    );
    if (relationshipConflicts.rows.length > 0) {
      throw new ContactMergeError('CONTACT_INTERACTION_ACCOUNT_CONFLICT', 'One or more CRM interactions are linked to a different account. Resolve those relationships before merging these contacts.', 409);
    }

    const interactionCountResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM public.crm_interactions WHERE company_id = $1 AND contact_id = $2 AND deleted_at IS NULL',
      [contactContext.companyId, sourceId],
    );
    const movedInteractionCount = Number(interactionCountResult.rows[0]?.count || 0);
    const interactionSnapshotsResult = await client.query(
      "SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'contact_id', contact_id, 'account_id', account_id, 'updated_at', updated_at, 'updated_by', updated_by) ORDER BY id), '[]'::jsonb) AS snapshots FROM public.crm_interactions WHERE company_id = $1 AND contact_id = ANY($2::uuid[]) AND deleted_at IS NULL",
      [contactContext.companyId, [survivorId, sourceId]],
    );
    const movedInteractionSnapshots = interactionSnapshotsResult.rows[0]?.snapshots || [];

    let hasOtherPrimary = false;
    if (mergedAccountId) {
      const otherPrimary = await client.query(
        `SELECT 1 FROM public.crm_contacts
         WHERE company_id = $1 AND account_id = $2 AND deleted_at IS NULL
           AND is_primary = TRUE AND id <> ALL($3::uuid[])
         LIMIT 1`,
        [contactContext.companyId, mergedAccountId, [survivorId, sourceId]],
      );
      hasOtherPrimary = otherPrimary.rows.length > 0;
    }

    const mergedNotes = [
      String(survivor.notes || '').trim(),
      String(source.notes || '').trim()
        ? '[Notes retained from merged duplicate contact "' + contactName(source) + '"]\n' + String(source.notes).trim()
        : '',
    ].filter(Boolean).join('\n\n') || null;
    const mergedPrimary = (survivor.is_primary === true || source.is_primary === true) && !hasOtherPrimary;
    const mergedDoNotContact = survivor.do_not_contact === true || source.do_not_contact === true;
    const mergedOwnerId = textOrNull(survivor.owner_user_id) || textOrNull(source.owner_user_id);

    await client.query(
      `UPDATE public.crm_contacts
       SET deleted_at = NOW(), updated_by = $3, updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [sourceId, contactContext.companyId, contactContext.userId],
    );

    await client.query(
      `UPDATE public.crm_interactions
       SET contact_id = $3,
           account_id = COALESCE(account_id, $4::uuid),
           updated_by = $5,
           updated_at = NOW()
       WHERE company_id = $1 AND contact_id = $2 AND deleted_at IS NULL`,
      [contactContext.companyId, sourceId, survivorId, mergedAccountId, contactContext.userId],
    );

    await client.query(
      `UPDATE public.crm_interactions
       SET account_id = COALESCE(account_id, $3::uuid),
           updated_by = $4,
           updated_at = NOW()
       WHERE company_id = $1 AND contact_id = $2 AND deleted_at IS NULL AND account_id IS NULL`,
      [contactContext.companyId, survivorId, mergedAccountId, contactContext.userId],
    );

    await client.query(
      `UPDATE public.crm_contacts SET
         account_id = $3::uuid,
         first_name = COALESCE(NULLIF(BTRIM(first_name), ''), $4),
         last_name = COALESCE(NULLIF(BTRIM(last_name), ''), $5, ''),
         job_title = COALESCE(NULLIF(BTRIM(job_title), ''), $6),
         department = COALESCE(NULLIF(BTRIM(department), ''), $7),
         email = COALESCE(NULLIF(BTRIM(email), ''), $8),
         phone = COALESCE(NULLIF(BTRIM(phone), ''), $9),
         mobile = COALESCE(NULLIF(BTRIM(mobile), ''), $10),
         contact_role = CASE WHEN contact_role = 'other' THEN $11 ELSE contact_role END,
         preferred_channel = CASE WHEN preferred_channel = 'email' AND $12 <> 'email' THEN $12 ELSE preferred_channel END,
         is_primary = $13,
         do_not_contact = $14,
         owner_user_id = COALESCE(owner_user_id, $15::uuid),
         notes = $16,
         updated_by = $17,
         updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [
        survivorId, contactContext.companyId, mergedAccountId,
        source.first_name, source.last_name, textOrNull(source.job_title), textOrNull(source.department),
        textOrNull(source.email), textOrNull(source.phone), textOrNull(source.mobile),
        source.contact_role, source.preferred_channel, mergedPrimary, mergedDoNotContact,
        mergedOwnerId, mergedNotes, contactContext.userId,
      ],
    );

    await client.query(
      `INSERT INTO public.crm_contact_merge_history (
         company_id, survivor_contact_id, source_contact_id, survivor_snapshot,
         source_snapshot, merged_account_id, moved_interaction_count,
         moved_interaction_snapshots, recovery_snapshot_version, merged_by
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::uuid, $7, $8::jsonb, 1, $9)`,
      [
        contactContext.companyId, survivorId, sourceId,
        JSON.stringify(survivor), JSON.stringify(source), mergedAccountId,
        movedInteractionCount, JSON.stringify(movedInteractionSnapshots), contactContext.userId,
      ],
    );

    await client.query('COMMIT');
    return json({
      success: true,
      survivorContactId: survivorId,
      mergedContactId: sourceId,
      mergedAccountId,
      movedInteractionCount,
      doNotContactPreserved: mergedDoNotContact,
      message: 'Contacts merged. Related CRM interactions now point to the surviving contact; account relationships were validated and Sales data was not modified.',
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
