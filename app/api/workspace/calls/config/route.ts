import {
  getWorkspaceNotificationContext,
} from '@/lib/services/workspace-notifications';

import {
  getWorkspaceCallIceServers,
} from '@/lib/services/workspace-calls';

import {
  handleNotificationApiError,
  notificationJson,
} from '@/lib/services/workspace-notification-api';

export const runtime =
  'nodejs';
export const dynamic =
  'force-dynamic';

export async function GET() {
  try {
    await getWorkspaceNotificationContext();

    return notificationJson({
      success:
        true,
      iceServers:
        getWorkspaceCallIceServers(),
    });
  } catch (
    error
  ) {
    return handleNotificationApiError(
      error,
    );
  }
}
