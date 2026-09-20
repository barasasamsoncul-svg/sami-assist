import { NextRequest } from 'next/server';

import { completeWorkspaceFileUpload } from '@/lib/services/workspace-files';
import {
  rejectCrossOriginWorkspaceFileRequest,
  workspaceFileAuditContext,
  workspaceFileErrorResponse,
  workspaceFileJson,
} from '@/lib/storage/workspace-file-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const crossOrigin = rejectCrossOriginWorkspaceFileRequest(request);
  if (crossOrigin) return crossOrigin;

  try {
    const { fileId } = await params;
    const file = await completeWorkspaceFileUpload(
      fileId,
      workspaceFileAuditContext(request),
    );

    return workspaceFileJson({
      success: true,
      file,
    });
  } catch (error) {
    return workspaceFileErrorResponse(error);
  }
}
