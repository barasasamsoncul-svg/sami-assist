import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createWorkspaceInvitation,
  markWorkspaceInvitationSent,
  revokeWorkspaceInvitation,
  InvitationServiceError,
  type WorkspaceInvitationMemberType,
} from '@/lib/services/invitations';

import {
  setInvitationAppAccess,
  AppAccessError,
  type AppAccessMode,
} from '@/lib/services/member-app-access';

import {
  sendWorkspaceInvitationEmail,
} from '@/lib/services/invitation-email';

import {
  PermissionGuardError,
} from '@/lib/auth/permission-guards';

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

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item: unknown): item is string => typeof item === 'string')
    : [];
}

function memberType(value: unknown): WorkspaceInvitationMemberType | undefined {
  return value === 'internal' || value === 'portal' ? value : undefined;
}

function appMode(value: unknown): AppAccessMode {
  return value === 'role_based' ? 'role_based' : 'selected';
}

function handleError(error: unknown) {
  if (error instanceof AppAccessError) {
    const forbidden = new Set([
      'INVITATIONS_VIEW_REQUIRED',
      'INVITATIONS_MANAGE_REQUIRED',
    ]);
    const notFound = new Set(['INVITATION_NOT_FOUND']);
    const conflict = new Set([
      'INVITATION_NOT_PENDING',
      'APP_NOT_INSTALLED',
      'APP_NOT_GRANTED_BY_ROLE',
    ]);
    return json(
      { success: false, code: error.code, error: error.message },
      forbidden.has(error.code) ? 403 : notFound.has(error.code) ? 404 : conflict.has(error.code) ? 409 : 400,
    );
  }

  if (error instanceof InvitationServiceError) {
    const forbidden = new Set([
      'ROLE_ACCESS_DENIED',
      'PRIVILEGE_ESCALATION_BLOCKED',
      'COMPANY_ACCESS_DENIED',
      'CONTEXT_MISMATCH',
    ]);
    const notFound = new Set(['INVITATION_NOT_FOUND', 'ROLE_NOT_FOUND', 'COMPANY_NOT_FOUND']);
    const conflict = new Set([
      'MEMBER_ALREADY_EXISTS',
      'INVITATION_ALREADY_PENDING',
      'INVITATION_NOT_PENDING',
      'INVITATION_EXPIRED',
    ]);
    return json(
      { success: false, code: error.code, error: error.message },
      forbidden.has(error.code) ? 403 : notFound.has(error.code) ? 404 : conflict.has(error.code) ? 409 : 400,
    );
  }

  if (error instanceof PermissionGuardError) {
    return json({ success: false, code: error.code, error: error.message }, 403);
  }

  if (error instanceof TenantContextError) {
    return json(
      { success: false, code: error.code, error: error.message },
      error.code === 'UNAUTHENTICATED' ? 401 : 403,
    );
  }

  if (error instanceof CompanyContextError) {
    return json(
      { success: false, code: error.code, error: error.message },
      error.code === 'UNAUTHENTICATED' ? 401 : 403,
    );
  }

  console.error('[SaMi] Invitation creation with app access failed:', error);
  return json({
    success: false,
    code: 'INVITATION_CREATE_WITH_ACCESS_FAILED',
    error: 'SaMi could not create the invitation.',
  }, 500);
}

export async function POST(request: NextRequest) {
  let createdInvitationId: string | null = null;

  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ success: false, code: 'INVALID_REQUEST', error: 'Invalid invitation request.' }, 400);
    }

    const body = parsed as Record<string, unknown>;
    const type = memberType(body.memberType) || 'internal';

    const created = await createWorkspaceInvitation({
      email: typeof body.email === 'string' ? body.email : '',
      memberType: type,
      roleIds: type === 'internal' ? strings(body.roleIds) : [],
      companyIds: strings(body.companyIds),
      defaultCompanyId: typeof body.defaultCompanyId === 'string' ? body.defaultCompanyId : null,
      message: typeof body.message === 'string' ? body.message : null,
      expiresInDays: typeof body.expiresInDays === 'number' ? body.expiresInDays : undefined,
      audit: auditContext(request),
    });

    createdInvitationId = created.invitation.id;

    let access;
    try {
      access = await setInvitationAppAccess({
        invitationId: created.invitation.id,
        mode: type === 'portal' ? 'selected' : appMode(body.appAccessMode),
        appIds: type === 'portal' ? [] : strings(body.appIds),
        audit: auditContext(request),
      });
    } catch (error) {
      /* Keep the failed invitation unusable; email has not been sent yet. */
      await revokeWorkspaceInvitation({
        invitationId: created.invitation.id,
        audit: auditContext(request),
      }).catch(() => undefined);
      throw error;
    }

    let delivery;
    try {
      delivery = await sendWorkspaceInvitationEmail({
        invitation: created.invitation,
        token: created.token,
      });
    } catch (error) {
      console.error('[SaMi] Invitation created with access but email delivery failed:', error);
      return json({
        success: false,
        code: 'INVITATION_EMAIL_FAILED',
        error: 'The invitation and access were created, but the email could not be delivered. You can resend it from People & Access.',
        invitation: created.invitation,
        appAccess: access,
        emailSent: false,
      }, 502);
    }

    if (!delivery.success) {
      return json({
        success: true,
        code: 'INVITATION_CREATED_EMAIL_NOT_SENT',
        message: 'The invitation and access were created. Email delivery is not configured in this environment.',
        invitation: created.invitation,
        appAccess: access,
        emailSent: false,
      }, 201);
    }

    const invitation = await markWorkspaceInvitationSent({
      invitationId: created.invitation.id,
      audit: auditContext(request),
    });

    return json({
      success: true,
      code: 'INVITATION_CREATED',
      message: 'Invitation sent with role, company and app access.',
      invitation,
      appAccess: access,
      emailSent: true,
    }, 201);
  } catch (error) {
    if (createdInvitationId) {
      console.error('[SaMi] Invitation create-with-access failed after invitation creation:', createdInvitationId, error);
    }
    return handleError(error);
  }
}
