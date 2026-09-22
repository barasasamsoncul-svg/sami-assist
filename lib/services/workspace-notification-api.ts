import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  WorkspaceNotificationError,
} from '@/lib/services/workspace-notifications';

export function notificationJson(
  body: Record<string, unknown>,
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

export function rejectNotificationCrossOrigin(
  request: NextRequest,
) {
  const fetchSite =
    request.headers
      .get('sec-fetch-site')
      ?.trim()
      .toLowerCase();

  if (
    fetchSite ===
    'cross-site'
  ) {
    return notificationJson(
      {
        success: false,
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
      .get('origin');

  if (!origin) {
    return null;
  }

  try {
    if (
      new URL(origin)
        .origin !==
      request.nextUrl
        .origin
    ) {
      return notificationJson(
        {
          success: false,
          code:
            'INVALID_ORIGIN',
          error:
            'This request could not be verified.',
        },
        403,
      );
    }
  } catch {
    return notificationJson(
      {
        success: false,
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

export function handleNotificationApiError(
  error: unknown,
) {
  if (
    error instanceof
      WorkspaceNotificationError
  ) {
    const status =
      error.code ===
        'UNAUTHENTICATED'
        ? 401
        : error.code ===
            'WORKSPACE_SUSPENDED'
          ? 402
          : error.code ===
              'COMPANY_ACCESS_DENIED'
            ? 403
          : error.code ===
              'NOTIFICATION_NOT_FOUND'
            ? 404
            : error.code ===
                'WORKSPACE_CONTEXT_CHANGED' ||
              error.code ===
                'COMPANY_REQUIRED'
              ? 409
              : 400;

    return notificationJson(
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
    '[SaMi Notifications] API request failed:',
    error,
  );

  return notificationJson(
    {
      success:
        false,
      code:
        'NOTIFICATION_REQUEST_FAILED',
      error:
        'SaMi could not complete the notification request.',
    },
    500,
  );
}
