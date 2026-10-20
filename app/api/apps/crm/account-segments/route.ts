import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError, requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const MAX_PAGE = 10000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIFECYCLE_STAGES = new Set(['', 'lead', 'qualified', 'customer', 'inactive']);
const ACCOUNT_TYPES = new Set(['', 'prospect', 'customer', 'partner', 'competitor']);
const ENGAGEMENT_STATES = new Set(['all', 'engaged', 'not_engaged']);

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
  });
}
function errorResponse(error: unknown) {
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
  console.error('[SaMi CRM account segments] request failed:', error);
  return json({ success: false, code: 'CRM_ACCOUNT_SEGMENTS_FAILED', error: 'SaMi could not load account segments.' }, 500);
}
function bounded(value: string | null, max: number) {
  return (value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view');
    const query = bounded(request.nextUrl.searchParams.get('q'), 100);
    const lifecycleStage = bounded(request.nextUrl.searchParams.get('lifecycleStage'), 30).toLowerCase();
    const accountType = bounded(request.nextUrl.searchParams.get('accountType'), 30).toLowerCase();
    const industry = bounded(request.nextUrl.searchParams.get('industry'), 160);
    const source = bounded(request.nextUrl.searchParams.get('source'), 120);
    const ownerUserId = bounded(request.nextUrl.searchParams.get('ownerUserId'), 64).toLowerCase();
    const engagement = bounded(request.nextUrl.searchParams.get('engagement'), 30).toLowerCase() || 'all';
    const requestedPage = Number(request.nextUrl.searchParams.get('page') || '1');

    if (!LIFECYCLE_STAGES.has(lifecycleStage) || !ACCOUNT_TYPES.has(accountType) || !ENGAGEMENT_STATES.has(engagement)) {
      return json({ success: false, code: 'INVALID_FILTER', error: 'Choose a valid account segment filter.' }, 400);
    }
    if (ownerUserId && ownerUserId !== 'unassigned' && !UUID_RE.test(ownerUserId)) {
      return json({ success: false, code: 'INVALID_OWNER', error: 'Choose a valid account owner.' }, 400);
    }
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > MAX_PAGE) {
      return json({ success: false, code: 'INVALID_PAGE', error: 'Choose a valid account page.' }, 400);
    }

    const searchPattern = '%' + query + '%';
    const offset = (requestedPage - 1) * PAGE_SIZE;
    const where = `
      a.company_id = $1 AND a.deleted_at IS NULL
      AND ($2::text = '%%' OR a.account_name ILIKE $2 OR COALESCE(a.email, '') ILIKE $2 OR COALESCE(a.phone, '') ILIKE $2)
      AND ($3::text = '' OR a.lifecycle_stage = $3)
      AND ($4::text = '' OR a.account_type = $4)
      AND ($5::text = '' OR COALESCE(a.industry, '') = $5)
      AND ($6::text = '' OR COALESCE(a.source, '') = $6)
      AND ($7::text = '' OR ($7::text = 'unassigned' AND a.owner_user_id IS NULL) OR a.owner_user_id::text = $7)
      AND ($8::text = 'all'
        OR ($8::text = 'engaged' AND EXISTS (SELECT 1 FROM public.crm_interactions i WHERE i.company_id = a.company_id AND i.account_id = a.id AND i.deleted_at IS NULL AND COALESCE(i.occurred_at, i.completed_at, i.created_at) >= NOW() - INTERVAL '90 days'))
        OR ($8::text = 'not_engaged' AND NOT EXISTS (SELECT 1 FROM public.crm_interactions i WHERE i.company_id = a.company_id AND i.account_id = a.id AND i.deleted_at IS NULL AND COALESCE(i.occurred_at, i.completed_at, i.created_at) >= NOW() - INTERVAL '90 days')))
    `;

    const params = [context.companyId, searchPattern, lifecycleStage, accountType, industry, source, ownerUserId, engagement];
    const [countsResult, rowsResult, industriesResult, sourcesResult, ownersResult] = await Promise.all([
      context.pool.query(
        'SELECT COUNT(*)::int AS total, ' +
        "COUNT(*) FILTER (WHERE a.lifecycle_stage = 'lead')::int AS leads, " +
        "COUNT(*) FILTER (WHERE a.lifecycle_stage = 'qualified')::int AS qualified, " +
        "COUNT(*) FILTER (WHERE a.lifecycle_stage = 'customer')::int AS customers, " +
        "COUNT(*) FILTER (WHERE a.account_type = 'partner')::int AS partners " +
        'FROM public.crm_accounts a WHERE ' + where,
        params,
      ),
      context.pool.query(
        'SELECT a.id, a.account_name, a.account_type, a.lifecycle_stage, a.industry, a.source, ' +
        'a.email, a.phone, a.owner_user_id, a.created_at, a.updated_at, ' +
        "(SELECT COUNT(*)::int FROM public.crm_contacts c WHERE c.company_id = a.company_id AND c.account_id = a.id AND c.deleted_at IS NULL) AS contact_count, " +
        "(SELECT MAX(COALESCE(i.occurred_at, i.completed_at, i.created_at)) FROM public.crm_interactions i WHERE i.company_id = a.company_id AND i.account_id = a.id AND i.deleted_at IS NULL) AS last_interaction_at " +
        'FROM public.crm_accounts a WHERE ' + where +
        ' ORDER BY LOWER(a.account_name), a.id LIMIT $9 OFFSET $10',
        [...params, PAGE_SIZE, offset],
      ),
      context.pool.query(
        "SELECT DISTINCT industry FROM public.crm_accounts WHERE company_id = $1 AND deleted_at IS NULL AND NULLIF(BTRIM(industry), '') IS NOT NULL ORDER BY industry LIMIT 100",
        [context.companyId],
      ),
      context.pool.query(
        "SELECT DISTINCT source FROM public.crm_accounts WHERE company_id = $1 AND deleted_at IS NULL AND NULLIF(BTRIM(source), '') IS NOT NULL ORDER BY source LIMIT 100",
        [context.companyId],
      ),
      context.pool.query(
        "SELECT DISTINCT owner_user_id::text AS id FROM public.crm_accounts WHERE company_id = $1 AND deleted_at IS NULL AND owner_user_id IS NOT NULL ORDER BY id LIMIT 100",
        [context.companyId],
      ),
    ]);

    const summary = countsResult.rows[0] || { total: 0, leads: 0, qualified: 0, customers: 0, partners: 0 };
    const total = Number(summary.total || 0);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return json({
      success: true,
      page: requestedPage,
      pageSize: PAGE_SIZE,
      total,
      pages,
      summary,
      options: {
        industries: industriesResult.rows.map((row: { industry: string }) => row.industry),
        sources: sourcesResult.rows.map((row: { source: string }) => row.source),
        owners: ownersResult.rows.map((row: { id: string }) => row.id),
      },
      accounts: rowsResult.rows,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
