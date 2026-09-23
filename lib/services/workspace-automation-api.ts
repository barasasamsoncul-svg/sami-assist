import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  SamiAutomationDefinitionError,
} from '@/lib/automation/definition';

import {
  WorkspaceAutomationError,
} from '@/lib/services/workspace-automation';

export function automationJson(
  body:
    Record<
      string,
      unknown
    >,
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

export function rejectAutomationCrossOrigin(
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
    return automationJson(
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
    request.headers.get(
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
      return automationJson(
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
    return automationJson(
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

export async function readAutomationJson(
  request:
    NextRequest,
) {
  try {
    const value:
      unknown =
      await request.json();

    return (
      value &&
      typeof value ===
        'object' &&
      !Array.isArray(
        value,
      )
        ? value
        : {}
    ) as
      Record<
        string,
        unknown
      >;
  } catch {
    return {};
  }
}

export function handleAutomationApiError(
  error:
    unknown,
) {
  if (
    error instanceof
      SamiAutomationDefinitionError
  ) {
    return automationJson(
      {
        success:
          false,
        code:
          'INVALID_AUTOMATION',
        error:
          error.message,
      },
      400,
    );
  }

  if (
    error instanceof
      WorkspaceAutomationError
  ) {
    const status =
      error.code ===
        'UNAUTHENTICATED'
        ? 401
        : error.code ===
            'AUTOMATION_PLATFORM_DISABLED'
          ? 503
        : error.code ===
              'COMPANY_ACCESS_DENIED' ||
            error.code ===
              'AUTOMATION_VIEW_REQUIRED' ||
            error.code ===
              'AUTOMATION_MANAGE_REQUIRED' ||
            error.code ===
              'AUTOMATION_APPROVAL_PERMISSION_REQUIRED'
          ? 403
          : error.code ===
                'AUTOMATION_NOT_FOUND' ||
              error.code ===
                'AUTOMATION_APPROVAL_NOT_FOUND'
            ? 404
            : error.code ===
                  'WORKSPACE_CONTEXT_CHANGED' ||
                error.code ===
                  'COMPANY_REQUIRED' ||
                error.code ===
                  'AUTOMATION_APPROVAL_EXPIRED'
              ? 409
              : 400;

    return automationJson(
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
    '[SaMi Automation] API request failed:',
    error,
  );

  return automationJson(
    {
      success:
        false,
      code:
        'AUTOMATION_REQUEST_FAILED',
      error:
        'SaMi could not complete the automation request.',
    },
    500,
  );
}
