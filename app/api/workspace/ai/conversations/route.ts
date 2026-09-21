import {
  listWorkspaceAiConversations,
} from '@/lib/services/workspace-ai';

import {
  aiJson,
  handleAiApiError,
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
