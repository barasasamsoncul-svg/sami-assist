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

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export async function GET(
  request:
    NextRequest,
) {
  const startedAt =
    Date.now();

  let context:
    DeveloperApiContext | null =
    null;

  try {
    context =
      await authenticateDeveloperRequest(
        request,
        'context.read',
      );

    const body = {
      success:
        true,
      apiVersion:
        'v1',
      requestId:
        context.requestId,
      workspace: {
        id:
          context.tenantId,
      },
      company: {
        id:
          context.companyId,
        name:
          context.companyName,
      },
      credential: {
        id:
          context.credentialId,
        name:
          context.credentialName,
        scopes:
          context.scopes,
        allowedAppKeys:
          context.allowedAppKeys,
      },
    };

    await recordDeveloperRequest(
      context,
      {
        routeKey:
          '/api/v1/context',
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
      body,
      200,
      context,
    );
  } catch (
    error
  ) {
    if (
      context
    ) {
      try {
        await recordDeveloperRequest(
          context,
          {
            routeKey:
              '/api/v1/context',
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
        // Never replace the original API error with log failure.
      }
    }

    return handleDeveloperApiError(
      error,
    );
  }
}
