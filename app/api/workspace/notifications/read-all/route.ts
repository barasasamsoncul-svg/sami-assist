import { NextRequest } from 'next/server';

import {
  markAllWorkspaceNotificationsRead,
} from '@/lib/services/workspace-notifications';

import {
  handleNotificationApiError,
  notificationJson,
  rejectNotificationCrossOrigin,
} from '@/lib/services/workspace-notification-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
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
    const result =
      await markAllWorkspaceNotificationsRead();

    return notificationJson({
      success:
        true,
      ...result,
    });
  } catch (error) {
    return handleNotificationApiError(
      error,
    );
  }
}
