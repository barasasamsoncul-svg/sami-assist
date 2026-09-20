import 'server-only';

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';

import {
  getControlPool,
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  getPermissionContext,
  permissionContextHas,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  requireCompanyContext,
  type CompanyContextCompany,
} from '@/lib/auth/company-context';

export interface MemberCompanyOption extends CompanyContextCompany {
  selected: boolean;
  isDefault: boolean;
}

export interface MemberCompanyAccessState {
  tenantId: string;
  userId: string;
  editable: boolean;
  defaultCompanyId: string;
  companyIds: string[];
  companies: MemberCompanyOption[];
}

export type MemberCompanyAccessErrorCode =
  | 'INVALID_USER_ID'
  | 'INVALID_COMPANY_ID'
  | 'TOO_MANY_COMPANIES'
  | 'EMPTY_COMPANY_SET'
  | 'DEFAULT_COMPANY_INVALID'
  | 'USERS_VIEW_REQUIRED'
  | 'USERS_MANAGE_REQUIRED'
  | 'MEMBER_NOT_FOUND'
  | 'OWNER_PROTECTED'
  | 'SELF_ACCESS_PROTECTED'
  | 'COMPANY_ACCESS_DENIED'
  | 'COMPANY_NOT_FOUND'
  | 'UPDATE_FAILED';

export class MemberCompanyAccessError extends Error {
  readonly code: MemberCompanyAccessErrorCode;
  constructor(code: MemberCompanyAccessErrorCode, message: string) {
    super(message);
    this.name = 'MemberCompanyAccessError';
    this.code = code;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMPANIES = 100;

function requireUuid(value: string, code: 'INVALID_USER_ID' | 'INVALID_COMPANY_ID', label: string) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!UUID_PATTERN.test(normalized)) {
    throw new MemberCompanyAccessError(code, `A valid ${label} is required.`);
  }
  return normalized;
}

function normalizeCompanyIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const ids = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (!UUID_PATTERN.test(id)) {
      throw new MemberCompanyAccessError('INVALID_COMPANY_ID', 'One of the selected companies is invalid.');
    }
    ids.add(id);
  }
  if (ids.size > MAX_COMPANIES) {
    throw new MemberCompanyAccessError('TOO_MANY_COMPANIES', `At most ${MAX_COMPANIES} companies can be assigned.`);
  }
  return [...ids];
}

async function requireUsersView() {
  const context = await getPermissionContext();
  if (
    context.isOwner ||
    permissionContextHas(context, SAMI_PERMISSIONS.USERS_VIEW) ||
    permissionContextHas(context, SAMI_PERMISSIONS.USERS_MANAGE)
  ) {
    return context;
  }
  throw new MemberCompanyAccessError('USERS_VIEW_REQUIRED', 'You do not have permission to view employee company access.');
}

async function requireUsersManage() {
  const context = await getPermissionContext();
  if (context.isOwner || permissionContextHas(context, SAMI_PERMISSIONS.USERS_MANAGE)) {
    return context;
  }
  throw new MemberCompanyAccessError('USERS_MANAGE_REQUIRED', 'You do not have permission to manage employee company access.');
}

async function loadTargetMembership(tenantId: string, userId: string) {
  const result = await queryControl(`
    SELECT id, user_id, tenant_id, is_owner, default_company_id, deleted_at
    FROM tenant_users
    WHERE tenant_id = $1 AND user_id = $2
    LIMIT 1
  `, [tenantId, userId]);

  if (result.rows.length === 0) {
    throw new MemberCompanyAccessError('MEMBER_NOT_FOUND', 'The workspace member could not be found.');
  }
  return result.rows[0] as Record<string, unknown>;
}

async function loadTargetCompanyIds(tenantId: string, userId: string): Promise<string[]> {
  const pool = await getTenantPoolByTenantId(tenantId);
  const result = await pool.query(`
    SELECT cu.company_id
    FROM company_users cu
    INNER JOIN companies c ON c.id = cu.company_id
    WHERE cu.user_id = $1
      AND LOWER(COALESCE(cu.status, '')) = 'active'
      AND c.is_active = TRUE
      AND c.archived_at IS NULL
    ORDER BY cu.is_default DESC, LOWER(c.name), c.id
  `, [userId]);
  return result.rows.map(row => String(row.company_id));
}

export async function getMemberCompanyAccess(userIdInput: string): Promise<MemberCompanyAccessState> {
  const context = await requireUsersView();
  const userId = requireUuid(userIdInput, 'INVALID_USER_ID', 'user ID');
  const [target, actorCompanies, companyIds] = await Promise.all([
    loadTargetMembership(context.tenantId, userId),
    requireCompanyContext(),
    loadTargetCompanyIds(context.tenantId, userId),
  ]);

  const defaultCompanyId = typeof target.default_company_id === 'string'
    ? target.default_company_id
    : companyIds[0] || actorCompanies.currentCompanyId;

  const selected = new Set(companyIds);
  return {
    tenantId: context.tenantId,
    userId,
    editable: target.is_owner !== true && userId !== context.userId && (context.isOwner || permissionContextHas(context, SAMI_PERMISSIONS.USERS_MANAGE)),
    defaultCompanyId,
    companyIds,
    companies: actorCompanies.allowedCompanies.map(company => ({
      ...company,
      selected: selected.has(company.id),
      isDefault: company.id === defaultCompanyId,
    })),
  };
}

type CompanyUserSnapshot = {
  company_id: string;
  is_default: boolean;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
};

