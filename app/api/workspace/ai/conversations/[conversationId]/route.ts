import {
  NextRequest,
} from 'next/server';

import {
  archiveWorkspaceAiConversation,
  getWorkspaceAiConversation,
} from '@/lib/services/workspace-ai';

import {
  aiJson,
  handleAiApiError,
  rejectAiCrossOrigin,
} from '@/lib/services/workspace-ai-api';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

type RouteContext = {
  params: Promise<{
    conversationId:
      string;
  }>;
};

export async function GET(
  _request:
    NextRequest,
  context:
    RouteContext,
) {
  try {
    const {
      conversationId,
    } =
      await context.params;

    const result =
      await getWorkspaceAiConversation(
        conversationId,
      );

    return aiJson({
      success: true,
      ...result,
    });
  } catch (
    error
  ) {
    return handleAiApiError(
      error,
    );
  }
}

export async function DELETE(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  try {
    const originError =
      rejectAiCrossOrigin(
        request,
      );

    if (originError) {
      return originError;
    }

    const {
      conversationId,
    } =
      await context.params;

    const result =
      await archiveWorkspaceAiConversation(
        conversationId,
      );

    return aiJson({
      success: true,
      ...result,
    });
  } catch (
    error
  ) {
    return handleAiApiError(
      error,
    );
  }
}
