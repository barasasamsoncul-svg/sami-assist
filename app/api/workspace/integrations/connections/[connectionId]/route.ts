import {
  NextRequest,
} from 'next/server';

import {
  checkWorkspaceIntegrationHealth,
  disconnectWorkspaceIntegration,
  runWorkspaceIntegrationSync,
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
      operation ===
        'disconnect'
    ) {
      const result =
        await disconnectWorkspaceIntegration(
          params.connectionId,
        );

      return integrationJson({
        success:
          true,
        result,
      });
    }

    if (
      operation ===
        'health_check'
    ) {
      const result =
        await checkWorkspaceIntegrationHealth(
          params.connectionId,
        );

      return integrationJson({
        success:
          true,
        result,
      });
    }

    if (
      operation ===
        'sync'
    ) {
      const result =
        await runWorkspaceIntegrationSync(
          params.connectionId,
        );

      return integrationJson({
        success:
          true,
        result,
      });
    }

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
  } catch (
    error
  ) {
    return handleIntegrationApiError(
      error,
    );
  }
}
