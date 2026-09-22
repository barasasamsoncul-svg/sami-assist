import {
  NextRequest,
} from 'next/server';

import {
  disconnectWorkspaceIntegration,
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
      connectionId:
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

    const operation =
      typeof body.operation ===
        'string'
        ? body.operation
            .trim()
            .toLowerCase()
        : '';

    if (
      operation !==
        'disconnect'
    ) {
      return integrationJson(
        {
          success:
            false,
          code:
            'INVALID_INTEGRATION_OPERATION',
          error:
            'Choose a supported connection operation.',
        },
        400,
      );
    }

    const result =
      await disconnectWorkspaceIntegration(
        params.connectionId,
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
