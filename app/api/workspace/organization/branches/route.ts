import {
  createOrganizationBranch,
  type BranchMutationInput,
} from '@/lib/services/organization-profile';

import {
  getOrganizationState,
} from '@/lib/services/organization-profile';

import {
  handleOrganizationApiError,
  organizationJson,
} from '@/lib/services/organization-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const organization = await getOrganizationState();

    return organizationJson({
      success: true,
      branches: organization.branches,
      capabilities: organization.capabilities,
    });
  } catch (error) {
    return handleOrganizationApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    let body: BranchMutationInput;

    try {
      body = await request.json();
    } catch {
      return organizationJson({
        success: false,
        code: 'INVALID_REQUEST',
        error: 'A valid JSON request body is required.',
      }, 400);
    }

    const branch = await createOrganizationBranch(body);

    return organizationJson({
      success: true,
      message: 'Branch created.',
      branch,
    }, 201);
  } catch (error) {
    return handleOrganizationApiError(error);
  }
}
