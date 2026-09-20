import { NextRequest } from 'next/server';

import {
  deleteWorkspaceFile,
  getWorkspaceFile,
} from '@/lib/services/workspace-files';
import {
  rejectCrossOriginWorkspaceFileRequest,
  workspaceFileAuditContext,
  workspaceFileErrorResponse,
  workspaceFileJson,
} from '@/lib/storage/workspace-file-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fileId(
  params: Promise<{ fileId: string }>,
) {
  return (await params).fileId;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    return workspaceFileJson({
      success: true,
      file: await getWorkspaceFile(await fileId(params)),
    });
  } catch (error) {
    return workspaceFileErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const crossOrigin = rejectCrossOriginWorkspaceFileRequest(request);
  if (crossOrigin) return crossOrigin;

  try {
    const result = await deleteWorkspaceFile(
      await fileId(params),
      workspaceFileAuditContext(request),
    );

    return workspaceFileJson({
      success: true,
      ...result,
    });
  } catch (error) {
    return workspaceFileErrorResponse(error);
  }
}
