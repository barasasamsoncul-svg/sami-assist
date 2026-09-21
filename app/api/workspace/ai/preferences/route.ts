import {
  NextRequest,
} from 'next/server';

import {
  getWorkspaceAiPreferences,
  updateWorkspaceAiPreferences,
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
    const preferences =
      await getWorkspaceAiPreferences();

    return aiJson({
      success: true,
      preferences,
    });
  } catch (error) {
    return handleAiApiError(
      error,
    );
  }
}

export async function PATCH(
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

    const body =
      await request.json();

    const preferences =
      await updateWorkspaceAiPreferences({
        memoryEnabled:
          body?.memoryEnabled,
        useAccountPreferences:
          body?.useAccountPreferences,
        responseStyle:
          body?.responseStyle,
      });

    return aiJson({
      success: true,
      preferences,
    });
  } catch (error) {
    return handleAiApiError(
      error,
    );
  }
}
