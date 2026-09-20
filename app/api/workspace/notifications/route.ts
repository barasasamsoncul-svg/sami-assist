import { NextRequest } from 'next/server';

import {
  listWorkspaceNotifications,
} from '@/lib/services/workspace-notifications';

import {
  handleNotificationApiError,
  notificationJson,
} from '@/lib/services/workspace-notification-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
) {
  try {
    const result =
      await listWorkspaceNotifications({
        limit:
          request.nextUrl
            .searchParams
            .get('limit'),
        cursor:
          request.nextUrl
            .searchParams
            .get('cursor'),
        unreadOnly:
          request.nextUrl
            .searchParams
            .get('unreadOnly'),
      });

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
