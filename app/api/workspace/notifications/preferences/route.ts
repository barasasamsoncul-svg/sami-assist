import { NextRequest } from 'next/server';

import {
  getWorkspaceNotificationPreferences,
  updateWorkspaceNotificationPreferences,
} from '@/lib/services/workspace-notifications';

import {
  handleNotificationApiError,
  notificationJson,
  rejectNotificationCrossOrigin,
} from '@/lib/services/workspace-notification-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const preferences =
      await getWorkspaceNotificationPreferences();

    return notificationJson({
      success:
        true,
      preferences,
    });
  } catch (error) {
    return handleNotificationApiError(
      error,
    );
  }
}

export async function PATCH(
  request: NextRequest,
) {
  const crossOrigin =
    rejectNotificationCrossOrigin(
      request,
    );

  if (crossOrigin) {
    return crossOrigin;
  }

  try {
    const body =
      await request.json();

    const preferences =
      await updateWorkspaceNotificationPreferences(
        body,
      );

    return notificationJson({
      success:
        true,
      preferences,
    });
  } catch (error) {
    return handleNotificationApiError(
      error,
    );
  }
}
