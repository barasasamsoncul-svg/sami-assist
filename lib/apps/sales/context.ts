import 'server-only';

import type { Pool, PoolClient } from 'pg';

import { getPermissionContext } from '@/lib/auth/permission-context';
import { requireCompanyContext } from '@/lib/auth/company-context';
import { getWorkspaceSubscriptionAccessState } from '@/lib/billing/access';
import { queryControl } from '@/lib/db/control';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';

const MODULE_KEY = 'sales';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------- */
/*  Permissions                                                               */
/* -------------------------------------------------------------------------- */

export const SALES_PERMISSIONS = {
  QUOTE_VIEW: 'sales.quote.view',
  QUOTE_CREATE: 'sales.quote.create',
  QUOTE_EDIT: 'sales.quote.edit',
  QUOTE_SEND: 'sales.quote.send',
  QUOTE_APPROVE: 'sales.quote.approve',
  QUOTE_INTERNAL_APPROVE: 'sales.quote.approve_internal',
  QUOTE_CONVERT: 'sales.quote.convert',
  QUOTE_CANCEL: 'sales.quote.cancel',
  QUOTE_REVISE: 'sales.quote.revise',
  QUOTE_OPTIONAL_MANAGE: 'sales.quote.optional.manage',
  PRICING_VIEW: 'sales.pricing.view',
  PRICING_MANAGE: 'sales.pricing.manage',
  MARGIN_VIEW: 'sales.margin.view',
  MARGIN_MANAGE: 'sales.margin.manage',
  TEAM_VIEW: 'sales.team.view',
  TEAM_MANAGE: 'sales.team.manage',
  TARGET_VIEW: 'sales.target.view',
  TARGET_MANAGE: 'sales.target.manage',
  COMMISSION_VIEW: 'sales.commission.view',
  COMMISSION_MANAGE: 'sales.commission.manage',
  SHIPPING_VIEW: 'sales.shipping.view',
  SHIPPING_MANAGE: 'sales.shipping.manage',
  RETURN_VIEW: 'sales.return.view',
  RETURN_MANAGE: 'sales.return.manage',
  DEPOSIT_MANAGE: 'sales.deposit.manage',
  FORECAST_VIEW: 'sales.forecast.view',
  PIPELINE_VIEW: 'sales.pipeline.view',
  PIPELINE_MANAGE: 'sales.pipeline.manage',
  ORDER_VIEW: 'sales.order.view',
  ORDER_MANAGE: 'sales.order.manage',
  REPORT_VIEW: 'sales.report.view',
  SETTINGS_MANAGE: 'sales.settings.manage',
} as const;

export type SalesPermission =
  (typeof SALES_PERMISSIONS)[keyof typeof SALES_PERMISSIONS];

/* -------------------------------------------------------------------------- */
/*  Errors                                                                    */
/* -------------------------------------------------------------------------- */

export type SalesErrorCode =
  | 'SALES_NOT_INSTALLED'
  | 'SALES_PERMISSION_REQUIRED'
  | 'SALES_WORKSPACE_SUSPENDED'
  | 'INVALID_INPUT'
  | 'LEAD_DUPLICATE_CONFIRMATION_REQUIRED'
  | 'QUOTE_NOT_FOUND'
  | 'QUOTE_STATE_INVALID'
  | 'OPPORTUNITY_NOT_FOUND'
  | 'INVALID_OPPORTUNITY_STAGE'
  | 'ORDER_NOT_FOUND'
  | 'DELIVERY_FAILED'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'BILLING_CUSTOMER_REQUIRED'
  | 'INVOICING_REQUIRED'
  | 'RETURN_CREDIT_LINK_MISSING'
  | 'INVENTORY_INTEGRATION_UNAVAILABLE'
  | 'CONFLICT';

export class SalesError extends Error {
  readonly code: SalesErrorCode;
  readonly details: Record<string, unknown>;
  readonly status: number;

