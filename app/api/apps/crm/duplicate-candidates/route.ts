import 'server-only';

import { NextResponse } from 'next/server';
import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { EnterpriseModuleError, requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const CANDIDATE_LIMIT = 100;

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
  console.error('[SaMi CRM duplicate candidates] request failed:', error);
  return json({ success: false, code: 'CRM_DUPLICATES_FAILED', error: 'SaMi could not load duplicate candidates.' }, 500);
}

export async function GET() {
  try {
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

    const [accounts, contacts] = await Promise.all([
      accountContext.pool.query(
        `SELECT
           a.id AS left_id, b.id AS right_id,
           a.account_name AS left_name, b.account_name AS right_name,
           a.email AS left_email, b.email AS right_email,
           a.phone AS left_phone, b.phone AS right_phone,
           a.owner_user_id AS left_owner_user_id, b.owner_user_id AS right_owner_user_id,
           (a.invoicing_customer_id IS NOT NULL) AS left_has_billing_identity,
           (b.invoicing_customer_id IS NOT NULL) AS right_has_billing_identity,
           (SELECT COUNT(*)::int FROM public.crm_contacts c WHERE c.company_id = a.company_id AND c.account_id = a.id AND c.deleted_at IS NULL) AS left_contact_count,
           (SELECT COUNT(*)::int FROM public.crm_contacts c WHERE c.company_id = b.company_id AND c.account_id = b.id AND c.deleted_at IS NULL) AS right_contact_count,
           CASE
             WHEN NULLIF(LOWER(BTRIM(a.email)), '') IS NOT NULL AND LOWER(BTRIM(a.email)) = LOWER(BTRIM(b.email)) THEN 'shared_email'
             WHEN NULLIF(REGEXP_REPLACE(COALESCE(a.phone, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
               AND REGEXP_REPLACE(COALESCE(a.phone, ''), '[^0-9]', '', 'g') = REGEXP_REPLACE(COALESCE(b.phone, ''), '[^0-9]', '', 'g') THEN 'shared_phone'
             ELSE 'normalized_name'
           END AS match_reason
         FROM public.crm_accounts a
         INNER JOIN public.crm_accounts b
           ON b.company_id = a.company_id
          AND a.id < b.id
          AND b.deleted_at IS NULL
         WHERE a.company_id = $1
           AND a.deleted_at IS NULL
           AND (
             (NULLIF(LOWER(BTRIM(a.email)), '') IS NOT NULL AND LOWER(BTRIM(a.email)) = LOWER(BTRIM(b.email)))
             OR (NULLIF(REGEXP_REPLACE(COALESCE(a.phone, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
               AND REGEXP_REPLACE(COALESCE(a.phone, ''), '[^0-9]', '', 'g') = REGEXP_REPLACE(COALESCE(b.phone, ''), '[^0-9]', '', 'g'))
             OR (NULLIF(REGEXP_REPLACE(LOWER(BTRIM(a.account_name)), '[^[:alnum:]]', '', 'g'), '') IS NOT NULL
               AND REGEXP_REPLACE(LOWER(BTRIM(a.account_name)), '[^[:alnum:]]', '', 'g') = REGEXP_REPLACE(LOWER(BTRIM(b.account_name)), '[^[:alnum:]]', '', 'g'))
           )
         ORDER BY
           CASE
             WHEN LOWER(BTRIM(a.email)) = LOWER(BTRIM(b.email)) AND NULLIF(BTRIM(a.email), '') IS NOT NULL THEN 0
             WHEN REGEXP_REPLACE(COALESCE(a.phone, ''), '[^0-9]', '', 'g') = REGEXP_REPLACE(COALESCE(b.phone, ''), '[^0-9]', '', 'g') AND NULLIF(REGEXP_REPLACE(COALESCE(a.phone, ''), '[^0-9]', '', 'g'), '') IS NOT NULL THEN 1
             ELSE 2
           END,
           LOWER(a.account_name), LOWER(b.account_name)
         LIMIT $2`,
        [accountContext.companyId, CANDIDATE_LIMIT],
      ),
      contactContext.pool.query(
        `SELECT
           c1.id AS left_id, c2.id AS right_id,
           c1.first_name AS left_first_name, c1.last_name AS left_last_name,
           c2.first_name AS right_first_name, c2.last_name AS right_last_name,
           c1.email AS left_email, c2.email AS right_email,
           c1.phone AS left_phone, c2.phone AS right_phone,
           c1.mobile AS left_mobile, c2.mobile AS right_mobile,
           c1.account_id AS left_account_id, c2.account_id AS right_account_id,
           a1.account_name AS left_account_name, a2.account_name AS right_account_name,
           CASE
             WHEN NULLIF(LOWER(BTRIM(c1.email)), '') IS NOT NULL
              AND LOWER(BTRIM(c1.email)) = LOWER(BTRIM(c2.email)) THEN 'shared_email'
             WHEN NULLIF(REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(c1.phone), ''), NULLIF(BTRIM(c1.mobile), ''), ''), '[^0-9]', '', 'g'), '') IS NOT NULL
              AND REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(c1.phone), ''), NULLIF(BTRIM(c1.mobile), ''), ''), '[^0-9]', '', 'g') = REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(c2.phone), ''), NULLIF(BTRIM(c2.mobile), ''), ''), '[^0-9]', '', 'g') THEN 'shared_phone'
             ELSE 'same_name_same_account'
           END AS match_reason
         FROM public.crm_contacts c1
         INNER JOIN public.crm_contacts c2
           ON c2.company_id = c1.company_id
          AND c1.id < c2.id
          AND c2.deleted_at IS NULL
         LEFT JOIN public.crm_accounts a1 ON a1.id = c1.account_id AND a1.company_id = c1.company_id AND a1.deleted_at IS NULL
         LEFT JOIN public.crm_accounts a2 ON a2.id = c2.account_id AND a2.company_id = c2.company_id AND a2.deleted_at IS NULL
         WHERE c1.company_id = $1
           AND c1.deleted_at IS NULL
           AND (
             (NULLIF(LOWER(BTRIM(c1.email)), '') IS NOT NULL AND LOWER(BTRIM(c1.email)) = LOWER(BTRIM(c2.email)))
             OR (NULLIF(REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(c1.phone), ''), NULLIF(BTRIM(c1.mobile), ''), ''), '[^0-9]', '', 'g'), '') IS NOT NULL
               AND REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(c1.phone), ''), NULLIF(BTRIM(c1.mobile), ''), ''), '[^0-9]', '', 'g') = REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(c2.phone), ''), NULLIF(BTRIM(c2.mobile), ''), ''), '[^0-9]', '', 'g'))
             OR (c1.account_id IS NOT NULL AND c1.account_id = c2.account_id
               AND REGEXP_REPLACE(LOWER(BTRIM(c1.first_name || ' ' || c1.last_name)), '[^[:alnum:]]', '', 'g')
                 = REGEXP_REPLACE(LOWER(BTRIM(c2.first_name || ' ' || c2.last_name)), '[^[:alnum:]]', '', 'g'))
           )
         ORDER BY CASE WHEN COALESCE(NULLIF(BTRIM(c1.phone), ''), c1.mobile) = COALESCE(NULLIF(BTRIM(c2.phone), ''), c2.mobile) THEN 0 ELSE 1 END,
                  LOWER(c1.last_name), LOWER(c1.first_name), c1.id
         LIMIT $2`,
        [contactContext.companyId, CANDIDATE_LIMIT],
      ),
    ]);

    return json({
      success: true,
      accounts: accounts.rows,
      contacts: contacts.rows,
      limits: { accounts: CANDIDATE_LIMIT, contacts: CANDIDATE_LIMIT },
    });
  } catch (error) {
    return handleError(error);
  }
}
