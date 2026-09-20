import { NextRequest } from 'next/server';

import {
  archiveWorkspaceNotification,
  setWorkspaceNotificationReadState,
} from '@/lib/services/workspace-notifications';

import {
  handleNotificationApiError,
  notificationJson,
  rejectNotificationCrossOrigin,
} from '@/lib/services/workspace-notification-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      notificationId:
        string;
    }>;
  },
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

    const {
      notificationId,
    } =
      await params;

    const notification =
      await setWorkspaceNotificationReadState(
        notificationId,
        body?.isRead === true,
      );

    return notificationJson({
      success:
        true,
      notification,
    });
  } catch (error) {
    return handleNotificationApiError(
      error,
    );
  }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      notificationId:
        string;
    }>;
  },
) {
  const crossOrigin =
    rejectNotificationCrossOrigin(
      request,
    );

  if (crossOrigin) {
    return crossOrigin;
  }

  try {
    const {
      notificationId,
    } =
      await params;

    const result =
      await archiveWorkspaceNotification(
        notificationId,
      );

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
