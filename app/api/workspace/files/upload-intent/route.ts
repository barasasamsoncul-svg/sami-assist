import { NextRequest } from 'next/server';

import { createWorkspaceFileUploadIntent } from '@/lib/services/workspace-files';
import {
  rejectCrossOriginWorkspaceFileRequest,
  workspaceFileAuditContext,
  workspaceFileErrorResponse,
  workspaceFileJson,
} from '@/lib/storage/workspace-file-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_INTENT_BODY_BYTES = 16 * 1024;

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginWorkspaceFileRequest(request);
  if (crossOrigin) return crossOrigin;

  const contentType = request.headers.get('content-type')?.toLowerCase() || '';
  if (!contentType.startsWith('application/json')) {
    return workspaceFileJson(
      {
        success: false,
        code: 'INVALID_CONTENT_TYPE',
        error: 'File upload intent must use JSON metadata.',
      },
      415,
    );
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_INTENT_BODY_BYTES) {
    return workspaceFileJson(
      {
        success: false,
        code: 'REQUEST_TOO_LARGE',
        error: 'The upload metadata request is too large.',
      },
      413,
    );
  }

  try {
    const raw = await request.text();

    if (Buffer.byteLength(raw, 'utf8') > MAX_INTENT_BODY_BYTES) {
      return workspaceFileJson(
        {
          success: false,
          code: 'REQUEST_TOO_LARGE',
          error: 'The upload metadata request is too large.',
        },
        413,
      );
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return workspaceFileJson(
        {
          success: false,
          code: 'INVALID_JSON',
          error: 'The upload metadata request is invalid.',
        },
        400,
      );
    }

    const result = await createWorkspaceFileUploadIntent(
      {
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        purpose: body.purpose,
      },
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
