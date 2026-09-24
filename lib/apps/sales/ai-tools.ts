import 'server-only';

import type {
  SamiAiToolDefinition,
} from '@/lib/ai/types';

import {
  SALES_PERMISSIONS,
  getSalesWorkspaceData,
  searchSalesRecords,
} from '@/lib/apps/sales/service';


export const SALES_AI_TOOLS:
  SamiAiToolDefinition[] = [
    {
      key:
        'sales_summary',
      name:
        'Sales summary',
      description:
        'Read quotation and sales-order performance for the current company.',
      moduleKey:
        'sales',
      operation:
        'read',
      riskLevel:
        'low',
      confirmationRequired:
        false,
      requiredAllPermissions: [
        SALES_PERMISSIONS.QUOTE_VIEW,
      ],
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {},
      },
      execute:
        async () => {
          const data =
            await getSalesWorkspaceData();

          return {
            company:
              data.company,
            metrics:
              data.metrics,
            statusCounts:
              data.statusCounts,
            monthly:
              data.monthly,
            topCustomers:
              data.topCustomers,
          };
        },
    },
    {
      key:
        'sales_search',
      name:
        'Search Sales',
      description:
        'Search quotations and sales orders in the current company.',
      moduleKey:
        'sales',
      operation:
        'read',
      riskLevel:
        'low',
      confirmationRequired:
        false,
      requiredAllPermissions: [
        SALES_PERMISSIONS.QUOTE_VIEW,
      ],
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          query: {
            type:
              'string',
          },
        },
        required: [
          'query',
        ],
      },
      execute:
        async (
          context,
          input,
        ) => {
          const query =
            typeof input.query ===
              'string'
              ? input.query
                  .trim()
                  .slice(
                    0,
                    120,
                  )
              : '';

          return {
            results:
              query
                ? await searchSalesRecords(
                    context.tenantId,
                    context.companyId,
                    query,
                    20,
                  )
                : [],
          };
        },
    },
  ];
