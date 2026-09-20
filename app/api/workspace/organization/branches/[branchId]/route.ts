import {
  archiveOrganizationBranch,
  reactivateOrganizationBranch,
  updateOrganizationBranch,
  type BranchMutationInput,
} from '@/lib/services/organization-profile';

import {
  handleOrganizationApiError,
  organizationJson,
} from '@/lib/services/organization-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BranchPatchBody =
  BranchMutationInput & {
    action?: 'reactivate';
  };

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      branchId: string;
    }>;
  },
) {
  try {
    const { branchId } = await context.params;

    let body:
      BranchPatchBody;

    try {
      body = await request.json();
    } catch {
      return organizationJson({
        success: false,
        code: 'INVALID_REQUEST',
        error: 'A valid JSON request body is required.',
      }, 400);
    }

    const branch =
      body.action === 'reactivate'
        ? await reactivateOrganizationBranch(
            branchId,
          )
        : await updateOrganizationBranch(
            branchId,
            body,
          );

    return organizationJson({
      success: true,
      message: 'Branch updated.',
      branch,
    });
  } catch (error) {
    return handleOrganizationApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      branchId: string;
    }>;
  },
) {
  try {
    const { branchId } = await context.params;

    await archiveOrganizationBranch(branchId);

    return organizationJson({
      success: true,
      message: 'Branch archived.',
    });
  } catch (error) {
    return handleOrganizationApiError(error);
  }
}
