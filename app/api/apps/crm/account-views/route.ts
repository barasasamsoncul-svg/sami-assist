import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError, requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 12 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIFECYCLE_STAGES = new Set(['', 'lead', 'qualified', 'customer', 'inactive']);
const ACCOUNT_TYPES = new Set(['', 'prospect', 'customer', 'partner', 'competitor']);
const ENGAGEMENT_STATES = new Set(['all', 'engaged', 'not_engaged']);

type AccountFilters = {
  search: string;
  lifecycleStage: string;
  accountType: string;
  industry: string;
  source: string;
  ownerUserId: string;
  engagement: string;
};

class AccountViewInputError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'AccountViewInputError';
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
function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : '';
}
function normalizeFilters(input: unknown): AccountFilters {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AccountViewInputError('INVALID_FILTERS', 'Provide valid account segment filters.');
  }
  const value = input as Record<string, unknown>;
  const filters: AccountFilters = {
    search: clean(value.search, 100),
    lifecycleStage: clean(value.lifecycleStage, 30).toLowerCase(),
    accountType: clean(value.accountType, 30).toLowerCase(),
    industry: clean(value.industry, 160),
    source: clean(value.source, 120),
    ownerUserId: clean(value.ownerUserId, 64).toLowerCase(),
    engagement: clean(value.engagement, 30).toLowerCase() || 'all',
  };
  if (!LIFECYCLE_STAGES.has(filters.lifecycleStage)) {
    throw new AccountViewInputError('INVALID_FILTERS', 'Choose a valid lifecycle stage.');
  }
  if (!ACCOUNT_TYPES.has(filters.accountType)) {
    throw new AccountViewInputError('INVALID_FILTERS', 'Choose a valid account type.');
  }
  if (!ENGAGEMENT_STATES.has(filters.engagement)) {
    throw new AccountViewInputError('INVALID_FILTERS', 'Choose a valid engagement segment.');
  }
  if (filters.ownerUserId && filters.ownerUserId !== 'unassigned' && !UUID_RE.test(filters.ownerUserId)) {
    throw new AccountViewInputError('INVALID_FILTERS', 'Choose a valid account owner.');
  }
  return filters;
}
async function parseBody(request: NextRequest) {
  const size = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(size) && size > MAX_BODY_BYTES) {
    throw new AccountViewInputError('REQUEST_TOO_LARGE', 'The saved view request is too large.', 413);
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new AccountViewInputError('INVALID_INPUT', 'A saved view request is required.');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AccountViewInputError) throw error;
    throw new AccountViewInputError('INVALID_INPUT', 'Send a valid JSON request.');
  }
}
function errorResponse(error: unknown) {
  if (error instanceof AccountViewInputError) {
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
            : error.code === 'TABLE_NOT_READY'
              ? 503 : 400;
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
    return json({ success: false, code: 'SAVED_VIEW_NAME_EXISTS', error: 'A saved view with that name already exists.' }, 409);
  }
  console.error('[SaMi CRM account views] request failed:', error);
  return json({ success: false, code: 'CRM_ACCOUNT_VIEWS_FAILED', error: 'SaMi could not complete the saved-view request.' }, 500);
}

export async function GET() {
  try {
    const context = await requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view');
    const result = await context.pool.query(
      'SELECT id, view_name, filters, created_at, updated_at FROM public.crm_account_saved_views ' +
      'WHERE company_id = $1 AND owner_user_id = $2 AND deleted_at IS NULL ' +
      'ORDER BY LOWER(view_name), id LIMIT 100',
      [context.companyId, context.userId],
    );
    return json({ success: true, views: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, code: 'CROSS_ORIGIN_REQUEST', error: 'This action must come from the SaMi workspace.' }, 403);
  try {
    const body = await parseBody(request);
    const name = clean(body.name, 80);
    if (name.length < 2) throw new AccountViewInputError('INVALID_NAME', 'Saved view names must contain at least two characters.');
    const filters = normalizeFilters(body.filters);
    const context = await requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view');
    const created = await context.pool.query(
      'INSERT INTO public.crm_account_saved_views (company_id, owner_user_id, view_name, filters) ' +
      'VALUES ($1, $2, $3, $4::jsonb) RETURNING id, view_name, filters, created_at, updated_at',
      [context.companyId, context.userId, name, JSON.stringify(filters)],
    );
    return json({ success: true, view: created.rows[0] }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, code: 'CROSS_ORIGIN_REQUEST', error: 'This action must come from the SaMi workspace.' }, 403);
  try {
    const body = await parseBody(request);
    const id = clean(body.id, 64);
    const name = clean(body.name, 80);
    if (!UUID_RE.test(id)) throw new AccountViewInputError('INVALID_ID', 'Choose a valid saved view.');
    if (name.length < 2) throw new AccountViewInputError('INVALID_NAME', 'Saved view names must contain at least two characters.');
    const filters = normalizeFilters(body.filters);
    const context = await requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view');
    const updated = await context.pool.query(
      'UPDATE public.crm_account_saved_views SET view_name = $4, filters = $5::jsonb, updated_at = NOW() ' +
      'WHERE id = $1 AND company_id = $2 AND owner_user_id = $3 AND deleted_at IS NULL ' +
      'RETURNING id, view_name, filters, created_at, updated_at',
      [id, context.companyId, context.userId, name, JSON.stringify(filters)],
    );
    if (updated.rows.length !== 1) {
      return json({ success: false, code: 'SAVED_VIEW_NOT_FOUND', error: 'This saved view was not found in your current company.' }, 404);
    }
    return json({ success: true, view: updated.rows[0] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, code: 'CROSS_ORIGIN_REQUEST', error: 'This action must come from the SaMi workspace.' }, 403);
  try {
    const body = await parseBody(request);
    const id = clean(body.id, 64);
    if (!UUID_RE.test(id)) throw new AccountViewInputError('INVALID_ID', 'Choose a valid saved view.');
    const context = await requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view');
    const removed = await context.pool.query(
      'UPDATE public.crm_account_saved_views SET deleted_at = NOW(), updated_at = NOW() ' +
      'WHERE id = $1 AND company_id = $2 AND owner_user_id = $3 AND deleted_at IS NULL RETURNING id',
      [id, context.companyId, context.userId],
    );
    if (removed.rows.length !== 1) {
      return json({ success: false, code: 'SAVED_VIEW_NOT_FOUND', error: 'This saved view was not found in your current company.' }, 404);
    }
    return json({ success: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
