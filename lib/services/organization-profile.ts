import 'server-only';

import crypto from 'node:crypto';

import type { PoolClient } from 'pg';

import {
  getCompanyPermissionContext,
  assertAllowedCompany,
  assertCompanyPermission,
  type CompanyPermissionContext,
} from '@/lib/auth/company-permission-guards';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getSamiPlanPolicy,
} from '@/lib/billing/plan-policy';

import {
  getWorkspaceSubscriptionAccessState,
} from '@/lib/billing/access';

/* ================================================================
   CATEGORY 10 — ORGANIZATION / COMPANY PROFILE
   ================================================================

   Workspace != Company.

   Workspace:
     SaMi isolation / membership / billing container.

   Company:
     Legal or operational business entity inside that workspace.

   This service never accepts a browser-provided tenant ID.
   Tenant and user identity come only from trusted session context.
   ================================================================ */

export type CompanyProfile = {
  id: string;
  name: string;
  legalName: string | null;
  companyCode: string | null;
  logoUrl: string | null;

  email: string | null;
  phone: string | null;
  website: string | null;

  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  countryCode: string | null;

  currency: string;
  timezone: string;
  locale: string;

  fiscalCountry: string | null;
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;

  taxId: string | null;
  registrationNumber: string | null;
  industry: string | null;
  businessType: string | null;
  foundedYear: number | null;
  employeeCount: number | null;

  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
};

export type BranchProfile = {
  id: string;
  companyId: string;
  name: string;
  code: string | null;

  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  countryCode: string | null;

  phone: string | null;
  email: string | null;

  isMain: boolean;
  isActive: boolean;

  createdAt: string | null;
  updatedAt: string | null;
};

export type CompanySummary = {
  id: string;
  name: string;
  legalName: string | null;
  companyCode: string | null;
  logoUrl: string | null;
  country: string | null;
  countryCode: string | null;
  currency: string;
  timezone: string;
  isCurrent: boolean;
  isDefault: boolean;
  isSelected: boolean;
  isActive: boolean;
  archivedAt: string | null;
};

export type OrganizationHistoryItem = {
  id: string;
  action: string;
  userId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
};

export type OrganizationState = {
  profile: CompanyProfile | null;
  branches: BranchProfile[];
  companies: CompanySummary[];
  history: OrganizationHistoryItem[];
  capabilities: {
    canViewOrganization: boolean;
    canManageOrganization: boolean;
    canViewCompanies: boolean;
    canManageCompanies: boolean;
  };
};

export type UpdateOrganizationProfileInput = {
  name?: unknown;
  legalName?: unknown;
  companyCode?: unknown;

  email?: unknown;
  phone?: unknown;
  website?: unknown;

  addressLine1?: unknown;
  addressLine2?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  country?: unknown;
  countryCode?: unknown;

  currency?: unknown;
  timezone?: unknown;
  locale?: unknown;

  fiscalCountry?: unknown;
  fiscalYearStartMonth?: unknown;
  fiscalYearStartDay?: unknown;

  taxId?: unknown;
  registrationNumber?: unknown;
  industry?: unknown;
  businessType?: unknown;
  foundedYear?: unknown;
  employeeCount?: unknown;
};

export type BranchMutationInput = {
  name?: unknown;
  code?: unknown;
  addressLine1?: unknown;
  addressLine2?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  country?: unknown;
  countryCode?: unknown;
  phone?: unknown;
  email?: unknown;
  isMain?: unknown;
};

export type CreateCompanyInput = {
  name?: unknown;
  legalName?: unknown;
  companyCode?: unknown;
  country?: unknown;
  countryCode?: unknown;
  currency?: unknown;
  timezone?: unknown;
  locale?: unknown;
};

/* ================================================================
   ERRORS
   ================================================================ */

export type OrganizationProfileErrorCode =
  | 'ORGANIZATION_VIEW_REQUIRED'
  | 'ORGANIZATION_MANAGE_REQUIRED'
  | 'COMPANIES_VIEW_REQUIRED'
  | 'COMPANIES_MANAGE_REQUIRED'
  | 'MULTI_COMPANY_PLAN_REQUIRED'
  | 'INVALID_FIELD'
  | 'COMPANY_NOT_FOUND'
  | 'COMPANY_NOT_ACTIVE'
  | 'COMPANY_CODE_IN_USE'
  | 'COMPANY_ARCHIVE_BLOCKED'
  | 'LAST_COMPANY_REQUIRED'
  | 'BRANCH_NOT_FOUND'
  | 'BRANCH_NAME_IN_USE'
  | 'UPDATE_FAILED';

export class OrganizationProfileError extends Error {
  readonly code: OrganizationProfileErrorCode;

  constructor(
    code: OrganizationProfileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OrganizationProfileError';
    this.code = code;
  }
}

