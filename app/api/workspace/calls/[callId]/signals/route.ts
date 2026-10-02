import {
  NextRequest,
} from 'next/server';

import {
  addWorkspaceCallSignal,
  listWorkspaceCallSignals,
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

export async function GET(
  _request:
    NextRequest,
  context: {
    params:
      Promise<{
        callId:
          string;
      }>;
  },
) {
  try {
    const params =
      await context.params;
    const signals =
      await listWorkspaceCallSignals(
        params.callId,
      );

    return notificationJson({
      success:
        true,
      signals,
    });
  } catch (
    error
  ) {
    return handleNotificationApiError(
      error,
    );
  }
}

export async function POST(
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

    const signal =
      await addWorkspaceCallSignal(
        params.callId,
        body,
      );

    return notificationJson({
      success:
        true,
      signal,
    });
  } catch (
    error
  ) {
    return handleNotificationApiError(
      error,
    );
  }
}
