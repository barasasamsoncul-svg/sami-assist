import {
  NextRequest,
} from 'next/server';

import {
  clearWorkspaceAiConversationHistory,
  listWorkspaceAiConversations,
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

export async function GET() {
  try {
    const conversations =
      await listWorkspaceAiConversations();

    return aiJson({
      success: true,
      conversations,
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
) {
  try {
    const originError =
      rejectAiCrossOrigin(
        request,
      );

    if (originError) {
      return originError;
    }

    const result =
      await clearWorkspaceAiConversationHistory();

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
