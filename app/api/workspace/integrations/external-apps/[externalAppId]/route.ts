import {
  NextRequest,
} from 'next/server';

import {
  manageWorkspaceExternalApp,
} from '@/lib/services/workspace-integrations';

import {
  handleIntegrationApiError,
  integrationJson,
  readIntegrationJson,
  rejectIntegrationCrossOrigin,
} from '@/lib/services/workspace-integrations-api';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

type Context = {
  params:
    Promise<{
      externalAppId:
        string;
    }>;
};

export async function PATCH(
  request:
    NextRequest,
  context:
    Context,
) {
  const rejected =
    rejectIntegrationCrossOrigin(
      request,
    );

  if (
    rejected
  ) {
    return rejected;
  }

  try {
    const [
      body,
      params,
    ] =
      await Promise.all([
        readIntegrationJson(
          request,
        ),
        context.params,
      ]);

    const result =
      await manageWorkspaceExternalApp(
        params.externalAppId,
        {
          operation:
            body.operation,
          name:
            body.name,
          description:
            body.description,
          launchUrl:
            body.launchUrl,
        },
      );

    return integrationJson({
      success:
        true,
      result,
    });
  } catch (
    error
  ) {
    return handleIntegrationApiError(
      error,
    );
  }
}
