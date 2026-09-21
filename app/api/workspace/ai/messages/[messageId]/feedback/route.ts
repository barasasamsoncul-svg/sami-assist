import {
  NextRequest,
} from 'next/server';

import {
  updateWorkspaceAiMessageFeedback,
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
    messageId:
      string;
  }>;
};

export async function POST(
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
      messageId,
    } =
      await context.params;

    const body =
      await request.json();

    const result =
      await updateWorkspaceAiMessageFeedback(
        messageId,
        body?.feedback ??
          null,
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
