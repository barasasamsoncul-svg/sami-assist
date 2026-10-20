import 'server-only';

import {
  cleanText,
  hasSalesPermission,
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

import type {
  SalesLeadScoreView,
  SalesOrderSortBy,
  SalesOrderStatusView,
  SalesPipelineStatusView,
  SalesPipelineViewType,
  SalesQuoteStatusView,
  SalesSavedOrderView,
  SalesSavedPipelineView,
  SalesSavedQuoteView,
} from '@/lib/apps/sales/types';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const MAX_SAVED_VIEWS = 25;
const DUPLICATE_KEY_SQLCODE = '23505';

const QUOTE_STATUS_VIEWS: ReadonlySet<SalesQuoteStatusView> = new Set([
  'all',
  'draft',
  'needs_approval',
  'awaiting_response',
  'accepted',
  'converted',
  'closed_without_sale',
  'expired',
  'expiring_soon',
]);

const ORDER_STATUS_VIEWS: ReadonlySet<SalesOrderStatusView> = new Set([
  'all',
  'awaiting_fulfillment',
  'partially_fulfilled',
  'fulfilled',
  'not_invoiced',
  'partially_invoiced',
  'invoiced',
]);

const ORDER_SORTS: ReadonlySet<SalesOrderSortBy> = new Set([
  'newest',
  'oldest',
  'value_high',
  'value_low',
  'delivery_first',
  'invoice_first',
  'customer_az',
]);

const PIPELINE_VIEW_TYPES: ReadonlySet<SalesPipelineViewType> = new Set([
  'leads',
  'opportunities',
]);

const LEAD_PIPELINE_STATUSES: ReadonlySet<SalesPipelineStatusView> = new Set([
  'all',
  'new',
  'contacted',
  'qualified',
  'disqualified',
  'converted',
]);

const OPPORTUNITY_PIPELINE_STATUSES: ReadonlySet<SalesPipelineStatusView> = new Set([
  'all',
  'open',
  'won',
  'lost',
]);

const LEAD_SCORE_VIEWS: ReadonlySet<SalesLeadScoreView> = new Set([
  'all',
  'high',
  'medium',
  'low',
]);

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

type SalesContext = Awaited<ReturnType<typeof requireSalesContext>>;

function canViewOrders(context: SalesContext): boolean {
  return (
    hasSalesPermission(
      context.permissions.isOwner,
      context.permissions.permissionSet,
      SALES_PERMISSIONS.ORDER_VIEW,
    ) ||
    hasSalesPermission(
      context.permissions.isOwner,
      context.permissions.permissionSet,
      SALES_PERMISSIONS.ORDER_MANAGE,
    )
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_SQLCODE
  );
}

/**
 * Enforces per-user saved-view caps. Runs before INSERT so the user gets a
 * clean error instead of a 23505 or a silently-dropped record.
 */
async function assertSavedViewCapacity(
  context: SalesContext,
  table: 'sales_quote_saved_views' | 'sales_order_saved_views' | 'sales_pipeline_saved_views',
  noun: string,
): Promise<void> {
  const result = await context.pool.query<{ count: number | string }>(
    `SELECT COUNT(*)::int AS count FROM ${table}
     WHERE company_id = $1
       AND user_id = $2
       AND deleted_at IS NULL`,
    [context.companyId, context.userId],
  );
  if (Number(result.rows[0]?.count || 0) >= MAX_SAVED_VIEWS) {
    throw new SalesError(
      'INVALID_INPUT',
      `You can save up to ${MAX_SAVED_VIEWS} ${noun}. Delete an unused view before saving another.`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Quote views                                                               */
/* -------------------------------------------------------------------------- */

type SavedQuoteViewRow = {
  id: string;
  name: string;
  status_view: SalesQuoteStatusView;
  search_query: string;
  created_at: Date | string;
};

function mapSavedQuoteView(row: SavedQuoteViewRow): SalesSavedQuoteView {
  return {
    id: String(row.id),
    name: String(row.name),
    statusView: row.status_view,
    searchQuery: String(row.search_query || ''),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getSalesSavedQuoteViews(): Promise<SalesSavedQuoteView[]> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);

  const result = await context.pool.query<SavedQuoteViewRow>(
    `SELECT id, name, status_view, search_query, created_at
     FROM sales_quote_saved_views
     WHERE company_id = $1
       AND user_id = $2
       AND deleted_at IS NULL
     ORDER BY LOWER(name), created_at DESC
     LIMIT $3`,
    [context.companyId, context.userId, MAX_SAVED_VIEWS],
  );

  return result.rows.map(mapSavedQuoteView);
}

export async function saveSalesSavedQuoteView(
  input: Record<string, unknown>,
): Promise<SalesSavedQuoteView> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);

  const name = cleanText(input.name, 80);
  const rawStatusView = cleanText(input.statusView, 40) || 'all';
  const searchQuery = cleanText(input.searchQuery, 120);

  if (!name) {
    throw new SalesError('INVALID_INPUT', 'Enter a name for this saved quotation view.');
  }
  if (!QUOTE_STATUS_VIEWS.has(rawStatusView as SalesQuoteStatusView)) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid quotation work queue.');
  }

  await assertSavedViewCapacity(context, 'sales_quote_saved_views', 'quotation views');

  try {
    const result = await context.pool.query<SavedQuoteViewRow>(
      `INSERT INTO sales_quote_saved_views
         (company_id, user_id, name, status_view, search_query, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id, name, status_view, search_query, created_at`,
      [context.companyId, context.userId, name, rawStatusView, searchQuery, context.userId],
    );
    return mapSavedQuoteView(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SalesError(
        'INVALID_INPUT',
        'A saved quotation view with that name already exists.',
      );
    }
    throw error;
  }
}

export async function deleteSalesSavedQuoteView(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const viewId = requireUuid(input.viewId, 'Saved quotation view');

  const result = await context.pool.query<{ id: string }>(
    `UPDATE sales_quote_saved_views
     SET deleted_at = NOW(), updated_by = $4, updated_at = NOW()
     WHERE id = $1
       AND company_id = $2
       AND user_id = $3
       AND deleted_at IS NULL
     RETURNING id`,
    [viewId, context.companyId, context.userId, context.userId],
  );
  if (result.rows.length !== 1) {
    throw new SalesError('INVALID_INPUT', 'The saved quotation view was not found.');
  }
  return { id: String(result.rows[0].id) };
}

/* -------------------------------------------------------------------------- */
/*  Order views                                                               */
/* -------------------------------------------------------------------------- */

type SavedOrderViewRow = {
  id: string;
  name: string;
  status_view: SalesOrderStatusView;
  search_query: string;
  sort_by: SalesOrderSortBy;
  created_at: Date | string;
};

function mapSavedOrderView(row: SavedOrderViewRow): SalesSavedOrderView {
  return {
    id: String(row.id),
    name: String(row.name),
    statusView: row.status_view,
    searchQuery: String(row.search_query || ''),
    sortBy: row.sort_by || 'newest',
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getSalesSavedOrderViews(): Promise<SalesSavedOrderView[]> {
  const context = await requireSalesContext();
  if (!canViewOrders(context)) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'You do not have permission to view Sales orders.',
    );
  }

  const result = await context.pool.query<SavedOrderViewRow>(
    `SELECT id, name, status_view, search_query, sort_by, created_at
     FROM sales_order_saved_views
     WHERE company_id = $1
       AND user_id = $2
       AND deleted_at IS NULL
     ORDER BY LOWER(name), created_at DESC
     LIMIT $3`,
    [context.companyId, context.userId, MAX_SAVED_VIEWS],
  );
  return result.rows.map(mapSavedOrderView);
}

export async function saveSalesSavedOrderView(
  input: Record<string, unknown>,
): Promise<SalesSavedOrderView> {
  const context = await requireSalesContext();
  if (!canViewOrders(context)) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'You do not have permission to view Sales orders.',
    );
  }

  const name = cleanText(input.name, 80);
  const rawStatusView = cleanText(input.statusView, 40) || 'all';
  const rawSortBy = cleanText(input.sortBy, 40) || 'newest';
  const searchQuery = cleanText(input.searchQuery, 120);

  if (!name) {
    throw new SalesError('INVALID_INPUT', 'Enter a name for this saved sales order view.');
  }
  if (!ORDER_STATUS_VIEWS.has(rawStatusView as SalesOrderStatusView)) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid sales order work queue.');
  }
  if (!ORDER_SORTS.has(rawSortBy as SalesOrderSortBy)) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid sales order sort order.');
  }

  await assertSavedViewCapacity(context, 'sales_order_saved_views', 'sales order views');

  try {
    const result = await context.pool.query<SavedOrderViewRow>(
      `INSERT INTO sales_order_saved_views
         (company_id, user_id, name, status_view, search_query, sort_by, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING id, name, status_view, search_query, sort_by, created_at`,
      [
        context.companyId,
        context.userId,
        name,
        rawStatusView,
        searchQuery,
        rawSortBy,
        context.userId,
      ],
    );
    return mapSavedOrderView(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SalesError(
        'INVALID_INPUT',
        'A saved sales order view with that name already exists.',
      );
    }
    throw error;
  }
}

