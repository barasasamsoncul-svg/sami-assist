import 'server-only';

import { NextResponse } from 'next/server';
import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError, requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
  });
}

function errorResponse(error: unknown) {
  if (error instanceof EnterpriseModuleError) {
    const status = error.code === 'MODULE_PERMISSION_REQUIRED' || error.code === 'TABLE_NOT_ALLOWED' ? 403
      : error.code === 'MODULE_NOT_INSTALLED' || error.code === 'RECORD_NOT_FOUND' ? 404
        : error.code === 'WORKSPACE_SUSPENDED' ? 402
          : error.code === 'WORKSPACE_CONTEXT_CHANGED' ? 409
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
  console.error('[SaMi CRM reports] request failed:', error);
  return json({ success: false, code: 'CRM_REPORTS_FAILED', error: 'SaMi could not load CRM reports.' }, 500);
}

export async function GET() {
  try {
    const [accounts, contacts, interactions] = await Promise.all([
      requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view'),
      requireEnterpriseModuleTableContext('crm', 'crm_contacts', 'view'),
      requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'view'),
    ]);

    if (
      accounts.tenantId !== contacts.tenantId || accounts.companyId !== contacts.companyId || accounts.userId !== contacts.userId ||
      accounts.tenantId !== interactions.tenantId || accounts.companyId !== interactions.companyId || accounts.userId !== interactions.userId
    ) {
      throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'The CRM workspace context changed. Refresh and try again.');
    }

    const [summary, lifecycle, trend] = await Promise.all([
      accounts.pool.query(
        `SELECT
          (SELECT COUNT(*)::int FROM public.crm_accounts a WHERE a.company_id = $1 AND a.deleted_at IS NULL) AS account_count,
          (SELECT COUNT(*)::int FROM public.crm_contacts c WHERE c.company_id = $1 AND c.deleted_at IS NULL) AS contact_count,
          (SELECT COUNT(*)::int FROM public.crm_interactions i WHERE i.company_id = $1 AND i.deleted_at IS NULL) AS interaction_count,
          (SELECT COUNT(*)::int FROM public.crm_interactions i WHERE i.company_id = $1 AND i.deleted_at IS NULL AND i.status = 'completed' AND COALESCE(i.completed_at, i.occurred_at, i.created_at) >= NOW() - INTERVAL '30 days') AS completed_30_days,
          (SELECT COUNT(*)::int FROM public.crm_interactions i WHERE i.company_id = $1 AND i.deleted_at IS NULL AND i.status = 'planned' AND i.due_at < NOW()) AS overdue_followups,
          (SELECT COUNT(*)::int FROM public.crm_interactions i WHERE i.company_id = $1 AND i.deleted_at IS NULL AND i.status = 'planned' AND i.due_at >= date_trunc('day', NOW()) AND i.due_at < date_trunc('day', NOW()) + INTERVAL '1 day') AS due_today,
          (SELECT COUNT(*)::int FROM public.crm_interactions i WHERE i.company_id = $1 AND i.deleted_at IS NULL AND i.status = 'planned' AND i.due_at >= NOW() AND i.due_at < NOW() + INTERVAL '7 days') AS due_next_7_days,
          (SELECT COUNT(*)::int FROM public.crm_accounts a WHERE a.company_id = $1 AND a.deleted_at IS NULL AND a.owner_user_id IS NULL) AS unassigned_accounts,
          (SELECT COUNT(*)::int FROM public.crm_accounts a WHERE a.company_id = $1 AND a.deleted_at IS NULL AND a.created_at >= NOW() - INTERVAL '30 days') AS accounts_created_30_days`,
        [accounts.companyId],
      ),
      accounts.pool.query(
        `SELECT lifecycle_stage AS stage, COUNT(*)::int AS count
         FROM public.crm_accounts
         WHERE company_id = $1 AND deleted_at IS NULL
         GROUP BY lifecycle_stage
         ORDER BY CASE lifecycle_stage WHEN 'lead' THEN 1 WHEN 'qualified' THEN 2 WHEN 'customer' THEN 3 WHEN 'inactive' THEN 4 ELSE 5 END, lifecycle_stage`,
        [accounts.companyId],
      ),
      accounts.pool.query(
        `WITH months AS (
           SELECT generate_series(date_trunc('month', NOW()) - INTERVAL '5 months', date_trunc('month', NOW()), INTERVAL '1 month') AS month_start
         )
         SELECT TO_CHAR(m.month_start, 'YYYY-MM') AS month,
           COUNT(i.id)::int AS interactions,
           COUNT(i.id) FILTER (WHERE i.status = 'completed')::int AS completed,
           COUNT(i.id) FILTER (WHERE i.status = 'planned')::int AS planned
         FROM months m
         LEFT JOIN public.crm_interactions i
           ON i.company_id = $1
          AND i.deleted_at IS NULL
          AND COALESCE(i.occurred_at, i.created_at) >= m.month_start
          AND COALESCE(i.occurred_at, i.created_at) < m.month_start + INTERVAL '1 month'
         GROUP BY m.month_start
         ORDER BY m.month_start`,
        [accounts.companyId],
      ),
    ]);

    const first = summary.rows[0] || {};
    return json({
      success: true,
      generatedAt: new Date().toISOString(),
      summary: {
        accounts: Number(first.account_count || 0),
        contacts: Number(first.contact_count || 0),
        interactions: Number(first.interaction_count || 0),
        completedLast30Days: Number(first.completed_30_days || 0),
        overdueFollowUps: Number(first.overdue_followups || 0),
        dueToday: Number(first.due_today || 0),
        dueNext7Days: Number(first.due_next_7_days || 0),
        unassignedAccounts: Number(first.unassigned_accounts || 0),
        newAccountsLast30Days: Number(first.accounts_created_30_days || 0),
      },
      lifecycle: lifecycle.rows.map((row: Record<string, unknown>) => ({
        stage: String(row.stage || 'unknown'),
        count: Number(row.count || 0),
      })),
      monthlyActivity: trend.rows.map((row: Record<string, unknown>) => ({
        month: String(row.month),
        interactions: Number(row.interactions || 0),
        completed: Number(row.completed || 0),
        planned: Number(row.planned || 0),
      })),
      scope: 'Current CRM company; active records only.',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
