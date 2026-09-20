import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  WorkspaceFileError,
  type WorkspaceFileAuditContext,
} from '@/lib/services/workspace-files';

export function workspaceFileJson(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export function workspaceFileAuditContext(
  request: NextRequest,
): WorkspaceFileAuditContext {
  return {
    userAgent: request.headers.get('user-agent'),
    correlationId: request.headers.get('x-request-id'),
  };
}

export function isSameOriginWorkspaceFileRequest(
  request: NextRequest,
): boolean {
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();

  if (fetchSite === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export function rejectCrossOriginWorkspaceFileRequest(
  request: NextRequest,
) {
  return isSameOriginWorkspaceFileRequest(request)
    ? null
    : workspaceFileJson(
        {
          success: false,
          code: 'INVALID_ORIGIN',
          error: 'This request could not be verified.',
        },
        403,
      );
}

export function workspaceFileErrorResponse(error: unknown) {
  if (error instanceof WorkspaceFileError) {
    const unauthorized = new Set(['UNAUTHENTICATED']);
    const forbidden = new Set([
      'COMPANY_ACCESS_DENIED',
      'FILES_VIEW_REQUIRED',
      'FILES_MANAGE_REQUIRED',
    ]);
    const notFound = new Set(['FILE_NOT_FOUND']);
    const conflict = new Set([
      'WORKSPACE_CONTEXT_CHANGED',
      'COMPANY_REQUIRED',
      'UPLOAD_NOT_PENDING',
      'UPLOAD_EXPIRED',
      'UPLOAD_INCOMPLETE',
      'UPLOAD_VALIDATION_FAILED',
    ]);

    const status =
      unauthorized.has(error.code)
        ? 401
        : forbidden.has(error.code)
          ? 403
          : notFound.has(error.code)
            ? 404
            : conflict.has(error.code)
              ? 409
              : error.code === 'STORAGE_UNAVAILABLE'
                ? 503
                : error.code === 'FILE_TOO_LARGE'
                  ? 413
                  : 400;

    return workspaceFileJson(
      {
        success: false,
        code: error.code,
        error: error.message,
        ...error.details,
      },
      status,
    );
  }

  console.error('[SaMi Files] API request failed:', error);

  return workspaceFileJson(
    {
      success: false,
      code: 'WORKSPACE_FILE_REQUEST_FAILED',
      error: 'SaMi could not complete the file request.',
    },
    500,
  );
}
