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
  console.error('[SaMi CRM relationship health] request failed:', error);
  return json({ success: false, code: 'CRM_RELATIONSHIP_HEALTH_FAILED', error: 'SaMi could not calculate CRM relationship health.' }, 500);
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

    const result = await accounts.pool.query(
      \`WITH activity_stats AS (
         SELECT
           COALESCE(i.account_id, c.account_id) AS account_id,
           MAX(COALESCE(i.occurred_at, i.created_at)) AS last_activity_at,
           COUNT(*) FILTER (WHERE COALESCE(i.occurred_at, i.created_at) >= NOW() - INTERVAL '90 days')::int AS activity_90_days,
           COUNT(*) FILTER (WHERE i.status = 'planned' AND i.due_at IS NOT NULL AND i.due_at >= NOW())::int AS future_followups,
           COUNT(*) FILTER (WHERE i.status = 'planned' AND i.due_at IS NOT NULL AND i.due_at < NOW())::int AS overdue_followups
         FROM public.crm_interactions i
         LEFT JOIN public.crm_contacts c
           ON c.id = i.contact_id
          AND c.company_id = i.company_id
          AND c.deleted_at IS NULL
         WHERE i.company_id = $1 AND i.deleted_at IS NULL
           AND COALESCE(i.account_id, c.account_id) IS NOT NULL
         GROUP BY COALESCE(i.account_id, c.account_id)
       ),
       contact_stats AS (
         SELECT account_id,
           COUNT(*)::int AS contact_count,
           COUNT(*) FILTER (WHERE is_primary = TRUE)::int AS primary_contact_count
         FROM public.crm_contacts
         WHERE company_id = $1 AND deleted_at IS NULL AND account_id IS NOT NULL
         GROUP BY account_id
       ),
       base AS (
         SELECT a.id, a.account_name, a.account_type, a.lifecycle_stage, a.industry,
           a.owner_user_id, a.updated_at,
           s.last_activity_at,
           COALESCE(s.activity_90_days, 0)::int AS activity_90_days,
           COALESCE(s.future_followups, 0)::int AS future_followups,
           COALESCE(s.overdue_followups, 0)::int AS overdue_followups,
           COALESCE(c.contact_count, 0)::int AS contact_count,
           COALESCE(c.primary_contact_count, 0)::int AS primary_contact_count,
           CASE
             WHEN s.last_activity_at >= NOW() - INTERVAL '7 days' THEN 35
             WHEN s.last_activity_at >= NOW() - INTERVAL '30 days' THEN 25
             WHEN s.last_activity_at >= NOW() - INTERVAL '90 days' THEN 15
             WHEN s.last_activity_at >= NOW() - INTERVAL '180 days' THEN 5
             ELSE 0
           END
           + CASE
             WHEN COALESCE(s.activity_90_days, 0) >= 8 THEN 25
             WHEN COALESCE(s.activity_90_days, 0) >= 4 THEN 18
             WHEN COALESCE(s.activity_90_days, 0) >= 1 THEN 10
             ELSE 0
           END
           + CASE WHEN COALESCE(s.future_followups, 0) > 0 THEN 10 ELSE 0 END
           + CASE WHEN COALESCE(c.contact_count, 0) >= 2 THEN 10 WHEN COALESCE(c.contact_count, 0) = 1 THEN 5 ELSE 0 END
           + CASE WHEN COALESCE(c.primary_contact_count, 0) > 0 THEN 5 ELSE 0 END
           + CASE WHEN a.lifecycle_stage = 'customer' THEN 10 WHEN a.lifecycle_stage = 'qualified' THEN 5 ELSE 0 END
           - LEAST(30, COALESCE(s.overdue_followups, 0) * 10) AS raw_score
         FROM public.crm_accounts a
         LEFT JOIN activity_stats s ON s.account_id = a.id
         LEFT JOIN contact_stats c ON c.account_id = a.id
         WHERE a.company_id = $1 AND a.deleted_at IS NULL
       ),
       scored AS (
         SELECT base.*,
           GREATEST(0, LEAST(100, raw_score))::int AS health_score
         FROM base
       )
       SELECT id, account_name, account_type, lifecycle_stage, industry, owner_user_id,
         last_activity_at, activity_90_days, future_followups, overdue_followups,
         contact_count, primary_contact_count, health_score,
         CASE WHEN health_score >= 75 THEN 'healthy'
              WHEN health_score >= 50 THEN 'watch'
              WHEN health_score >= 25 THEN 'at_risk'
              ELSE 'critical' END AS health_band,
         ARRAY_REMOVE(ARRAY[
           CASE WHEN last_activity_at IS NULL OR last_activity_at < NOW() - INTERVAL '30 days' THEN 'No recent engagement' END,
           CASE WHEN overdue_followups > 0 THEN 'Overdue follow-ups' END,
           CASE WHEN contact_count = 0 THEN 'No linked contacts' END,
           CASE WHEN primary_contact_count = 0 AND contact_count > 0 THEN 'No primary contact' END,
           CASE WHEN future_followups = 0 THEN 'No upcoming follow-up' END
         ], NULL) AS attention_reasons
       FROM scored
       ORDER BY
         CASE WHEN overdue_followups > 0 THEN 0 ELSE 1 END,
         health_score ASC, last_activity_at ASC NULLS FIRST, LOWER(account_name)
       LIMIT 250\`,
      [accounts.companyId],
    );

    const accountsList = result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      name: String(row.account_name || 'Unnamed account'),
      accountType: String(row.account_type || 'prospect'),
      lifecycleStage: String(row.lifecycle_stage || 'lead'),
      industry: row.industry ? String(row.industry) : null,
      ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
      lastActivityAt: row.last_activity_at ? new Date(String(row.last_activity_at)).toISOString() : null,
      activity90Days: Number(row.activity_90_days || 0),
      futureFollowUps: Number(row.future_followups || 0),
      overdueFollowUps: Number(row.overdue_followups || 0),
      contactCount: Number(row.contact_count || 0),
      primaryContactCount: Number(row.primary_contact_count || 0),
      score: Number(row.health_score || 0),
      band: String(row.health_band || 'critical'),
      reasons: Array.isArray(row.attention_reasons) ? row.attention_reasons.map(String) : [],
    }));
    return json({
      success: true,
      accounts: accountsList,
      limited: accountsList.length === 250,
      calculatedAt: new Date().toISOString(),
      methodology: 'Engagement recency, 90-day activity volume, follow-up coverage, contact coverage and lifecycle stage; overdue follow-ups reduce the score.',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
