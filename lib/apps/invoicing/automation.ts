import 'server-only';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  deliverInvoice,
  normalizeInvoiceDeliveryChannels,
} from '@/lib/apps/invoicing/delivery';

import {
  INVOICING_PERMISSIONS,
  UUID_RE,
} from '@/lib/apps/invoicing/context';

import type {
  SamiAutomationActionDefinition,
  SamiAutomationActionHandler,
  SamiAutomationRuntimeContext,
  SamiAutomationTriggerDefinition,
} from '@/lib/automation/types';


export const INVOICING_AUTOMATION_TRIGGERS:
  SamiAutomationTriggerDefinition[] = [
    {
      key:
        'invoicing.invoice.created',
      name:
        'Invoice created',
      description:
        'Run after an invoice is created in the current company.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'invoice',
      requiredPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'invoicing.invoice.approval_submitted',
      name:
        'Invoice submitted for approval',
      description:
        'Run after a draft invoice enters the approval queue.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'invoice',
      requiredPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'invoicing.invoice.approval_rejected',
      name:
        'Invoice approval rejected',
      description:
        'Run after an approver rejects an invoice for rework.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'invoice',
      requiredPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'invoicing.invoice.confirmed',
      name:
        'Invoice confirmed',
      description:
        'Run after an invoice becomes a posted commercial receivable.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'invoice',
      requiredPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'invoicing.invoice.sent',
      name:
        'Invoice sent',
      description:
        'Run after an invoice is delivered to its customer.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'invoice',
      requiredPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'invoicing.payment.posted',
      name:
        'Invoice payment posted',
      description:
        'Run after a payment is posted against an invoice.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'payment',
      requiredPermissions: [
        INVOICING_PERMISSIONS
          .PAYMENT_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'invoicing.payment.reversed',
      name:
        'Invoice payment reversed',
      description:
        'Run after a previously posted invoice payment is reversed.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'payment',
      requiredPermissions: [
        INVOICING_PERMISSIONS
          .PAYMENT_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'invoicing.credit_note.issued',
      name:
        'Credit note issued',
      description:
        'Run after a credit note is issued against an invoice.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'credit_note',
      requiredPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'invoicing.invoice.corrected',
      name:
        'Invoice corrected',
      description:
        'Run after an invoice is cancelled, voided, written off or financially corrected.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'invoice',
      requiredPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
      ],
      companyScoped:
        true,
    },
  ];


export const INVOICING_AUTOMATION_ACTIONS:
  SamiAutomationActionDefinition[] = [
    {
      key:
        'invoicing.invoice.send',
      name:
        'Send invoice',
      description:
        'Deliver an invoice through an approved channel using the authoritative Invoicing delivery service.',
      moduleKey:
        'invoicing',
      operation:
        'write',
      resourceKey:
        'invoice',
      requiredPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_SEND,
      ],
      approvalPolicy:
        'always',
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          invoiceId: {
            type:
              'string',
          },
          channels: {
            type:
              'array',
            minItems:
              1,
            maxItems:
              3,
            items: {
              type:
                'string',
              enum: [
                'email',
                'sms',
                'whatsapp',
              ],
            },
          },
        },
        required: [
          'invoiceId',
          'channels',
        ],
      },
    },
    {
      key:
        'invoicing.invoice.remind',
      name:
        'Send invoice reminder',
      description:
        'Send a payment reminder through selected channels without changing invoice totals.',
      moduleKey:
        'invoicing',
      operation:
        'write',
      resourceKey:
        'invoice',
      requiredPermissions: [
        INVOICING_PERMISSIONS
          .INVOICE_SEND,
      ],
      approvalPolicy:
        'always',
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          invoiceId: {
            type:
              'string',
          },
          channels: {
            type:
              'array',
            minItems:
              1,
            maxItems:
              3,
            items: {
              type:
                'string',
              enum: [
                'email',
                'sms',
                'whatsapp',
              ],
            },
          },
        },
        required: [
          'invoiceId',
          'channels',
        ],
      },
    },
  ];


async function deliveryContext(
  runtime:
    SamiAutomationRuntimeContext,
) {
  const pool =
    await getTenantPoolByTenantId(
      runtime.tenantId,
    );

  const company =
    await pool.query(
      `
        SELECT name
        FROM companies
        WHERE id = $1
          AND deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        runtime.companyId,
      ],
    );

  return {
    pool,
    companyName:
      String(
        company.rows[0]
          ?.name ||
        'SaMi workspace',
      ),
  };
}


async function deliver(
  runtime:
    SamiAutomationRuntimeContext,
  input:
    Record<
      string,
      unknown
    >,
  purpose:
    'send' |
    'reminder',
) {
  const invoiceId =
    typeof input.invoiceId ===
      'string' &&
    UUID_RE.test(
      input.invoiceId,
    )
      ? input.invoiceId
      : '';

  if (
    !invoiceId
  ) {
    throw new Error(
      'Choose a valid invoice.',
    );
  }

  const channels =
    normalizeInvoiceDeliveryChannels(
      input.channels,
    );

  if (
    channels.length ===
      0
  ) {
    throw new Error(
      'Choose at least one invoice delivery channel.',
    );
  }

  const context =
    await deliveryContext(
      runtime,
    );

  const result =
    await deliverInvoice({
      pool:
        context.pool,
      tenantId:
        runtime.tenantId,
      companyId:
        runtime.companyId,
      companyName:
        context.companyName,
      userId:
        runtime.userId,
      invoiceId,
      channels,
      purpose,
    });

  return {
    ...result,
    purpose,
    channels,
  } as
    Record<
      string,
      unknown
    >;
}


export const INVOICING_AUTOMATION_ACTION_HANDLERS =
  new Map<
    string,
    SamiAutomationActionHandler
  >([
    [
      'invoicing.invoice.send',
      (
        runtime,
        input,
      ) =>
        deliver(
          runtime,
          input,
          'send',
        ),
    ],
    [
      'invoicing.invoice.remind',
      (
        runtime,
        input,
      ) =>
        deliver(
          runtime,
          input,
          'reminder',
        ),
    ],
  ]);
