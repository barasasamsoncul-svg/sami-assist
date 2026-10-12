import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';
import { queryControl } from '@/lib/db/control';

export type SalesActivityOwnerSummary = {
  ownerId: string | null;
  ownerName: string;
  plannedCount: number;
  overdueCount: number;
  undatedCount: number;
  dueNext7Count: number;
  completedLast30Count: number;
  completedWithDueDateLast30Count: number;
  completedOnTimeLast30Count: number;
  onTimeRateLast30: number | null;
};

export type SalesActivityQueueRow = {
  activityId: string;
  activityType: string;
  subject: string;
  dueDate: string | null;
  daysOverdue: number;
  recordType: 'Lead' | 'Opportunity';
  recordId: string;
  recordNumber: string;
  recordName: string;
  customerName: string;
  assignedUserId: string | null;
  assignedUserName: string;
};

export type SalesActivityExecutionReport = {
  totals: {
    plannedCount: number;
    overdueCount: number;
    undatedCount: number;
    dueNext7Count: number;
    completedLast30Count: number;
    completedWithDueDateLast30Count: number;
    completedOnTimeLast30Count: number;
    onTimeRateLast30: number | null;
  };
  owners: SalesActivityOwnerSummary[];
  queue: SalesActivityQueueRow[];
};

type UserNameRow = { user_id: string; name: string };

function ownerId(value: unknown): string | null {
  return value == null || value === '' ? null : String(value);
}

