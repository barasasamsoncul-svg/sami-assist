import 'server-only';

import type {
  SamiModuleDataLifecycleHandler,
} from '@/lib/data-lifecycle/types';

/*
 * App-specific lifecycle handlers.
 * Generic company-scoped export is provided by suite-export.
 * Domain-specific erasure/export policies register here.
 */
export const APP_RUNTIME_DATA_LIFECYCLE_HANDLERS:
  SamiModuleDataLifecycleHandler[] = [];
