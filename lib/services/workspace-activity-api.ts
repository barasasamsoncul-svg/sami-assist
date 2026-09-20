import { NextResponse } from 'next/server';
import {
  WorkspaceActivityError,
} from '@/lib/services/workspace-activity';

export function activityJson(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control':
        'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export function handleActivityApiError(error: unknown) {
  if (error instanceof WorkspaceActivityError) {
    const status =
      error.code === 'UNAUTHENTICATED'
        ? 401
        : error.code === 'AUDIT_VIEW_REQUIRED' ||
            error.code === 'COMPANY_ACCESS_DENIED'
          ? 403
          : error.code === 'WORKSPACE_CONTEXT_CHANGED' ||
              error.code === 'COMPANY_REQUIRED'
            ? 409
            : 400;

    return activityJson(
      {
        success: false,
        code: error.code,
        error: error.message,
      },
      status,
    );
  }

  console.error(
    '[SaMi Activity] API request failed:',
    error,
  );

  return activityJson(
    {
      success: false,
      code: 'ACTIVITY_REQUEST_FAILED',
      error: 'SaMi could not complete the activity request.',
    },
    500,
  );
}