/* ================================================================
   VALIDATION
   ================================================================ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nullableText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      `${field} must be text.`,
    );
  }

  const normalized = value.trim();

  if (!normalized) return null;

  if (normalized.length > maxLength) {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      `${field} is too long.`,
    );
  }

  return normalized;
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  const normalized = nullableText(value, field, maxLength);

  if (!normalized) {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      `${field} is required.`,
    );
  }

  return normalized;
}

function optionalCode(
  value: unknown,
  field: string,
  length: 2 | 3,
): string | null {
  const normalized = nullableText(value, field, length);

  if (!normalized) return null;

  const upper = normalized.toUpperCase();

  if (!new RegExp(`^[A-Z]{${length}}$`).test(upper)) {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      `${field} must contain exactly ${length} letters.`,
    );
  }

  return upper;
}

function optionalInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric =
    typeof value === 'number'
      ? value
      : Number(value);

  if (
    !Number.isInteger(numeric) ||
    numeric < min ||
    numeric > max
  ) {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      `${field} must be a whole number between ${min} and ${max}.`,
    );
  }

  return numeric;
}

function requireCompanyId(value: unknown): string {
  const normalized =
    typeof value === 'string'
      ? value.trim()
      : '';

  if (!UUID_PATTERN.test(normalized)) {
    throw new OrganizationProfileError(
      'COMPANY_NOT_FOUND',
      'A valid company is required.',
    );
  }

  return normalized;
}

function requireBranchId(value: unknown): string {
  const normalized =
    typeof value === 'string'
      ? value.trim()
      : '';

  if (!UUID_PATTERN.test(normalized)) {
    throw new OrganizationProfileError(
      'BRANCH_NOT_FOUND',
      'A valid branch is required.',
    );
  }

  return normalized;
}

function normalizeUrl(value: unknown): string | null {
  const normalized = nullableText(value, 'Website', 255);

  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('invalid protocol');
    }
    return url.toString();
  } catch {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      'Website must be a valid http or https URL.',
    );
  }
}

function normalizeLocale(value: unknown): string {
  const normalized = requiredText(value, 'Locale', 20).replace(/_/g, '-');

  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(normalized)) {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      'Locale is invalid.',
    );
  }

  return normalized;
}

function normalizeTimezone(value: unknown): string {
  const normalized = requiredText(value, 'Timezone', 100);

  try {
    new Intl.DateTimeFormat('en', {
      timeZone: normalized,
    }).format();
  } catch {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      'Timezone is invalid.',
    );
  }

  return normalized;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const date =
    value instanceof Date
      ? value
      : new Date(String(value));

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

/* ================================================================
   PERMISSION HELPERS
   ================================================================ */

function requireOrganizationManage(
  context: CompanyPermissionContext,
): void {
  if (context.isOwner) return;

  try {
    assertCompanyPermission(
      context,
      SAMI_PERMISSIONS.ORGANIZATION_MANAGE,
    );
  } catch {
    throw new OrganizationProfileError(
      'ORGANIZATION_MANAGE_REQUIRED',
      'You do not have permission to manage organization details.',
    );
  }
}

function requireCompaniesManage(
  context: CompanyPermissionContext,
): void {
  if (context.isOwner) return;

  try {
    assertCompanyPermission(
      context,
      SAMI_PERMISSIONS.COMPANIES_MANAGE,
    );
  } catch {
    throw new OrganizationProfileError(
      'COMPANIES_MANAGE_REQUIRED',
      'You do not have permission to manage companies.',
    );
  }
}

/* ================================================================
   MAPPERS
   ================================================================ */

function mapCompanyProfile(
  row: Record<string, unknown>,
): CompanyProfile {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    legalName:
      typeof row.legal_name === 'string'
        ? row.legal_name
        : null,
    companyCode:
      typeof row.company_code === 'string'
        ? row.company_code
        : null,
    logoUrl:
      typeof row.logo_url === 'string'
        ? row.logo_url
        : null,

    email:
      typeof row.email === 'string'
        ? row.email
        : null,
    phone:
      typeof row.phone === 'string'
        ? row.phone
        : null,
    website:
      typeof row.website === 'string'
        ? row.website
        : null,

    addressLine1:
      typeof row.address_line1 === 'string'
        ? row.address_line1
        : typeof row.address === 'string'
          ? row.address
          : null,
    addressLine2:
      typeof row.address_line2 === 'string'
        ? row.address_line2
        : null,
    city:
      typeof row.city === 'string'
        ? row.city
        : null,
    state:
      typeof row.state === 'string'
        ? row.state
        : null,
    postalCode:
      typeof row.postal_code === 'string'
        ? row.postal_code
        : null,
    country:
      typeof row.country === 'string'
        ? row.country
        : null,
    countryCode:
      typeof row.country_code === 'string'
        ? row.country_code
        : null,

    currency:
      typeof row.currency === 'string'
        ? row.currency
        : 'KES',
    timezone:
      typeof row.timezone === 'string'
        ? row.timezone
        : 'Africa/Nairobi',
    locale:
      typeof row.locale === 'string'
        ? row.locale
        : 'en',

    fiscalCountry:
      typeof row.fiscal_country === 'string'
        ? row.fiscal_country
        : null,
    fiscalYearStartMonth:
      Number(row.fiscal_year_start_month || 1),
    fiscalYearStartDay:
      Number(row.fiscal_year_start_day || 1),

    taxId:
      typeof row.tax_id === 'string'
        ? row.tax_id
        : null,
    registrationNumber:
      typeof row.registration_number === 'string'
        ? row.registration_number
        : null,
    industry:
      typeof row.industry === 'string'
        ? row.industry
        : null,
    businessType:
      typeof row.business_type === 'string'
        ? row.business_type
        : null,
    foundedYear:
      row.founded_year === null || row.founded_year === undefined
        ? null
        : Number(row.founded_year),
    employeeCount:
      row.employee_count === null || row.employee_count === undefined
        ? null
        : Number(row.employee_count),

    isActive: row.is_active === true,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    archivedAt: toIso(row.archived_at),
  };
}

function mapBranch(
  row: Record<string, unknown>,
): BranchProfile {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name || ''),
    code:
      typeof row.code === 'string'
        ? row.code
        : null,

    addressLine1:
      typeof row.address_line1 === 'string'
        ? row.address_line1
        : typeof row.address === 'string'
          ? row.address
          : null,
    addressLine2:
      typeof row.address_line2 === 'string'
        ? row.address_line2
        : null,
    city:
      typeof row.city === 'string'
        ? row.city
        : null,
    state:
      typeof row.state === 'string'
        ? row.state
        : null,
    postalCode:
      typeof row.postal_code === 'string'
        ? row.postal_code
        : null,
    country:
      typeof row.country === 'string'
        ? row.country
        : null,
    countryCode:
      typeof row.country_code === 'string'
        ? row.country_code
        : null,

    phone:
      typeof row.phone === 'string'
        ? row.phone
        : null,
    email:
      typeof row.email === 'string'
        ? row.email
        : null,

    isMain: row.is_main === true,
    isActive: row.is_active === true,

    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/* ================================================================
   TENANT AUDIT
   ================================================================ */

