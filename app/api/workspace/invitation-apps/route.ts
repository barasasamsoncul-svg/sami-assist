import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  AppAccessError,
  getInvitationAppAccesses,
  setInvitationAppAccess,
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
    const forbidden = new Set(['INVITATIONS_VIEW_REQUIRED', 'INVITATIONS_MANAGE_REQUIRED']);
    const notFound = new Set(['INVITATION_NOT_FOUND']);
    const conflict = new Set(['INVITATION_NOT_PENDING', 'APP_NOT_INSTALLED', 'APP_NOT_GRANTED_BY_ROLE']);
    return json({ success: false, code: error.code, error: error.message },
      forbidden.has(error.code) ? 403 : notFound.has(error.code) ? 404 : conflict.has(error.code) ? 409 : 400);
  }

  if (error instanceof TenantContextError) {
    return json(
      { success: false, code: error.code, error: error.message },
      error.code === 'UNAUTHENTICATED' ? 401 : 403,
    );
  }

  console.error('[SaMi] Invitation app-access request failed:', error);
  return json({
    success: false,
    code: 'INVITATION_APP_ACCESS_FAILED',
    error: 'SaMi could not complete the invitation app-access request.',
  }, 500);
}

export async function GET() {
  try {
    const accesses = await getInvitationAppAccesses();
    return json({ success: true, accesses });
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

    const access = await setInvitationAppAccess({
      invitationId: typeof body?.invitationId === 'string' ? body.invitationId : '',
      mode,
      appIds,
      audit: auditContext(request),
    });

    return json({
      success: true,
      message: 'Invitation app access updated.',
      access,
    });
  } catch (error) {
    return handleError(error);
  }
}
