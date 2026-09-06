import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE_NAMES = [
  '__Host-sami_session',
  'sami_session',
];

const PROTECTED_PATHS = [
  '/dashboard',
  '/settings',
  '/account',
  '/billing',
  '/apps',
  '/workspace',
  '/invoices',
  '/customers',
  '/products',
  '/inventory',
  '/pos',
  '/crm',
  '/reports',
  '/analytics',
  '/team',
  '/organization',
];

function hasSessionCookie(request: NextRequest): boolean {
  return AUTH_COOKIE_NAMES.some((cookieName) => {
    const value =
      request.cookies.get(cookieName)?.value;

    return (
      typeof value === 'string' &&
      value.length > 0
    );
  });
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => {
    return (
      pathname === path ||
      pathname.startsWith(`${path}/`)
    );
  });
}

function buildLoginRedirectUrl(
  request: NextRequest
): URL {
  const loginUrl = new URL(
    '/login',
    request.url
  );

  const nextPath =
    request.nextUrl.pathname +
    request.nextUrl.search;

  loginUrl.searchParams.set(
    'next',
    nextPath
  );

  return loginUrl;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const sessionCookieExists =
    hasSessionCookie(request);

  if (
    isProtectedPath(pathname) &&
    !sessionCookieExists
  ) {
    return NextResponse.redirect(
      buildLoginRedirectUrl(request)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
};