async function restoreSnapshot(tenantId: string, userId: string, snapshot: CompanyUserSnapshot[]) {
  const pool = await getTenantPoolByTenantId(tenantId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM company_users WHERE user_id = $1', [userId]);
    for (const row of snapshot) {
      await client.query(`
        INSERT INTO company_users (company_id, user_id, is_default, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [row.company_id, userId, row.is_default, row.status, row.created_at, row.updated_at]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[SaMi] Employee company-access compensation failed:', error);
  } finally {
    client.release();
  }
}

export async function replaceMemberCompanyAccess(input: {
  userId: string;
  companyIds: string[];
  defaultCompanyId: string;
  audit?: { ipAddress?: string | null; userAgent?: string | null; correlationId?: string | null };
}): Promise<MemberCompanyAccessState> {
  const context = await requireUsersManage();
  const userId = requireUuid(input.userId, 'INVALID_USER_ID', 'user ID');
  const companyIds = normalizeCompanyIds(input.companyIds);
  const defaultCompanyId = requireUuid(input.defaultCompanyId, 'INVALID_COMPANY_ID', 'default company ID');

  if (userId === context.userId) {
    throw new MemberCompanyAccessError('SELF_ACCESS_PROTECTED', 'You cannot change your own company scope from People & Access.');
  }
  if (companyIds.length === 0) {
    throw new MemberCompanyAccessError('EMPTY_COMPANY_SET', 'Select at least one company.');
  }
  if (!companyIds.includes(defaultCompanyId)) {
    throw new MemberCompanyAccessError('DEFAULT_COMPANY_INVALID', 'The default company must be one of the selected companies.');
  }

  const [target, actorCompanyContext] = await Promise.all([
    loadTargetMembership(context.tenantId, userId),
    requireCompanyContext(),
  ]);

  if (target.is_owner === true) {
    throw new MemberCompanyAccessError('OWNER_PROTECTED', 'Workspace owner company access cannot be restricted.');
  }

  const actorAllowed = new Set(actorCompanyContext.allowedCompanyIds);
  for (const companyId of companyIds) {
    if (!actorAllowed.has(companyId)) {
      throw new MemberCompanyAccessError('COMPANY_ACCESS_DENIED', 'You cannot grant access to a company outside your own allowed company scope.');
    }
  }

  const tenantPool = await getTenantPoolByTenantId(context.tenantId);
  const tenantClient: PoolClient = await tenantPool.connect();
  let snapshot: CompanyUserSnapshot[] = [];
  let tenantCommitted = false;

  try {
    await tenantClient.query('BEGIN');

    const existing = await tenantClient.query<CompanyUserSnapshot>(`
      SELECT company_id, is_default, status, created_at, updated_at
      FROM company_users
      WHERE user_id = $1
      ORDER BY company_id
      FOR UPDATE
    `, [userId]);
    snapshot = existing.rows;

    const validCompanies = await tenantClient.query(`
      SELECT id
      FROM companies
      WHERE id = ANY($1::uuid[])
        AND is_active = TRUE
        AND archived_at IS NULL
    `, [companyIds]);
    if (validCompanies.rows.length !== companyIds.length) {
      throw new MemberCompanyAccessError('COMPANY_NOT_FOUND', 'One or more selected companies are unavailable.');
    }

    await tenantClient.query('DELETE FROM company_users WHERE user_id = $1', [userId]);
    for (const companyId of companyIds) {
      await tenantClient.query(`
        INSERT INTO company_users (
          company_id, user_id, is_default, status, created_at, updated_at
        ) VALUES ($1, $2, $3, 'active', NOW(), NOW())
      `, [companyId, userId, companyId === defaultCompanyId]);
    }

    await tenantClient.query('COMMIT');
    tenantCommitted = true;

    const controlClient = await getControlPool().connect();
    try {
      await controlClient.query('BEGIN');
      await controlClient.query(`
        UPDATE tenant_users
        SET default_company_id = $3, updated_at = NOW()
        WHERE tenant_id = $1 AND user_id = $2
      `, [context.tenantId, userId, defaultCompanyId]);

      /* Reset the target's active session to a guaranteed-valid company context. */
      await controlClient.query(`
        UPDATE sessions
        SET current_company_id = $3,
            selected_company_ids = $4::uuid[],
            updated_at = NOW()
        WHERE user_id = $1
          AND current_tenant_id = $2
          AND revoked_at IS NULL
          AND expires_at > NOW()
      `, [userId, context.tenantId, defaultCompanyId, companyIds]);

      await controlClient.query(`
        INSERT INTO audit_logs (
          tenant_id, user_id, actor_type, action,
          resource_type, resource_id, module, result,
          metadata, ip_address, user_agent, correlation_id,
          event_type, entity_type, entity_id
        ) VALUES (
          $1, $2, 'human', 'workspace.member.companies.updated',
          'workspace_member', $3, 'workspace', 'success',
          $4::jsonb, $5, $6, $7,
          'workspace.member.companies.updated', 'workspace_member', $3
        )
      `, [
        context.tenantId,
        context.userId,
        userId,
        JSON.stringify({ companyIds, defaultCompanyId }),
        input.audit?.ipAddress || 'unknown',
        input.audit?.userAgent || '',
        input.audit?.correlationId || crypto.randomUUID(),
      ]);

      await controlClient.query('COMMIT');
    } catch (error) {
      await controlClient.query('ROLLBACK').catch(() => undefined);
      if (tenantCommitted) await restoreSnapshot(context.tenantId, userId, snapshot);
      throw error;
    } finally {
      controlClient.release();
    }
  } catch (error) {
    if (!tenantCommitted) await tenantClient.query('ROLLBACK').catch(() => undefined);
    if (error instanceof MemberCompanyAccessError) throw error;
    throw new MemberCompanyAccessError('UPDATE_FAILED', 'Employee company access could not be updated.');
  } finally {
    tenantClient.release();
  }

  return getMemberCompanyAccess(userId);
}
