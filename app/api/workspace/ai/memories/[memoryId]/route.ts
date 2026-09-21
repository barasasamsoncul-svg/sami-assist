import {
  NextRequest,
} from 'next/server';

import {
  forgetWorkspaceAiMemory,
} from '@/lib/services/workspace-ai';

import {
  aiJson,
  handleAiApiError,
  rejectAiCrossOrigin,
} from '@/lib/services/workspace-ai-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    memoryId: string;
  }>;
};

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
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
      memoryId,
    } =
      await context.params;

    const result =
      await forgetWorkspaceAiMemory(
        memoryId,
      );

    return aiJson({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleAiApiError(
      error,
    );
  }
}
