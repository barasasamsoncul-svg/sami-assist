import {
  permissionContextHas,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  listWorkspaceMessageRecipients,
} from '@/lib/services/workspace-messages';

import {
  getWorkspaceNotificationContext,
} from '@/lib/services/workspace-notifications';

import {
  handleNotificationApiError,
  notificationJson,
} from '@/lib/services/workspace-notification-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      recipients,
      context,
    ] =
      await Promise.all([
        listWorkspaceMessageRecipients(),
        getWorkspaceNotificationContext(),
      ]);

    const canAnnounce =
      context.permissions.isOwner ||
      permissionContextHas(
        context.permissions,
        SAMI_PERMISSIONS
          .NOTIFICATIONS_MANAGE,
      );

    return notificationJson({
      success:
        true,
      recipients,
      canAnnounce,
    });
  } catch (error) {
    return handleNotificationApiError(
      error,
    );
  }
}
