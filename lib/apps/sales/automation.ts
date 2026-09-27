import 'server-only';

import {
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

import type {
  SamiAutomationTriggerDefinition,
} from '@/lib/automation/types';


export const SALES_AUTOMATION_TRIGGERS:
  SamiAutomationTriggerDefinition[] = [
    {
      key:
        'sales.quote.sent',
      name:
        'Quotation sent',
      description:
        'Run after a quotation is successfully sent through SaMi Sales.',
      type:
        'event',
      moduleKey:
        'sales',
      resourceKey:
        'quote',
      requiredPermissions: [
        SALES_PERMISSIONS.QUOTE_VIEW,
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
        'Run after an accepted quotation becomes a sales order.',
      type:
        'event',
      moduleKey:
        'sales',
      resourceKey:
        'order',
      requiredPermissions: [
        SALES_PERMISSIONS.ORDER_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'sales.order.fulfilled',
      name:
        'Sales order fulfilled',
      description:
        'Run when all sales-order quantities have been fulfilled.',
      type:
        'event',
      moduleKey:
        'sales',
      resourceKey:
        'order',
      requiredPermissions: [
        SALES_PERMISSIONS.ORDER_VIEW,
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
        'Run after a sales order creates or recovers its linked customer invoice.',
      type:
        'event',
      moduleKey:
        'sales',
      resourceKey:
        'order',
      requiredPermissions: [
        SALES_PERMISSIONS.ORDER_VIEW,
      ],
      companyScoped:
        true,
    },
  ];
