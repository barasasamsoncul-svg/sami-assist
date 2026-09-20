import {
  createWorkspaceCompany,
  getOrganizationState,
  type CreateCompanyInput,
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
      companies: organization.companies,
      capabilities: organization.capabilities,
    });
  } catch (error) {
    return handleOrganizationApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    let body: CreateCompanyInput;

    try {
      body = await request.json();
    } catch {
      return organizationJson({
        success: false,
        code: 'INVALID_REQUEST',
        error: 'A valid JSON request body is required.',
      }, 400);
    }

    const company = await createWorkspaceCompany(body);

    return organizationJson({
      success: true,
      message: 'Company created.',
      company,
    }, 201);
  } catch (error) {
    return handleOrganizationApiError(error);
  }
}
