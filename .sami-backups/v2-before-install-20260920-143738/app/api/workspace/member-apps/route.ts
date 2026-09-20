import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  AppAccessError,
  getMemberAppAccess,
  replaceMemberAppAccess,
  type AppAccessMode,
} from '@/lib/services/member-app-access';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}

function auditContext(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return {
    ipAddress: forwarded || request.headers.get('x-real-ip') || null,
    userAgent: request.headers.get('user-agent'),
    correlationId: request.headers.get('x-request-id'),
  };
}

function handleError(error: unknown) {
  if (error instanceof AppAccessError) {
    const forbidden = new Set([
      'USERS_VIEW_REQUIRED',
      'USERS_MANAGE_REQUIRED',
      'APPS_VIEW_REQUIRED',
      'APPS_MANAGE_REQUIRED',
      'OWNER_PROTECTED',
      'SELF_ACCESS_PROTECTED',
    ]);
    const notFound = new Set(['MEMBER_NOT_FOUND']);
    const conflict = new Set(['MEMBER_NOT_ACTIVE', 'APP_NOT_INSTALLED', 'APP_NOT_GRANTED_BY_ROLE']);
    return json({ success: false, code: error.code, error: error.message },
      forbidden.has(error.code) ? 403 : notFound.has(error.code) ? 404 : conflict.has(error.code) ? 409 : 400);
  }

  if (error instanceof TenantContextError) {
    return json(
      { success: false, code: error.code, error: error.message },
      error.code === 'UNAUTHENTICATED' ? 401 : 403,
    );
  }

  console.error('[SaMi] Member app access request failed:', error);
  return json({
    success: false,
    code: 'MEMBER_APP_ACCESS_FAILED',
    error: 'SaMi could not complete the employee app-access request.',
  }, 500);
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') || '';
    const access = await getMemberAppAccess(userId);
    return json({ success: true, access });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const mode: AppAccessMode = body?.mode === 'role_based' ? 'role_based' : 'selected';
    const appIds = Array.isArray(body?.appIds)
      ? body.appIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];

    const access = await replaceMemberAppAccess({
      userId: typeof body?.userId === 'string' ? body.userId : '',
      mode,
      appIds,
      audit: auditContext(request),
    });

    return json({
      success: true,
      message: 'Employee app access updated.',
      access,
    });
  } catch (error) {
    return handleError(error);
  }
}
