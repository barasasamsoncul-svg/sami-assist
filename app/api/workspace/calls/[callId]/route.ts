import {
  NextRequest,
} from 'next/server';

import {
  updateWorkspaceCall,
} from '@/lib/services/workspace-calls';

import {
  handleNotificationApiError,
  notificationJson,
  rejectNotificationCrossOrigin,
} from '@/lib/services/workspace-notification-api';

export const runtime =
  'nodejs';
export const dynamic =
  'force-dynamic';

export async function PATCH(
  request:
    NextRequest,
  context: {
    params:
      Promise<{
        callId:
          string;
      }>;
  },
) {
  const crossOrigin =
    rejectNotificationCrossOrigin(
      request,
    );

  if (
    crossOrigin
  ) {
    return crossOrigin;
  }

  try {
    const [
      params,
      body,
    ] =
      await Promise.all([
        context.params,
        request.json(),
      ]);

    const call =
      await updateWorkspaceCall(
        params.callId,
        body.action,
      );

    return notificationJson({
      success:
        true,
      call,
    });
  } catch (
    error
  ) {
    return handleNotificationApiError(
      error,
    );
  }
}