async function writeTenantAudit(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  /*
   * Category 16 will provide the durable audit/event pipeline.
   *
   * Until then, audit logging must NEVER make an otherwise valid
   * organization mutation fail. A failed PostgreSQL statement marks
   * the surrounding transaction as aborted, so use a savepoint and
   * roll back only the audit statement when necessary.
   */
  const savepoint =
    'sami_organization_audit';

  await client.query(
    `SAVEPOINT ${savepoint}`,
  );

  try {
    await client.query(
      `
        INSERT INTO audit_logs (
          company_id,
          user_id,
          actor_type,
          action,
          resource_type,
          resource_id,
          module,
          result,
          metadata,
          correlation_id,
          created_at
        )
        VALUES (
          $1,
          $2,
          'human',
          $3,
          $4,
          $5,
          'organization',
          'success',
          $6::jsonb,
          $7,
          NOW()
        )
      `,
      [
        input.companyId,
        input.userId,
        input.action,
        input.resourceType,
        input.resourceId,
        JSON.stringify(
          input.metadata || {},
        ),
        crypto.randomUUID(),
      ],
    );

    await client.query(
      `RELEASE SAVEPOINT ${savepoint}`,
    );
  } catch (error) {
    try {
      await client.query(
        `ROLLBACK TO SAVEPOINT ${savepoint}`,
      );

      await client.query(
        `RELEASE SAVEPOINT ${savepoint}`,
      );
    } catch (savepointError) {
      console.error(
        '[SaMi] Organization audit savepoint recovery failed:',
        savepointError,
      );

      throw error;
    }

    console.error(
      '[SaMi] Organization audit write failed; business mutation will continue:',
      error,
    );
  }
}


/* ================================================================
   READ HELPERS
   ================================================================ */

const COMPANY_SELECT = `
  SELECT
    id,
    name,
    legal_name,
    company_code,
    logo_url,
    email,
    phone,
    website,
    address,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    country_code,
    currency,
    timezone,
    locale,
    fiscal_country,
    fiscal_year_start_month,
    fiscal_year_start_day,
    tax_id,
    registration_number,
    industry,
    business_type,
    founded_year,
    employee_count,
    is_active,
    created_at,
    updated_at,
    archived_at
  FROM companies
`;

const BRANCH_SELECT = `
  SELECT
    id,
    company_id,
    name,
    code,
    address,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    country_code,
    phone,
    email,
    is_main,
    is_active,
    created_at,
    updated_at
  FROM branches
`;

async function loadProfile(
  context: CompanyPermissionContext,
): Promise<CompanyProfile> {
  const pool = await getTenantPoolByTenantId(context.tenantId);

  const result = await pool.query(
    `
      ${COMPANY_SELECT}
      WHERE id = $1
      LIMIT 1
    `,
    [context.currentCompanyId],
  );

  if (result.rows.length !== 1) {
    throw new OrganizationProfileError(
      'COMPANY_NOT_FOUND',
      'The current company could not be found.',
    );
  }

  return mapCompanyProfile(result.rows[0]);
}

async function loadBranches(
  context: CompanyPermissionContext,
): Promise<BranchProfile[]> {
  const pool = await getTenantPoolByTenantId(context.tenantId);

  const result = await pool.query(
    `
      ${BRANCH_SELECT}
      WHERE company_id = $1
      ORDER BY
        is_active DESC,
        is_main DESC,
        LOWER(name),
        created_at,
        id
    `,
    [context.currentCompanyId],
  );

  return result.rows.map(mapBranch);
}

async function loadCompanySummaries(
  context: CompanyPermissionContext,
): Promise<CompanySummary[]> {
  const pool = await getTenantPoolByTenantId(context.tenantId);

  const result = await pool.query(
    `
      SELECT
        c.id,
        c.name,
        c.legal_name,
        c.company_code,
        c.logo_url,
        c.country,
        c.country_code,
        c.currency,
        c.timezone,
        c.is_active,
        c.archived_at
      FROM companies c
      WHERE (
        $1::boolean = TRUE
        OR EXISTS (
          SELECT 1
          FROM company_users cu
          WHERE cu.company_id = c.id
            AND cu.user_id = $2
            AND LOWER(COALESCE(cu.status, '')) = 'active'
        )
      )
      ORDER BY
        CASE
          WHEN c.is_active = TRUE AND c.archived_at IS NULL
          THEN 0
          ELSE 1
        END,
        LOWER(c.name),
        c.created_at,
        c.id
    `,
    [
      context.isOwner,
      context.userId,
    ],
  );

  return result.rows.map(row => ({
    id: String(row.id),
    name: String(row.name || ''),
    legalName:
      typeof row.legal_name === 'string'
        ? row.legal_name
        : null,
    companyCode:
      typeof row.company_code === 'string'
        ? row.company_code
        : null,
    logoUrl:
      typeof row.logo_url === 'string'
        ? row.logo_url
        : null,
    country:
      typeof row.country === 'string'
        ? row.country
        : null,
    countryCode:
      typeof row.country_code === 'string'
        ? row.country_code
        : null,
    currency:
      typeof row.currency === 'string'
        ? row.currency
        : 'KES',
    timezone:
      typeof row.timezone === 'string'
        ? row.timezone
        : 'Africa/Nairobi',
    isCurrent:
      String(row.id) === context.currentCompanyId,
    isDefault:
      String(row.id) === context.companyContext.defaultCompanyId,
    isSelected:
      context.selectedCompanyIds.includes(String(row.id)),
    isActive:
      row.is_active === true,
    archivedAt:
      toIso(row.archived_at),
  }));
}

