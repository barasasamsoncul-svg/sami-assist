import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import {
  EnterpriseModuleError,
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const MAX_PAGE = 10000;
const FOLLOW_UP_VIEWS = new Set(['overdue', 'due_today', 'upcoming', 'completed', 'all']);

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}

function errorResponse(error: unknown) {
  if (error instanceof EnterpriseModuleError) {
    const status =
      error.code === 'MODULE_PERMISSION_REQUIRED' || error.code === 'TABLE_NOT_ALLOWED'
        ? 403
        : error.code === 'MODULE_NOT_INSTALLED' || error.code === 'RECORD_NOT_FOUND'
          ? 404
          : error.code === 'WORKSPACE_SUSPENDED'
            ? 402
            : error.code === 'WORKSPACE_CONTEXT_CHANGED'
              ? 409
              : error.code === 'TABLE_NOT_READY'
                ? 503
                : 400;
    return json({ success: false, code: error.code, error: error.message }, status);
  }

  if (error instanceof CompanyContextError || error instanceof TenantContextError) {
    const statuses: Record<string, number> = {
      UNAUTHENTICATED: 401,
      NO_WORKSPACE_SELECTED: 409,
      WORKSPACE_ACCESS_DENIED: 403,
      WORKSPACE_DATABASE_UNAVAILABLE: 503,
      NO_COMPANY_ACCESS: 403,
      INVALID_COMPANY_ID: 400,
      COMPANY_ACCESS_DENIED: 403,
      EMPTY_COMPANY_SELECTION: 400,
      TOO_MANY_COMPANIES: 400,
      SESSION_UPDATE_FAILED: 500,
    };
    return json(
      { success: false, code: error.code, error: error.message },
      statuses[error.code] ?? 500,
    );
  }

  console.error('[SaMi CRM follow-ups] request failed:', error);
  return json({
    success: false,
    code: 'CRM_FOLLOW_UPS_FAILED',
    error: 'SaMi could not load the CRM follow-up queue.',
  }, 500);
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'view');
    const requestedView = (request.nextUrl.searchParams.get('view') || 'overdue').trim().toLowerCase();
    const view = FOLLOW_UP_VIEWS.has(requestedView) ? requestedView : null;
    if (!view) {
      return json({ success: false, code: 'INVALID_VIEW', error: 'Choose a valid follow-up queue.' }, 400);
    }

    const requestedPage = Number(request.nextUrl.searchParams.get('page') || '1');
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > MAX_PAGE) {
      return json({ success: false, code: 'INVALID_PAGE', error: 'Choose a valid follow-up page.' }, 400);
    }

    const search = (request.nextUrl.searchParams.get('q') || '').replace(/\u0000/g, '').trim().slice(0, 100);
    const searchPattern = '%' + search + '%';
    const offset = (requestedPage - 1) * PAGE_SIZE;

    const summaryPromise = context.pool.query(
      'SELECT ' +
        "COUNT(*) FILTER (WHERE status = 'planned')::int AS open, " +
        "COUNT(*) FILTER (WHERE status = 'planned' AND due_at < NOW())::int AS overdue, " +
        "COUNT(*) FILTER (WHERE status = 'planned' AND due_at >= NOW() AND due_at < CURRENT_DATE + INTERVAL '1 day')::int AS due_today, " +
        "COUNT(*) FILTER (WHERE status = 'planned' AND due_at >= CURRENT_DATE + INTERVAL '1 day' AND due_at < CURRENT_DATE + INTERVAL '8 days')::int AS upcoming, " +
        "COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= NOW() - INTERVAL '30 days')::int AS completed_recently, " +
        "COUNT(*) FILTER (WHERE status = 'completed')::int AS completed, " +
        "COUNT(*)::int AS all_activity, " +
        "COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled " +
      'FROM public.crm_interactions WHERE company_id = $1 AND deleted_at IS NULL',
      [context.companyId],
    );

    const where =
      'i.company_id = $1 AND i.deleted_at IS NULL ' +
      'AND ($2::text = \'all\' ' +
        'OR ($2::text = \'overdue\' AND i.status = \'planned\' AND i.due_at < NOW()) ' +
        'OR ($2::text = \'due_today\' AND i.status = \'planned\' AND i.due_at >= NOW() AND i.due_at < CURRENT_DATE + INTERVAL \'1 day\') ' +
        'OR ($2::text = \'upcoming\' AND i.status = \'planned\' AND i.due_at >= CURRENT_DATE + INTERVAL \'1 day\' AND i.due_at < CURRENT_DATE + INTERVAL \'8 days\') ' +
        'OR ($2::text = \'completed\' AND i.status = \'completed\')) ' +
      'AND ($3::text = \'%%\' OR i.subject ILIKE $3 OR COALESCE(i.description, \'\') ILIKE $3 ' +
        'OR COALESCE(a.account_name, \'\') ILIKE $3 ' +
        'OR COALESCE(c.first_name, \'\') ILIKE $3 ' +
        'OR COALESCE(c.last_name, \'\') ILIKE $3)';

    const countPromise = context.pool.query(
      'SELECT COUNT(*)::int AS total ' +
      'FROM public.crm_interactions i ' +
      'LEFT JOIN public.crm_accounts a ON a.id = i.account_id AND a.company_id = i.company_id ' +
      'LEFT JOIN public.crm_contacts c ON c.id = i.contact_id AND c.company_id = i.company_id ' +
      'WHERE ' + where,
      [context.companyId, view, searchPattern],
    );

    const rowsPromise = context.pool.query(
      'SELECT i.id, i.account_id, i.contact_id, i.interaction_type, i.subject, i.description, ' +
        'i.status, i.occurred_at, i.due_at, i.completed_at, i.outcome, i.owner_user_id, ' +
        'i.created_by, i.created_at, i.updated_at, a.account_name, ' +
        'c.first_name AS contact_first_name, c.last_name AS contact_last_name, ' +
        'c.do_not_contact AS contact_do_not_contact ' +
      'FROM public.crm_interactions i ' +
      'LEFT JOIN public.crm_accounts a ON a.id = i.account_id AND a.company_id = i.company_id ' +
      'LEFT JOIN public.crm_contacts c ON c.id = i.contact_id AND c.company_id = i.company_id ' +
      'WHERE ' + where + ' ' +
      'ORDER BY CASE WHEN i.status = \'planned\' THEN 0 ELSE 1 END, ' +
        'i.due_at ASC NULLS LAST, COALESCE(i.completed_at, i.updated_at, i.created_at) DESC, i.id DESC ' +
      'LIMIT $4 OFFSET $5',
      [context.companyId, view, searchPattern, PAGE_SIZE, offset],
    );

    const [summaryResult, countResult, rowsResult] = await Promise.all([
      summaryPromise,
      countPromise,
      rowsPromise,
    ]);

    const total = Number(countResult.rows[0]?.total || 0);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return json({
      success: true,
      view,
      page: requestedPage,
      pageSize: PAGE_SIZE,
      total,
      pages,
      hasMore: requestedPage < pages,
      summary: summaryResult.rows[0] || {
        open: 0,
        overdue: 0,
        due_today: 0,
        upcoming: 0,
        completed_recently: 0,
        completed: 0,
        all_activity: 0,
        cancelled: 0,
      },
      interactions: rowsResult.rows,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
