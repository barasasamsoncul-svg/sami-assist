import { NextRequest } from 'next/server';

import {
  getWorkspaceConversation,
  markWorkspaceConversationRead,
  sendWorkspaceConversationMessage,
} from '@/lib/services/workspace-messages';

import {
  handleNotificationApiError,
  notificationJson,
  rejectNotificationCrossOrigin,
} from '@/lib/services/workspace-notification-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      conversationId:
        string;
    }>;
  },
) {
  try {
    const {
      conversationId,
    } =
      await params;

    const result =
      await getWorkspaceConversation(
        conversationId,
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

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      conversationId:
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
      conversationId,
    } =
      await params;

    const result =
      await sendWorkspaceConversationMessage(
        conversationId,
        {
          body:
            body?.body,
          replyToMessageId:
            body?.replyToMessageId,
        },
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

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      conversationId:
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
      conversationId,
    } =
      await params;

    const result =
      await markWorkspaceConversationRead(
        conversationId,
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
