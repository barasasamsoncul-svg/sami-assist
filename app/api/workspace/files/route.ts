import { NextRequest } from 'next/server';

import { listWorkspaceFiles } from '@/lib/services/workspace-files';
import {
  workspaceFileErrorResponse,
  workspaceFileJson,
} from '@/lib/storage/workspace-file-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const result = await listWorkspaceFiles({
      limit: request.nextUrl.searchParams.get('limit'),
      cursor: request.nextUrl.searchParams.get('cursor'),
    });

    return workspaceFileJson({
      success: true,
      ...result,
    });
  } catch (error) {
    return workspaceFileErrorResponse(error);
  }
}
