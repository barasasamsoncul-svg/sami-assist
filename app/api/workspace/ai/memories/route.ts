import {
  NextRequest,
} from 'next/server';

import {
  clearWorkspaceAiMemories,
  listWorkspaceAiMemories,
} from '@/lib/services/workspace-ai';

import {
  aiJson,
  handleAiApiError,
  rejectAiCrossOrigin,
} from '@/lib/services/workspace-ai-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const memories =
      await listWorkspaceAiMemories();

    return aiJson({
      success: true,
      memories,
    });
  } catch (error) {
    return handleAiApiError(
      error,
    );
  }
}

export async function DELETE(
  request: NextRequest,
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
      await clearWorkspaceAiMemories();

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
