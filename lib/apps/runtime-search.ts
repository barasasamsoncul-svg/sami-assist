import 'server-only';

import type {
  WorkspaceSearchProvider,
} from '@/lib/search/types';

import {
  ENTERPRISE_MODULE_SEARCH_PROVIDERS,
} from '@/lib/apps/enterprise/search';

import {
  SALES_SEARCH_PROVIDER,
} from '@/lib/apps/sales/search';

import {
  INVOICING_SEARCH_PROVIDER,
} from '@/lib/apps/invoicing/search';

/*
 * App-owned Search contributions.
 * Search core imports this boundary, never named business apps.
 */
export const APP_RUNTIME_SEARCH_PROVIDERS:
  WorkspaceSearchProvider[] = [
    ...ENTERPRISE_MODULE_SEARCH_PROVIDERS,
    SALES_SEARCH_PROVIDER,
    INVOICING_SEARCH_PROVIDER,
  ];
