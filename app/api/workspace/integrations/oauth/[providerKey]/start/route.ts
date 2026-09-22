import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  beginWorkspaceIntegrationOAuth,
} from '@/lib/integrations/oauth';

import {
  handleIntegrationApiError,
  integrationJson,
  rejectIntegrationCrossOrigin,
} from '@/lib/services/workspace-integrations-api';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

type Context = {
  params:
    Promise<{
      providerKey:
        string;
    }>;
};

export async function GET(
  request:
    NextRequest,
  context:
    Context,
) {
  const rejected =
    rejectIntegrationCrossOrigin(
      request,
    );

  if (
    rejected
  ) {
    return rejected;
  }

  try {
    const params =
      await context.params;

    const result =
      await beginWorkspaceIntegrationOAuth({
        providerKey:
          params.providerKey,
        requestOrigin:
          request.nextUrl
            .origin,
        returnPath:
          request.nextUrl
            .searchParams
            .get(
              'return',
            ),
      });

    return NextResponse.redirect(
      result.authorizationUrl,
      302,
    );
  } catch (
    error
  ) {
    const response =
      handleIntegrationApiError(
        error,
      );

    if (
      request.nextUrl
        .searchParams
        .get(
          'format',
        ) ===
      'json'
    ) {
      return response;
    }

    const fallback =
      new URL(
        '/integrations',
        request.nextUrl
          .origin,
      );

    fallback.searchParams.set(
      'error',
      'connection_failed',
    );

    return NextResponse.redirect(
      fallback,
      302,
    );
  }
}
