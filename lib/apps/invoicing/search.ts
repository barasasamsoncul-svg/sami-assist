import 'server-only';

import type {
  WorkspaceSearchProvider,
} from '@/lib/search/types';

import {
  INVOICING_PERMISSIONS,
  searchInvoicingRecords,
} from '@/lib/apps/invoicing/service';

export const INVOICING_SEARCH_PROVIDER:
  WorkspaceSearchProvider = {
    key: 'invoicing',
    search: async (
      context,
      query,
    ) => {
      if (
        !context.isOwner &&
        !context.permissionSet.has(
          INVOICING_PERMISSIONS
            .INVOICE_VIEW,
        )
      ) {
        return [];
      }

      const records =
        await searchInvoicingRecords(
          context.tenantId,
          context.companyId,
          query,
          15,
        );

      return records.map(
        (record, index) => ({
          id:
            'invoicing:' +
            record.kind +
            ':' +
            record.id,
          kind: 'record' as const,
          title: record.title,
          subtitle: record.subtitle,
          description:
            record.kind === 'invoice'
              ? record.currency +
                ' ' +
                record.amount.toLocaleString()
              : 'Invoicing customer',
          href: '/apps/invoicing',
          iconKey:
            record.kind === 'invoice'
              ? 'receipt'
              : 'users',
          badge: record.badge,
          score: 100 - index,
          action: null,
          source: 'invoicing',
        }),
      );
    },
  };
