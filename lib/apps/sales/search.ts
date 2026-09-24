import 'server-only';

import type {
  WorkspaceSearchProvider,
} from '@/lib/search/types';

import {
  SALES_PERMISSIONS,
  searchSalesRecords,
} from '@/lib/apps/sales/service';


export const SALES_SEARCH_PROVIDER:
  WorkspaceSearchProvider = {
    key:
      'sales',

    search:
      async (
        context,
        query,
      ) => {
        if (
          !context.isOwner &&
          !context.permissionSet.has(
            SALES_PERMISSIONS.QUOTE_VIEW,
          )
        ) {
          return [];
        }

        const rows =
          await searchSalesRecords(
            context.tenantId,
            context.companyId,
            query,
            20,
          );

        return rows.map(
          (
            row,
            index,
          ) => ({
            id:
              'sales:' +
              row.kind +
              ':' +
              row.id,
            kind:
              'record' as const,
            title:
              row.number,
            subtitle:
              row.customerName,
            description:
              row.currency +
              ' ' +
              row.totalAmount
                .toLocaleString(),
            href:
              row.kind ===
                'quote'
                ? '/apps/sales/quotes/' +
                  row.id
                : '/apps/sales/orders/' +
                  row.id,
            iconKey:
              row.kind ===
                'quote'
                ? 'file-text'
                : 'shopping-cart',
            badge:
              row.status,
            score:
              100 -
              index,
            action:
              null,
            source:
              'sales',
          }),
        );
      },
  };
