import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { Pool } from 'pg';

import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import {
  EnterpriseModuleError,
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';
import {
  INVOICING_PERMISSIONS,
  InvoicingError,
  requireInvoicingContext,
  UUID_RE,
} from '@/lib/apps/invoicing/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16 * 1024;
const ACCOUNT_RESULT_LIMIT = 200;
const CUSTOMER_RESULT_LIMIT = 30;

class CrmCustomerLinkError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'CrmCustomerLinkError';
    this.code = code;
    this.status = status;
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}

function sameOrigin(request: NextRequest) {
  const site = request.headers.get('sec-fetch-site')?.toLowerCase();
  if (site === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function handleError(error: unknown) {
  if (error instanceof CrmCustomerLinkError) {
    return json({ success: false, code: error.code, error: error.message }, error.status);
  }

  if (error instanceof EnterpriseModuleError) {
    const status =
      error.code === 'MODULE_PERMISSION_REQUIRED' || error.code === 'TABLE_NOT_ALLOWED'
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

  if (error instanceof InvoicingError) {
    const status =
      error.code === 'INVOICING_PERMISSION_REQUIRED'
        ? 403
        : error.code === 'INVOICING_NOT_INSTALLED'
          ? 409
          : error.code === 'INVOICING_WORKSPACE_SUSPENDED'
            ? 402
            : error.code === 'CUSTOMER_NOT_FOUND'
              ? 404
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
    return json({
      success: false,
      code: error.code,
      error: error.message,
    }, statuses[error.code] ?? 500);
  }

  const databaseCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';

  if (databaseCode === '23505') {
    return json({
      success: false,
      code: 'BILLING_CUSTOMER_ALREADY_LINKED',
      error: 'That billing customer is already linked to another active CRM account.',
    }, 409);
  }

  console.error('[SaMi CRM customer link] request failed:', error);
  return json({
    success: false,
    code: 'CRM_CUSTOMER_LINK_FAILED',
    error: 'SaMi could not complete the customer-link request.',
  }, 500);
}

async function requireLinkContext(operation: 'view' | 'edit') {
  const [crm, invoicing] = await Promise.all([
    requireEnterpriseModuleTableContext('crm', 'crm_accounts', operation),
    requireInvoicingContext(INVOICING_PERMISSIONS.CUSTOMER_VIEW),
  ]);

  if (
    crm.tenantId !== invoicing.tenantId ||
    crm.companyId !== invoicing.companyId ||
    crm.userId !== invoicing.userId
  ) {
    throw new EnterpriseModuleError(
      'WORKSPACE_CONTEXT_CHANGED',
      'The CRM and Invoicing workspace contexts do not match. Refresh and try again.',
    );
  }

  await ensureBillingCustomerLinkSchema(crm.pool);
  return crm;
}

/**
 * Older preview databases may already have the initial CRM tables but not
 * this newly introduced link column. Run the tiny, idempotent additive
 * migration under a transaction-scoped advisory lock before querying it.
 */
async function ensureBillingCustomerLinkSchema(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['sami:crm:billing-customer-link-schema'],
    );

    const state = await client.query<{
      has_column: boolean;
      has_index: boolean;
    }>(`
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'crm_accounts'
            AND column_name = 'invoicing_customer_id'
        ) AS has_column,
        EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'crm_accounts'
            AND indexname = 'uq_crm_accounts_company_invoicing_customer'
        ) AS has_index
    `);

    if (state.rows[0]?.has_column !== true) {
      await client.query(
        'ALTER TABLE public.crm_accounts ADD COLUMN IF NOT EXISTS invoicing_customer_id UUID',
      );
    }

    if (state.rows[0]?.has_index !== true) {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_accounts_company_invoicing_customer
        ON public.crm_accounts(company_id, invoicing_customer_id)
        WHERE invoicing_customer_id IS NOT NULL AND deleted_at IS NULL
      `);
    }

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireLinkContext('view');
    const search = (request.nextUrl.searchParams.get('search') || '').trim().slice(0, 100);
    const searchPattern = '%' + search + '%';

    const [accountsResult, customersResult] = await Promise.all([
      context.pool.query(`
        SELECT
          a.id,
          a.account_name,
          a.account_type,
          a.lifecycle_stage,
          a.invoicing_customer_id,
          c.name AS linked_customer_name,
          c.status AS linked_customer_status,
          (c.deleted_at IS NOT NULL) AS linked_customer_deleted
        FROM public.crm_accounts a
        LEFT JOIN public.invoicing_customers c
          ON c.id = a.invoicing_customer_id
         AND c.company_id = a.company_id
        WHERE a.company_id = $1
          AND a.deleted_at IS NULL
        ORDER BY LOWER(a.account_name), a.id
        LIMIT $2
      `, [context.companyId, ACCOUNT_RESULT_LIMIT + 1]),
      context.pool.query(`
        SELECT id, name, email, phone, currency
        FROM public.invoicing_customers
        WHERE company_id = $1
          AND status = 'active'
          AND deleted_at IS NULL
          AND (
            $2 = '%%'
            OR name ILIKE $2
            OR COALESCE(email, '') ILIKE $2
            OR COALESCE(phone, '') ILIKE $2
          )
        ORDER BY LOWER(name), id
        LIMIT $3
      `, [context.companyId, searchPattern, CUSTOMER_RESULT_LIMIT]),
    ]);

    return json({
      success: true,
      accounts: accountsResult.rows.slice(0, ACCOUNT_RESULT_LIMIT),
      accountsTruncated: accountsResult.rows.length > ACCOUNT_RESULT_LIMIT,
      customers: customersResult.rows,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return json({
      success: false,
      code: 'CROSS_ORIGIN_REQUEST',
      error: 'This action must come from the SaMi workspace.',
    }, 403);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({
      success: false,
      code: 'REQUEST_TOO_LARGE',
      error: 'The customer-link request is too large.',
    }, 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({
      success: false,
      code: 'INVALID_INPUT',
      error: 'Send a valid JSON request.',
    }, 400);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({
      success: false,
      code: 'INVALID_INPUT',
      error: 'A customer-link request is required.',
    }, 400);
  }

  const body = payload as Record<string, unknown>;
  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
  const rawCustomerId = body.customerId;
  const customerId =
    rawCustomerId === null
      ? null
      : typeof rawCustomerId === 'string'
        ? rawCustomerId.trim()
        : undefined;

  if (!UUID_RE.test(accountId) || customerId === undefined ||
      (customerId !== null && !UUID_RE.test(customerId))) {
    return json({
      success: false,
      code: 'INVALID_INPUT',
      error: 'Choose a valid CRM account and an existing billing customer.',
    }, 400);
  }

  try {
    const context = await requireLinkContext('edit');
    const client = await context.pool.connect();

    try {
      await client.query('BEGIN');

      const account = await client.query(`
        SELECT id
        FROM public.crm_accounts
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `, [accountId, context.companyId]);

      if (account.rows.length !== 1) {
        throw new CrmCustomerLinkError(
          'CRM_ACCOUNT_NOT_FOUND',
          'Choose an active CRM account in this company.',
          404,
        );
      }

      if (customerId !== null) {
        const customer = await client.query(`
          SELECT id
          FROM public.invoicing_customers
          WHERE id = $1
            AND company_id = $2
            AND status = 'active'
            AND deleted_at IS NULL
          LIMIT 1
        `, [customerId, context.companyId]);

        if (customer.rows.length !== 1) {
          throw new CrmCustomerLinkError(
            'BILLING_CUSTOMER_NOT_SELECTABLE',
            'Choose an active billing customer from this company.',
            400,
          );
        }

        const existingLink = await client.query(`
          SELECT id
          FROM public.crm_accounts
          WHERE company_id = $1
            AND invoicing_customer_id = $2
            AND deleted_at IS NULL
            AND id <> $3
          LIMIT 1
        `, [context.companyId, customerId, accountId]);

        if (existingLink.rows.length > 0) {
          throw new CrmCustomerLinkError(
            'BILLING_CUSTOMER_ALREADY_LINKED',
            'That billing customer is already linked to another active CRM account.',
            409,
          );
        }
      }

      await client.query(`
        UPDATE public.crm_accounts
        SET
          invoicing_customer_id = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `, [accountId, context.companyId, customerId, context.userId]);

      await client.query('COMMIT');
      return json({
        success: true,
        accountId,
        customerId,
      });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}

      const databaseCode =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code || '')
          : '';

      if (databaseCode === '23505') {
        throw new CrmCustomerLinkError(
          'BILLING_CUSTOMER_ALREADY_LINKED',
          'That billing customer is already linked to another active CRM account.',
          409,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return handleError(error);
  }
}
