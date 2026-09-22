import {
  NextRequest,
} from 'next/server';

import {
  createWorkspaceExternalApp,
  createWorkspaceWebhookEndpoint,
  getWorkspaceIntegrationState,
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

export async function GET() {
  try {
    const state =
      await getWorkspaceIntegrationState();

    return integrationJson({
      success:
        true,
      ...state,
    });
  } catch (
    error
  ) {
    return handleIntegrationApiError(
      error,
    );
  }
}

export async function POST(
  request:
    NextRequest,
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
    const body =
      await readIntegrationJson(
        request,
      );

    const operation =
      typeof body.operation ===
        'string'
        ? body.operation
            .trim()
            .toLowerCase()
        : '';

    if (
      operation ===
        'create_webhook'
    ) {
      const result =
        await createWorkspaceWebhookEndpoint({
          name:
            body.name,
          eventKeys:
            body.eventKeys,
        });

      return integrationJson(
        {
          success:
            true,
          result,
        },
        201,
      );
    }

    if (
      operation ===
        'create_external_app'
    ) {
      const result =
        await createWorkspaceExternalApp({
          name:
            body.name,
          description:
            body.description,
          launchUrl:
            body.launchUrl,
          assignmentMode:
            body.assignmentMode,
        });

      return integrationJson(
        {
          success:
            true,
          result,
        },
        201,
      );
    }

    return integrationJson(
      {
        success:
          false,
        code:
          'INVALID_INTEGRATION_OPERATION',
        error:
          'Choose a supported integration operation.',
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
