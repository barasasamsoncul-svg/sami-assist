import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';


/* ================================================================
   SaMi TENANT DATABASE HEALTH
   ================================================================

   PURPOSE

   This service verifies the operational health of a tenant's
   physical PostgreSQL database.

   It checks:

   1. Whether the database can be reached.
   2. Whether PostgreSQL connected to the expected physical DB.
   3. Whether the tenant core schema version exists.
   4. Whether the tenant-side schema version matches the
      Control DB registry.
   5. How long the verification took.

   It then updates:

     tenant_databases.health_status
     tenant_databases.last_health_check_at
     tenant_databases.last_verified_at
     tenant_databases.failure_code
     tenant_databases.failure_message

   IMPORTANT

   Lifecycle status and health status are deliberately separate.

   Example:

       status = active
       health_status = unreachable

   A temporary provider/network/database outage MUST NOT
   automatically suspend, archive or delete a tenant.

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type TenantDatabaseHealthStatus =
  | 'unknown'
  | 'healthy'
  | 'degraded'
  | 'unreachable'
  | 'maintenance';


export type TenantHealthFailureCode =
  | 'DATABASE_CONNECTION_FAILED'
  | 'DATABASE_IDENTITY_MISMATCH'
  | 'SCHEMA_VERSION_MISSING'
  | 'SCHEMA_VERSION_MISMATCH'
  | 'DATABASE_HEALTH_QUERY_FAILED';


type TenantDatabaseRegistryRow = {
  id:
    string;

  tenantId:
    string;

  databaseName:
    string;

  lifecycleStatus:
    string;

  healthStatus:
    TenantDatabaseHealthStatus;

  schemaVersion:
    string | null;
};


export interface TenantDatabaseHealthResult {
  tenantId:
    string;

  databaseId:
    string;

  lifecycleStatus:
    string;

  healthStatus:
    TenantDatabaseHealthStatus;

  connected:
    boolean;

  skipped:
    boolean;

  expectedDatabase:
    string;

  actualDatabase:
    string | null;

  registrySchemaVersion:
    string | null;

  tenantSchemaVersion:
    string | null;

  latencyMs:
    number | null;

  checkedAt:
    string;

  failureCode:
    TenantHealthFailureCode | null;

  failureMessage:
    string | null;
}


/* ================================================================
   ERROR
   ================================================================ */

export class TenantHealthError
  extends Error {
  readonly code:
    | 'INVALID_TENANT_ID'
    | 'TENANT_DATABASE_NOT_REGISTERED';

  constructor(
    code:
      | 'INVALID_TENANT_ID'
      | 'TENANT_DATABASE_NOT_REGISTERED',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'TenantHealthError';

    this.code =
      code;
  }
}


/* ================================================================
   HEALTH STATUS NORMALIZATION
   ================================================================ */

function normalizeHealthStatus(
  value:
    unknown,
): TenantDatabaseHealthStatus {
  const normalized =
    typeof value ===
      'string'
      ? value
          .trim()
          .toLowerCase()
      : '';


  switch (
    normalized
  ) {
    case 'healthy':
      return 'healthy';

    case 'degraded':
      return 'degraded';

    case 'unreachable':
      return 'unreachable';

    case 'maintenance':
      return 'maintenance';

    default:
      return 'unknown';
  }
}


/* ================================================================
   TENANT DATABASE REGISTRY
   ================================================================ */

