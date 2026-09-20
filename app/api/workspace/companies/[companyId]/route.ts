import {
  archiveWorkspaceCompany,
  reactivateWorkspaceCompany,
} from '@/lib/services/organization-profile';

import {
  handleOrganizationApiError,
  organizationJson,
} from '@/lib/services/organization-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CompanyActionBody = {
  action?: 'archive' | 'reactivate';
};

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      companyId: string;
    }>;
  },
) {
  try {
    const { companyId } = await context.params;

    let body: CompanyActionBody;

    try {
      body = await request.json();
    } catch {
      return organizationJson({
        success: false,
        code: 'INVALID_REQUEST',
        error: 'A valid JSON request body is required.',
      }, 400);
    }

    switch (body.action) {
      case 'archive':
        await archiveWorkspaceCompany(companyId);
        return organizationJson({
          success: true,
          message: 'Company archived.',
        });

      case 'reactivate':
        await reactivateWorkspaceCompany(companyId);
        return organizationJson({
          success: true,
          message: 'Company reactivated.',
        });

      default:
        return organizationJson({
          success: false,
          code: 'INVALID_ACTION',
          error: 'Use archive or reactivate.',
        }, 400);
    }
  } catch (error) {
    return handleOrganizationApiError(error);
  }
}
