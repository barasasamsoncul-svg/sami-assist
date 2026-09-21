import {
  getWorkspaceAiStatus,
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
    const status =
      await getWorkspaceAiStatus();

    return aiJson({
      success: true,
      status,
    });
  } catch (
    error
  ) {
    return handleAiApiError(
      error,
    );
  }
}
