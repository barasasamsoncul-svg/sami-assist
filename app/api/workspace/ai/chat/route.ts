import {
  NextRequest,
} from 'next/server';

import {
  sendWorkspaceAiMessage,
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

export async function POST(
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

    const body =
      await request.json();

    const result =
      await sendWorkspaceAiMessage({
        conversationId:
          body?.conversationId,
        message:
          body?.message,
        mode:
          body?.mode,
        targetMessageId:
          body?.targetMessageId,
        signal:
          request.signal,
      });

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
