import { NextRequest } from 'next/server';

import {
  listWorkspaceConversations,
  sendWorkspaceCompanyAnnouncement,
  startWorkspaceDirectConversation,
} from '@/lib/services/workspace-messages';

import {
  handleNotificationApiError,
  notificationJson,
  rejectNotificationCrossOrigin,
} from '@/lib/services/workspace-notification-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result =
      await listWorkspaceConversations();

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
    const body =
      await request.json();

    const result =
      body?.type ===
        'announcement'
        ? await sendWorkspaceCompanyAnnouncement({
            subject:
              body.subject,
            body:
              body.body,
          })
        : await startWorkspaceDirectConversation({
            recipientUserId:
              body?.recipientUserId,
            body:
              body?.body,
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
