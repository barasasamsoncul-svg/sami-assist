import {
  NextRequest,
} from 'next/server';

import {
  createWorkspaceApiCredential,
  getWorkspaceDeveloperState,
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

export async function GET() {
  try {
    const state =
      await getWorkspaceDeveloperState();

    return developerWorkspaceJson({
      success:
        true,
      ...state,
    });
  } catch (
    error
  ) {
    return handleDeveloperWorkspaceError(
      error,
    );
  }
}

export async function POST(
  request:
    NextRequest,
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
    const body =
      await readDeveloperJson(
        request,
      );

    const result =
      await createWorkspaceApiCredential({
        name:
          body.name,
        scopes:
          body.scopes,
        allowedAppKeys:
          body.allowedAppKeys,
        rateLimitPerMinute:
          body.rateLimitPerMinute,
        expiresInDays:
          body.expiresInDays,
      });

    return developerWorkspaceJson(
      {
        success:
          true,
        result,
      },
      201,
    );
  } catch (
    error
  ) {
    return handleDeveloperWorkspaceError(
      error,
    );
  }
}
