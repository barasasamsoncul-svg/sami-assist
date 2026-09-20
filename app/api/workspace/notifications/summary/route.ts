import {
  getWorkspaceNotificationSummary,
} from '@/lib/services/workspace-notifications';

import {
  handleNotificationApiError,
  notificationJson,
} from '@/lib/services/workspace-notification-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary =
      await getWorkspaceNotificationSummary();

    return notificationJson({
      success:
        true,
      summary,
    });
  } catch (error) {
    return handleNotificationApiError(
      error,
    );
  }
}
