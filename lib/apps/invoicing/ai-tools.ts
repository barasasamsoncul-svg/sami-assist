import 'server-only';

import type {
  SamiAiToolDefinition,
} from '@/lib/ai/types';

import {
  changeInvoiceStatus,
  createInvoice,
  getInvoicingWorkspaceData,
  issueInvoiceCreditNote,
  recordInvoicePayment,
  INVOICING_PERMISSIONS,
  searchInvoicingRecords,
  sendInvoiceToCustomer,
} from '@/lib/apps/invoicing/service';

function cleanText(
  input: Record<string, unknown>,
  key: string,
  max: number,
) {
  return typeof input[key] === 'string'
    ? String(input[key])
        .trim()
        .slice(0, max)
    : '';
}

export const INVOICING_AI_TOOLS:
  SamiAiToolDefinition[] = [
    {
      key: 'invoicing_summary',
      name: 'Invoicing summary',
      description:
        'Read invoice, receivables, overdue and collections totals for the current company.',
      moduleKey: 'invoicing',
      operation: 'read',
      riskLevel: 'low',
      confirmationRequired: false,
      requiredAllPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      execute: async () => {
        const data =
          await getInvoicingWorkspaceData();

        return {
          company: data.company,
          metrics: data.metrics,
          aging: data.aging,
          statusCounts:
            data.statusCounts,
        };
      },
    },
    {
      key: 'invoicing_search',
      name: 'Search invoices and customers',
      description:
        'Search invoices and billing customers in the current company by invoice number, customer, reference, PO number, email, phone or tax identifier.',
      moduleKey: 'invoicing',
      operation: 'read',
      riskLevel: 'low',
      confirmationRequired: false,
      requiredAllPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
        INVOICING_PERMISSIONS
          .CUSTOMER_VIEW,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {
            type: 'string',
          },
        },
        required: ['query'],
      },
      execute: async (
        context,
        input,
      ) => {
        const query =
          cleanText(
            input,
            'query',
            120,
          );

        if (!query) {
          return {
            results: [],
          };
        }

        return {
          results:
            await searchInvoicingRecords(
              context.tenantId,
              context.companyId,
              query,
              20,
              {
                includeCustomers:
                  true,
              },
            ),
        };
      },
    },
    {
      key: 'invoicing_create_draft',
      name: 'Create invoice draft',
      description:
        'Create a draft invoice in the current company. The customer must already exist. This is a financial write and always requires explicit confirmation.',
      moduleKey: 'invoicing',
      operation: 'write',
      riskLevel: 'high',
      confirmationRequired: true,
      requiredAllPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_CREATE,
        INVOICING_PERMISSIONS
          .CUSTOMER_VIEW,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          customerId: {
            type: 'string',
          },
          dueDate: {
            type: 'string',
          },
          reference: {
            type: 'string',
          },
          notes: {
            type: 'string',
          },
          lines: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              additionalProperties:
                false,
              properties: {
                description: {
                  type: 'string',
                },
                quantity: {
                  type: 'number',
                  minimum: 0.0001,
                },
                unitPrice: {
                  type: 'number',
                  minimum: 0,
                },
                taxRate: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                },
              },
              required: [
                'description',
                'quantity',
                'unitPrice',
              ],
            },
          },
        },
        required: [
          'customerId',
          'lines',
        ],
      },
      execute: async (
        _context,
        input,
      ) =>
        createInvoice({
          customerId:
            input.customerId,
          dueDate:
            input.dueDate,
          reference:
            input.reference,
          notes:
            input.notes,
          lines:
            input.lines,
          confirm: false,
        }),
    },

    {
      key: 'invoicing_confirm_invoice',
      name: 'Confirm invoice',
      description:
        'Confirm a draft invoice using the same auditable invoice lifecycle as the Invoicing workspace.',
      moduleKey: 'invoicing',
      operation: 'write',
      riskLevel: 'high',
      confirmationRequired: true,
      requiredAllPermissions: [
        INVOICING_PERMISSIONS.INVOICE_CONFIRM,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          invoiceId: { type: 'string' },
        },
        required: ['invoiceId'],
      },
      execute: async (_context, input) =>
        changeInvoiceStatus({
          invoiceId: input.invoiceId,
          status: 'confirmed',
        }),
    },
    {
      key: 'invoicing_send_invoice',
      name: 'Send invoice',
      description:
        'Deliver an invoice through configured channels after normal invoice validation.',
      moduleKey: 'invoicing',
      operation: 'write',
      riskLevel: 'high',
      confirmationRequired: true,
      requiredAllPermissions: [
        INVOICING_PERMISSIONS.INVOICE_SEND,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          invoiceId: { type: 'string' },
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
        required: ['invoiceId','channels'],
      },
      execute: async (_context, input) =>
        sendInvoiceToCustomer({
          invoiceId: input.invoiceId,
          channels: input.channels,
        }),
    },
    {
      key: 'invoicing_record_payment',
      name: 'Record invoice payment',
      description:
        'Post a payment against an open invoice with balance validation and duplicate-reference protection.',
      moduleKey: 'invoicing',
      operation: 'write',
      riskLevel: 'high',
      confirmationRequired: true,
      requiredAllPermissions: [
        INVOICING_PERMISSIONS.PAYMENT_RECORD,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          invoiceId: { type: 'string' },
          amount: { type: 'number', minimum: 0.0001 },
          method: { type: 'string' },
          reference: { type: 'string' },
          paymentDate: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['invoiceId','amount'],
      },
      execute: async (_context, input) =>
        recordInvoicePayment({
          invoiceId: input.invoiceId,
          amount: input.amount,
          method: input.method,
          reference: input.reference,
          paymentDate: input.paymentDate,
          notes: input.notes,
        }),
    },
    {
      key: 'invoicing_issue_credit_note',
      name: 'Issue invoice credit note',
      description:
        'Issue an auditable credit note against an eligible invoice and recalculate settlement state.',
      moduleKey: 'invoicing',
      operation: 'write',
      riskLevel: 'high',
      confirmationRequired: true,
      requiredAllPermissions: [
        INVOICING_PERMISSIONS.CREDIT_NOTE_MANAGE,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          invoiceId: { type: 'string' },
          amount: { type: 'number', minimum: 0.0001 },
          reason: { type: 'string' },
        },
        required: ['invoiceId','amount','reason'],
      },
      execute: async (_context, input) =>
        issueInvoiceCreditNote({
          invoiceId: input.invoiceId,
          amount: input.amount,
          reason: input.reason,
        }),
    },
  ];
