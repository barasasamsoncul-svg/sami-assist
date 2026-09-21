import {
  NextRequest,
} from 'next/server';

import {
  activateWorkspaceAutomation,
  pauseWorkspaceAutomation,
  runWorkspaceAutomationManually,
  saveWorkspaceAutomationVersion,
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

type Context = {
  params:
    Promise<{
      workflowId:
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
    rejectAutomationCrossOrigin(
      request,
    );

  if (rejected) {
    return rejected;
  }

  try {
    const [
      body,
      params,
    ] =
      await Promise.all([
        readAutomationJson(
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
        'save_version'
    ) {
      const result =
        await saveWorkspaceAutomationVersion(
          params.workflowId,
          body.definition,
        );

      return automationJson({
        success:
          true,
        result,
      });
    }

    if (
      operation ===
        'activate'
    ) {
      const result =
        await activateWorkspaceAutomation(
          params.workflowId,
        );

      return automationJson({
        success:
          true,
        result,
      });
    }

    if (
      operation ===
        'pause'
    ) {
      const result =
        await pauseWorkspaceAutomation(
          params.workflowId,
        );

      return automationJson({
        success:
          true,
        result,
      });
    }

    if (
      operation ===
        'run_manual'
    ) {
      const result =
        await runWorkspaceAutomationManually(
          params.workflowId,
          {
            payload:
              body.payload,
          },
        );

      return automationJson({
        success:
          true,
        result,
      });
    }

    return automationJson(
      {
        success:
          false,
        code:
          'INVALID_AUTOMATION_OPERATION',
        error:
          'Choose a supported automation operation.',
      },
      400,
    );
  } catch (
    error
  ) {
    return handleAutomationApiError(
      error,
    );
  }
}
