import {
  getOrganizationState,
  updateOrganizationProfile,
  type UpdateOrganizationProfileInput,
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
      organization,
    });
  } catch (error) {
    return handleOrganizationApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    let body: UpdateOrganizationProfileInput;

    try {
      body = await request.json();
    } catch {
      return organizationJson({
        success: false,
        code: 'INVALID_REQUEST',
        error: 'A valid JSON request body is required.',
      }, 400);
    }

    const profile = await updateOrganizationProfile(body);

    return organizationJson({
      success: true,
      message: 'Organization profile updated.',
      profile,
    });
  } catch (error) {
    return handleOrganizationApiError(error);
  }
}
