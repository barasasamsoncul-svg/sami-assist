import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  completeWorkspaceIntegrationOAuth,
} from '@/lib/integrations/oauth';

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
  const params =
    await context.params;

  try {
    const result =
      await completeWorkspaceIntegrationOAuth({
        providerKey:
          params.providerKey,
        requestOrigin:
          request.nextUrl
            .origin,
        state:
          request.nextUrl
            .searchParams
            .get(
              'state',
            ),
        code:
          request.nextUrl
            .searchParams
            .get(
              'code',
            ),
        providerError:
          request.nextUrl
            .searchParams
            .get(
              'error',
            ),
      });

    const target =
      new URL(
        result.returnPath,
        request.nextUrl
          .origin,
      );

    target.searchParams.set(
      'connected',
      result.providerKey,
    );

    return NextResponse.redirect(
      target,
      302,
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Integrations] OAuth callback failed:',
      error,
    );

    const target =
      new URL(
        '/integrations',
        request.nextUrl
          .origin,
      );

    target.searchParams.set(
      'error',
      'oauth_callback_failed',
    );

    return NextResponse.redirect(
      target,
      302,
    );
  }
}
