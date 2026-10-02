import {
  NextRequest,
} from 'next/server';

import {
  listActiveWorkspaceCalls,
  startWorkspaceCall,
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

export async function GET() {
  try {
    const calls =
      await listActiveWorkspaceCalls();

    return notificationJson({
      success:
        true,
      calls,
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
    const body =
      await request.json();

    const call =
      await startWorkspaceCall(
        body,
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
