import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError, requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
            : error.code === 'TABLE_NOT_READY'
              ? 503
              : 400;
    return json({ success: false, code: error.code, error: error.message }, status);
  }
  if (error instanceof CompanyContextError || error instanceof TenantContextError) {
    const statuses: Record<string, number> = {
      UNAUTHENTICATED: 401,
      NO_WORKSPACE_SELECTED: 409,
      WORKSPACE_ACCESS_DENIED: 403,
      WORKSPACE_DATABASE_UNAVAILABLE: 503,
      NO_COMPANY_ACCESS: 403,
      INVALID_COMPANY_ID: 400,
      COMPANY_ACCESS_DENIED: 403,
      EMPTY_COMPANY_SELECTION: 400,
      TOO_MANY_COMPANIES: 400,
      SESSION_UPDATE_FAILED: 500,
    };
    return json({ success: false, code: error.code, error: error.message }, statuses[error.code] ?? 500);
  }
  console.error('[SaMi CRM Customer 360] request failed:', error);
  return json({ success: false, code: 'CRM_ACCOUNT_PROFILE_FAILED', error: 'SaMi could not load this account profile.' }, 500);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await params;
    if (!UUID_RE.test(accountId)) {
      return json({ success: false, code: 'INVALID_INPUT', error: 'Choose a valid CRM account.' }, 400);
    }

    const [accountContext, contactContext] = await Promise.all([
      requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view'),
      requireEnterpriseModuleTableContext('crm', 'crm_contacts', 'view'),
    ]);

    if (
      accountContext.tenantId !== contactContext.tenantId ||
      accountContext.companyId !== contactContext.companyId ||
      accountContext.userId !== contactContext.userId
    ) {
      throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'The CRM workspace context changed. Refresh and try again.');
    }

    const [accountResult, contactsResult] = await Promise.all([
      accountContext.pool.query(
        'SELECT id, account_name, account_type, lifecycle_stage, source, website, industry, email, phone, invoicing_customer_id, employee_count, annual_revenue, owner_user_id, notes, created_at, updated_at FROM public.crm_accounts WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL LIMIT 1',
        [accountId, accountContext.companyId],
      ),
      contactContext.pool.query(
        'SELECT id, account_id, first_name, last_name, job_title, department, email, phone, mobile, contact_role, preferred_channel, is_primary, do_not_contact, owner_user_id, notes, created_at, updated_at FROM public.crm_contacts WHERE account_id = $1 AND company_id = $2 AND deleted_at IS NULL ORDER BY is_primary DESC, LOWER(last_name), LOWER(first_name), id LIMIT 200',
        [accountId, accountContext.companyId],
      ),
    ]);

    if (accountResult.rows.length !== 1) {
      return json({ success: false, code: 'CRM_ACCOUNT_NOT_FOUND', error: 'This account was not found in the current company or is no longer active.' }, 404);
    }

    return json({ success: true, account: accountResult.rows[0], contacts: contactsResult.rows });
  } catch (error) {
    return handleError(error);
  }
}
