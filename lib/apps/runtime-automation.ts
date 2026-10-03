import 'server-only';

import type {
  SamiAutomationActionDefinition,
  SamiAutomationActionHandler,
  SamiAutomationTriggerDefinition,
} from '@/lib/automation/types';

import {
  ENTERPRISE_AUTOMATION_ACTION_HANDLERS,
  ENTERPRISE_AUTOMATION_ACTIONS,
  ENTERPRISE_AUTOMATION_TRIGGERS,
} from '@/lib/apps/enterprise/automation';

import {
  SALES_AUTOMATION_ACTION_HANDLERS,
  SALES_AUTOMATION_ACTIONS,
  SALES_AUTOMATION_TRIGGERS,
} from '@/lib/apps/sales/automation';

import {
  INVOICING_AUTOMATION_ACTION_HANDLERS,
  INVOICING_AUTOMATION_ACTIONS,
  INVOICING_AUTOMATION_TRIGGERS,
} from '@/lib/apps/invoicing/automation';

import {
  ACCOUNTING_AUTOMATION_ACTION_HANDLERS,
  ACCOUNTING_AUTOMATION_ACTIONS,
  ACCOUNTING_AUTOMATION_TRIGGERS,
} from '@/lib/apps/accounting/automation';

/*
 * App-owned Automation contributions.
 * Automation core imports this boundary, never named business apps.
 */
export const APP_RUNTIME_AUTOMATION_TRIGGERS:
  SamiAutomationTriggerDefinition[] = [
    ...ENTERPRISE_AUTOMATION_TRIGGERS,
    ...SALES_AUTOMATION_TRIGGERS,
    ...INVOICING_AUTOMATION_TRIGGERS,
    ...ACCOUNTING_AUTOMATION_TRIGGERS,
  ];

export const APP_RUNTIME_AUTOMATION_ACTIONS:
  SamiAutomationActionDefinition[] = [
    ...ENTERPRISE_AUTOMATION_ACTIONS,
    ...SALES_AUTOMATION_ACTIONS,
    ...INVOICING_AUTOMATION_ACTIONS,
    ...ACCOUNTING_AUTOMATION_ACTIONS,
  ];

export const APP_RUNTIME_AUTOMATION_ACTION_HANDLERS =
  new Map<
    string,
    SamiAutomationActionHandler
  >([
    ...ENTERPRISE_AUTOMATION_ACTION_HANDLERS,
    ...SALES_AUTOMATION_ACTION_HANDLERS,
    ...INVOICING_AUTOMATION_ACTION_HANDLERS,
    ...ACCOUNTING_AUTOMATION_ACTION_HANDLERS,
  ]);
