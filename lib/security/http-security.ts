import type { NextRequest } from 'next/server';

const SAFE_METHODS =
  new Set([
    'GET',
    'HEAD',
    'OPTIONS',
  ]);

const SESSION_COOKIES = [
  '__Host-sami_session',
  'sami_session',
  '__Host-sami_admin_session',
  'sami_admin_session',
] as const;

export function requestHasSaMiSession(
  request: NextRequest,
) {
  return SESSION_COOKIES.some(
    name =>
      Boolean(
        request.cookies.get(
          name,
        )?.value,
      ),
  );
}

export function requestRequiresSameOrigin(
  request: NextRequest,
) {
  return (
    request.nextUrl.pathname
      .startsWith(
        '/api/',
      ) &&
    !SAFE_METHODS.has(
      request.method
        .toUpperCase(),
    ) &&
    requestHasSaMiSession(
      request,
    )
  );
}

export function isSameOriginBrowserRequest(
  request: NextRequest,
) {
  const fetchSite =
    request.headers.get(
      'sec-fetch-site',
    );

  if (
    fetchSite &&
    fetchSite !== 'same-origin' &&
    fetchSite !== 'none'
  ) {
    return false;
  }

  const origin =
    request.headers.get(
      'origin',
    );

  if (
    origin
  ) {
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

  /*
   * Modern browsers send either Origin or Sec-Fetch-Site on
   * credentialed state-changing requests. A same-origin fetch-site
   * signal is therefore sufficient when Origin is omitted.
   */
  return (
    fetchSite ===
      'same-origin' ||
    fetchSite ===
      'none'
  );
}

export function createRequestNonce() {
  return crypto
    .randomUUID()
    .replace(
      /-/g,
      '',
    );
}

export function buildContentSecurityPolicy(
  nonce: string,
) {
  const development =
    process.env.NODE_ENV !==
    'production';

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://m.stripe.network",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.stripe.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    development
      ? null
      : 'upgrade-insecure-requests',
  ]
    .filter(
      Boolean,
    )
    .join(
      '; ',
    );

  return `${directives};`;
}

export function securityResponseHeaders(
  contentSecurityPolicy: string,
  requestId: string,
) {
  return {
    'Content-Security-Policy':
      contentSecurityPolicy,
    'Referrer-Policy':
      'strict-origin-when-cross-origin',
    'X-Content-Type-Options':
      'nosniff',
    'X-Frame-Options':
      'DENY',
    'X-DNS-Prefetch-Control':
      'off',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), serial=(), bluetooth=()',
    'Cross-Origin-Opener-Policy':
      'same-origin-allow-popups',
    'Cross-Origin-Resource-Policy':
      'same-origin',
    'X-Request-Id':
      requestId,
  } as const;
}
