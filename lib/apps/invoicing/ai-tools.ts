import 'server-only';

import type {
  SamiAiToolDefinition,
} from '@/lib/ai/types';

import {
  changeInvoiceStatus,
  createInvoice,
  getEInvoiceWorkspaceData,
  getEtimsWorkspaceData,
  getInvoicingInvoiceDetail,
  getInvoicingWorkspaceData,
  issueInvoiceCreditNote,
  recordInvoicePayment,
  INVOICING_PERMISSIONS,
  searchInvoicingRecords,
  sendInvoiceReminder,
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


function boundedInteger(
  input: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed =
    Number(
      input[key],
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return fallback;
  }

  return Math.max(
    min,
    Math.min(
      max,
      Math.trunc(
        parsed,
      ),
    ),
  );
}


function compactInvoice(
  invoice: {
    id: string;
    invoiceNumber: string;
    customerId: string;
    customerName: string;
    status: string;
    invoiceDate: string;
    dueDate: string;
    currency: string;
    totalAmount: number;
    paidAmount: number;
    creditedAmount: number;
    customerAvailableCredit: number;
    balanceDue: number;
    daysOverdue: number;
    reminderMode: string;
    reminderPauseUntil: string | null;
    reminderPauseReason: string | null;
  },
) {
  return {
    id:
      invoice.id,
    invoiceNumber:
      invoice.invoiceNumber,
    customerId:
      invoice.customerId,
    customerName:
      invoice.customerName,
    status:
      invoice.status,
    invoiceDate:
      invoice.invoiceDate,
    dueDate:
      invoice.dueDate,
    currency:
      invoice.currency,
    totalAmount:
      invoice.totalAmount,
    paidAmount:
      invoice.paidAmount,
    creditedAmount:
      invoice.creditedAmount,
    customerAvailableCredit:
      invoice.customerAvailableCredit,
    balanceDue:
      invoice.balanceDue,
    daysOverdue:
      invoice.daysOverdue,
    reminder: {
      mode:
        invoice.reminderMode,
      pauseUntil:
        invoice.reminderPauseUntil,
      pauseReason:
        invoice.reminderPauseReason,
    },
  };
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
      key: 'invoicing_invoice_detail',
      name: 'Explain invoice',
      description:
        'Read one invoice in depth, including line items, settlement, credit notes, lifecycle history, delivery outcomes and immutable document evidence available to the current user.',
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
        properties: {
          invoiceId: {
            type: 'string',
          },
        },
        required: [
          'invoiceId',
        ],
      },
      execute: async (
        _context,
        input,
      ) => {
        const detail =
          await getInvoicingInvoiceDetail(
            input.invoiceId,
          );

        return {
          invoice: {
            id:
              detail.id,
            invoiceNumber:
              detail.invoiceNumber,
            status:
              detail.status,
            invoiceDate:
              detail.invoiceDate,
            dueDate:
              detail.dueDate,
            serviceDate:
              detail.serviceDate,
            currency:
              detail.currency,
            exchangeRate:
              detail.exchangeRate,
            reference:
              detail.reference,
            purchaseOrderNumber:
              detail.purchaseOrderNumber,
            subtotal:
              detail.subtotal,
            discountTotal:
              detail.discountTotal,
            taxTotal:
              detail.taxTotal,
            shippingTotal:
              detail.shippingTotal,
            roundingAdjustment:
              detail.roundingAdjustment,
            totalAmount:
              detail.totalAmount,
            paidAmount:
              detail.paidAmount,
            creditedAmount:
              detail.creditedAmount,
            balanceDue:
              detail.balanceDue,
            taxCalculation:
              detail.taxCalculation,
            notes:
              detail.notes,
            terms:
              detail.terms,
            customer:
              detail.customer,
          },
          lines:
            detail.lines,
          payments:
            detail.payments,
          creditNotes:
            detail.creditNotes,
          history:
            detail.history,
          deliveries:
            detail.deliveries,
          documentSnapshots:
            detail.documentSnapshots,
        };
      },
    },
    {
      key: 'invoicing_collections_queue',
      name: 'Collections queue',
      description:
        'Prioritize unpaid and overdue invoices for collection attention using balance, days overdue, customer and reminder controls.',
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
          minDaysOverdue: {
            type: 'number',
            minimum: 0,
            maximum: 3650,
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 50,
          },
        },
      },
      execute: async (
        _context,
        input,
      ) => {
        const data =
          await getInvoicingWorkspaceData();

        const minDaysOverdue =
          boundedInteger(
            input,
            'minDaysOverdue',
            0,
            0,
            3650,
          );

        const limit =
          boundedInteger(
            input,
            'limit',
            20,
            1,
            50,
          );

        const queue =
          data.invoices
            .filter(
              invoice =>
                invoice.balanceDue >
                  0 &&
                invoice.daysOverdue >=
                  minDaysOverdue &&
                ![
                  'draft',
                  'pending_approval',
                  'rejected',
                  'cancelled',
                  'void',
                  'written_off',
                  'paid',
                ].includes(
                  invoice.status,
                ),
            )
            .sort(
              (
                left,
                right,
              ) =>
                right.daysOverdue -
                  left.daysOverdue ||
                right.balanceDue -
                  left.balanceDue,
            )
            .slice(
              0,
              limit,
            )
            .map(
              compactInvoice,
            );

        return {
          company:
            data.company,
          totals: {
            outstanding:
              data.metrics
                .outstandingTotal,
            overdue:
              data.metrics
                .overdueTotal,
            overdueInvoiceCount:
              data.metrics
                .overdueCount,
          },
          aging:
            data.aging,
          minDaysOverdue,
          queue,
        };
      },
    },
    {
      key: 'invoicing_customer_account',
      name: 'Customer receivables account',
      description:
        'Read one billing customer account with receivables totals, payment terms, credit controls and related invoices.',
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
          customerId: {
            type: 'string',
          },
        },
        required: [
          'customerId',
        ],
      },
      execute: async (
        _context,
        input,
      ) => {
        const customerId =
          cleanText(
            input,
            'customerId',
            80,
          );

        const data =
          await getInvoicingWorkspaceData();

        const customer =
          data.customers
            .find(
              item =>
                item.id ===
                customerId,
            );

        if (!customer) {
          return {
            found:
              false,
            customerId,
          };
        }

        return {
          found:
            true,
          customer: {
            id:
              customer.id,
            customerType:
              customer.customerType,
            name:
              customer.name,
            legalName:
              customer.legalName,
            contactName:
              customer.contactName,
            email:
              customer.email,
            phone:
              customer.phone,
            country:
              customer.country,
            countryCode:
              customer.countryCode,
            taxId:
              customer.taxId,
            currency:
              customer.currency,
            paymentTermsName:
              customer.paymentTermsName,
            dueDays:
              customer.dueDays,
            creditLimit:
              customer.creditLimit,
            reminderMode:
              customer.reminderMode,
            reminderPauseUntil:
              customer.reminderPauseUntil,
            reminderPauseReason:
              customer.reminderPauseReason,
            status:
              customer.status,
            invoiceCount:
              customer.invoiceCount,
            invoicedTotal:
              customer.invoicedTotal,
            paidTotal:
              customer.paidTotal,
            outstandingTotal:
              customer.outstandingTotal,
          },
          invoices:
            data.invoices
              .filter(
                invoice =>
                  invoice.customerId ===
                  customerId,
              )
              .sort(
                (
                  left,
                  right,
                ) =>
                  right.daysOverdue -
                    left.daysOverdue ||
                  right.balanceDue -
                    left.balanceDue,
              )
              .slice(
                0,
                50,
              )
              .map(
                compactInvoice,
              ),
        };
      },
    },
    {
      key: 'invoicing_recurring_health',
      name: 'Recurring billing health',
      description:
        'Inspect recurring invoice schedules, failures, retries and upcoming runs for the current company.',
      moduleKey: 'invoicing',
      operation: 'read',
      riskLevel: 'low',
      confirmationRequired: false,
      requiredAllPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
        INVOICING_PERMISSIONS
          .RECURRING_MANAGE,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 50,
          },
        },
      },
      execute: async (
        _context,
        input,
      ) => {
        const data =
          await getInvoicingWorkspaceData();

        const limit =
          boundedInteger(
            input,
            'limit',
            25,
            1,
            50,
          );

        const templates =
          [...data.recurring]
            .sort(
              (
                left,
                right,
              ) =>
                right.consecutiveFailures -
                  left.consecutiveFailures ||
                String(
                  left.nextRunAt,
                ).localeCompare(
                  String(
                    right.nextRunAt,
                  ),
                ),
            )
            .slice(
              0,
              limit,
            )
            .map(
              template => ({
                id:
                  template.id,
                name:
                  template.name,
                customerName:
                  template.customerName,
                status:
                  template.status,
                intervalUnit:
                  template.intervalUnit,
                intervalCount:
                  template.intervalCount,
                nextRunAt:
                  template.nextRunAt,
                runCount:
                  template.runCount,
                consecutiveFailures:
                  template.consecutiveFailures,
                maxRetryAttempts:
                  template.maxRetryAttempts,
                lastRunAt:
                  template.lastRunAt,
                lastSuccessAt:
                  template.lastSuccessAt,
                lastFailureAt:
                  template.lastFailureAt,
                retryAfter:
                  template.retryAfter,
                lastErrorCode:
                  template.lastErrorCode,
                lastErrorMessage:
                  template.lastErrorMessage,
                autoSend:
                  template.autoSend,
                deliveryChannels:
                  template.deliveryChannels,
                recentRuns:
                  template.runs
                    .slice(
                      0,
                      5,
                    ),
              }),
            );

        return {
          company:
            data.company,
          summary: {
            templateCount:
              data.recurring
                .length,
            activeCount:
              data.recurring
                .filter(
                  item =>
                    item.status ===
                    'active',
                )
                .length,
            failingCount:
              data.recurring
                .filter(
                  item =>
                    item.consecutiveFailures >
                    0,
                )
                .length,
          },
          templates,
        };
      },
    },
    {
      key: 'invoicing_fiscal_readiness',
      name: 'Fiscal invoicing readiness',
      description:
        'Check Kenya eTIMS and international Peppol/EDI readiness, recent validation/transmission state and configuration gaps without exposing provider secrets.',
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
        const [
          etims,
          international,
        ] =
          await Promise.all([
            getEtimsWorkspaceData(),
            getEInvoiceWorkspaceData(),
          ]);

        return {
          etims: {
            endpointConfigured:
              etims
                .endpointConfigured,
            profile: etims.profile
              ? {
                  solutionType:
                    etims.profile
                      .solutionType,
                  environment:
                    etims.profile
                      .environment,
                  status:
                    etims.profile
                      .status,
                  lastDeviceInitAt:
                    etims.profile
                      .lastDeviceInitAt,
                  lastReferenceSyncAt:
                    etims.profile
                      .lastReferenceSyncAt,
                  lastSuccessAt:
                    etims.profile
                      .lastSuccessAt,
                  lastErrorAt:
                    etims.profile
                      .lastErrorAt,
                  lastErrorCode:
                    etims.profile
                      .lastErrorCode,
                  lastErrorMessage:
                    etims.profile
                      .lastErrorMessage,
                }
              : null,
            readiness:
              etims.readiness,
            recentSubmissions:
              etims.submissions
                .slice(
                  0,
                  20,
                )
                .map(
                  submission => ({
                    documentNumber:
                      submission.documentNumber,
                    submissionType:
                      submission.submissionType,
                    environment:
                      submission.environment,
                    status:
                      submission.status,
                    attemptCount:
                      submission.attemptCount,
                    resultCode:
                      submission.resultCode,
                    resultMessage:
                      submission.resultMessage,
                    succeededAt:
                      submission.succeededAt,
                  }),
                ),
          },
          international: {
            standards:
              international
                .standards,
            profiles:
              international
                .profiles
                .map(
                  profile => ({
                    id:
                      profile.id,
                    name:
                      profile.name,
                    network:
                      profile.network,
                    providerKey:
                      profile.providerKey,
                    environment:
                      profile.environment,
                    status:
                      profile.status,
                    credentialConfigured:
                      profile.credentialConfigured,
                    endpointConfigured:
                      profile.endpointConfigured,
                    isDefault:
                      profile.isDefault,
                    lastSuccessAt:
                      profile.lastSuccessAt,
                    lastErrorAt:
                      profile.lastErrorAt,
                    lastErrorCode:
                      profile.lastErrorCode,
                    lastErrorMessage:
                      profile.lastErrorMessage,
                  }),
                ),
            participantCount:
              international
                .participants
                .filter(
                  participant =>
                    participant.isActive,
                )
                .length,
            documents:
              international
                .documents
                .slice(
                  0,
                  20,
                )
                .map(
                  document => ({
                    documentNumber:
                      document.documentNumber,
                    documentKind:
                      document.documentKind,
                    validationStatus:
                      document.validationStatus,
                    validationErrors:
                      document.validationErrors,
                    transmissionStatus:
                      document.transmissionStatus,
                    providerStatus:
                      document.providerStatus,
                    attemptCount:
                      document.attemptCount,
                    acceptedAt:
                      document.acceptedAt,
                    rejectedAt:
                      document.rejectedAt,
                  }),
                ),
          },
        };
      },
    },
    {
      key: 'invoicing_send_reminder',
      name: 'Send payment reminder',
      description:
        'Send an audited payment reminder for one invoice through configured delivery channels. This external communication always requires explicit confirmation.',
      moduleKey: 'invoicing',
      operation: 'write',
      riskLevel: 'high',
      confirmationRequired: true,
      requiredAllPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_SEND,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          invoiceId: {
            type: 'string',
          },
          channels: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'email',
                'sms',
                'whatsapp',
              ],
            },
            minItems: 1,
            maxItems: 3,
          },
        },
        required: [
          'invoiceId',
          'channels',
        ],
      },
      execute: async (
        _context,
        input,
      ) =>
        sendInvoiceReminder({
          invoiceId:
            input.invoiceId,
          channels:
            input.channels,
        }),
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
      name: 'Post or approve invoice',
      description:
        'Post a draft invoice when approvals are disabled, or approve and post an invoice already waiting for approval. The same auditable lifecycle rules as the Invoicing workspace apply.',
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
