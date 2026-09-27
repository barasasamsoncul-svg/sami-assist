import 'server-only';

import {
  INVOICING_PERMISSIONS,
} from '@/lib/apps/invoicing/context';

import type {
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
        'Run after a customer invoice is created.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'invoice',
      requiredPermissions: [
        INVOICING_PERMISSIONS.INVOICE_VIEW,
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
        'Run after an invoice is confirmed and its optional accounting posting succeeds.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'invoice',
      requiredPermissions: [
        INVOICING_PERMISSIONS.INVOICE_VIEW,
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
        'Run after a payment is posted and applied to an invoice.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'payment',
      requiredPermissions: [
        INVOICING_PERMISSIONS.PAYMENT_VIEW,
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
        'Run after a posted invoice payment is reversed.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'payment',
      requiredPermissions: [
        INVOICING_PERMISSIONS.PAYMENT_VIEW,
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
        INVOICING_PERMISSIONS.INVOICE_VIEW,
      ],
      companyScoped:
        true,
    },
    {
      key:
        'invoicing.credit_note.cancelled',
      name:
        'Credit note cancelled',
      description:
        'Run after an issued credit note is cancelled and its accounting effect is reversed.',
      type:
        'event',
      moduleKey:
        'invoicing',
      resourceKey:
        'credit_note',
      requiredPermissions: [
        INVOICING_PERMISSIONS.INVOICE_VIEW,
      ],
      companyScoped:
        true,
    },
  ];
