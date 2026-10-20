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

class MergeHistoryError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'MergeHistoryError';
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
function contextStatus(error: EnterpriseModuleError) {
  return error.code === 'MODULE_PERMISSION_REQUIRED' || error.code === 'TABLE_NOT_ALLOWED' ? 403
    : error.code === 'MODULE_NOT_INSTALLED' || error.code === 'RECORD_NOT_FOUND' ? 404
      : error.code === 'WORKSPACE_SUSPENDED' ? 402
        : error.code === 'WORKSPACE_CONTEXT_CHANGED' ? 409
          : error.code === 'TABLE_NOT_READY' ? 503 : 400;
}
function handleError(error: unknown) {
  if (error instanceof MergeHistoryError) return json({ success: false, code: error.code, error: error.message }, error.status);
  if (error instanceof EnterpriseModuleError) return json({ success: false, code: error.code, error: error.message }, contextStatus(error));
  if (error instanceof CompanyContextError || error instanceof TenantContextError) {
    const statuses: Record<string, number> = {
      UNAUTHENTICATED: 401, NO_WORKSPACE_SELECTED: 409, WORKSPACE_ACCESS_DENIED: 403,
      WORKSPACE_DATABASE_UNAVAILABLE: 503, NO_COMPANY_ACCESS: 403, INVALID_COMPANY_ID: 400,
      COMPANY_ACCESS_DENIED: 403, EMPTY_COMPANY_SELECTION: 400, TOO_MANY_COMPANIES: 400,
      SESSION_UPDATE_FAILED: 500,
    };
    return json({ success: false, code: error.code, error: error.message }, statuses[error.code] ?? 500);
  }
  const dbCode = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code) : '';
  if (dbCode === '23505') {
    return json({ success: false, code: 'MERGE_RECOVERY_CONSTRAINT_CONFLICT', error: 'Recovery conflicts with an active CRM uniqueness rule. No changes were retained.' }, 409);
  }
  console.error('[SaMi CRM merge history] request failed:', error);
  return json({ success: false, code: 'CRM_MERGE_HISTORY_FAILED', error: 'SaMi could not complete the merge-history operation.' }, 500);
}
async function matchingContext(mode: 'view' | 'edit') {
  const [accounts, contacts, interactions] = await Promise.all([
    requireEnterpriseModuleTableContext('crm', 'crm_accounts', mode),
    requireEnterpriseModuleTableContext('crm', 'crm_contacts', mode),
    requireEnterpriseModuleTableContext('crm', 'crm_interactions', mode),
  ]);
  if (
    accounts.tenantId !== contacts.tenantId || accounts.companyId !== contacts.companyId || accounts.userId !== contacts.userId ||
    accounts.tenantId !== interactions.tenantId || accounts.companyId !== interactions.companyId || accounts.userId !== interactions.userId
  ) throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'The CRM workspace context changed. Refresh and try again.');
  return accounts;
}
function historyLabel(type: 'account' | 'contact', snapshot: Record<string, unknown>) {
  if (type === 'account') return String(snapshot.account_name || 'Unnamed account');
  return [snapshot.first_name, snapshot.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' ') || 'Unnamed contact';
}
function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)) : [];
}
function millis(value: unknown) {
  const result = value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
  return Number.isFinite(result) ? result : null;
}
function editedAfterMerge(value: unknown, mergedAt: unknown) {
  const updated = millis(value);
  const merged = millis(mergedAt);
  return updated === null || merged === null || updated > merged;
}
function safeSnapshotForHistory(type: 'account' | 'contact', row: Record<string, unknown>) {
  const source = (row.source_snapshot && typeof row.source_snapshot === 'object' ? row.source_snapshot : {}) as Record<string, unknown>;
  const movedContacts = asArray(row.moved_contact_snapshots);
  const movedInteractions = asArray(row.moved_interaction_snapshots);
  if (Number(row.recovery_snapshot_version || 0) !== 1 || !source.id) return false;
  if (type === 'account') {
    return movedContacts.length === Number(row.moved_contact_count || 0) &&
      movedInteractions.length === Number(row.moved_interaction_count || 0);
  }
  return movedInteractions.length >= Number(row.moved_interaction_count || 0);
}

