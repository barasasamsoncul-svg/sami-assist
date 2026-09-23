import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  buildContentSecurityPolicy,
  createRequestNonce,
  isSameOriginBrowserRequest,
  requestRequiresSameOrigin,
  securityResponseHeaders,
} from '@/lib/security/http-security';

const WORKSPACE_SESSION_COOKIE_NAMES = [
  '__Host-sami_session',
  'sami_session',
] as const;

const PROTECTED_PATHS = [
  '/dashboard',
  '/settings',
  '/account',
  '/billing',
  '/apps',
  '/workspace',
  '/company',
  '/organization',
  '/team',
  '/ai',
  '/automation',
  '/integrations',
  '/developer',
  '/activity',
  '/notifications',
  '/usage',
  '/subscription-required',
] as const;

function hasWorkspaceSessionCookie(
  request: NextRequest,
): boolean {
  return WORKSPACE_SESSION_COOKIE_NAMES.some(
    cookieName => {
      const value =
        request.cookies.get(
          cookieName,
        )?.value;

      return (
        typeof value ===
          'string' &&
        value.length >
          0
      );
    },
  );
}

function isProtectedPath(
  pathname: string,
): boolean {
  return PROTECTED_PATHS.some(
    path =>
      pathname ===
        path ||
      pathname.startsWith(
        `${path}/`,
      ),
  );
}

function buildLoginRedirectUrl(
  request: NextRequest,
): URL {
  const loginUrl =
    new URL(
      '/login',
      request.url,
    );

  const nextPath =
    request.nextUrl
      .pathname +
    request.nextUrl
      .search;

  loginUrl.searchParams.set(
    'next',
    nextPath,
  );

  return loginUrl;
}

function applySecurityHeaders(
  response: NextResponse,
  contentSecurityPolicy: string,
  requestId: string,
) {
  for (
    const [
      name,
      value,
    ]
    of Object.entries(
      securityResponseHeaders(
        contentSecurityPolicy,
        requestId,
      ),
    )
  ) {
    response.headers.set(
      name,
      value,
    );
  }

  if (
    process.env.NODE_ENV ===
    'production'
  ) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }

  return response;
}

export function proxy(
  request: NextRequest,
) {
  const requestId =
    crypto.randomUUID();

  const nonce =
    createRequestNonce();

  const contentSecurityPolicy =
    buildContentSecurityPolicy(
      nonce,
    );

  /*
   * All browser mutations authenticated by a SaMi session cookie
   * inherit the same-origin boundary automatically. External
   * webhooks, OAuth callbacks, billing callbacks and Developer API
   * clients do not carry SaMi browser session cookies and therefore
   * continue to use their own signature/token authentication.
   */
  if (
    requestRequiresSameOrigin(
      request,
    ) &&
    !isSameOriginBrowserRequest(
      request,
    )
  ) {
    const response =
      NextResponse.json(
        {
          success:
            false,
          code:
            'CROSS_ORIGIN_REQUEST_BLOCKED',
          error:
            'This request could not be verified as same-origin.',
        },
        {
          status:
            403,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );

    return applySecurityHeaders(
      response,
      contentSecurityPolicy,
      requestId,
    );
  }

  if (
    isProtectedPath(
      request.nextUrl
        .pathname,
    ) &&
    !hasWorkspaceSessionCookie(
      request,
    )
  ) {
    const response =
      NextResponse.redirect(
        buildLoginRedirectUrl(
          request,
        ),
      );

    return applySecurityHeaders(
      response,
      contentSecurityPolicy,
      requestId,
    );
  }

  const requestHeaders =
    new Headers(
      request.headers,
    );

  requestHeaders.set(
    'x-nonce',
    nonce,
  );

  requestHeaders.set(
    'x-sami-request-id',
    requestId,
  );

  /*
   * Next.js reads the request CSP to discover the nonce and applies
   * it to framework/runtime scripts during dynamic rendering.
   */
  requestHeaders.set(
    'Content-Security-Policy',
    contentSecurityPolicy,
  );

  const response =
    NextResponse.next({
      request: {
        headers:
          requestHeaders,
      },
    });

  return applySecurityHeaders(
    response,
    contentSecurityPolicy,
    requestId,
  );
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
};
