import {
  NextRequest,
} from 'next/server';

import {
  confirmWorkspaceAiAction,
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
    actionId:
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
      actionId,
    } =
      await context.params;

    const result =
      await confirmWorkspaceAiAction(
        actionId,
      );

    return aiJson(
      result,
    );
  } catch (
    error
  ) {
    return handleAiApiError(
      error,
    );
  }
}
