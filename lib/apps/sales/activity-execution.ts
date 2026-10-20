import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';
import { queryControl } from '@/lib/db/control';

/* -------------------------------------------------------------------------- */
/*  Public types                                                              */
/* -------------------------------------------------------------------------- */

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

export type SalesActivityExecutionReportMeta = {
  allowed: boolean;
  asOf: string;
  windowDays: number;
  queueHorizonDays: number;
  queueLimit: number;
  queueOffset: number;
  queueHasMore: boolean;
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
  /** Always populated. Additive — consumers that ignore this keep working. */
  meta?: SalesActivityExecutionReportMeta;
};

export type GetSalesActivityExecutionReportOptions = {
  ownerId?: string | null;
  recordType?: 'Lead' | 'Opportunity';
  activityType?: string | null;
  queueLimit?: number;
  queueOffset?: number;
  /** Defaults to now. Pass a fixed Date for reproducible / "as of" reports. */
  asOf?: Date;
};

/* -------------------------------------------------------------------------- */
/*  Internal types & constants                                                */
/* -------------------------------------------------------------------------- */

type UserNameRow = { user_id: string; name: string };

const REPORT_WINDOW_DAYS = 30;
const QUEUE_HORIZON_DAYS = 7;
const DEFAULT_QUEUE_LIMIT = 25;
const MAX_QUEUE_LIMIT = 200;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function toOwnerId(value: unknown): string | null {
  return value == null || value === '' ? null : String(value);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function ratePercent(onTime: number, withDueDate: number): number | null {
  return withDueDate > 0 ? roundToOneDecimal((onTime / withDueDate) * 100) : null;
}

function sanitizeLimit(value: number | undefined): number {
  const n = Math.floor(value ?? DEFAULT_QUEUE_LIMIT);
  return Math.min(
    MAX_QUEUE_LIMIT,
    Math.max(1, Number.isFinite(n) ? n : DEFAULT_QUEUE_LIMIT),
  );
}

function sanitizeOffset(value: number | undefined): number {
  const n = Math.floor(value ?? 0);
  return Math.max(0, Number.isFinite(n) ? n : 0);
}

/* -------------------------------------------------------------------------- */
/*  Report                                                                    */
/* -------------------------------------------------------------------------- */

export async function getSalesActivityExecutionReport(
  options: GetSalesActivityExecutionReportOptions = {},
): Promise<SalesActivityExecutionReport> {
  const asOf = options.asOf ?? new Date();
  const asOfTs = asOf.toISOString();
  const asOfDate = asOf.toISOString().slice(0, 10);

  const queueLimit = sanitizeLimit(options.queueLimit);
  const queueOffset = sanitizeOffset(options.queueOffset);
  const ownerIdFilter = options.ownerId ?? null;
  const recordTypeFilter = options.recordType ?? null;
  const activityTypeFilter = options.activityType ?? null;

  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );

  const emptyMeta: SalesActivityExecutionReportMeta = {
    allowed: canViewReports,
    asOf: asOfTs,
    windowDays: REPORT_WINDOW_DAYS,
    queueHorizonDays: QUEUE_HORIZON_DAYS,
    queueLimit,
    queueOffset,
    queueHasMore: false,
  };

  if (!canViewReports) {
    return {
      totals: {
        plannedCount: 0,
        overdueCount: 0,
        undatedCount: 0,
        dueNext7Count: 0,
        completedLast30Count: 0,
        completedWithDueDateLast30Count: 0,
        completedOnTimeLast30Count: 0,
        onTimeRateLast30: null,
      },
      owners: [],
      queue: [],
      meta: emptyMeta,
    };
  }

  const [ownerResult, queueResult] = await Promise.all([
    // --- Owner aggregates ---------------------------------------------------
    context.pool.query(
      `
        WITH activities AS (
          SELECT
            a.assigned_user_id,
            a.status,
            a.due_date,
            a.completed_at,
            a.activity_type,
            'Lead'::text AS record_type
          FROM sales_lead_activities a
          INNER JOIN sales_leads l
            ON l.id = a.lead_id
           AND l.company_id = a.company_id
           AND l.deleted_at IS NULL
          WHERE a.company_id = $1 AND a.deleted_at IS NULL

          UNION ALL

          SELECT
            a.assigned_user_id,
            a.status,
            a.due_date,
            a.completed_at,
            a.activity_type,
            'Opportunity'::text AS record_type
          FROM sales_opportunity_activities a
          INNER JOIN sales_opportunities o
            ON o.id = a.opportunity_id
           AND o.company_id = a.company_id
           AND o.deleted_at IS NULL
          WHERE a.company_id = $1 AND a.deleted_at IS NULL
        )
        SELECT
          assigned_user_id::text AS owner_id,
          COUNT(*) FILTER (WHERE status = 'planned')::int AS planned_count,
          COUNT(*) FILTER (WHERE status = 'planned' AND due_date < $3::date)::int AS overdue_count,
          COUNT(*) FILTER (WHERE status = 'planned' AND due_date IS NULL)::int AS undated_count,
          COUNT(*) FILTER (
            WHERE status = 'planned' AND due_date BETWEEN $3::date AND $3::date + 7
          )::int AS due_next_7_count,
          COUNT(*) FILTER (
            WHERE status = 'completed' AND completed_at >= $2::timestamptz - INTERVAL '30 days'
          )::int AS completed_last_30_count,
          COUNT(*) FILTER (
            WHERE status = 'completed'
              AND completed_at >= $2::timestamptz - INTERVAL '30 days'
              AND due_date IS NOT NULL
          )::int AS completed_with_due_date_last_30_count,
          COUNT(*) FILTER (
            WHERE status = 'completed'
              AND completed_at >= $2::timestamptz - INTERVAL '30 days'
              AND due_date IS NOT NULL
              AND completed_at::date <= due_date
          )::int AS completed_on_time_last_30_count
        FROM activities
        WHERE ($4::uuid IS NULL OR assigned_user_id = $4::uuid)
          AND ($5::text IS NULL OR record_type = $5::text)
          AND ($6::text IS NULL OR activity_type = $6::text)
        GROUP BY assigned_user_id
        ORDER BY overdue_count DESC, planned_count DESC, owner_id NULLS LAST
      `,
      [
        context.companyId,
        asOfTs,
        asOfDate,
        ownerIdFilter,
        recordTypeFilter,
        activityTypeFilter,
      ],
    ),

    // --- Action queue (paginated, limit+1 for hasMore) ----------------------
    context.pool.query(
      `
        WITH activities AS (
          SELECT
            a.id AS activity_id,
            a.activity_type,
            a.subject,
            a.due_date,
            a.created_at,
            a.assigned_user_id::text AS assigned_user_id,
            'Lead'::text AS record_type,
            l.id AS record_id,
            l.lead_number AS record_number,
            l.name AS record_name,
            COALESCE(
              NULLIF(BTRIM(l.company_name), ''),
              NULLIF(BTRIM(l.contact_name), ''),
              NULLIF(BTRIM(l.name), ''),
              'Lead not named'
            ) AS customer_name
          FROM sales_lead_activities a
          INNER JOIN sales_leads l
            ON l.id = a.lead_id
           AND l.company_id = a.company_id
           AND l.deleted_at IS NULL
          WHERE a.company_id = $1
            AND a.deleted_at IS NULL
            AND a.status = 'planned'
            AND (a.due_date IS NULL OR a.due_date <= $3::date + 7)

          UNION ALL

          SELECT
            a.id AS activity_id,
            a.activity_type,
            a.subject,
            a.due_date,
            a.created_at,
            a.assigned_user_id::text AS assigned_user_id,
            'Opportunity'::text AS record_type,
            o.id AS record_id,
            o.opportunity_number AS record_number,
            o.name AS record_name,
            COALESCE(
              NULLIF(BTRIM(o.customer_name), ''),
              NULLIF(BTRIM(o.contact_name), ''),
              NULLIF(BTRIM(o.name), ''),
              'Customer not set'
            ) AS customer_name
          FROM sales_opportunity_activities a
          INNER JOIN sales_opportunities o
            ON o.id = a.opportunity_id
           AND o.company_id = a.company_id
           AND o.deleted_at IS NULL
          WHERE a.company_id = $1
            AND a.deleted_at IS NULL
            AND a.status = 'planned'
            AND (a.due_date IS NULL OR a.due_date <= $3::date + 7)
        )
        SELECT
          activity_id,
          activity_type,
          subject,
          due_date::text AS due_date,
          GREATEST(0, $3::date - due_date)::int AS days_overdue,
          record_type,
          record_id,
          record_number,
          record_name,
          customer_name,
          assigned_user_id
        FROM activities
        WHERE ($4::text IS NULL OR assigned_user_id = $4::text)
          AND ($5::text IS NULL OR record_type = $5::text)
          AND ($6::text IS NULL OR activity_type = $6::text)
        ORDER BY
          CASE WHEN due_date < $3::date THEN 0 WHEN due_date IS NOT NULL THEN 1 ELSE 2 END,
          due_date ASC NULLS LAST,
          created_at ASC,
          activity_id ASC
        LIMIT $7 OFFSET $8
      `,
      [
        context.companyId,
        asOfTs,
        asOfDate,
        ownerIdFilter,
        recordTypeFilter,
        activityTypeFilter,
        queueLimit + 1,
        queueOffset,
      ],
    ),
  ]);

  const queueHasMore = queueResult.rows.length > queueLimit;
  const queueRows = queueHasMore
    ? queueResult.rows.slice(0, queueLimit)
    : queueResult.rows;

  /* ------------------------------------------------------------------------ */
  /*  Display names                                                          */
  /* ------------------------------------------------------------------------ */

  const ids = Array.from(
    new Set(
      [
        ...ownerResult.rows.map((row) => toOwnerId(row.owner_id)),
        ...queueRows.map((row) => toOwnerId(row.assigned_user_id)),
      ].filter((id): id is string => id !== null),
    ),
  );

  let activeUsers: UserNameRow[] = [];
  if (ids.length > 0) {
    const users = await queryControl(
      `SELECT tu.user_id::text AS user_id,
              COALESCE(
                NULLIF(BTRIM(COALESCE(u.full_name, '')), ''),
                NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
                u.email
              ) AS name
       FROM tenant_users tu
       INNER JOIN users u ON u.id = tu.user_id
       WHERE tu.tenant_id = $1
         AND tu.user_id = ANY($2::uuid[])
         AND tu.status = 'active'
         AND tu.member_type = 'internal'
         AND tu.deleted_at IS NULL
         AND u.deleted_at IS NULL`,
      [context.tenantId, ids],
    );
    activeUsers = users.rows.map((row) => ({
      user_id: String(row.user_id),
      name: String(row.name || 'Salesperson'),
    }));
  }

  const names = new Map(activeUsers.map((user) => [user.user_id, user.name]));
  const displayOwner = (id: string | null): string =>
    id === null ? 'Unassigned' : names.get(id) || 'Inactive or unavailable user';

  /* ------------------------------------------------------------------------ */
  /*  Shape                                                                  */
  /* ------------------------------------------------------------------------ */

  const owners: SalesActivityOwnerSummary[] = ownerResult.rows.map((row) => {
    const id = toOwnerId(row.owner_id);
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
      onTimeRateLast30: ratePercent(completedOnTime, completedWithDue),
    };
  });

  const totals = owners.reduce<SalesActivityExecutionReport['totals']>(
    (acc, owner) => ({
      plannedCount: acc.plannedCount + owner.plannedCount,
      overdueCount: acc.overdueCount + owner.overdueCount,
      undatedCount: acc.undatedCount + owner.undatedCount,
      dueNext7Count: acc.dueNext7Count + owner.dueNext7Count,
      completedLast30Count: acc.completedLast30Count + owner.completedLast30Count,
      completedWithDueDateLast30Count:
        acc.completedWithDueDateLast30Count + owner.completedWithDueDateLast30Count,
      completedOnTimeLast30Count:
        acc.completedOnTimeLast30Count + owner.completedOnTimeLast30Count,
      onTimeRateLast30: null,
    }),
    {
      plannedCount: 0,
      overdueCount: 0,
      undatedCount: 0,
      dueNext7Count: 0,
      completedLast30Count: 0,
      completedWithDueDateLast30Count: 0,
      completedOnTimeLast30Count: 0,
      onTimeRateLast30: null,
    },
  );

  totals.onTimeRateLast30 = ratePercent(
    totals.completedOnTimeLast30Count,
    totals.completedWithDueDateLast30Count,
  );

  const queue: SalesActivityQueueRow[] = queueRows.map((row) => {
    const id = toOwnerId(row.assigned_user_id);
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

  return {
    totals,
    owners,
    queue,
    meta: {
      ...emptyMeta,
      queueHasMore,
    },
  };
}