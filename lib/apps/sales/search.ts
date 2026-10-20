import 'server-only';

import type {
  WorkspaceSearchProvider,
  WorkspaceSearchResult,
} from '@/lib/search/types';

import {
  SALES_PERMISSIONS,
  searchSalesPipelineRecords,
  searchSalesRecords,
} from '@/lib/apps/sales/service';

const MAX_RESULTS = 20;
const PER_SOURCE_LIMIT = 20;

/* -------------------------------------------------------------------------- */
/*  Internal ranking types                                                    */
/* -------------------------------------------------------------------------- */

type RankedSalesSearchResult = {
  kind: string;
  recordId: string;
  sourceOrder: number;
  sourceIndex: number;
  result: WorkspaceSearchResult;
};

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

export const SALES_SEARCH_PROVIDER: WorkspaceSearchProvider = {
  key: 'sales',

  async search(context, query) {
    const canSearchSalesRecords =
      context.isOwner ||
      context.permissionSet.has(SALES_PERMISSIONS.QUOTE_VIEW);

    const canSearchSalesPipeline =
      context.isOwner ||
      context.permissionSet.has(SALES_PERMISSIONS.PIPELINE_VIEW) ||
      context.permissionSet.has(SALES_PERMISSIONS.PIPELINE_MANAGE);

    if (!canSearchSalesRecords && !canSearchSalesPipeline) {
      return [];
    }

    const [rows, pipelineRows] = await Promise.all([
      canSearchSalesRecords
        ? searchSalesRecords(
            context.tenantId,
            context.companyId,
            query,
            PER_SOURCE_LIMIT,
          )
        : Promise.resolve([]),
      canSearchSalesPipeline
        ? searchSalesPipelineRecords(
            context.tenantId,
            context.companyId,
            query,
            PER_SOURCE_LIMIT,
          )
        : Promise.resolve([]),
    ]);

    const ranked: RankedSalesSearchResult[] = [
      ...rows.map<RankedSalesSearchResult>((row, index) => ({
        kind: row.kind,
        recordId: row.id,
        sourceOrder: 0,
        sourceIndex: index,
        result: {
          id: 'sales:' + row.kind + ':' + row.id,
          kind: 'record',
          title: row.number,
          subtitle: row.customerName,
          description: row.currency + ' ' + row.totalAmount.toLocaleString(),
          href:
            row.kind === 'quote'
              ? '/apps/sales/quotes/' + row.id
              : '/apps/sales/orders/' + row.id,
          iconKey: row.kind === 'quote' ? 'file-text' : 'shopping-cart',
          badge: row.status,
          score: 100 - index,
          action: null,
          source: 'sales',
        },
      })),
      ...pipelineRows.map<RankedSalesSearchResult>((row, index) => ({
        kind: row.kind,
        recordId: row.id,
        sourceOrder: 1,
        sourceIndex: index,
        result: {
          id: 'sales:' + row.kind + ':' + row.id,
          kind: 'record',
          title: row.title,
          subtitle: row.subtitle,
          description: row.description,
          href: '/apps/sales/opportunities',
          iconKey: row.kind === 'lead' ? 'user-round' : 'trending-up',
          badge: row.badge,
          score: 100 - index,
          action: null,
          source: 'sales',
        },
      })),
    ];

    ranked.sort(
      (left, right) =>
        right.result.score - left.result.score ||
        left.sourceOrder - right.sourceOrder ||
        left.sourceIndex - right.sourceIndex,
    );

    const seen = new Set<string>();
    const results: WorkspaceSearchResult[] = [];

    for (const item of ranked) {
      const key = JSON.stringify([item.kind, item.recordId]);
      if (seen.has(key)) continue;
      seen.add(key);

      results.push(item.result);
      if (results.length >= MAX_RESULTS) break;
    }

    return results;
  },
};