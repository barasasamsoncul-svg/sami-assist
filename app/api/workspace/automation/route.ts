import {
  NextRequest,
} from 'next/server';

import {
  createWorkspaceAutomationDraft,
  getWorkspaceAutomationState,
} from '@/lib/services/workspace-automation';

import {
  automationJson,
  handleAutomationApiError,
  readAutomationJson,
  rejectAutomationCrossOrigin,
} from '@/lib/services/workspace-automation-api';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export async function GET() {
  try {
    const state =
      await getWorkspaceAutomationState();

    return automationJson({
      success:
        true,
      ...state,
    });
  } catch (
    error
  ) {
    return handleAutomationApiError(
      error,
    );
  }
}

export async function POST(
  request:
    NextRequest,
) {
  const rejected =
    rejectAutomationCrossOrigin(
      request,
    );

  if (rejected) {
    return rejected;
  }

  try {
    const body =
      await readAutomationJson(
        request,
      );

    const workflow =
      await createWorkspaceAutomationDraft({
        name:
          body.name,
        description:
          body.description,
      });

    return automationJson(
      {
        success:
          true,
        workflow,
      },
      201,
    );
  } catch (
    error
  ) {
    return handleAutomationApiError(
      error,
    );
  }
}
