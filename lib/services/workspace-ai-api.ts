import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  WorkspaceAiError,
} from '@/lib/services/workspace-ai';

export function aiJson(
  body:
    Record<
      string,
      unknown
    >,
  status = 200,
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

export function rejectAiCrossOrigin(
  request:
    NextRequest,
) {
  const fetchSite =
    request.headers
      .get(
        'sec-fetch-site',
      )
      ?.trim()
      .toLowerCase();

  if (
    fetchSite ===
    'cross-site'
  ) {
    return aiJson(
      {
        success:
          false,
        code:
          'INVALID_ORIGIN',
        error:
          'This request could not be verified.',
      },
      403,
    );
  }

  const origin =
    request.headers
      .get(
        'origin',
      );

  if (!origin) {
    return null;
  }

  try {
    if (
      new URL(
        origin,
      ).origin !==
      request.nextUrl
        .origin
    ) {
      return aiJson(
        {
          success:
            false,
          code:
            'INVALID_ORIGIN',
          error:
            'This request could not be verified.',
        },
        403,
      );
    }
  } catch {
    return aiJson(
      {
        success:
          false,
        code:
          'INVALID_ORIGIN',
        error:
          'This request could not be verified.',
      },
      403,
    );
  }

  return null;
}

export function handleAiApiError(
  error:
    unknown,
) {
  if (
    error instanceof
      WorkspaceAiError
  ) {
    const status =
      error.code ===
        'UNAUTHENTICATED'
        ? 401
        : error.code ===
              'COMPANY_ACCESS_DENIED' ||
            error.code ===
              'AI_NOT_ENTITLED'
          ? 403
          : error.code ===
                'AI_PLATFORM_DISABLED'
            ? 503
            : error.code ===
                'WORKSPACE_CONTEXT_CHANGED' ||
              error.code ===
                'COMPANY_REQUIRED'
            ? 409
            : error.code ===
                'AI_RATE_LIMITED'
              ? 429
              : error.code ===
                    'AI_PROVIDER_FAILED'
                ? 502
                : error.code ===
                      'CONVERSATION_NOT_FOUND' ||
                    error.code ===
                      'MESSAGE_NOT_FOUND' ||
                    error.code ===
                      'ACTION_NOT_FOUND' ||
                    error.code ===
                      'MEMORY_NOT_FOUND'
                  ? 404
                  : 400;

    return aiJson(
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
    '[SaMi AI] API request failed.',
  );

  return aiJson(
    {
      success:
        false,
      code:
        'AI_REQUEST_FAILED',
      error:
        'SaMi AI could not complete the request.',
    },
    500,
  );
}
