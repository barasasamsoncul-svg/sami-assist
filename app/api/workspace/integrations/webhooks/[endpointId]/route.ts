import {
  NextRequest,
} from 'next/server';

import {
  manageWorkspaceWebhookEndpoint,
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
      endpointId:
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
      await manageWorkspaceWebhookEndpoint(
        params.endpointId,
        body.operation,
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
