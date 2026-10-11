import 'server-only';

import {
  cleanText,
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

import type {
  SalesQuoteStatusView,
  SalesSavedQuoteView,
} from '@/lib/apps/sales/types';

const ALLOWED_STATUS_VIEWS = new Set<SalesQuoteStatusView>([
  'all',
  'draft',
  'needs_approval',
  'awaiting_response',
  'accepted',
  'converted',
  'closed_without_sale',
]);

const MAX_SAVED_VIEWS = 25;

type SavedQuoteViewRow = {
  id: string;
  name: string;
  status_view: SalesQuoteStatusView;
  search_query: string;
  created_at: Date | string;
};

function mapSavedView(row: SavedQuoteViewRow): SalesSavedQuoteView {
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
    `
      SELECT id, name, status_view, search_query, created_at
      FROM sales_quote_saved_views
      WHERE company_id = $1
        AND user_id = $2
        AND deleted_at IS NULL
      ORDER BY LOWER(name), created_at DESC
      LIMIT $3
    `,
    [context.companyId, context.userId, MAX_SAVED_VIEWS],
  );

  return result.rows.map(mapSavedView);
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

  if (!ALLOWED_STATUS_VIEWS.has(rawStatusView as SalesQuoteStatusView)) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid quotation work queue.');
  }

  const countResult = await context.pool.query<{ count: number | string }>(
    `
      SELECT COUNT(*)::int AS count
      FROM sales_quote_saved_views
      WHERE company_id = $1
        AND user_id = $2
        AND deleted_at IS NULL
    `,
    [context.companyId, context.userId],
  );

  if (Number(countResult.rows[0]?.count || 0) >= MAX_SAVED_VIEWS) {
    throw new SalesError(
      'INVALID_INPUT',
      'You can save up to 25 quotation views. Delete an unused view before saving another.',
    );
  }

  try {
    const result = await context.pool.query<SavedQuoteViewRow>(
      `
        INSERT INTO sales_quote_saved_views (
          company_id,
          user_id,
          name,
          status_view,
          search_query,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6)
        RETURNING id, name, status_view, search_query, created_at
      `,
      [
        context.companyId,
        context.userId,
        name,
        rawStatusView,
        searchQuery,
        context.userId,
      ],
    );

    return mapSavedView(result.rows[0]);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'A saved quotation view with that name already exists.',
      );
    }

    throw error;
  }
}

export async function deleteSalesSavedQuoteView(
  input: Record<string, unknown>,
) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const viewId = requireUuid(input.viewId, 'Saved quotation view');

  const result = await context.pool.query<{ id: string }>(
    `
      UPDATE sales_quote_saved_views
      SET
        deleted_at = NOW(),
        updated_by = $4,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
        AND user_id = $3
        AND deleted_at IS NULL
      RETURNING id
    `,
    [viewId, context.companyId, context.userId, context.userId],
  );

  if (result.rows.length !== 1) {
    throw new SalesError('INVALID_INPUT', 'The saved quotation view was not found.');
  }

  return { id: String(result.rows[0].id) };
}
