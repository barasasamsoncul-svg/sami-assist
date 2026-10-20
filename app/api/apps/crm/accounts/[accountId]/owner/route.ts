import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError, requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { buildWorkspaceMemberDirectory } from '@/lib/services/member-directory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4096;

class OwnerAssignmentError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'OwnerAssignmentError';
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
async function parseBody(request: NextRequest) {
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new OwnerAssignmentError('REQUEST_TOO_LARGE', 'The owner assignment request is too large.', 413);
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new OwnerAssignmentError('INVALID_INPUT', 'A valid owner assignment is required.');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof OwnerAssignmentError) throw error;
    throw new OwnerAssignmentError('INVALID_INPUT', 'Send a valid JSON request.');
  }
}
function handleError(error: unknown) {
  if (error instanceof OwnerAssignmentError) {
    return json({ success: false, code: error.code, error: error.message }, error.status);
  }
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
  console.error('[SaMi CRM owner assignment] request failed:', error);
  return json({ success: false, code: 'CRM_OWNER_ASSIGNMENT_FAILED', error: 'SaMi could not update this account owner.' }, 500);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  if (!sameOrigin(request)) {
    return json({ success: false, code: 'CROSS_ORIGIN_REQUEST', error: 'This action must come from the SaMi workspace.' }, 403);
  }

  let client: Awaited<ReturnType<Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>['pool']['connect']>> | null = null;
  try {
    const { accountId } = await params;
    if (!UUID_RE.test(accountId)) throw new OwnerAssignmentError('INVALID_ACCOUNT_ID', 'Choose a valid CRM account.');
    const body = await parseBody(request);
    const rawOwnerId = body.ownerUserId;
    let ownerUserId: string | null;
    if (rawOwnerId === null || rawOwnerId === '' || rawOwnerId === undefined) {
      ownerUserId = null;
    } else if (typeof rawOwnerId === 'string' && UUID_RE.test(rawOwnerId.trim())) {
      ownerUserId = rawOwnerId.trim();
    } else {
      throw new OwnerAssignmentError('INVALID_OWNER', 'Choose an active owner from this company.');
    }

    const context = await requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'edit');
    if (ownerUserId) {
      const directory = await buildWorkspaceMemberDirectory(context.tenantId);
      const eligible = directory.members.some((member) =>
        member.userId === ownerUserId &&
        member.accountStatus === 'active' &&
        member.membershipStatus === 'active' &&
        member.canEnterWorkspace &&
        member.memberType === 'internal' &&
        member.companies.some((company) => company.id === context.companyId),
      );
      if (!eligible) throw new OwnerAssignmentError('OWNER_NOT_ASSIGNABLE', 'This user is not an active member with access to the current company.', 409);
    }

    client = await context.pool.connect();
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, owner_user_id FROM public.crm_accounts WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL FOR UPDATE',
      [accountId, context.companyId],
    );
    if (currentResult.rows.length !== 1) {
      await client.query('ROLLBACK');
      return json({ success: false, code: 'CRM_ACCOUNT_NOT_FOUND', error: 'This account was not found in the current company or is no longer active.' }, 404);
    }
    const previousOwnerId = currentResult.rows[0].owner_user_id ? String(currentResult.rows[0].owner_user_id) : null;
    if (previousOwnerId === ownerUserId) {
      await client.query('COMMIT');
      return json({ success: true, changed: false, accountId, ownerUserId });
    }

    await client.query(
      'UPDATE public.crm_accounts SET owner_user_id = $3::uuid, updated_by = $4, updated_at = NOW() WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
      [accountId, context.companyId, ownerUserId, context.userId],
    );
    await client.query(
      'INSERT INTO public.crm_account_owner_history (company_id, account_id, previous_owner_user_id, new_owner_user_id, changed_by) VALUES ($1, $2, $3::uuid, $4::uuid, $5)',
      [context.companyId, accountId, previousOwnerId, ownerUserId, context.userId],
    );
    await client.query('COMMIT');
    return json({ success: true, changed: true, accountId, ownerUserId });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
    }
    return handleError(error);
  } finally {
    client?.release();
  }
}
