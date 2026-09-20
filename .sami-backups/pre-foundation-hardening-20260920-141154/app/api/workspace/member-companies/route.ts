import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getMemberCompanyAccess,
  replaceMemberCompanyAccess,
  MemberCompanyAccessError,
} from '@/lib/services/member-company-access';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

import {
  CompanyContextError,
} from '@/lib/auth/company-context';

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
  if (error instanceof MemberCompanyAccessError) {
    const forbidden = new Set([
      'USERS_VIEW_REQUIRED',
      'USERS_MANAGE_REQUIRED',
      'OWNER_PROTECTED',
      'SELF_ACCESS_PROTECTED',
      'COMPANY_ACCESS_DENIED',
    ]);
    const notFound = new Set(['MEMBER_NOT_FOUND', 'COMPANY_NOT_FOUND']);
    const conflict = new Set(['EMPTY_COMPANY_SET', 'DEFAULT_COMPANY_INVALID']);
    return json(
      { success: false, code: error.code, error: error.message },
      forbidden.has(error.code) ? 403 : notFound.has(error.code) ? 404 : conflict.has(error.code) ? 409 : 400,
    );
  }

  if (error instanceof TenantContextError || error instanceof CompanyContextError) {
    return json(
      { success: false, code: error.code, error: error.message },
      error.code === 'UNAUTHENTICATED' ? 401 : 403,
    );
  }

  console.error('[SaMi] Member company access request failed:', error);
  return json({
    success: false,
    code: 'MEMBER_COMPANY_ACCESS_FAILED',
    error: 'SaMi could not complete the employee company-access request.',
  }, 500);
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') || '';
    const access = await getMemberCompanyAccess(userId);
    return json({ success: true, access });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const companyIds = Array.isArray(body?.companyIds)
      ? body.companyIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];

    const access = await replaceMemberCompanyAccess({
      userId: typeof body?.userId === 'string' ? body.userId : '',
      companyIds,
      defaultCompanyId: typeof body?.defaultCompanyId === 'string' ? body.defaultCompanyId : '',
      audit: auditContext(request),
    });

    return json({
      success: true,
      message: 'Employee company access updated.',
      access,
    });
  } catch (error) {
    return handleError(error);
  }
}
