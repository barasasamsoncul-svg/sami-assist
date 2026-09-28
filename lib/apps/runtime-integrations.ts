import 'server-only';

import type {
  SamiIntegrationProviderDefinition,
} from '@/lib/integrations/types';

/*
 * App-owned Integration provider contributions.
 * Current first-party business apps do not add provider definitions yet.
 * Future modules register providers here without modifying integration core.
 */
export const APP_RUNTIME_INTEGRATION_PROVIDERS:
  SamiIntegrationProviderDefinition[] = [];