async function loadHistory(
  context: CompanyPermissionContext,
): Promise<OrganizationHistoryItem[]> {
  const pool = await getTenantPoolByTenantId(context.tenantId);

  const result = await pool.query(
    `
      SELECT
        id,
        action,
        user_id,
        resource_type,
        resource_id,
        metadata,
        created_at
      FROM audit_logs
      WHERE company_id = $1
        AND module = 'organization'
      ORDER BY created_at DESC
      LIMIT 25
    `,
    [context.currentCompanyId],
  );

  return result.rows.map(row => ({
    id: String(row.id),
    action: String(row.action || ''),
    userId:
      row.user_id
        ? String(row.user_id)
        : null,
    resourceType:
      typeof row.resource_type === 'string'
        ? row.resource_type
        : null,
    resourceId:
      row.resource_id
        ? String(row.resource_id)
        : null,
    metadata:
      row.metadata &&
      typeof row.metadata === 'object' &&
      !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {},
    createdAt:
      toIso(row.created_at),
  }));
}

/* ================================================================
   PUBLIC READ STATE
   ================================================================ */

export async function getOrganizationState():
  Promise<OrganizationState> {
  const context = await getCompanyPermissionContext();

  const canViewOrganization =
    context.isOwner ||
    context.permissionContext.permissionSet.has(
      SAMI_PERMISSIONS.ORGANIZATION_VIEW,
    ) ||
    context.permissionContext.permissionSet.has(
      SAMI_PERMISSIONS.ORGANIZATION_MANAGE,
    );

  const canViewCompanies =
    context.isOwner ||
    context.permissionContext.permissionSet.has(
      SAMI_PERMISSIONS.COMPANIES_VIEW,
    ) ||
    context.permissionContext.permissionSet.has(
      SAMI_PERMISSIONS.COMPANIES_MANAGE,
    );

  if (!canViewOrganization && !canViewCompanies) {
    throw new OrganizationProfileError(
      'ORGANIZATION_VIEW_REQUIRED',
      'You do not have permission to view organization or company administration.',
    );
  }

  const [
    profile,
    branches,
    companies,
    history,
  ] = await Promise.all([
    canViewOrganization
      ? loadProfile(context)
      : Promise.resolve(null),
    canViewOrganization
      ? loadBranches(context)
      : Promise.resolve([]),
    canViewCompanies
      ? loadCompanySummaries(context)
      : Promise.resolve([]),
    canViewOrganization
      ? loadHistory(context)
      : Promise.resolve([]),
  ]);

  return {
    profile,
    branches,
    companies,
    history,
    capabilities: {
      canViewOrganization,
      canManageOrganization:
        context.isOwner ||
        context.permissionContext.permissionSet.has(
          SAMI_PERMISSIONS.ORGANIZATION_MANAGE,
        ),
      canViewCompanies,
      canManageCompanies:
        context.isOwner ||
        context.permissionContext.permissionSet.has(
          SAMI_PERMISSIONS.COMPANIES_MANAGE,
        ),
    },
  };
}

/* ================================================================
   UPDATE CURRENT COMPANY PROFILE
   ================================================================ */