  constructor(
    code: SalesErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'SalesError';
    this.code = code;
    this.details = details;
    this.status = salesErrorHttpStatus(code);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

function salesErrorHttpStatus(code: SalesErrorCode): number {
  switch (code) {
    case 'SALES_NOT_INSTALLED':
      return 412;
    case 'SALES_WORKSPACE_SUSPENDED':
      return 402;
    case 'SALES_PERMISSION_REQUIRED':
      return 403;
    case 'QUOTE_NOT_FOUND':
    case 'ORDER_NOT_FOUND':
    case 'OPPORTUNITY_NOT_FOUND':
      return 404;
    case 'QUOTE_STATE_INVALID':
    case 'INVALID_OPPORTUNITY_STAGE':
    case 'LEAD_DUPLICATE_CONFIRMATION_REQUIRED':
    case 'CONFLICT':
      return 409;
    case 'CREDIT_LIMIT_EXCEEDED':
    case 'BILLING_CUSTOMER_REQUIRED':
    case 'INVOICING_REQUIRED':
    case 'RETURN_CREDIT_LINK_MISSING':
    case 'INVENTORY_INTEGRATION_UNAVAILABLE':
    case 'DELIVERY_FAILED':
      return 422;
    case 'INVALID_INPUT':
    default:
      return 400;
  }
}

/* -------------------------------------------------------------------------- */
/*  Input sanitisation                                                        */
/* -------------------------------------------------------------------------- */

export function cleanText(value: unknown, maxLength = 1000): string {
  return typeof value === 'string'
    ? value.replace(/\u0000/g, '').trim().slice(0, maxLength)
    : '';
}

export function nullableText(value: unknown, maxLength = 1000): string | null {
  const text = cleanText(value, maxLength);
  return text || null;
}

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new SalesError('INVALID_INPUT', `${field} is invalid.`);
  }
  return value;
}

export function optionalUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

export function numberInput(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
): number {
  const numeric = Number(value);
  const min = options.min ?? 0;
  const max = options.max ?? 1_000_000_000_000;

  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new SalesError('INVALID_INPUT', `${field} is invalid.`);
  }
  return numeric;
}

/**
 * Round a money value to two decimals. Uses half-away-from-zero (round-half-up
 * for positive values), matching the behaviour of Postgres NUMERIC in the
 * sales tables. EPSILON nudge guards against 0.1 + 0.2 style drift.
 */
export function money(value: unknown): number {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export function isoDate(value: unknown, fallback: Date = new Date()): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return fallback.toISOString().slice(0, 10);
}

export function datePlusDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/*  Permissions helpers                                                       */
/* -------------------------------------------------------------------------- */

export function hasSalesPermission(
  isOwner: boolean,
  permissionSet: ReadonlySet<string>,
  permission: string,
): boolean {
  return isOwner || permissionSet.has(permission);
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

export type SalesContext = {
  permissions: Awaited<ReturnType<typeof getPermissionContext>>;
  company: Awaited<ReturnType<typeof requireCompanyContext>>;
  tenantId: string;
  userId: string;
  companyId: string;
  pool: Pool;
};

export async function requireSalesContext(
  requiredPermission?: string,
): Promise<SalesContext> {
  const [permissions, company] = await Promise.all([
    getPermissionContext(),
    requireCompanyContext(),
  ]);

  if (
    permissions.tenantId !== company.tenantId ||
    permissions.userId !== company.userId
  ) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'Your workspace context changed. Please try again.',
    );
  }

  const access = await getWorkspaceSubscriptionAccessState(permissions.tenantId);
  if (access.suspended || !access.entitled) {
    throw new SalesError(
      'SALES_WORKSPACE_SUSPENDED',
      'Sales is unavailable until workspace access is restored.',
    );
  }

  const installed = await queryControl(
    `
      SELECT 1
      FROM tenant_modules tm
      INNER JOIN modules m ON m.id = tm.module_id
      WHERE tm.tenant_id = $1
        AND LOWER(COALESCE(m.key, '')) = $2
        AND m.deleted_at IS NULL
        AND tm.deleted_at IS NULL
        AND LOWER(COALESCE(m.status, '')) = 'active'
        AND LOWER(COALESCE(tm.status, '')) IN ('installed', 'active', 'enabled')
      LIMIT 1
    `,
    [permissions.tenantId, MODULE_KEY],
  );

  if (installed.rows.length !== 1) {
    throw new SalesError(
      'SALES_NOT_INSTALLED',
      'Install Sales before using this feature.',
    );
  }

  if (
    requiredPermission &&
    !hasSalesPermission(permissions.isOwner, permissions.permissionSet, requiredPermission)
  ) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'You do not have permission to perform this Sales action.',
      { permission: requiredPermission },
    );
  }

  return {
    permissions,
    company,
    tenantId: permissions.tenantId,
    userId: permissions.userId,
    companyId: company.currentCompanyId,
    pool: await getTenantPoolByTenantId(permissions.tenantId),
  };
}

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_SEQUENCES: Array<{
  documentType: 'quote' | 'order' | 'shipment' | 'return';
  prefix: string;
}> = [
  { documentType: 'quote', prefix: 'QTE-' },
  { documentType: 'order', prefix: 'SO-' },
  { documentType: 'shipment', prefix: 'SHP-' },
  { documentType: 'return', prefix: 'RMA-' },
];

