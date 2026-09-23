import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

export type PlatformRecoveryWorkspace = {
  tenantId: string;
  tenantName: string;
  databaseName: string | null;
  databaseStatus: string;
  schemaVersion: string | null;
  retentionUntil: string | null;
  purgedAt: string | null;
  availableRecoveryPoints: number;
  lastRecoveryAt: string | null;
};

export type PlatformRecoveryPointSummary = {
  id: string;
  tenantId: string;
  tenantName: string;
  recoveryType: string;
  provider: string;
  sourceDatabaseName: string;
  sourceSchemaVersion: string | null;
  reason: string | null;
  status: string;
  requestedAt: string | null;
  availableAt: string | null;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
};

function iso(
  value: unknown,
): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toISOString();
  }

  return null;
}

function databaseErrorCode(
  error: unknown,
): string | null {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error
  ) {
    const code = String(
      (error as { code?: unknown }).code || '',
    ).trim();

    return code || null;
  }

  return null;
}

export async function getPlatformRecoveryOverview() {
  try {
    const [
      workspaceResult,
      recoveryResult,
    ] = await Promise.all([
      queryControl(
        \`
          SELECT
            t.id::text AS tenant_id,
            t.name::text AS tenant_name,
            td.database_name::text AS database_name,
            COALESCE(td.status::text, 'not_registered') AS database_status,
            td.schema_version::text AS schema_version,
            td.retention_until,
            td.purged_at,
            COUNT(rp.id) FILTER (
              WHERE rp.status = 'available'
                AND (
                  rp.expires_at IS NULL
                  OR rp.expires_at > NOW()
                )
            )::int AS available_recovery_points,
            MAX(rp.created_at) AS last_recovery_at
          FROM tenants t
          LEFT JOIN tenant_databases td
            ON td.tenant_id = t.id
          LEFT JOIN tenant_database_recovery_points rp
            ON rp.tenant_id = t.id
          WHERE t.deleted_at IS NULL
          GROUP BY
            t.id,
            t.name,
            td.database_name,
            td.status,
            td.schema_version,
            td.retention_until,
            td.purged_at
          ORDER BY
            t.name ASC,
            t.id ASC
          LIMIT 500
        \`,
      ),

      queryControl(
        \`
          SELECT
            rp.id::text,
            rp.tenant_id::text,
            t.name::text AS tenant_name,
            rp.recovery_type::text,
            rp.provider::text,
            rp.source_database_name::text,
            rp.source_schema_version::text,
            rp.reason::text,
            rp.status::text,
            rp.requested_at,
            rp.available_at,
            rp.expires_at,
            rp.last_verified_at,
            rp.failure_code::text,
            rp.failure_message::text
          FROM tenant_database_recovery_points rp
          INNER JOIN tenants t
            ON t.id = rp.tenant_id
          WHERE t.deleted_at IS NULL
          ORDER BY rp.created_at DESC
          LIMIT 250
        \`,
      ),
    ]);

    const workspaces:
      PlatformRecoveryWorkspace[] =
      workspaceResult.rows.map(
        row => ({
          tenantId:
            String(row.tenant_id),
          tenantName:
            String(row.tenant_name || 'Workspace'),
          databaseName:
            typeof row.database_name === 'string'
              ? row.database_name
              : null,
          databaseStatus:
            typeof row.database_status === 'string'
              ? row.database_status
              : 'unknown',
          schemaVersion:
            typeof row.schema_version === 'string'
              ? row.schema_version
              : null,
          retentionUntil:
            iso(row.retention_until),
          purgedAt:
            iso(row.purged_at),
          availableRecoveryPoints:
            Number(row.available_recovery_points || 0),
          lastRecoveryAt:
            iso(row.last_recovery_at),
        }),
      );

    const recoveryPoints:
      PlatformRecoveryPointSummary[] =
      recoveryResult.rows.map(
        row => ({
          id:
            String(row.id),
          tenantId:
            String(row.tenant_id),
          tenantName:
            String(row.tenant_name || 'Workspace'),
          recoveryType:
            String(row.recovery_type || 'unknown'),
          provider:
            String(row.provider || 'unknown'),
          sourceDatabaseName:
            String(row.source_database_name || 'unknown'),
          sourceSchemaVersion:
            typeof row.source_schema_version === 'string'
              ? row.source_schema_version
              : null,
          reason:
            typeof row.reason === 'string'
              ? row.reason
              : null,
          status:
            String(row.status || 'unknown'),
          requestedAt:
            iso(row.requested_at),
          availableAt:
            iso(row.available_at),
          expiresAt:
            iso(row.expires_at),
          lastVerifiedAt:
            iso(row.last_verified_at),
          failureCode:
            typeof row.failure_code === 'string'
              ? row.failure_code
              : null,
          failureMessage:
            typeof row.failure_message === 'string'
              ? row.failure_message
              : null,
        }),
      );

    return {
      available:
        true,
      error:
        null as string | null,
      workspaces,
      recoveryPoints,
    };
  } catch (error) {
    const code =
      databaseErrorCode(error);

    console.error(
      '[SaMi Admin] Recovery overview unavailable:',
      code ||
      (
        error instanceof Error
          ? error.message
          : 'unknown_error'
      ),
    );

    return {
      available:
        false,
      error:
        code === '42P01' ||
        code === '42703'
          ? 'Recovery metadata is not ready. Apply the pending control database migrations first.'
          : 'Recovery operations could not be loaded from the control database.',
      workspaces:
        [] as PlatformRecoveryWorkspace[],
      recoveryPoints:
        [] as PlatformRecoveryPointSummary[],
    };
  }
}