export async function updateOrganizationProfile(
  input: UpdateOrganizationProfileInput,
): Promise<CompanyProfile> {
  const context = await getCompanyPermissionContext();
  requireOrganizationManage(context);

  const current = await loadProfile(context);

  const next = {
    name:
      input.name === undefined
        ? current.name
        : requiredText(input.name, 'Company name', 200),
    legalName:
      input.legalName === undefined
        ? current.legalName
        : nullableText(input.legalName, 'Legal name', 200),
    companyCode:
      input.companyCode === undefined
        ? current.companyCode
        : nullableText(input.companyCode, 'Company code', 50)?.toUpperCase() || null,

    email:
      input.email === undefined
        ? current.email
        : nullableText(input.email, 'Email', 255),
    phone:
      input.phone === undefined
        ? current.phone
        : nullableText(input.phone, 'Phone', 50),
    website:
      input.website === undefined
        ? current.website
        : normalizeUrl(input.website),

    addressLine1:
      input.addressLine1 === undefined
        ? current.addressLine1
        : nullableText(input.addressLine1, 'Address line 1', 255),
    addressLine2:
      input.addressLine2 === undefined
        ? current.addressLine2
        : nullableText(input.addressLine2, 'Address line 2', 255),
    city:
      input.city === undefined
        ? current.city
        : nullableText(input.city, 'City', 100),
    state:
      input.state === undefined
        ? current.state
        : nullableText(input.state, 'State / region', 100),
    postalCode:
      input.postalCode === undefined
        ? current.postalCode
        : nullableText(input.postalCode, 'Postal code', 30),
    country:
      input.country === undefined
        ? current.country
        : nullableText(input.country, 'Country', 100),
    countryCode:
      input.countryCode === undefined
        ? current.countryCode
        : optionalCode(input.countryCode, 'Country code', 2),

    currency:
      input.currency === undefined
        ? current.currency
        : optionalCode(input.currency, 'Currency', 3) || current.currency,
    timezone:
      input.timezone === undefined
        ? current.timezone
        : normalizeTimezone(input.timezone),
    locale:
      input.locale === undefined
        ? current.locale
        : normalizeLocale(input.locale),

    fiscalCountry:
      input.fiscalCountry === undefined
        ? current.fiscalCountry
        : optionalCode(input.fiscalCountry, 'Fiscal country', 2),
    fiscalYearStartMonth:
      input.fiscalYearStartMonth === undefined
        ? current.fiscalYearStartMonth
        : optionalInteger(input.fiscalYearStartMonth, 'Fiscal year start month', 1, 12) || 1,
    fiscalYearStartDay:
      input.fiscalYearStartDay === undefined
        ? current.fiscalYearStartDay
        : optionalInteger(input.fiscalYearStartDay, 'Fiscal year start day', 1, 31) || 1,

    taxId:
      input.taxId === undefined
        ? current.taxId
        : nullableText(input.taxId, 'Tax ID', 100),
    registrationNumber:
      input.registrationNumber === undefined
        ? current.registrationNumber
        : nullableText(input.registrationNumber, 'Registration number', 100),
    industry:
      input.industry === undefined
        ? current.industry
        : nullableText(input.industry, 'Industry', 100),
    businessType:
      input.businessType === undefined
        ? current.businessType
        : nullableText(input.businessType, 'Business type', 100),
    foundedYear:
      input.foundedYear === undefined
        ? current.foundedYear
        : optionalInteger(
            input.foundedYear,
            'Founded year',
            1000,
            new Date().getUTCFullYear() + 1,
          ),
    employeeCount:
      input.employeeCount === undefined
        ? current.employeeCount
        : optionalInteger(
            input.employeeCount,
            'Employee count',
            0,
            1_000_000_000,
          ),
  };

  const pool = await getTenantPoolByTenantId(context.tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updated = await client.query(
      `
        UPDATE companies
        SET
          name = $2,
          legal_name = $3,
          company_code = $4,
          email = $5,
          phone = $6,
          website = $7,
          address = $8::text,
          address_line1 = $8::varchar(255),
          address_line2 = $9,
          city = $10,
          state = $11,
          postal_code = $12,
          country = $13,
          country_code = $14,
          currency = $15,
          timezone = $16,
          locale = $17,
          fiscal_country = $18,
          fiscal_year_start_month = $19,
          fiscal_year_start_day = $20,
          tax_id = $21,
          registration_number = $22,
          industry = $23,
          business_type = $24,
          founded_year = $25,
          employee_count = $26,
          updated_at = NOW()
        WHERE id = $1
          AND is_active = TRUE
          AND archived_at IS NULL
        RETURNING *
      `,
      [
        context.currentCompanyId,
        next.name,
        next.legalName,
        next.companyCode,
        next.email,
        next.phone,
        next.website,
        next.addressLine1,
        next.addressLine2,
        next.city,
        next.state,
        next.postalCode,
        next.country,
        next.countryCode,
        next.currency,
        next.timezone,
        next.locale,
        next.fiscalCountry,
        next.fiscalYearStartMonth,
        next.fiscalYearStartDay,
        next.taxId,
        next.registrationNumber,
        next.industry,
        next.businessType,
        next.foundedYear,
        next.employeeCount,
      ],
    );

    if (updated.rows.length !== 1) {
      throw new OrganizationProfileError(
        'COMPANY_NOT_ACTIVE',
        'The current company is not available for editing.',
      );
    }

    await writeTenantAudit(client, {
      companyId: context.currentCompanyId,
      userId: context.userId,
      action: 'organization.profile.updated',
      resourceType: 'company',
      resourceId: context.currentCompanyId,
      metadata: {
        fields: Object.keys(input),
      },
    });

    await client.query('COMMIT');

    return mapCompanyProfile(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    const candidate = error as {
      code?: string;
      constraint?: string;
    };

    if (
      candidate.code === '23505' &&
      candidate.constraint?.includes('companies_code')
    ) {
      throw new OrganizationProfileError(
        'COMPANY_CODE_IN_USE',
        'That company code is already used in this workspace.',
      );
    }

    if (error instanceof OrganizationProfileError) {
      throw error;
    }

    console.error(
      '[SaMi] Organization profile update failed:',
      error,
    );

    throw new OrganizationProfileError(
      'UPDATE_FAILED',
      'Organization details could not be updated.',
    );
  } finally {
    client.release();
  }
}

/* ================================================================
   BRANCHES
   ================================================================ */

function normalizeBranchInput(
  input: BranchMutationInput,
  current?: BranchProfile,
) {
  return {
    name:
      input.name === undefined
        ? current?.name || ''
        : requiredText(input.name, 'Branch name', 200),
    code:
      input.code === undefined
        ? current?.code || null
        : nullableText(input.code, 'Branch code', 50)?.toUpperCase() || null,
    addressLine1:
      input.addressLine1 === undefined
        ? current?.addressLine1 || null
        : nullableText(input.addressLine1, 'Address line 1', 255),
    addressLine2:
      input.addressLine2 === undefined
        ? current?.addressLine2 || null
        : nullableText(input.addressLine2, 'Address line 2', 255),
    city:
      input.city === undefined
        ? current?.city || null
        : nullableText(input.city, 'City', 100),
    state:
      input.state === undefined
        ? current?.state || null
        : nullableText(input.state, 'State / region', 100),
    postalCode:
      input.postalCode === undefined
        ? current?.postalCode || null
        : nullableText(input.postalCode, 'Postal code', 30),
    country:
      input.country === undefined
        ? current?.country || null
        : nullableText(input.country, 'Country', 100),
    countryCode:
      input.countryCode === undefined
        ? current?.countryCode || null
        : optionalCode(input.countryCode, 'Country code', 2),
    phone:
      input.phone === undefined
        ? current?.phone || null
        : nullableText(input.phone, 'Phone', 50),
    email:
      input.email === undefined
        ? current?.email || null
        : nullableText(input.email, 'Email', 255),
    isMain:
      input.isMain === undefined
        ? current?.isMain || false
        : input.isMain === true,
  };
}

export async function createOrganizationBranch(
  input: BranchMutationInput,
): Promise<BranchProfile> {
  const context = await getCompanyPermissionContext();
  requireOrganizationManage(context);

  const next = normalizeBranchInput(input);

  if (!next.name) {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      'Branch name is required.',
    );
  }

  const pool = await getTenantPoolByTenantId(context.tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (next.isMain) {
      await client.query(
        `
          UPDATE branches
          SET is_main = FALSE,
              updated_at = NOW()
          WHERE company_id = $1
            AND is_main = TRUE
        `,
        [context.currentCompanyId],
      );
    }

    const inserted = await client.query(
      `
        INSERT INTO branches (
          company_id,
          name,
          code,
          address,
          address_line1,
          address_line2,
          city,
          state,
          postal_code,
          country,
          country_code,
          phone,
          email,
          is_main,
          is_active,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4::text, $4::varchar(255), $5, $6, $7, $8,
          $9, $10, $11, $12, $13, TRUE, NOW(), NOW()
        )
        RETURNING *
      `,
      [
        context.currentCompanyId,
        next.name,
        next.code,
        next.addressLine1,
        next.addressLine2,
        next.city,
        next.state,
        next.postalCode,
        next.country,
        next.countryCode,
        next.phone,
        next.email,
        next.isMain,
      ],
    );

    await writeTenantAudit(client, {
      companyId: context.currentCompanyId,
      userId: context.userId,
      action: 'organization.branch.created',
      resourceType: 'branch',
      resourceId: String(inserted.rows[0].id),
      metadata: {
        name: next.name,
      },
    });

    await client.query('COMMIT');

    return mapBranch(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    const candidate = error as { code?: string };

    if (candidate.code === '23505') {
      throw new OrganizationProfileError(
        'BRANCH_NAME_IN_USE',
        'A branch with that name already exists for this company.',
      );
    }

    if (error instanceof OrganizationProfileError) throw error;

    throw new OrganizationProfileError(
      'UPDATE_FAILED',
      'The branch could not be created.',
    );
  } finally {
    client.release();
  }
}

async function loadBranchForUpdate(
  client: PoolClient,
  companyId: string,
  branchId: string,
): Promise<BranchProfile> {
  const result = await client.query(
    `
      ${BRANCH_SELECT}
      WHERE id = $1
        AND company_id = $2
      LIMIT 1
      FOR UPDATE
    `,
    [branchId, companyId],
  );

  if (result.rows.length !== 1) {
    throw new OrganizationProfileError(
      'BRANCH_NOT_FOUND',
      'The branch could not be found.',
    );
  }

  return mapBranch(result.rows[0]);
}

export async function updateOrganizationBranch(
  branchIdInput: unknown,
  input: BranchMutationInput,
): Promise<BranchProfile> {
  const context = await getCompanyPermissionContext();
  requireOrganizationManage(context);

  const branchId = requireBranchId(branchIdInput);

  const pool = await getTenantPoolByTenantId(context.tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const current = await loadBranchForUpdate(
      client,
      context.currentCompanyId,
      branchId,
    );

    const next = normalizeBranchInput(input, current);

    if (next.isMain) {
      await client.query(
        `
          UPDATE branches
          SET is_main = FALSE,
              updated_at = NOW()
          WHERE company_id = $1
            AND id <> $2
            AND is_main = TRUE
        `,
        [context.currentCompanyId, branchId],
      );
    }

    const updated = await client.query(
      `
        UPDATE branches
        SET
          name = $3,
          code = $4,
          address = $5::text,
          address_line1 = $5::varchar(255),
          address_line2 = $6,
          city = $7,
          state = $8,
          postal_code = $9,
          country = $10,
          country_code = $11,
          phone = $12,
          email = $13,
          is_main = $14,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
        RETURNING *
      `,
      [
        branchId,
        context.currentCompanyId,
        next.name,
        next.code,
        next.addressLine1,
        next.addressLine2,
        next.city,
        next.state,
        next.postalCode,
        next.country,
        next.countryCode,
        next.phone,
        next.email,
        next.isMain,
      ],
    );

    await writeTenantAudit(client, {
      companyId: context.currentCompanyId,
      userId: context.userId,
      action: 'organization.branch.updated',
      resourceType: 'branch',
      resourceId: branchId,
      metadata: {
        fields: Object.keys(input),
      },
    });

    await client.query('COMMIT');

    return mapBranch(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    const candidate = error as { code?: string };

    if (candidate.code === '23505') {
      throw new OrganizationProfileError(
        'BRANCH_NAME_IN_USE',
        'A branch with that name already exists for this company.',
      );
    }

    if (error instanceof OrganizationProfileError) throw error;

    throw new OrganizationProfileError(
      'UPDATE_FAILED',
      'The branch could not be updated.',
    );
  } finally {
    client.release();
  }
}

export async function archiveOrganizationBranch(
  branchIdInput: unknown,
): Promise<void> {
  const context = await getCompanyPermissionContext();
  requireOrganizationManage(context);

  const branchId = requireBranchId(branchIdInput);

  const pool = await getTenantPoolByTenantId(context.tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const current = await loadBranchForUpdate(
      client,
      context.currentCompanyId,
      branchId,
    );

    await client.query(
      `
        UPDATE branches
        SET is_active = FALSE,
            is_main = FALSE,
            updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [branchId, context.currentCompanyId],
    );

    if (current.isMain) {
      const replacement = await client.query(
        `
          SELECT id
          FROM branches
          WHERE company_id = $1
            AND id <> $2
            AND is_active = TRUE
          ORDER BY created_at, id
          LIMIT 1
        `,
        [context.currentCompanyId, branchId],
      );

      if (replacement.rows[0]?.id) {
        await client.query(
          `
            UPDATE branches
            SET is_main = TRUE,
                updated_at = NOW()
            WHERE id = $1
          `,
          [replacement.rows[0].id],
        );
      }
    }

    await writeTenantAudit(client, {
      companyId: context.currentCompanyId,
      userId: context.userId,
      action: 'organization.branch.archived',
      resourceType: 'branch',
      resourceId: branchId,
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    if (error instanceof OrganizationProfileError) throw error;

    throw new OrganizationProfileError(
      'UPDATE_FAILED',
      'The branch could not be archived.',
    );
  } finally {
    client.release();
  }
}

export async function reactivateOrganizationBranch(
  branchIdInput: unknown,
): Promise<BranchProfile> {
  const context = await getCompanyPermissionContext();
  requireOrganizationManage(context);

  const branchId = requireBranchId(branchIdInput);

  const pool = await getTenantPoolByTenantId(context.tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const current = await loadBranchForUpdate(
      client,
      context.currentCompanyId,
      branchId,
    );

    if (current.isActive) {
      await client.query('COMMIT');
      return current;
    }

    const main = await client.query(
      `
        SELECT 1
        FROM branches
        WHERE company_id = $1
          AND is_active = TRUE
          AND is_main = TRUE
        LIMIT 1
      `,
      [context.currentCompanyId],
    );

    const updated = await client.query(
      `
        UPDATE branches
        SET
          is_active = TRUE,
          is_main = CASE
            WHEN $3::boolean = TRUE
            THEN TRUE
            ELSE is_main
          END,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
        RETURNING *
      `,
      [
        branchId,
        context.currentCompanyId,
        main.rows.length === 0,
      ],
    );

    await writeTenantAudit(client, {
      companyId: context.currentCompanyId,
      userId: context.userId,
      action: 'organization.branch.reactivated',
      resourceType: 'branch',
      resourceId: branchId,
    });

    await client.query('COMMIT');

    return mapBranch(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    if (error instanceof OrganizationProfileError) throw error;

    throw new OrganizationProfileError(
      'UPDATE_FAILED',
      'The branch could not be reactivated.',
    );
  } finally {
    client.release();
  }
}


/* ================================================================
   MULTI-COMPANY ADMINISTRATION
   ================================================================ */

async function requireMultiCompanyPlan(
  tenantId:
    string,
): Promise<void> {
  const access =
    await getWorkspaceSubscriptionAccessState(
      tenantId,
    );

  if (
    !access.entitled ||
    access.policy
      ?.companies
      .multiCompany !==
      true
  ) {
    throw new OrganizationProfileError(
      'MULTI_COMPANY_PLAN_REQUIRED',
      'Multiple companies require an active Custom subscription.',
    );
  }
}

async function getWorkspaceOwnerUserId(
  tenantId: string,
): Promise<string> {
  const result = await queryControl(
    `
      SELECT user_id
      FROM tenant_users
      WHERE tenant_id = $1
        AND is_owner = TRUE
        AND deleted_at IS NULL
        AND LOWER(COALESCE(status, '')) = 'active'
      LIMIT 1
    `,
    [tenantId],
  );

  if (!result.rows[0]?.user_id) {
    throw new OrganizationProfileError(
      'UPDATE_FAILED',
      'Workspace ownership could not be resolved.',
    );
  }

  return String(result.rows[0].user_id);
}

export async function createWorkspaceCompany(
  input: CreateCompanyInput,
): Promise<CompanyProfile> {
  const context = await getCompanyPermissionContext();
  requireCompaniesManage(context);

  await requireMultiCompanyPlan(
    context.tenantId,
  );

  const current = await loadProfile(context);

  const name = requiredText(input.name, 'Company name', 200);
  const legalName = nullableText(input.legalName, 'Legal name', 200);
  const companyCode =
    nullableText(input.companyCode, 'Company code', 50)?.toUpperCase() || null;

  const country =
    input.country === undefined
      ? current.country
      : nullableText(input.country, 'Country', 100);

  const countryCode =
    input.countryCode === undefined
      ? current.countryCode
      : optionalCode(input.countryCode, 'Country code', 2);

  const currency =
    input.currency === undefined
      ? current.currency
      : optionalCode(input.currency, 'Currency', 3) || current.currency;

  const timezone =
    input.timezone === undefined
      ? current.timezone
      : normalizeTimezone(input.timezone);

  const locale =
    input.locale === undefined
      ? current.locale
      : normalizeLocale(input.locale);

  const ownerUserId = await getWorkspaceOwnerUserId(context.tenantId);

  const pool = await getTenantPoolByTenantId(context.tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `
        INSERT INTO companies (
          name,
          legal_name,
          company_code,
          country,
          country_code,
          currency,
          timezone,
          locale,
          is_active,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          TRUE, NOW(), NOW()
        )
        RETURNING *
      `,
      [
        name,
        legalName,
        companyCode,
        country,
        countryCode,
        currency,
        timezone,
        locale,
      ],
    );

    const companyId = String(inserted.rows[0].id);

    await client.query(
      `
        INSERT INTO company_settings (
          company_id,
          settings,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          '{}'::jsonb,
          NOW(),
          NOW()
        )
        ON CONFLICT (company_id)
        DO NOTHING
      `,
      [companyId],
    );

    const accessUsers = [
      ...new Set([
        ownerUserId,
        context.userId,
      ]),
    ];

    for (const userId of accessUsers) {
      await client.query(
        `
          INSERT INTO company_users (
            company_id,
            user_id,
            is_default,
            status,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            FALSE,
            'active',
            NOW(),
            NOW()
          )
          ON CONFLICT (company_id, user_id)
          DO UPDATE SET
            status = 'active',
            updated_at = NOW()
        `,
        [companyId, userId],
      );
    }

    await writeTenantAudit(client, {
      companyId,
      userId: context.userId,
      action: 'organization.company.created',
      resourceType: 'company',
      resourceId: companyId,
      metadata: {
        name,
      },
    });

    await client.query('COMMIT');

    return mapCompanyProfile(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    const candidate = error as { code?: string };

    if (candidate.code === '23505') {
      throw new OrganizationProfileError(
        'COMPANY_CODE_IN_USE',
        'That company code is already used in this workspace.',
      );
    }

    if (error instanceof OrganizationProfileError) throw error;

    throw new OrganizationProfileError(
      'UPDATE_FAILED',
      'The company could not be created.',
    );
  } finally {
    client.release();
  }
}

async function assertCompanyArchiveSafe(
  context: CompanyPermissionContext,
  companyId: string,
): Promise<void> {
  if (companyId === context.currentCompanyId) {
    throw new OrganizationProfileError(
      'COMPANY_ARCHIVE_BLOCKED',
      'Switch to another company before archiving the current company.',
    );
  }

  const pool = await getTenantPoolByTenantId(context.tenantId);

  const activeCount = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM companies
      WHERE is_active = TRUE
        AND archived_at IS NULL
    `,
  );

  if (Number(activeCount.rows[0]?.count || 0) <= 1) {
    throw new OrganizationProfileError(
      'LAST_COMPANY_REQUIRED',
      'A workspace must keep at least one active company.',
    );
  }

  const onlyAccess = await pool.query(
    `
      SELECT cu.user_id
      FROM company_users cu
      WHERE cu.company_id = $1
        AND LOWER(COALESCE(cu.status, '')) = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM company_users other
          INNER JOIN companies c
            ON c.id = other.company_id
          WHERE other.user_id = cu.user_id
            AND other.company_id <> cu.company_id
            AND LOWER(COALESCE(other.status, '')) = 'active'
            AND c.is_active = TRUE
            AND c.archived_at IS NULL
        )
      LIMIT 1
    `,
    [companyId],
  );

  if (onlyAccess.rows.length > 0) {
    throw new OrganizationProfileError(
      'COMPANY_ARCHIVE_BLOCKED',
      'Reassign users who only have access to this company before archiving it.',
    );
  }

  const controlUse = await queryControl(
    `
      SELECT 1
      FROM tenant_users
      WHERE tenant_id = $1
        AND default_company_id = $2
        AND deleted_at IS NULL

      UNION ALL

      SELECT 1
      FROM sessions
      WHERE current_tenant_id = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
        AND (
          current_company_id = $2
          OR $2 = ANY(COALESCE(selected_company_ids, ARRAY[]::uuid[]))
        )

      LIMIT 1
    `,
    [context.tenantId, companyId],
  );

  if (controlUse.rows.length > 0) {
    throw new OrganizationProfileError(
      'COMPANY_ARCHIVE_BLOCKED',
      'This company is still a user default or active session context. Reassign those users first.',
    );
  }
}

export async function archiveWorkspaceCompany(
  companyIdInput: unknown,
): Promise<void> {
  const context = await getCompanyPermissionContext();
  requireCompaniesManage(context);

  const companyId = requireCompanyId(companyIdInput);

  if (!context.isOwner) {
    assertAllowedCompany(
      context,
      companyId,
    );
  }

  await assertCompanyArchiveSafe(context, companyId);

  const pool = await getTenantPoolByTenantId(context.tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updated = await client.query(
      `
        UPDATE companies
        SET
          is_active = FALSE,
          archived_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND is_active = TRUE
          AND archived_at IS NULL
        RETURNING id
      `,
      [companyId],
    );

    if (updated.rows.length !== 1) {
      throw new OrganizationProfileError(
        'COMPANY_NOT_ACTIVE',
        'The company is already archived or unavailable.',
      );
    }

    await writeTenantAudit(client, {
      companyId,
      userId: context.userId,
      action: 'organization.company.archived',
      resourceType: 'company',
      resourceId: companyId,
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    if (error instanceof OrganizationProfileError) throw error;

    throw new OrganizationProfileError(
      'UPDATE_FAILED',
      'The company could not be archived.',
    );
  } finally {
    client.release();
  }
}

export async function reactivateWorkspaceCompany(
  companyIdInput: unknown,
): Promise<void> {
  const context = await getCompanyPermissionContext();
  requireCompaniesManage(context);

  await requireMultiCompanyPlan(
    context.tenantId,
  );

  const companyId = requireCompanyId(companyIdInput);

  const pool = await getTenantPoolByTenantId(context.tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (!context.isOwner) {
      const access = await client.query(
        `
          SELECT 1
          FROM company_users
          WHERE company_id = $1
            AND user_id = $2
            AND LOWER(COALESCE(status, '')) = 'active'
          LIMIT 1
        `,
        [
          companyId,
          context.userId,
        ],
      );

      if (access.rows.length !== 1) {
        throw new OrganizationProfileError(
          'COMPANY_NOT_FOUND',
          'The archived company could not be found.',
        );
      }
    }

    const updated = await client.query(
      `
        UPDATE companies
        SET
          is_active = TRUE,
          archived_at = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND (
            is_active = FALSE
            OR archived_at IS NOT NULL
          )
        RETURNING id
      `,
      [companyId],
    );

    if (updated.rows.length !== 1) {
      throw new OrganizationProfileError(
        'COMPANY_NOT_FOUND',
        'The archived company could not be found.',
      );
    }

    await writeTenantAudit(client, {
      companyId,
      userId: context.userId,
      action: 'organization.company.reactivated',
      resourceType: 'company',
      resourceId: companyId,
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    if (error instanceof OrganizationProfileError) throw error;

    throw new OrganizationProfileError(
      'UPDATE_FAILED',
      'The company could not be reactivated.',
    );
  } finally {
    client.release();
  }
}
