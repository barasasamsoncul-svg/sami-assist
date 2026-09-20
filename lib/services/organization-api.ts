import { NextResponse } from 'next/server';

import {
  CompanyContextError,
} from '@/lib/auth/company-context';

import {
  CompanyPermissionGuardError,
} from '@/lib/auth/company-permission-guards';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

import {
  OrganizationProfileError,
} from '@/lib/services/organization-profile';

export function organizationJson(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export function handleOrganizationApiError(
  error: unknown,
) {
  if (error instanceof OrganizationProfileError) {
    switch (error.code) {
      case 'INVALID_FIELD':
        return organizationJson({
          success: false,
          code: error.code,
          error: error.message,
        }, 400);

      case 'ORGANIZATION_VIEW_REQUIRED':
      case 'ORGANIZATION_MANAGE_REQUIRED':
      case 'COMPANIES_VIEW_REQUIRED':
      case 'COMPANIES_MANAGE_REQUIRED':
      case 'COMPANY_ARCHIVE_BLOCKED':
        return organizationJson({
          success: false,
          code: error.code,
          error: error.message,
        }, 403);

      case 'COMPANY_NOT_FOUND':
      case 'BRANCH_NOT_FOUND':
        return organizationJson({
          success: false,
          code: error.code,
          error: error.message,
        }, 404);

      case 'COMPANY_CODE_IN_USE':
      case 'BRANCH_NAME_IN_USE':
      case 'COMPANY_NOT_ACTIVE':
      case 'LAST_COMPANY_REQUIRED':
        return organizationJson({
          success: false,
          code: error.code,
          error: error.message,
        }, 409);

      case 'UPDATE_FAILED':
        return organizationJson({
          success: false,
          code: error.code,
          error: error.message,
        }, 500);
    }
  }

  if (error instanceof CompanyPermissionGuardError) {
    return organizationJson({
      success: false,
      code: error.code,
      error: 'You do not have permission to perform this action.',
    }, 403);
  }

  if (error instanceof CompanyContextError) {
    if (error.code === 'UNAUTHENTICATED') {
      return organizationJson({
        success: false,
        code: error.code,
        error: 'Authentication is required.',
      }, 401);
    }

    return organizationJson({
      success: false,
      code: error.code,
      error: error.message,
    }, 409);
  }

  if (error instanceof TenantContextError) {
    if (error.code === 'UNAUTHENTICATED') {
      return organizationJson({
        success: false,
        code: error.code,
        error: 'Authentication is required.',
      }, 401);
    }

    return organizationJson({
      success: false,
      code: error.code,
      error: 'The current workspace is not available.',
    }, 403);
  }

  console.error('[SaMi] Organization API request failed:', error);

  return organizationJson({
    success: false,
    code: 'ORGANIZATION_REQUEST_FAILED',
    error: 'SaMi could not complete the organization request.',
  }, 500);
}
