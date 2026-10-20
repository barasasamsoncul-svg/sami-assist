import 'server-only';

import { NextResponse } from 'next/server';
import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError, requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { buildWorkspaceMemberDirectory } from '@/lib/services/member-directory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
  });
}

function handleError(error: unknown) {
  if (error instanceof EnterpriseModuleError) {
    const status = error.code === 'MODULE_PERMISSION_REQUIRED' || error.code === 'TABLE_NOT_ALLOWED'
      ? 403
      : error.code === 'MODULE_NOT_INSTALLED' || error.code === 'RECORD_NOT_FOUND'
        ? 404
        : error.code === 'WORKSPACE_SUSPENDED'
          ? 402
          : error.code === 'WORKSPACE_CONTEXT_CHANGED'
            ? 409
            : error.code === 'TABLE_NOT_READY' ? 503 : 400;
    return json({ success: false, code: error.code, error: error.message }, status);
  }
  if (error instanceof CompanyContextError || error instanceof TenantContextError) {
    const status = error.code === 'UNAUTHENTICATED' ? 401
      : error.code === 'WORKSPACE_DATABASE_UNAVAILABLE' ? 503 : 403;
    return json({ success: false, code: error.code, error: error.message }, status);
  }
  console.error('[SaMi CRM owners] request failed:', error);
  return json({ success: false, code: 'CRM_OWNERS_FAILED', error: 'SaMi could not load eligible account owners.' }, 500);
}

export async function GET() {
  try {
    const context = await requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view');
    const directory = await buildWorkspaceMemberDirectory(context.tenantId);
    const owners = directory.members
      .filter((member) =>
        member.accountStatus === 'active' &&
        member.membershipStatus === 'active' &&
        member.canEnterWorkspace &&
        member.memberType === 'internal' &&
        member.companies.some((company) => company.id === context.companyId),
      )
      .map((member) => ({
        id: member.userId,
        name: member.fullName || member.email,
        email: member.email,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return json({ success: true, owners });
  } catch (error) {
    return handleError(error);
  }
}