async function getTenantDatabaseRegistry(
  tenantId:
    string,
): Promise<TenantDatabaseRegistryRow> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          tenant_id,
          database_name,
          status,
          health_status,
          schema_version

        FROM tenant_databases

        WHERE tenant_id = $1

        LIMIT 1
      `,
      [
        tenantId,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    throw new TenantHealthError(
      'TENANT_DATABASE_NOT_REGISTERED',
      'No tenant database is registered for this workspace.',
    );
  }


  const row =
    result.rows[0];


  if (
    typeof row.database_name !==
      'string' ||
    !row.database_name.trim()
  ) {
    throw new TenantHealthError(
      'TENANT_DATABASE_NOT_REGISTERED',
      'The tenant database registry is incomplete.',
    );
  }


  return {
    id:
      String(
        row.id,
      ),

    tenantId:
      String(
        row.tenant_id,
      ),

    databaseName:
      row.database_name
        .trim(),

    lifecycleStatus:
      typeof row.status ===
        'string'
        ? row.status
            .trim()
            .toLowerCase()
        : 'unknown',

    healthStatus:
      normalizeHealthStatus(
        row.health_status,
      ),

    schemaVersion:
      typeof row.schema_version ===
        'string' &&
      row.schema_version.trim()
        ? row.schema_version
            .trim()
        : null,
  };
}


/* ================================================================
   SAFE FAILURE MESSAGE
   ================================================================ */

/**
 * Only safe operational messages are written to the Control DB.
 *
 * Raw PostgreSQL/provider errors remain in server logs.
 *
 * This is important because failure_message may eventually be
 * displayed inside SaMi Platform Administration.
 */
function safeFailureMessage(
  code:
    TenantHealthFailureCode,
): string {
  switch (
    code
  ) {
    case 'DATABASE_CONNECTION_FAILED':
      return (
        'SaMi could not establish a connection to the tenant database.'
      );

    case 'DATABASE_IDENTITY_MISMATCH':
      return (
        'The database connection resolved to an unexpected database.'
      );

    case 'SCHEMA_VERSION_MISSING':
      return (
        'SaMi could not determine the tenant core schema version.'
      );

    case 'SCHEMA_VERSION_MISMATCH':
      return (
        'The tenant database schema version does not match the Control DB registry.'
      );

    case 'DATABASE_HEALTH_QUERY_FAILED':
      return (
        'The tenant database responded, but the health verification could not be completed.'
      );

    default:
      return (
        'SaMi detected an unexpected tenant database health problem.'
      );
  }
}


/* ================================================================
   DATABASE ERROR CODE
   ================================================================ */

function getErrorCode(
  error:
    unknown,
): string | null {
  if (
    !error ||
    typeof error !==
      'object'
  ) {
    return null;
  }


  const code =
    (
      error as {
        code?: unknown;
      }
    ).code;


  return typeof code ===
    'string'
    ? code
    : null;
}


/* ================================================================
   CONNECTIVITY ERROR CLASSIFICATION
   ================================================================ */

function isConnectivityError(
  error:
    unknown,
): boolean {
  const code =
    getErrorCode(
      error,
    );


  if (
    !code
  ) {
    return false;
  }


  /**
   * PostgreSQL SQLSTATE class 08:
   *
   * Connection Exception
   */
  if (
    code.startsWith(
      '08',
    )
  ) {
    return true;
  }


  /**
   * Common Node/network failures.
   */
  const networkCodes =
    new Set([
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'EPIPE',

      /**
       * PostgreSQL server shutdown / unavailable errors.
       */
      '57P01',
      '57P02',
      '57P03',
    ]);


  return networkCodes.has(
    code,
  );
}


/* ================================================================
   HEALTH STATE WRITE
   ================================================================ */

async function updateHealthState(
  input: {
    databaseId:
      string;

    healthStatus:
      TenantDatabaseHealthStatus;

    failureCode:
      TenantHealthFailureCode | null;

    failureMessage:
      string | null;

    verified:
      boolean;
  },
): Promise<void> {
  await queryControl(
    `
      UPDATE tenant_databases

      SET
        health_status =
          $2,

        last_health_check_at =
          NOW(),

        last_verified_at =
          CASE
            WHEN $5 = TRUE
            THEN NOW()

            ELSE last_verified_at
          END,

        failure_code =
          $3,

        failure_message =
          $4,

        updated_at =
          NOW()

      WHERE id = $1
    `,
    [
      input.databaseId,
      input.healthStatus,
      input.failureCode,
      input.failureMessage,
      input.verified,
    ],
  );
}


/* ================================================================
   MARK HEALTHY
   ================================================================ */

async function markHealthy(
  databaseId:
    string,
): Promise<void> {
  await updateHealthState({
    databaseId,

    healthStatus:
      'healthy',

    failureCode:
      null,

    failureMessage:
      null,

    verified:
      true,
  });
}


/* ================================================================
   MARK DEGRADED
   ================================================================ */

async function markDegraded(
  databaseId:
    string,

  failureCode:
    TenantHealthFailureCode,
): Promise<void> {
  await updateHealthState({
    databaseId,

    healthStatus:
      'degraded',

    failureCode,

    failureMessage:
      safeFailureMessage(
        failureCode,
      ),

    verified:
      false,
  });
}


/* ================================================================
   MARK UNREACHABLE
   ================================================================ */

async function markUnreachable(
  databaseId:
    string,
): Promise<void> {
  const failureCode:
    TenantHealthFailureCode =
    'DATABASE_CONNECTION_FAILED';


  await updateHealthState({
    databaseId,

    healthStatus:
      'unreachable',

    failureCode,

    failureMessage:
      safeFailureMessage(
        failureCode,
      ),

    verified:
      false,
  });
}


/* ================================================================
   RESULT BUILDER
   ================================================================ */

function createResult(
  input: {
    registry:
      TenantDatabaseRegistryRow;

    healthStatus:
      TenantDatabaseHealthStatus;

    connected:
      boolean;

    skipped:
      boolean;

    actualDatabase:
      string | null;

    tenantSchemaVersion:
      string | null;

    latencyMs:
      number | null;

    failureCode:
      TenantHealthFailureCode | null;
  },
): TenantDatabaseHealthResult {
  return {
    tenantId:
      input.registry
        .tenantId,

    databaseId:
      input.registry
        .id,

    lifecycleStatus:
      input.registry
        .lifecycleStatus,

    healthStatus:
      input.healthStatus,

    connected:
      input.connected,

    skipped:
      input.skipped,

    expectedDatabase:
      input.registry
        .databaseName,

    actualDatabase:
      input.actualDatabase,

    registrySchemaVersion:
      input.registry
        .schemaVersion,

    tenantSchemaVersion:
      input.tenantSchemaVersion,

    latencyMs:
      input.latencyMs,

    checkedAt:
      new Date()
        .toISOString(),

    failureCode:
      input.failureCode,

    failureMessage:
      input.failureCode
        ? safeFailureMessage(
            input.failureCode,
          )
        : null,
  };
}


/* ================================================================
   RUN TENANT DATABASE HEALTH CHECK
   ================================================================ */

export async function checkTenantDatabaseHealth(
  tenantId:
    string,
): Promise<TenantDatabaseHealthResult> {
  /* ------------------------------------------------------------
     VALIDATE TENANT ID
     ------------------------------------------------------------ */

  if (
    typeof tenantId !==
      'string' ||
    !tenantId.trim()
  ) {
    throw new TenantHealthError(
      'INVALID_TENANT_ID',
      'A valid tenant ID is required.',
    );
  }


  const normalizedTenantId =
    tenantId.trim();


  /* ------------------------------------------------------------
     LOAD DATABASE REGISTRY
     ------------------------------------------------------------ */

  const registry =
    await getTenantDatabaseRegistry(
      normalizedTenantId,
    );


  /* ------------------------------------------------------------
     NON-ACTIVE DATABASE
     ------------------------------------------------------------

     Database lifecycle status is NOT the same as database health.

     If the database has intentionally been suspended, archived,
     scheduled for deletion, etc., we do not classify it as
     unreachable merely because normal application access is
     disabled.
     ------------------------------------------------------------ */

  if (
    registry.lifecycleStatus !==
      'active'
  ) {
    return createResult({
      registry,

      healthStatus:
        registry.healthStatus,

      connected:
        false,

      skipped:
        true,

      actualDatabase:
        null,

      tenantSchemaVersion:
        null,

      latencyMs:
        null,

      failureCode:
        null,
    });
  }


  /* ------------------------------------------------------------
     MAINTENANCE MODE
     ------------------------------------------------------------

     A manually set maintenance state must not be overwritten by
     routine probes.
     ------------------------------------------------------------ */

  if (
    registry.healthStatus ===
      'maintenance'
  ) {
    return createResult({
      registry,

      healthStatus:
        'maintenance',

      connected:
        false,

      skipped:
        true,

      actualDatabase:
        null,

      tenantSchemaVersion:
        null,

      latencyMs:
        null,

      failureCode:
        null,
    });
  }


  const startedAt =
    Date.now();


  let client:
    PoolClient | null =
    null;


  let connected =
    false;


  let actualDatabase:
    string | null =
    null;


  let tenantSchemaVersion:
    string | null =
    null;


  try {
    /* ----------------------------------------------------------
       GET TENANT DATABASE POOL
       ---------------------------------------------------------- */

    const pool =
      await getTenantPoolByTenantId(
        normalizedTenantId,
      );


    /**
     * Use a local non-null variable for database operations.
     *
     * Keep the outer `client` only so finally() can safely release
     * it if anything throws after acquisition.
     */
    const dbClient =
      await pool.connect();


    client =
      dbClient;


    connected =
      true;


    /* ----------------------------------------------------------
       DATABASE IDENTITY CHECK
       ----------------------------------------------------------

       We verify PostgreSQL actually connected to the physical
       database registered for this tenant.

       Tenant A must never accidentally execute against Tenant B.
       ---------------------------------------------------------- */

    const identityResult =
      await dbClient.query<{
        database_name:
          string;
      }>(
        `
          SELECT
            current_database()
              AS database_name
        `,
      );


    actualDatabase =
      typeof identityResult
        .rows[0]
        ?.database_name ===
      'string'
        ? identityResult
            .rows[0]
            .database_name
        : null;


    const latencyMs =
      Date.now() -
      startedAt;


    if (
      actualDatabase !==
      registry.databaseName
    ) {
      const failureCode:
        TenantHealthFailureCode =
        'DATABASE_IDENTITY_MISMATCH';


      await markDegraded(
        registry.id,
        failureCode,
      );


      return createResult({
        registry,

        healthStatus:
          'degraded',

        connected:
          true,

        skipped:
          false,

        actualDatabase,

        tenantSchemaVersion:
          null,

        latencyMs,

        failureCode,
      });
    }


    /* ----------------------------------------------------------
       TENANT-SIDE CORE SCHEMA VERSION
       ---------------------------------------------------------- */

    const versionResult =
      await dbClient.query<{
        version:
          string;
      }>(
        `
          SELECT
            version

          FROM core_schema_version

          ORDER BY
            installed_at DESC,
            version DESC

          LIMIT 1
        `,
      );


    tenantSchemaVersion =
      typeof versionResult
        .rows[0]
        ?.version ===
      'string'
        ? versionResult
            .rows[0]
            .version
            .trim()
        : null;


    if (
      !tenantSchemaVersion
    ) {
      const failureCode:
        TenantHealthFailureCode =
        'SCHEMA_VERSION_MISSING';


      await markDegraded(
        registry.id,
        failureCode,
      );


      return createResult({
        registry,

        healthStatus:
          'degraded',

        connected:
          true,

        skipped:
          false,

        actualDatabase,

        tenantSchemaVersion:
          null,

        latencyMs,

        failureCode,
      });
    }


    /* ----------------------------------------------------------
       CONTROL DB ↔ TENANT DB VERSION CONSISTENCY
       ---------------------------------------------------------- */

    if (
      !registry.schemaVersion ||
      registry.schemaVersion !==
        tenantSchemaVersion
    ) {
      const failureCode:
        TenantHealthFailureCode =
        'SCHEMA_VERSION_MISMATCH';


      await markDegraded(
        registry.id,
        failureCode,
      );


      return createResult({
        registry,

        healthStatus:
          'degraded',

        connected:
          true,

        skipped:
          false,

        actualDatabase,

        tenantSchemaVersion,

        latencyMs,

        failureCode,
      });
    }


    /* ----------------------------------------------------------
       HEALTHY
       ---------------------------------------------------------- */

    await markHealthy(
      registry.id,
    );


    return createResult({
      registry,

      healthStatus:
        'healthy',

      connected:
        true,

      skipped:
        false,

      actualDatabase,

      tenantSchemaVersion,

      latencyMs,

      failureCode:
        null,
    });
  } catch (
    error
  ) {
    /* ----------------------------------------------------------
       SERVER-SIDE DIAGNOSTIC
       ----------------------------------------------------------

       Detailed PostgreSQL/provider information belongs in server
       logs.

       Do not expose this raw error to workspace users.
       ---------------------------------------------------------- */

    console.error(
      `[SaMi] Tenant database health check failed for ${normalizedTenantId}:`,
      error,
    );


    const latencyMs =
      Date.now() -
      startedAt;


    /* ----------------------------------------------------------
       CONNECTION FAILURE
       ---------------------------------------------------------- */

    const connectivityFailure =
      !connected ||
      isConnectivityError(
        error,
      );


    if (
      connectivityFailure
    ) {
      await markUnreachable(
        registry.id,
      );


      const failureCode:
        TenantHealthFailureCode =
        'DATABASE_CONNECTION_FAILED';


      return createResult({
        registry,

        healthStatus:
          'unreachable',

        connected:
          false,

        skipped:
          false,

        actualDatabase,

        tenantSchemaVersion,

        latencyMs,

        failureCode,
      });
    }


    /* ----------------------------------------------------------
       DATABASE RESPONDED BUT HEALTH CHECK FAILED
       ---------------------------------------------------------- */

    const failureCode:
      TenantHealthFailureCode =
      'DATABASE_HEALTH_QUERY_FAILED';


    await markDegraded(
      registry.id,
      failureCode,
    );


    return createResult({
      registry,

      healthStatus:
        'degraded',

      connected:
        true,

      skipped:
        false,

      actualDatabase,

      tenantSchemaVersion,

      latencyMs,

      failureCode,
    });
  } finally {
    /* ----------------------------------------------------------
       ALWAYS RELEASE CHECKED-OUT CLIENT
       ---------------------------------------------------------- */

    if (
      client
    ) {
      client.release();
    }
  }
}


/* ================================================================
   READ CURRENT STORED HEALTH
   ================================================================ */

export async function getTenantDatabaseHealth(
  tenantId:
    string,
): Promise<{
  id: string;
  tenantId: string;

  lifecycleStatus: string;

  healthStatus:
    TenantDatabaseHealthStatus;

  schemaVersion:
    string | null;

  lastHealthCheckAt:
    Date | string | null;

  lastVerifiedAt:
    Date | string | null;

  failureCode:
    string | null;

  failureMessage:
    string | null;

  provisionedAt:
    Date | string | null;

  lastMigratedAt:
    Date | string | null;
}> {
  if (
    typeof tenantId !==
      'string' ||
    !tenantId.trim()
  ) {
    throw new TenantHealthError(
      'INVALID_TENANT_ID',
      'A valid tenant ID is required.',
    );
  }


  const normalizedTenantId =
    tenantId.trim();


  const result =
    await queryControl(
      `
        SELECT
          td.id,
          td.tenant_id,

          td.status,

          td.health_status,

          td.schema_version,

          td.last_health_check_at,

          td.last_verified_at,

          td.failure_code,

          td.failure_message,

          td.provisioned_at,

          td.last_migrated_at

        FROM tenant_databases td

        WHERE td.tenant_id = $1

        LIMIT 1
      `,
      [
        normalizedTenantId,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    throw new TenantHealthError(
      'TENANT_DATABASE_NOT_REGISTERED',
      'No tenant database is registered for this workspace.',
    );
  }


  const row =
    result.rows[0];


  return {
    id:
      String(
        row.id,
      ),

    tenantId:
      String(
        row.tenant_id,
      ),

    lifecycleStatus:
      typeof row.status ===
        'string'
        ? row.status
        : 'unknown',

    healthStatus:
      normalizeHealthStatus(
        row.health_status,
      ),

    schemaVersion:
      typeof row.schema_version ===
        'string'
        ? row.schema_version
        : null,

    lastHealthCheckAt:
      row.last_health_check_at ??
      null,

    lastVerifiedAt:
      row.last_verified_at ??
      null,

    failureCode:
      typeof row.failure_code ===
        'string'
        ? row.failure_code
        : null,

    failureMessage:
      typeof row.failure_message ===
        'string'
        ? row.failure_message
        : null,

    provisionedAt:
      row.provisioned_at ??
      null,

    lastMigratedAt:
      row.last_migrated_at ??
      null,
  };
}


/* ================================================================
   SET MAINTENANCE MODE
   ================================================================

   Backend capability only.

   We will not expose this to normal workspace users.

   Platform Administration may use this later.
   ================================================================ */

export async function setTenantDatabaseMaintenance(
  tenantId:
    string,

  enabled:
    boolean,
): Promise<void> {
  if (
    typeof tenantId !==
      'string' ||
    !tenantId.trim()
  ) {
    throw new TenantHealthError(
      'INVALID_TENANT_ID',
      'A valid tenant ID is required.',
    );
  }


  const normalizedTenantId =
    tenantId.trim();


  const result =
    await queryControl(
      `
        UPDATE tenant_databases

        SET
          health_status =
            CASE
              WHEN $2 = TRUE
              THEN 'maintenance'

              ELSE 'unknown'
            END,

          failure_code =
            NULL,

          failure_message =
            NULL,

          updated_at =
            NOW()

        WHERE tenant_id = $1

        RETURNING id
      `,
      [
        normalizedTenantId,
        enabled,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    throw new TenantHealthError(
      'TENANT_DATABASE_NOT_REGISTERED',
      'No tenant database is registered for this workspace.',
    );
  }
}