export async function ensureSalesDefaults(
  pool: Pool,
  companyId: string,
  userId: string,
): Promise<void> {
  // All writes are idempotent (`ON CONFLICT DO NOTHING`) — safe to run on every
  // workspace load. Batched inside a single transaction so a partial failure
  // never leaves the workspace half-seeded.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `
        INSERT INTO sales_quote_templates (
          company_id,
          name,
          is_default,
          terms,
          footer_text,
          created_by,
          updated_by
        )
        VALUES (
          $1,
          'Modern',
          TRUE,
          'Prices are valid until the quotation expiry date.',
          'Thank you for considering our proposal.',
          $2,
          $2
        )
        ON CONFLICT DO NOTHING
      `,
      [companyId, userId],
    );

    for (const { documentType, prefix } of DEFAULT_SEQUENCES) {
      await client.query(
        `
          INSERT INTO sales_sequences (
            company_id,
            document_type,
            prefix,
            next_number,
            padding,
            format,
            updated_by
          )
          VALUES ($1, $2, $3, 1, 6, '{prefix}{number}', $4)
          ON CONFLICT (company_id, document_type) DO NOTHING
        `,
        [companyId, documentType, prefix, userId],
      );
    }

    await client.query(
      `
        INSERT INTO sales_settings (company_id, default_currency, updated_by)
        SELECT c.id, COALESCE(c.currency, 'KES'), $2
        FROM companies c
        WHERE c.id = $1
        ON CONFLICT (company_id) DO NOTHING
      `,
      [companyId, userId],
    );

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* swallow — original error is what matters */
    }
    throw error;
  } finally {
    client.release();
  }
}

/* -------------------------------------------------------------------------- */
/*  Sequences                                                                 */
/* -------------------------------------------------------------------------- */

export type SalesDocumentType = 'quote' | 'order' | 'shipment' | 'return';

export async function nextSalesNumber(
  client: PoolClient,
  companyId: string,
  userId: string,
  documentType: SalesDocumentType,
): Promise<string> {
  const result = await client.query(
    `
      SELECT prefix, next_number, padding, format
      FROM sales_sequences
      WHERE company_id = $1
        AND document_type = $2
      FOR UPDATE
    `,
    [companyId, documentType],
  );

  if (result.rows.length !== 1) {
    throw new SalesError(
      'INVALID_INPUT',
      'Sales document numbering is not configured.',
      { documentType },
    );
  }

  const row = result.rows[0];
  const current = Number(row.next_number);
  const prefix = String(row.prefix || '');
  const padding = Math.max(1, Math.min(12, Number(row.padding || 6)));
  const format = String(row.format || '{prefix}{number}');

  const number = format
    .replace('{prefix}', prefix)
    .replace('{number}', String(current).padStart(padding, '0'));

  await client.query(
    `
      UPDATE sales_sequences
      SET
        next_number = next_number + 1,
        updated_by = $3,
        updated_at = NOW()
      WHERE company_id = $1
        AND document_type = $2
    `,
    [companyId, documentType, userId],
  );

  return number;
}

/* -------------------------------------------------------------------------- */
/*  Activity log                                                              */
/* -------------------------------------------------------------------------- */

export async function recordSalesActivity(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string | null;
    quoteId: string;
    type: string;
    content: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO activities (
        company_id,
        user_id,
        model,
        record_id,
        type,
        content,
        metadata
      )
      VALUES ($1, $2, 'sales.quote', $3, $4, $5, $6::jsonb)
    `,
    [
      input.companyId,
      input.userId,
      input.quoteId,
      input.type,
      input.content,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}