import {
  NextRequest,
} from 'next/server';

import {
  authenticateDeveloperRequest,
  developerApiJson,
  handleDeveloperApiError,
  recordDeveloperRequest,
  type DeveloperApiContext,
} from '@/lib/developer/auth';

import {
  getAccessibleModuleDeveloperEndpoints,
} from '@/lib/developer/registry';

import {
  EnterpriseDeveloperApiError,
  listDeveloperAppRecords,
} from '@/lib/apps/enterprise/developer';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export async function GET(
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
  const startedAt =
    Date.now();

  let context:
    DeveloperApiContext |
    null =
    null;

  try {
    context =
      await authenticateDeveloperRequest(
        request,
        'apps.read',
      );

    const {
      appKey,
    } =
      await params;

    const key =
      appKey
        .trim()
        .toLowerCase();

    const endpoint =
      getAccessibleModuleDeveloperEndpoints(
        [
          key,
        ],
        context.allowedAppKeys,
      )
        .find(
          item =>
            item.moduleKey ===
              key &&
            item.method ===
              'GET',
        );

    if (
      !endpoint
    ) {
      throw new EnterpriseDeveloperApiError(
        'APP_NOT_ALLOWED',
        403,
        'This API credential cannot read the requested app.',
      );
    }

    const data =
      await listDeveloperAppRecords(
        context,
        {
          moduleKey:
            key,
          table:
            request.nextUrl
              .searchParams
              .get(
                'table',
              ),
          limit:
            request.nextUrl
              .searchParams
              .get(
                'limit',
              ),
          offset:
            request.nextUrl
              .searchParams
              .get(
                'offset',
              ),
        },
      );

    await recordDeveloperRequest(
      context,
      {
        routeKey:
          endpoint.path,
        method:
          'GET',
        statusCode:
          200,
        outcome:
          'success',
        durationMs:
          Date.now() -
          startedAt,
      },
    );

    return developerApiJson(
      {
        success:
          true,
        apiVersion:
          'v1',
        requestId:
          context.requestId,
        data,
      },
      200,
      context,
    );
  } catch (
    error
  ) {
    if (
      context &&
      error instanceof
        EnterpriseDeveloperApiError
    ) {
      try {
        await recordDeveloperRequest(
          context,
          {
            routeKey:
              request.nextUrl
                .pathname,
            method:
              'GET',
            statusCode:
              error.status,
            outcome:
              'failure',
            durationMs:
              Date.now() -
              startedAt,
          },
        );
      } catch {
        // Never replace the business API error with request-log failure.
      }

      return developerApiJson(
        {
          success:
            false,
          code:
            error.code,
          error:
            error.message,
          requestId:
            context.requestId,
        },
        error.status,
        context,
      );
    }

    if (
      context
    ) {
      try {
        await recordDeveloperRequest(
          context,
          {
            routeKey:
              request.nextUrl
                .pathname,
            method:
              'GET',
            statusCode:
              500,
            outcome:
              'failure',
            durationMs:
              Date.now() -
              startedAt,
          },
        );
      } catch {
        // Never replace the original API failure with request-log failure.
      }
    }

    return handleDeveloperApiError(
      error,
    );
  }
}
