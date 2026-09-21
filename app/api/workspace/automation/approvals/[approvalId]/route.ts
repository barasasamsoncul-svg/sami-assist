import {
  NextRequest,
} from 'next/server';

import {
  resolveWorkspaceAutomationApproval,
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
      approvalId:
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
        readAutomationJson(
          request,
        ),
        context.params,
      ]);

    const result =
      await resolveWorkspaceAutomationApproval(
        params.approvalId,
        {
          decision:
            body.decision,
          note:
            body.note,
        },
      );

    return automationJson({
      success:
        true,
      result,
    });
  } catch (
    error
  ) {
    return handleAutomationApiError(
      error,
    );
  }
}
