import {
  NextRequest,
} from 'next/server';

import {
  getWorkspaceExternalAppAssignmentState,
  setWorkspaceExternalAppAssignments,
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

export async function GET(
  _request:
    NextRequest,
  context:
    Context,
) {
  try {
    const params =
      await context.params;

    const state =
      await getWorkspaceExternalAppAssignmentState(
        params.externalAppId,
      );

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

export async function PUT(
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
      await setWorkspaceExternalAppAssignments(
        params.externalAppId,
        body.userIds,
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