export async function GET() {
  try {
    const context = await matchingContext('view');
    const [accounts, contacts] = await Promise.all([
      context.pool.query(
        "SELECT id, survivor_account_id, source_account_id, survivor_snapshot, source_snapshot, moved_contact_count, moved_interaction_count, moved_contact_snapshots, moved_interaction_snapshots, recovery_snapshot_version, merged_by, merged_at, reversed_at, reversed_by FROM public.crm_account_merge_history WHERE company_id = $1 ORDER BY merged_at DESC LIMIT 100",
        [context.companyId],
      ),
      context.pool.query(
        "SELECT id, survivor_contact_id, source_contact_id, survivor_snapshot, source_snapshot, merged_account_id, moved_interaction_count, moved_interaction_snapshots, recovery_snapshot_version, merged_by, merged_at, reversed_at, reversed_by FROM public.crm_contact_merge_history WHERE company_id = $1 ORDER BY merged_at DESC LIMIT 100",
        [context.companyId],
      ),
    ]);
    const shape = (type: 'account' | 'contact', row: Record<string, unknown>) => {
      const source = (row.source_snapshot && typeof row.source_snapshot === 'object' ? row.source_snapshot : {}) as Record<string, unknown>;
      const survivor = (row.survivor_snapshot && typeof row.survivor_snapshot === 'object' ? row.survivor_snapshot : {}) as Record<string, unknown>;
      return {
        id: row.id, type,
        survivorId: type === 'account' ? row.survivor_account_id : row.survivor_contact_id,
        sourceId: type === 'account' ? row.source_account_id : row.source_contact_id,
        survivorName: historyLabel(type, survivor), sourceName: historyLabel(type, source),
        movedContactCount: Number(row.moved_contact_count || 0),
        movedInteractionCount: Number(row.moved_interaction_count || 0),
        mergedBy: row.merged_by, mergedAt: row.merged_at,
        reversedBy: row.reversed_by, reversedAt: row.reversed_at,
        recoverable: !row.reversed_at && safeSnapshotForHistory(type, row),
      };
    };
    const entries = [
      ...accounts.rows.map((r: Record<string, unknown>) => shape('account', r)),
      ...contacts.rows.map((r: Record<string, unknown>) => shape('contact', r)),
    ].sort((a, b) => (millis(b.mergedAt) || 0) - (millis(a.mergedAt) || 0));
    return json({ success: true, entries });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, code: 'CROSS_ORIGIN_REQUEST', error: 'This action must come from the SaMi workspace.' }, 403);
  let client: PoolClient | null = null;
  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new MergeHistoryError('REQUEST_TOO_LARGE', 'The recovery request is too large.', 413);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid body');
      body = parsed as Record<string, unknown>;
    } catch {
      throw new MergeHistoryError('INVALID_INPUT', 'Send a valid JSON recovery request.');
    }
    const type = body.type === 'account' || body.type === 'contact' ? body.type : null;
    const historyId = typeof body.historyId === 'string' ? body.historyId.trim() : '';
    const confirmation = typeof body.confirmSourceName === 'string' ? body.confirmSourceName.trim().slice(0, 320) : '';
    if (!type || !UUID_RE.test(historyId)) throw new MergeHistoryError('INVALID_INPUT', 'Choose a valid merge-history record.');
    if (!confirmation) throw new MergeHistoryError('CONFIRMATION_REQUIRED', 'Confirm the exact source record name before recovery.');

    const context = await matchingContext('edit');
    client = await context.pool.connect();
    await client.query('BEGIN');
    const table = type === 'account' ? 'crm_account_merge_history' : 'crm_contact_merge_history';
    const rowResult = await client.query("SELECT * FROM public." + table + " WHERE company_id = $1 AND id = $2 FOR UPDATE", [context.companyId, historyId]);
    const history = rowResult.rows[0] as Record<string, unknown> | undefined;
    if (!history) throw new MergeHistoryError('MERGE_HISTORY_NOT_FOUND', 'The merge-history record was not found in this company.', 404);
    if (history.reversed_at) throw new MergeHistoryError('ALREADY_RECOVERED', 'This merge has already been recovered.', 409);
    const sourceSnapshot = (history.source_snapshot && typeof history.source_snapshot === 'object' ? history.source_snapshot : {}) as Record<string, unknown>;
    const survivorSnapshot = (history.survivor_snapshot && typeof history.survivor_snapshot === 'object' ? history.survivor_snapshot : {}) as Record<string, unknown>;
    if (historyLabel(type, sourceSnapshot) !== confirmation) throw new MergeHistoryError('SOURCE_NAME_CONFIRMATION_MISMATCH', 'The source name confirmation did not match. No records were changed.', 409);
    if (!safeSnapshotForHistory(type, history)) throw new MergeHistoryError('RECOVERY_NOT_AVAILABLE', 'This merge does not have a complete relationship snapshot. It remains in history, but automatic recovery is unavailable.', 409);

    if (type === 'account') {
      const sourceId = String(history.source_account_id);
      const survivorId = String(history.survivor_account_id);
      const accountRows = await client.query("SELECT * FROM public.crm_accounts WHERE company_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE", [context.companyId, [sourceId, survivorId]]);
      if (accountRows.rows.length !== 2) throw new MergeHistoryError('RECOVERY_RECORD_MISSING', 'One of the original accounts no longer exists in this company.', 409);
      const source = accountRows.rows.find((r: Record<string, unknown>) => String(r.id) === sourceId) as Record<string, unknown>;
      const survivor = accountRows.rows.find((r: Record<string, unknown>) => String(r.id) === survivorId) as Record<string, unknown>;
      if (!source.deleted_at || survivor.deleted_at) throw new MergeHistoryError('RECOVERY_STATE_CHANGED', 'The account active/retired state has changed since the merge. Recovery was blocked.', 409);
      if (editedAfterMerge(source.updated_at, history.merged_at) || editedAfterMerge(survivor.updated_at, history.merged_at)) {
        throw new MergeHistoryError('RECOVERY_STALE_RECORD', 'An account has changed since the merge. Recovery was blocked to avoid overwriting newer work.', 409);
      }
      const contactSnapshots = asArray(history.moved_contact_snapshots);
      const interactionSnapshots = asArray(history.moved_interaction_snapshots);
      if (contactSnapshots.length) {
        const ids = contactSnapshots.map((s) => String(s.id || ''));
        const rows = await client.query("SELECT id, account_id, updated_at, deleted_at FROM public.crm_contacts WHERE company_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE", [context.companyId, ids]);
        if (rows.rows.length !== ids.length || rows.rows.some((r: Record<string, unknown>) => r.deleted_at || String(r.account_id) !== survivorId || editedAfterMerge(r.updated_at, history.merged_at))) {
          throw new MergeHistoryError('RECOVERY_RELATIONSHIPS_CHANGED', 'One or more moved contacts were changed, deleted or reassigned. Recovery was blocked.', 409);
        }
      }
      if (interactionSnapshots.length) {
        const ids = interactionSnapshots.map((s) => String(s.id || ''));
        const rows = await client.query("SELECT id, account_id, updated_at, deleted_at FROM public.crm_interactions WHERE company_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE", [context.companyId, ids]);
        if (rows.rows.length !== ids.length || rows.rows.some((r: Record<string, unknown>) => r.deleted_at || String(r.account_id) !== survivorId || editedAfterMerge(r.updated_at, history.merged_at))) {
          throw new MergeHistoryError('RECOVERY_RELATIONSHIPS_CHANGED', 'One or more moved interactions were changed, deleted or reassigned. Recovery was blocked.', 409);
        }
      }
      const restoreAccount = async (id: string, snap: Record<string, unknown>, restoreDeleted: boolean) => client!.query(
        "UPDATE public.crm_accounts SET account_name=$3, account_type=$4, lifecycle_stage=$5, source=$6, website=$7, industry=$8, email=$9, phone=$10, invoicing_customer_id=$11::uuid, employee_count=$12::integer, annual_revenue=$13::numeric, owner_user_id=$14::uuid, notes=$15, deleted_at=CASE WHEN $16::boolean THEN NULL ELSE deleted_at END, updated_by=$17, updated_at=NOW() WHERE company_id=$1 AND id=$2",
        [context.companyId,id,snap.account_name,snap.account_type,snap.lifecycle_stage,snap.source,snap.website,snap.industry,snap.email,snap.phone,snap.invoicing_customer_id,snap.employee_count,snap.annual_revenue,snap.owner_user_id,snap.notes,restoreDeleted,context.userId],
      );
      await restoreAccount(survivorId, survivorSnapshot, false);
      await restoreAccount(sourceId, sourceSnapshot, true);
      await client.query(
        "UPDATE public.crm_contacts c SET account_id=s.account_id, is_primary=s.is_primary, updated_by=$3, updated_at=NOW() FROM jsonb_to_recordset($2::jsonb) AS s(id uuid, account_id uuid, is_primary boolean) WHERE c.company_id=$1 AND c.id=s.id AND c.deleted_at IS NULL",
        [context.companyId, JSON.stringify(contactSnapshots), context.userId],
      );
      await client.query(
        "UPDATE public.crm_interactions i SET account_id=s.account_id, updated_by=$3, updated_at=NOW() FROM jsonb_to_recordset($2::jsonb) AS s(id uuid, account_id uuid) WHERE i.company_id=$1 AND i.id=s.id AND i.deleted_at IS NULL",
        [context.companyId, JSON.stringify(interactionSnapshots), context.userId],
      );
    } else {
      const sourceId = String(history.source_contact_id);
      const survivorId = String(history.survivor_contact_id);
      const contactRows = await client.query("SELECT * FROM public.crm_contacts WHERE company_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE", [context.companyId,[sourceId,survivorId]]);
      if (contactRows.rows.length !== 2) throw new MergeHistoryError('RECOVERY_RECORD_MISSING', 'One of the original contacts no longer exists in this company.', 409);
      const source = contactRows.rows.find((r: Record<string, unknown>) => String(r.id) === sourceId) as Record<string, unknown>;
      const survivor = contactRows.rows.find((r: Record<string, unknown>) => String(r.id) === survivorId) as Record<string, unknown>;
      if (!source.deleted_at || survivor.deleted_at) throw new MergeHistoryError('RECOVERY_STATE_CHANGED', 'The contact active/retired state has changed since the merge. Recovery was blocked.', 409);
      if (editedAfterMerge(source.updated_at, history.merged_at) || editedAfterMerge(survivor.updated_at, history.merged_at)) {
        throw new MergeHistoryError('RECOVERY_STALE_RECORD', 'A contact has changed since the merge. Recovery was blocked to avoid overwriting newer work.', 409);
      }
      const interactionSnapshots = asArray(history.moved_interaction_snapshots);
      if (interactionSnapshots.length) {
        const ids = interactionSnapshots.map((s) => String(s.id || ''));
        const rows = await client.query("SELECT id, contact_id, account_id, updated_at, deleted_at FROM public.crm_interactions WHERE company_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE", [context.companyId, ids]);
        if (rows.rows.length !== ids.length || rows.rows.some((r: Record<string, unknown>) =>
          r.deleted_at || String(r.contact_id) !== survivorId || editedAfterMerge(r.updated_at, history.merged_at) ||
          (history.merged_account_id ? String(r.account_id) !== String(history.merged_account_id) : r.account_id !== null))) {
          throw new MergeHistoryError('RECOVERY_RELATIONSHIPS_CHANGED', 'One or more related interactions were changed, deleted or reassigned. Recovery was blocked.', 409);
        }
      }
      const restoreContact = async (id: string, snap: Record<string, unknown>, restoreDeleted: boolean) => client!.query(
        "UPDATE public.crm_contacts SET account_id=$3::uuid, first_name=$4, last_name=$5, job_title=$6, department=$7, email=$8, phone=$9, mobile=$10, contact_role=$11, preferred_channel=$12, is_primary=$13, do_not_contact=$14, owner_user_id=$15::uuid, notes=$16, deleted_at=CASE WHEN $17::boolean THEN NULL ELSE deleted_at END, updated_by=$18, updated_at=NOW() WHERE company_id=$1 AND id=$2",
        [context.companyId,id,snap.account_id,snap.first_name,snap.last_name,snap.job_title,snap.department,snap.email,snap.phone,snap.mobile,snap.contact_role,snap.preferred_channel,snap.is_primary,snap.do_not_contact,snap.owner_user_id,snap.notes,restoreDeleted,context.userId],
      );
      await restoreContact(survivorId, survivorSnapshot, false);
      await restoreContact(sourceId, sourceSnapshot, true);
      await client.query(
        "UPDATE public.crm_interactions i SET contact_id=s.contact_id, account_id=s.account_id, updated_by=$3, updated_at=NOW() FROM jsonb_to_recordset($2::jsonb) AS s(id uuid, contact_id uuid, account_id uuid) WHERE i.company_id=$1 AND i.id=s.id AND i.deleted_at IS NULL",
        [context.companyId, JSON.stringify(interactionSnapshots), context.userId],
      );
    }

    await client.query("UPDATE public." + table + " SET reversed_at=NOW(), reversed_by=$3 WHERE company_id=$1 AND id=$2 AND reversed_at IS NULL", [context.companyId,historyId,context.userId]);
    await client.query('COMMIT');
    return json({ success: true, type, historyId, message: 'The original CRM record and captured relationships were restored. The audit record has been marked recovered.' });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
    }
    return handleError(error);
  } finally {
    client?.release();
  }
}
