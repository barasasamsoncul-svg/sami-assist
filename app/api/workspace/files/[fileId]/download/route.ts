import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { createWorkspaceFileDownload } from '@/lib/services/workspace-files';
import {
  workspaceFileAuditContext,
  workspaceFileErrorResponse,
} from '@/lib/storage/workspace-file-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await params;
    const signed = await createWorkspaceFileDownload(
      fileId,
      workspaceFileAuditContext(request),
    );

    const response = NextResponse.redirect(signed.url, 302);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    return workspaceFileErrorResponse(error);
  }
}
