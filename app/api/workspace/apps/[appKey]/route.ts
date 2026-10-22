import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  disableWorkspaceApp,
  enableWorkspaceApp,
  installWorkspaceApp,
  uninstallWorkspaceApp,
  WorkspaceAppLifecycleError,
} from '@/lib/services/workspace-app-lifecycle';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';


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
          'no-store, no-cache, must-revalidate',
        Pragma:
          'no-cache',
      },
    },
  );
}


function isSameOrigin(
  request:
    NextRequest,
) {
  const secFetchSite =
    request.headers
      .get(
        'sec-fetch-site',
      )
      ?.trim()
      .toLowerCase();

  if (
    secFetchSite ===
      'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers.get(
      'origin',
    );

  if (
    !origin
  ) {
    return true;
  }

  try {
    return (
      new URL(
        origin,
      ).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}


function auditContext(
  request:
    NextRequest,
) {
  const forwarded =
    request.headers
      .get(
        'x-forwarded-for',
      )
      ?.split(
        ',',
      )[0]
      ?.trim();

  return {
    ipAddress:
      forwarded ||
      request.headers.get(
        'x-real-ip',
      ) ||
      null,
    userAgent:
      request.headers.get(
        'user-agent',
      ),
    correlationId:
      request.headers.get(
        'x-request-id',
      ),
  };
}


function handleError(
  error:
    unknown,
) {
  if (
    error instanceof
      WorkspaceAppLifecycleError
  ) {
    const forbidden =
      new Set([
        'APPS_MANAGE_REQUIRED',
        'APP_CORE_PROTECTED',
      ]);

    const notFound =
      new Set([
        'APP_NOT_FOUND',
      ]);

    const paymentRequired =
      new Set([
        'APP_SUBSCRIPTION_REQUIRED',
        'APP_PLAN_UPGRADE_REQUIRED',
      ]);

    const conflict =
      new Set([
        'WORKSPACE_NOT_READY',
        'WORKSPACE_CONTEXT_CHANGED',
        'APP_CHANGE_IN_PROGRESS',
        'APP_DEPENDENCY_CONFIRMATION_REQUIRED',
        'APP_NOT_INSTALLED',
        'APP_DEPENDENCY_BLOCKED',
        'APP_DEPENDENCY_CYCLE',
        'APP_NOT_INSTALLABLE',
        'APP_MIGRATION_MISSING',
        'APP_MIGRATION_UNSAFE',
        'APP_DOWNGRADE_UNSUPPORTED',
      ]);

    const server =
      new Set([
        'APP_SCHEMA_MISSING',
        'APP_SCHEMA_FAILED',
        'APP_MIGRATION_FAILED',
        'APP_PERMISSION_SYNC_FAILED',
      ]);

    return json(
      {
        success:
          false,
        code:
          error.code,
        error:
          error.message,
        ...(
          error.details
        ),
      },
      forbidden.has(
        error.code,
      )
        ? 403
        : paymentRequired.has(
              error.code,
            )
          ? 402
          : notFound.has(
                error.code,
              )
            ? 404
            : conflict.has(
                  error.code,
                )
              ? 409
              : server.has(
                    error.code,
                  )
                ? 500
                : 400,
    );
  }

  if (
    error instanceof
      TenantContextError
  ) {
    return json(
      {
        success:
          false,
        code:
          error.code,
        error:
          error.message,
      },
      error.code ===
        'UNAUTHENTICATED'
        ? 401
        : 403,
    );
  }

  console.error(
    '[SaMi] Workspace app lifecycle request failed:',
    error,
  );

  return json(
    {
      success:
        false,
      code:
        'WORKSPACE_APP_LIFECYCLE_FAILED',
      error:
        'SaMi could not complete the app change.',
    },
    500,
  );
}


async function getAppKey(
  params:
    Promise<{
      appKey:
        string;
    }>,
) {
  const {
    appKey,
  } =
    await params;

  return appKey;
}


function parseAcceptedDependencyKeys(
  body:
    unknown,
):
  | {
      valid: true;
      keys?: string[];
    }
  | {
      valid: false;
    } {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return {
      valid: false,
    };
  }

  const record =
    body as Record<
      string,
      unknown
    >;

  if (
    !Object.prototype.hasOwnProperty.call(
      record,
      'acceptedDependencyKeys',
    )
  ) {
    return {
      valid: true,
    };
  }

  const value =
    record.acceptedDependencyKeys;

  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      key =>
        typeof key !== 'string' ||
        !/^[a-z0-9_-]{1,100}$/i.test(
          key.trim(),
        ),
    )
  ) {
    return {
      valid: false,
    };
  }

  return {
    valid: true,
    keys:
      value as string[],
  };
}


export async function POST(
  request:
    NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        appKey:
          string;
      }>;
  },
) {
  if (
    !isSameOrigin(
      request,
    )
  ) {
    return json(
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

  try {
    let body:
      unknown = {};

    const rawBody =
      await request.text();

    if (
      rawBody.trim()
    ) {
      try {
        body =
          JSON.parse(
            rawBody,
          ) as unknown;
      } catch {
        return json(
          {
            success:
              false,
            code:
              'INVALID_APP_REQUEST',
            error:
              'The app installation request is invalid.',
          },
          400,
        );
      }
    }

    const consent =
      parseAcceptedDependencyKeys(
        body,
      );

    if (
      !consent.valid
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_DEPENDENCY_CONFIRMATION',
          error:
            'The dependency confirmation is invalid. Please try again.',
        },
        400,
      );
    }

    const result =
      await installWorkspaceApp(
        await getAppKey(
          params,
        ),
        auditContext(
          request,
        ),
        consent.keys,
      );

    return json({
      success:
        true,
      message:
        result.message,
      app:
        result,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


export async function PATCH(
  request:
    NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        appKey:
          string;
      }>;
  },
) {
  if (
    !isSameOrigin(
      request,
    )
  ) {
    return json(
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

  try {
    const body =
      await request.json();

    const consent =
      parseAcceptedDependencyKeys(
        body,
      );

    if (
      !consent.valid
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_DEPENDENCY_CONFIRMATION',
          error:
            'The dependency confirmation is invalid. Please try again.',
        },
        400,
      );
    }

    const action =
      body?.action ===
        'enable'
        ? 'enable'
        : body?.action ===
            'disable'
          ? 'disable'
          : '';

    if (
      !action
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_APP_ACTION',
          error:
            'Choose a valid app action.',
        },
        400,
      );
    }

    const appKey =
      await getAppKey(
        params,
      );

    const result =
      action ===
        'enable'
        ? await enableWorkspaceApp(
            appKey,
            auditContext(
              request,
            ),
            consent.keys,
          )
        : await disableWorkspaceApp(
            appKey,
            auditContext(
              request,
            ),
          );

    return json({
      success:
        true,
      message:
        result.message,
      app:
        result,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


export async function DELETE(
  request:
    NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        appKey:
          string;
      }>;
  },
) {
  if (
    !isSameOrigin(
      request,
    )
  ) {
    return json(
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

  try {
    const result =
      await uninstallWorkspaceApp(
        await getAppKey(
          params,
        ),
        auditContext(
          request,
        ),
        consent.keys,
      );

    return json({
      success:
        true,
      message:
        result.message,
      app:
        result,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}
