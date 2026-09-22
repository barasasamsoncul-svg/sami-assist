import {
  NextResponse,
} from 'next/server';

import {
  getWorkspaceUsageState,
  WorkspaceUsageAccessError,
} from '@/lib/services/workspace-usage';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function json(
  body:
    Record<string, unknown>,
  status =
    200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, private',
        Pragma:
          'no-cache',
        'X-Content-Type-Options':
          'nosniff',
        'Referrer-Policy':
          'no-referrer',
      },
    },
  );
}


export async function GET() {
  try {
    const usage =
      await getWorkspaceUsageState();

    return json({
      success:
        true,
      usage,
    });
  } catch (
    error
  ) {
    if (
      error instanceof
        WorkspaceUsageAccessError
    ) {
      const status =
        error.code ===
          'UNAUTHENTICATED'
          ? 401
          : error.code ===
                'USAGE_VIEW_REQUIRED'
            ? 403
            : error.code ===
                  'WORKSPACE_CONTEXT_CHANGED'
              ? 409
              : 503;

      return json(
        {
          success:
            false,
          code:
            error.code,
          error:
            error.message,
        },
        status,
      );
    }

    console.error(
      '[SaMi Usage] Workspace usage request failed:',
      error,
    );

    return json(
      {
        success:
          false,
        code:
          'USAGE_REQUEST_FAILED',
        error:
          'Workspace usage could not be loaded.',
      },
      500,
    );
  }
}
