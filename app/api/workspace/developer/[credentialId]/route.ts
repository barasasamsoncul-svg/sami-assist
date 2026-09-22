import {
  NextRequest,
} from 'next/server';

import {
  manageWorkspaceApiCredential,
} from '@/lib/services/workspace-developer';

import {
  developerWorkspaceJson,
  handleDeveloperWorkspaceError,
  readDeveloperJson,
  rejectDeveloperCrossOrigin,
} from '@/lib/services/workspace-developer-api';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

type Context = {
  params:
    Promise<{
      credentialId:
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
    rejectDeveloperCrossOrigin(
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
        readDeveloperJson(
          request,
        ),
        context.params,
      ]);

    const result =
      await manageWorkspaceApiCredential(
        params.credentialId,
        {
          operation:
            body.operation,
        },
      );

    return developerWorkspaceJson({
      success:
        true,
      result,
    });
  } catch (
    error
  ) {
    return handleDeveloperWorkspaceError(
      error,
    );
  }
}