export async function deleteSalesSavedOrderView(input: Record<string, unknown>) {
  const context = await requireSalesContext();
  if (!canViewOrders(context)) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'You do not have permission to view Sales orders.',
    );
  }
  const viewId = requireUuid(input.viewId, 'Saved sales order view');

  const result = await context.pool.query<{ id: string }>(
    `UPDATE sales_order_saved_views
     SET deleted_at = NOW(), updated_by = $4, updated_at = NOW()
     WHERE id = $1
       AND company_id = $2
       AND user_id = $3
       AND deleted_at IS NULL
     RETURNING id`,
    [viewId, context.companyId, context.userId, context.userId],
  );
  if (result.rows.length !== 1) {
    throw new SalesError('INVALID_INPUT', 'The saved sales order view was not found.');
  }
  return { id: String(result.rows[0].id) };
}

/* -------------------------------------------------------------------------- */
/*  Pipeline views                                                            */
/* -------------------------------------------------------------------------- */

type SavedPipelineViewRow = {
  id: string;
  name: string;
  view_type: SalesPipelineViewType;
  status_view: SalesPipelineStatusView;
  score_view: SalesLeadScoreView;
  search_query: string;
  created_at: Date | string;
};

function mapSavedPipelineView(row: SavedPipelineViewRow): SalesSavedPipelineView {
  return {
    id: String(row.id),
    name: String(row.name),
    viewType: row.view_type,
    statusView: row.status_view,
    scoreView: row.score_view || 'all',
    searchQuery: String(row.search_query || ''),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getSalesSavedPipelineViews(): Promise<SalesSavedPipelineView[]> {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_VIEW);

  const result = await context.pool.query<SavedPipelineViewRow>(
    `SELECT id, name, view_type, status_view, score_view, search_query, created_at
     FROM sales_pipeline_saved_views
     WHERE company_id = $1
       AND user_id = $2
       AND deleted_at IS NULL
     ORDER BY view_type, LOWER(name), created_at DESC
     LIMIT $3`,
    [context.companyId, context.userId, MAX_SAVED_VIEWS],
  );
  return result.rows.map(mapSavedPipelineView);
}

export async function saveSalesSavedPipelineView(
  input: Record<string, unknown>,
): Promise<SalesSavedPipelineView> {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_VIEW);

  const name = cleanText(input.name, 80);
  const rawViewType = cleanText(input.viewType, 30);
  const rawStatusView = cleanText(input.statusView, 30) || 'all';
  const rawScoreView = cleanText(input.scoreView, 20) || 'all';
  const searchQuery = cleanText(input.searchQuery, 120);

  if (!name) {
    throw new SalesError('INVALID_INPUT', 'Enter a name for this saved pipeline view.');
  }
  if (!PIPELINE_VIEW_TYPES.has(rawViewType as SalesPipelineViewType)) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose either the lead list or opportunity pipeline.',
    );
  }
  const viewType = rawViewType as SalesPipelineViewType;
  const allowedStatuses =
    viewType === 'leads' ? LEAD_PIPELINE_STATUSES : OPPORTUNITY_PIPELINE_STATUSES;
  if (!allowedStatuses.has(rawStatusView as SalesPipelineStatusView)) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid status filter for this pipeline view.',
    );
  }
  if (!LEAD_SCORE_VIEWS.has(rawScoreView as SalesLeadScoreView)) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid lead score filter.');
  }
  if (viewType === 'opportunities' && rawScoreView !== 'all') {
    throw new SalesError(
      'INVALID_INPUT',
      'Lead score filters can only be saved for lead views.',
    );
  }

  await assertSavedViewCapacity(context, 'sales_pipeline_saved_views', 'pipeline views');

  try {
    const result = await context.pool.query<SavedPipelineViewRow>(
      `INSERT INTO sales_pipeline_saved_views
         (company_id, user_id, view_type, name, status_view, score_view,
          search_query, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING id, name, view_type, status_view, score_view, search_query, created_at`,
      [
        context.companyId,
        context.userId,
        viewType,
        name,
        rawStatusView,
        rawScoreView,
        searchQuery,
        context.userId,
      ],
    );
    return mapSavedPipelineView(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SalesError(
        'INVALID_INPUT',
        'A pipeline view with that name already exists in this list.',
      );
    }
    throw error;
  }
}

export async function deleteSalesSavedPipelineView(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.PIPELINE_VIEW);
  const viewId = requireUuid(input.viewId, 'Saved pipeline view');

  const result = await context.pool.query<{ id: string }>(
    `UPDATE sales_pipeline_saved_views
     SET deleted_at = NOW(), updated_by = $4, updated_at = NOW()
     WHERE id = $1
       AND company_id = $2
       AND user_id = $3
       AND deleted_at IS NULL
     RETURNING id`,
    [viewId, context.companyId, context.userId, context.userId],
  );
  if (result.rows.length !== 1) {
    throw new SalesError('INVALID_INPUT', 'The saved pipeline view was not found.');
  }
  return { id: String(result.rows[0].id) };
}