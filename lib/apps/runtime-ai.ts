import 'server-only';

import type {
  SamiAiToolDefinition,
} from '@/lib/ai/types';

import {
  ENTERPRISE_SUITE_AI_TOOLS,
} from '@/lib/apps/enterprise/ai-tools';

import {
  SALES_AI_TOOLS,
} from '@/lib/apps/sales/ai-tools';

import {
  INVOICING_AI_TOOLS,
} from '@/lib/apps/invoicing/ai-tools';

/*
 * App-owned SaMi AI contributions.
 * AI core imports this boundary, never named business apps.
 */
export const APP_RUNTIME_AI_TOOLS:
  SamiAiToolDefinition[] = [
    ...ENTERPRISE_SUITE_AI_TOOLS,
    ...SALES_AI_TOOLS,
    ...INVOICING_AI_TOOLS,
  ];
