import {
  getWorkspaceExternalAppLauncherEntries,
} from '@/lib/services/workspace-integrations';

import {
  handleIntegrationApiError,
  integrationJson,
} from '@/lib/services/workspace-integrations-api';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export async function GET() {
  try {
    const apps =
      await getWorkspaceExternalAppLauncherEntries();

    return integrationJson({
      success:
        true,
      apps,
    });
  } catch (
    error
  ) {
    return handleIntegrationApiError(
      error,
    );
  }
}