export async function getSalesActivityExecutionReport(): Promise<SalesActivityExecutionReport> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );

  if (!canViewReports) {
    return {
      totals: {
        plannedCount: 0, overdueCount: 0, undatedCount: 0, dueNext7Count: 0,
        completedLast30Count: 0, completedWithDueDateLast30Count: 0,
        completedOnTimeLast30Count: 0, onTimeRateLast30: null,
      },
      owners: [],
      queue: [],
    };
  }

  const [ownerResult, queueResult] = await Promise.all([
    context.pool.query(
      `
        WITH activities AS (
          SELECT a.assigned_user_id, a.status, a.due_date, a.completed_at
          FROM sales_lead_activities a
          INNER JOIN sales_leads l
            ON l.id = a.lead_id AND l.company_id = a.company_id AND l.deleted_at IS NULL
          WHERE a.company_id = $1 AND a.deleted_at IS NULL
          UNION ALL
          SELECT a.assigned_user_id, a.status, a.due_date, a.completed_at
          FROM sales_opportunity_activities a
          INNER JOIN sales_opportunities o
            ON o.id = a.opportunity_id AND o.company_id = a.company_id AND o.deleted_at IS NULL
          WHERE a.company_id = $1 AND a.deleted_at IS NULL
        )
        SELECT
          assigned_user_id::text AS owner_id,
          COUNT(*) FILTER (WHERE status = 'planned')::int AS planned_count,
          COUNT(*) FILTER (WHERE status = 'planned' AND due_date < CURRENT_DATE)::int AS overdue_count,
          COUNT(*) FILTER (WHERE status = 'planned' AND due_date IS NULL)::int AS undated_count,
          COUNT(*) FILTER (
            WHERE status = 'planned' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
          )::int AS due_next_7_count,
          COUNT(*) FILTER (
            WHERE status = 'completed' AND completed_at >= NOW() - INTERVAL '30 days'
          )::int AS completed_last_30_count,
          COUNT(*) FILTER (
            WHERE status = 'completed'
              AND completed_at >= NOW() - INTERVAL '30 days'
              AND due_date IS NOT NULL
          )::int AS completed_with_due_date_last_30_count,
          COUNT(*) FILTER (
            WHERE status = 'completed'
              AND completed_at >= NOW() - INTERVAL '30 days'
              AND due_date IS NOT NULL
              AND completed_at::date <= due_date
          )::int AS completed_on_time_last_30_count
        FROM activities
        GROUP BY assigned_user_id
        ORDER BY overdue_count DESC, planned_count DESC, owner_id NULLS LAST
      `,
      [context.companyId],
    ),
    context.pool.query(
      `
        WITH activities AS (
          SELECT
            a.id AS activity_id, a.activity_type, a.subject, a.due_date, a.created_at,
            a.assigned_user_id::text AS assigned_user_id,
            'Lead'::text AS record_type, l.id AS record_id, l.lead_number AS record_number,
            l.name AS record_name,
            COALESCE(NULLIF(BTRIM(l.company_name), ''), NULLIF(BTRIM(l.contact_name), ''),
              NULLIF(BTRIM(l.name), ''), 'Lead not named') AS customer_name
          FROM sales_lead_activities a
          INNER JOIN sales_leads l
            ON l.id = a.lead_id AND l.company_id = a.company_id AND l.deleted_at IS NULL
          WHERE a.company_id = $1 AND a.deleted_at IS NULL AND a.status = 'planned'
            AND (a.due_date IS NULL OR a.due_date <= CURRENT_DATE + 7)
          UNION ALL
          SELECT
            a.id AS activity_id, a.activity_type, a.subject, a.due_date, a.created_at,
            a.assigned_user_id::text AS assigned_user_id,
            'Opportunity'::text AS record_type, o.id AS record_id, o.opportunity_number AS record_number,
            o.name AS record_name,
            COALESCE(NULLIF(BTRIM(o.customer_name), ''), NULLIF(BTRIM(o.contact_name), ''),
              NULLIF(BTRIM(o.name), ''), 'Customer not set') AS customer_name
          FROM sales_opportunity_activities a
          INNER JOIN sales_opportunities o
            ON o.id = a.opportunity_id AND o.company_id = a.company_id AND o.deleted_at IS NULL
          WHERE a.company_id = $1 AND a.deleted_at IS NULL AND a.status = 'planned'
            AND (a.due_date IS NULL OR a.due_date <= CURRENT_DATE + 7)
        )
        SELECT
          activity_id, activity_type, subject, due_date::text AS due_date,
          GREATEST(0, CURRENT_DATE - due_date)::int AS days_overdue,
          record_type, record_id, record_number, record_name, customer_name, assigned_user_id
        FROM activities
        ORDER BY
          CASE WHEN due_date < CURRENT_DATE THEN 0 WHEN due_date IS NOT NULL THEN 1 ELSE 2 END,
          due_date ASC NULLS LAST, created_at ASC, activity_id ASC
        LIMIT 25
      `,
      [context.companyId],
    ),
  ]);

  const ids = Array.from(new Set([
    ...ownerResult.rows.map(row => ownerId(row.owner_id)),
    ...queueResult.rows.map(row => ownerId(row.assigned_user_id)),
  ].filter((id): id is string => id !== null)));

  let activeUsers: UserNameRow[] = [];
  if (ids.length > 0) {
    const users = await queryControl(
      `
        SELECT tu.user_id::text AS user_id,
          COALESCE(NULLIF(BTRIM(COALESCE(u.full_name, '')), ''),
            NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email) AS name
        FROM tenant_users tu
        INNER JOIN users u ON u.id = tu.user_id
        WHERE tu.tenant_id = $1 AND tu.user_id = ANY($2::uuid[])
          AND tu.status = 'active' AND tu.member_type = 'internal'
          AND tu.deleted_at IS NULL AND u.deleted_at IS NULL
      `,
      [context.tenantId, ids],
    );
    activeUsers = users.rows.map(row => ({ user_id: String(row.user_id), name: String(row.name || 'Salesperson') }));
  }
  const names = new Map(activeUsers.map(user => [user.user_id, user.name]));
  const displayOwner = (id: string | null) => id === null
    ? 'Unassigned'
    : names.get(id) || 'Inactive or unavailable user';

  const owners: SalesActivityOwnerSummary[] = ownerResult.rows.map(row => {
    const id = ownerId(row.owner_id);
    const completedWithDue = Number(row.completed_with_due_date_last_30_count || 0);
    const completedOnTime = Number(row.completed_on_time_last_30_count || 0);
    return {
      ownerId: id,
      ownerName: displayOwner(id),
      plannedCount: Number(row.planned_count || 0),
      overdueCount: Number(row.overdue_count || 0),
      undatedCount: Number(row.undated_count || 0),
      dueNext7Count: Number(row.due_next_7_count || 0),
      completedLast30Count: Number(row.completed_last_30_count || 0),
      completedWithDueDateLast30Count: completedWithDue,
      completedOnTimeLast30Count: completedOnTime,
      onTimeRateLast30: completedWithDue > 0
        ? Math.round(completedOnTime / completedWithDue * 1000) / 10
        : null,
    };
  });

  const totals = owners.reduce<SalesActivityExecutionReport['totals']>((acc, owner) => ({
    plannedCount: acc.plannedCount + owner.plannedCount,
    overdueCount: acc.overdueCount + owner.overdueCount,
    undatedCount: acc.undatedCount + owner.undatedCount,
    dueNext7Count: acc.dueNext7Count + owner.dueNext7Count,
    completedLast30Count: acc.completedLast30Count + owner.completedLast30Count,
    completedWithDueDateLast30Count: acc.completedWithDueDateLast30Count + owner.completedWithDueDateLast30Count,
    completedOnTimeLast30Count: acc.completedOnTimeLast30Count + owner.completedOnTimeLast30Count,
    onTimeRateLast30: null,
  }), {
    plannedCount: 0, overdueCount: 0, undatedCount: 0, dueNext7Count: 0,
    completedLast30Count: 0, completedWithDueDateLast30Count: 0,
    completedOnTimeLast30Count: 0, onTimeRateLast30: null,
  });
  totals.onTimeRateLast30 = totals.completedWithDueDateLast30Count > 0
    ? Math.round(totals.completedOnTimeLast30Count / totals.completedWithDueDateLast30Count * 1000) / 10
    : null;

  const queue: SalesActivityQueueRow[] = queueResult.rows.map(row => {
    const id = ownerId(row.assigned_user_id);
    return {
      activityId: String(row.activity_id),
      activityType: String(row.activity_type),
      subject: String(row.subject),
      dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
      daysOverdue: Number(row.days_overdue || 0),
      recordType: String(row.record_type) as 'Lead' | 'Opportunity',
      recordId: String(row.record_id),
      recordNumber: String(row.record_number),
      recordName: String(row.record_name),
      customerName: String(row.customer_name || 'Customer not set'),
      assignedUserId: id,
      assignedUserName: displayOwner(id),
    };
  });

  return { totals, owners, queue };
}
