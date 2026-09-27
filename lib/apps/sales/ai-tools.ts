import 'server-only';

import type {
  SamiAiToolDefinition,
} from '@/lib/ai/types';

import {
  SALES_PERMISSIONS,
  convertSalesQuoteToInvoice,
  createSalesOrderFromQuote,
  getSalesWorkspaceData,
  searchSalesRecords,
  sendSalesQuote,
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

    {
      key:
        'sales_send_quote',
      name:
        'Send sales quotation',
      description:
        'Send an approved quotation through configured delivery channels. Requires explicit confirmation.',
      moduleKey:
        'sales',
      operation:
        'write',
      riskLevel:
        'high',
      confirmationRequired:
        true,
      requiredAllPermissions: [
        SALES_PERMISSIONS.QUOTE_SEND,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          quoteId: { type: 'string' },
          channels: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['email','sms','whatsapp'],
            },
            minItems: 1,
            maxItems: 3,
          },
        },
        required: ['quoteId','channels'],
      },
      execute: async (_context, input) =>
        sendSalesQuote({
          quoteId: input.quoteId,
          channels: input.channels,
        }),
    },
    {
      key:
        'sales_quote_to_order',
      name:
        'Convert quotation to sales order',
      description:
        'Convert an accepted quotation into a governed sales order. Requires explicit confirmation.',
      moduleKey:
        'sales',
      operation:
        'write',
      riskLevel:
        'high',
      confirmationRequired:
        true,
      requiredAllPermissions: [
        SALES_PERMISSIONS.QUOTE_CONVERT,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          quoteId: { type: 'string' },
        },
        required: ['quoteId'],
      },
      execute: async (_context, input) =>
        createSalesOrderFromQuote({
          quoteId: input.quoteId,
        }),
    },
    {
      key:
        'sales_quote_to_invoice',
      name:
        'Convert quotation to invoice',
      description:
        'Convert an accepted quotation through Sales order creation into a controlled invoice. Requires explicit confirmation.',
      moduleKey:
        'sales',
      operation:
        'write',
      riskLevel:
        'high',
      confirmationRequired:
        true,
      requiredAllPermissions: [
        SALES_PERMISSIONS.QUOTE_CONVERT,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          quoteId: { type: 'string' },
          idempotencyKey: { type: 'string' },
          exchangeRate: { type: 'number', minimum: 0.00000001 },
        },
        required: ['quoteId'],
      },
      execute: async (_context, input) =>
        convertSalesQuoteToInvoice({
          quoteId: input.quoteId,
          idempotencyKey: input.idempotencyKey,
          exchangeRate: input.exchangeRate,
        }),
    },
  ];
