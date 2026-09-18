import { queryControl } from './control';

/**
 * SaMi Tenant Database Registry
 *
 * The control database is the source of truth for mapping:
 *
 * tenant_id -> tenant database
 *
 * IMPORTANT:
 * - This file does NOT create databases.
 * - This file does NOT authorize users.
 * - This file does NOT expose database information to the browser.
 * - Tenant authorization is handled separately.
 */

export type TenantDatabaseStatus =
  | 'provisioning'
  | 'active'
  | 'failed'
  | 'suspended'
  | 'archived'
  | 'pending_deletion'
  | 'deleted';

export type TenantDatabaseHealthStatus =
  | 'unknown'
  | 'healthy'
  | 'degraded'
  | 'unreachable'
  | 'maintenance';

export interface TenantDatabaseRecord {
  id: string;
  tenant_id: string;

  provider: string;
  database_engine: string;

  region: string | null;

  database_identifier: string | null;
  database_name: string;

  database_host: string | null;
  database_port: number;

  schema_version: string | null;

  status: TenantDatabaseStatus;
  health_status: TenantDatabaseHealthStatus;

  retry_count: number;

  failure_code: string | null;
  failure_message: string | null;

  provisioned_at: Date | null;

  last_health_check_at: Date | null;
  last_verified_at: Date | null;
  last_migrated_at: Date | null;

  suspended_at: Date | null;
  archived_at: Date | null;
  deletion_requested_at: Date | null;
  deleted_at: Date | null;

  created_at: Date;
  updated_at: Date;
}

/**
 * Internal mapper.
 *
 * Keeps database row conversion in one place instead of spreading
 * PostgreSQL result handling throughout SaMi.
 */
function mapTenantDatabaseRow(row: any): TenantDatabaseRecord {
  return {
    id: row.id,
    tenant_id: row.tenant_id,

    provider: row.provider,
    database_engine: row.database_engine ?? 'postgresql',

    region: row.region ?? null,

    database_identifier: row.database_identifier ?? null,
    database_name: row.database_name,

    database_host: row.database_host ?? null,
    database_port: Number(row.database_port ?? 5432),

    schema_version: row.schema_version ?? null,

    status: row.status,
    health_status: row.health_status ?? 'unknown',

    retry_count: Number(row.retry_count ?? 0),

    failure_code: row.failure_code ?? null,
    failure_message: row.failure_message ?? null,

    provisioned_at: row.provisioned_at ?? null,

    last_health_check_at: row.last_health_check_at ?? null,
    last_verified_at: row.last_verified_at ?? null,
    last_migrated_at: row.last_migrated_at ?? null,

    suspended_at: row.suspended_at ?? null,
    archived_at: row.archived_at ?? null,
    deletion_requested_at: row.deletion_requested_at ?? null,
    deleted_at: row.deleted_at ?? null,

    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Get the ACTIVE database for a tenant.
 *
 * KEEPING THIS FUNCTION NAME because existing SaMi code
 * already uses it.
 */
export async function getTenantDatabase(
  tenantId: string
): Promise<TenantDatabaseRecord | null> {
  if (!tenantId) {
    return null;
  }

  const result = await queryControl(
    `
      SELECT *
      FROM tenant_databases
      WHERE tenant_id = $1
        AND status = 'active'
      LIMIT 1
    `,
    [tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapTenantDatabaseRow(result.rows[0]);
}

/**
 * Existing compatibility helper.
 *
 * KEEP this export because other SaMi code may already depend on it.
 */
export async function getTenantDatabaseName(
  tenantId: string
): Promise<string | null> {
  const database = await getTenantDatabase(tenantId);

  return database?.database_name ?? null;
}

/**
 * Get the canonical registry record regardless of lifecycle status.
 *
 * Useful for:
 * - admin diagnostics
 * - provisioning
 * - suspension
 * - recovery
 * - migration checks
 *
 * Do NOT use this function to grant normal workspace database access.
 */
export async function getTenantDatabaseRecord(
  tenantId: string
): Promise<TenantDatabaseRecord | null> {
  if (!tenantId) {
    return null;
  }

  const result = await queryControl(
    `
      SELECT *
      FROM tenant_databases
      WHERE tenant_id = $1
      LIMIT 1
    `,
    [tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapTenantDatabaseRow(result.rows[0]);
}

/**
 * Look up registry entry using the registry row UUID.
 *
 * Internal/admin use only.
 */
export async function getTenantDatabaseById(
  id: string
): Promise<TenantDatabaseRecord | null> {
  if (!id) {
    return null;
  }

  const result = await queryControl(
    `
      SELECT *
      FROM tenant_databases
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapTenantDatabaseRow(result.rows[0]);
}

/**
 * Does the tenant already have a canonical database registry entry?
 *
 * Important for idempotent provisioning.
 */
export async function tenantDatabaseExists(
  tenantId: string
): Promise<boolean> {
  if (!tenantId) {
    return false;
  }

  const result = await queryControl(
    `
      SELECT 1
      FROM tenant_databases
      WHERE tenant_id = $1
      LIMIT 1
    `,
    [tenantId]
  );

  return result.rows.length > 0;
}

/**
 * Update health after a successful database connectivity check.
 *
 * This deliberately does NOT change lifecycle status.
 *
 * For example:
 * status = active
 * health_status = healthy
 */
export async function markTenantDatabaseHealthy(
  tenantId: string
): Promise<void> {
  await queryControl(
    `
      UPDATE tenant_databases
      SET
        health_status = 'healthy',
        last_health_check_at = NOW(),
        last_verified_at = NOW(),
        failure_code = NULL,
        failure_message = NULL
      WHERE tenant_id = $1
    `,
    [tenantId]
  );
}

/**
 * Mark a database health check as degraded.
 *
 * Does not suspend or deactivate the tenant.
 */
export async function markTenantDatabaseDegraded(
  tenantId: string,
  failureCode?: string,
  failureMessage?: string
): Promise<void> {
  await queryControl(
    `
      UPDATE tenant_databases
      SET
        health_status = 'degraded',
        last_health_check_at = NOW(),
        failure_code = $2,
        failure_message = $3
      WHERE tenant_id = $1
    `,
    [
      tenantId,
      failureCode ?? null,
      failureMessage ?? null,
    ]
  );
}

/**
 * Mark database as unreachable.
 *
 * IMPORTANT:
 * This does NOT automatically change:
 *
 * status = active
 *
 * because a temporary Neon/network failure must not permanently
 * suspend a customer's workspace.
 */
export async function markTenantDatabaseUnreachable(
  tenantId: string,
  failureCode?: string,
  failureMessage?: string
): Promise<void> {
  await queryControl(
    `
      UPDATE tenant_databases
      SET
        health_status = 'unreachable',
        last_health_check_at = NOW(),
        failure_code = $2,
        failure_message = $3
      WHERE tenant_id = $1
    `,
    [
      tenantId,
      failureCode ?? null,
      failureMessage ?? null,
    ]
  );
}

/**
 * Update schema version after a successful migration.
 */
export async function updateTenantSchemaVersion(
  tenantId: string,
  schemaVersion: string
): Promise<void> {
  await queryControl(
    `
      UPDATE tenant_databases
      SET
        schema_version = $2,
        last_migrated_at = NOW()
      WHERE tenant_id = $1
    `,
    [tenantId, schemaVersion]
  );
}