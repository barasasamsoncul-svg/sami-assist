import 'server-only';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  deliverSalesQuote,
  normalizeSalesQuoteDeliveryChannels,
} from '@/lib/apps/sales/delivery';

import {
  SALES_PERMISSIONS,
  UUID_RE,
} from '@/lib/apps/sales/context';

import type {
  SamiAutomationActionDefinition,
  SamiAutomationActionHandler,
  SamiAutomationRuntimeContext,
  SamiAutomationTriggerDefinition,
} from '@/lib/automation/types';


export const SALES_AUTOMATION_TRIGGERS:
  SamiAutomationTriggerDefinition[] = [
    {
      key:
        'sales.quote.created',
      name:
        'Quotation created',
      description:
        'Run after a Sales quotation is created in the current company.',
      type:
        'event',
      moduleKey:
        'sales',
      resourceKey:
        'quote',
      requiredPermissions: [
        SALES_PERMISSIONS
          .QUOTE_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'sales.quote.sent',
      name:
        'Quotation sent',
      description:
        'Run after a Sales quotation is delivered to the customer.',
      type:
        'event',
      moduleKey:
        'sales',
      resourceKey:
        'quote',
      requiredPermissions: [
        SALES_PERMISSIONS
          .QUOTE_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'sales.quote.accepted',
      name:
        'Quotation accepted',
      description:
        'Run after a quotation is recorded as accepted.',
      type:
        'event',
      moduleKey:
        'sales',
      resourceKey:
        'quote',
      requiredPermissions: [
        SALES_PERMISSIONS
          .QUOTE_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'sales.order.created',
      name:
        'Sales order created',
      description:
        'Run after an accepted quotation becomes a Sales order.',
      type:
        'event',
      moduleKey:
        'sales',
      resourceKey:
        'order',
      requiredPermissions: [
        SALES_PERMISSIONS
          .ORDER_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'sales.order.fulfillment.changed',
      name:
        'Sales order fulfillment changed',
      description:
        'Run after delivered quantities change on a Sales order.',
      type:
        'event',
      moduleKey:
        'sales',
      resourceKey:
        'order',
      requiredPermissions: [
        SALES_PERMISSIONS
          .ORDER_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'sales.invoice.created',
      name:
        'Sales invoice created',
      description:
        'Run after Sales hands an order batch to Invoicing.',
      type:
        'event',
      moduleKey:
        'sales',
      resourceKey:
        'order',
      requiredPermissions: [
        SALES_PERMISSIONS
          .ORDER_VIEW,
      ],
      companyScoped:
        true,
    },
  ];


export const SALES_AUTOMATION_ACTIONS:
  SamiAutomationActionDefinition[] = [
    {
      key:
        'sales.quote.send',
      name:
        'Send Sales quotation',
      description:
        'Deliver a quotation through email, SMS or WhatsApp using the same Sales delivery service.',
      moduleKey:
        'sales',
      operation:
        'write',
      resourceKey:
        'quote',
      requiredPermissions: [
        SALES_PERMISSIONS
          .QUOTE_SEND,
      ],
      approvalPolicy:
        'always',
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          quoteId: {
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
          'quoteId',
          'channels',
        ],
      },
    },
  ];


async function companyName(
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
    name:
      String(
        company.rows[0]
          ?.name ||
        'SaMi workspace',
      ),
  };
}


export const SALES_AUTOMATION_ACTION_HANDLERS =
  new Map<
    string,
    SamiAutomationActionHandler
  >([
    [
      'sales.quote.send',
      async (
        runtime,
        input,
      ) => {
        const quoteId =
          typeof input.quoteId ===
            'string' &&
          UUID_RE.test(
            input.quoteId,
          )
            ? input.quoteId
            : '';

        if (
          !quoteId
        ) {
          throw new Error(
            'Choose a valid quotation.',
          );
        }

        const channels =
          normalizeSalesQuoteDeliveryChannels(
            input.channels,
          );

        if (
          channels.length ===
            0
        ) {
          throw new Error(
            'Choose at least one quotation delivery channel.',
          );
        }

        const company =
          await companyName(
            runtime,
          );

        const result =
          await deliverSalesQuote({
            pool:
              company.pool,
            tenantId:
              runtime.tenantId,
            companyId:
              runtime.companyId,
            companyName:
              company.name,
            userId:
              runtime.userId,
            quoteId,
            channels,
          });

        return {
          quoteId,
          channels,
          ...result,
        } as
          Record<
            string,
            unknown
          >;
      },
    ],
  ]);
