import 'server-only';

import '@/lib/services/postgres-logical-backup-provider';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantBackupProvider,
  type TenantRecoveryType,
} from '@/lib/services/tenant-backup-provider';


/* ================================================================
   SaMi TENANT DATABASE RECOVERY
   ================================================================

   Responsibilities:

   - inspect tenant database retention state
   - record real recovery point requests
   - call a configured provider adapter
   - record provider recovery references
   - verify recovery point availability
   - expire recovery metadata
   - distinguish logical deletion from physical purge

   IMPORTANT:

   This service does NOT expose browser endpoints.

   This service does NOT physically DROP databases.

   This service does NOT pretend that the retained production
   database itself is a backup.
   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type TenantRecoveryPointStatus =
  | 'requested'
  | 'creating'
  | 'available'
  | 'failed'
  | 'expired'
  | 'deleted';


export interface TenantRecoveryPoint {
  id:
    string;

  tenantId:
    string;

  databaseId:
    string | null;

  recoveryType:
    TenantRecoveryType;

  provider:
    string;

  providerReference:
    string | null;

  sourceDatabaseName:
    string;

  sourceSchemaVersion:
    string | null;

  reason:
    string | null;

  status:
    TenantRecoveryPointStatus;

  requestedAt:
    Date | string;

  availableAt:
    Date | string | null;

  expiresAt:
    Date | string | null;

  lastVerifiedAt:
    Date | string | null;

  failureCode:
    string | null;

  failureMessage:
    string | null;

  metadata:
    Record<string, unknown>;

  createdAt:
    Date | string;

  updatedAt:
    Date | string;
}


export interface TenantRecoveryState {
  tenantId:
    string;

  databaseId:
    string;

  databaseName:
    string;

  databaseStatus:
    string;

  schemaVersion:
    string | null;

  deletionRequestedAt:
    Date | string | null;

  deletedAt:
    Date | string | null;

  retentionUntil:
    Date | string | null;

  purgedAt:
    Date | string | null;

  physicalDatabaseExpectedRetained:
    boolean;

  recoverableFromRetainedDatabase:
    boolean;

  availableRecoveryPoints:
    number;
}


/* ================================================================
   ERROR
   ================================================================ */

export class TenantRecoveryError
  extends Error {
  readonly code:
    | 'INVALID_TENANT_ID'
    | 'TENANT_DATABASE_NOT_FOUND'
    | 'DATABASE_ALREADY_PURGED'
    | 'INVALID_RECOVERY_TYPE'
    | 'RECOVERY_POINT_NOT_FOUND'
    | 'RECOVERY_POINT_NOT_AVAILABLE'
    | 'RECOVERY_POINT_CREATION_FAILED';


  constructor(
    code:
      | 'INVALID_TENANT_ID'
      | 'TENANT_DATABASE_NOT_FOUND'
      | 'DATABASE_ALREADY_PURGED'
      | 'INVALID_RECOVERY_TYPE'
      | 'RECOVERY_POINT_NOT_FOUND'
      | 'RECOVERY_POINT_NOT_AVAILABLE'
      | 'RECOVERY_POINT_CREATION_FAILED',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'TenantRecoveryError';

    this.code =
      code;
  }
}


/* ================================================================
   VALIDATION
   ================================================================ */

function requireTenantId(
  tenantId:
    string,
): string {
  if (
    typeof tenantId !==
      'string' ||
    !tenantId.trim()
  ) {
    throw new TenantRecoveryError(
      'INVALID_TENANT_ID',
      'A valid tenant ID is required.',
    );
  }


  return tenantId.trim();
}


function requireRecoveryType(
  value:
    TenantRecoveryType,
): TenantRecoveryType {
  if (
    value ===
      'provider_snapshot' ||
    value ===
      'point_in_time' ||
    value ===
      'logical_export'
  ) {
    return value;
  }


  throw new TenantRecoveryError(
    'INVALID_RECOVERY_TYPE',
    'The requested recovery type is not supported.',
  );
}


/* ================================================================
   SAFE FAILURE MESSAGE
   ================================================================ */

function safeProviderFailureMessage():
  string {
  return (
    'The database recovery provider could not create the requested recovery point.'
  );
}


/* ================================================================
   DATABASE REGISTRY
   ================================================================ */

async function getRecoverySource(
  tenantId:
    string,
) {
  const result =
    await queryControl(
      `
        SELECT
          id,
          tenant_id,

          provider,

          database_identifier,
          database_name,
          database_host,
          database_port,

          schema_version,
          status,

          deletion_requested_at,
          deleted_at,

          retention_until,
          purged_at

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
    throw new TenantRecoveryError(
      'TENANT_DATABASE_NOT_FOUND',
      'No database is registered for this workspace.',
    );
  }


  const row =
    result.rows[0];


  if (
    row.purged_at
  ) {
    throw new TenantRecoveryError(
      'DATABASE_ALREADY_PURGED',
      'The physical tenant database has already been purged.',
    );
  }


  return {
    databaseId:
      String(
        row.id,
      ),

    tenantId:
      String(
        row.tenant_id,
      ),

    provider:
      typeof row.provider ===
        'string'
        ? row.provider
        : 'unknown',

    databaseIdentifier:
      typeof row.database_identifier ===
        'string'
        ? row.database_identifier
        : null,

    databaseName:
      String(
        row.database_name,
      ),

    databaseHost:
      typeof row.database_host ===
        'string'
        ? row.database_host
        : null,

    databasePort:
      Number(
        row.database_port ||
        5432,
      ),

    schemaVersion:
      typeof row.schema_version ===
        'string'
        ? row.schema_version
        : null,

    status:
      typeof row.status ===
        'string'
        ? row.status
        : 'unknown',

    deletionRequestedAt:
      row.deletion_requested_at ??
      null,

    deletedAt:
      row.deleted_at ??
      null,

    retentionUntil:
      row.retention_until ??
      null,

    purgedAt:
      row.purged_at ??
      null,
  };
}


/* ================================================================
   MAP RECOVERY POINT
   ================================================================ */

function mapRecoveryPoint(
  row:
    Record<string, unknown>,
): TenantRecoveryPoint {
  const metadata =
    row.metadata &&
    typeof row.metadata ===
      'object' &&
    !Array.isArray(
      row.metadata,
    )
      ? (
          row.metadata as
            Record<string, unknown>
        )
      : {};


  return {
    id:
      String(
        row.id,
      ),

    tenantId:
      String(
        row.tenant_id,
      ),

    databaseId:
      row.database_id
        ? String(
            row.database_id,
          )
        : null,

    recoveryType:
      row.recovery_type as
        TenantRecoveryType,

    provider:
      String(
        row.provider,
      ),

    providerReference:
      typeof row.provider_reference ===
        'string'
        ? row.provider_reference
        : null,

    sourceDatabaseName:
      String(
        row.source_database_name,
      ),

    sourceSchemaVersion:
      typeof row.source_schema_version ===
        'string'
        ? row.source_schema_version
        : null,

    reason:
      typeof row.reason ===
        'string'
        ? row.reason
        : null,

    status:
      row.status as
        TenantRecoveryPointStatus,

    requestedAt:
      row.requested_at as
        Date | string,

    availableAt:
      (
        row.available_at as
          Date | string | null
      ) ??
      null,

    expiresAt:
      (
        row.expires_at as
          Date | string | null
      ) ??
      null,

    lastVerifiedAt:
      (
        row.last_verified_at as
          Date | string | null
      ) ??
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

    metadata,

    createdAt:
      row.created_at as
        Date | string,

    updatedAt:
      row.updated_at as
        Date | string,
  };
}


/* ================================================================
   CREATE RECOVERY POINT
   ================================================================ */

export async function createTenantRecoveryPoint(
  input: {
    tenantId:
      string;

    recoveryType:
      TenantRecoveryType;

    reason?:
      string | null;
  },
): Promise<TenantRecoveryPoint> {
  const tenantId =
    requireTenantId(
      input.tenantId,
    );


  const recoveryType =
    requireRecoveryType(
      input.recoveryType,
    );


  const source =
    await getRecoverySource(
      tenantId,
    );


  const provider =
    getTenantBackupProvider(
      source.provider,
    );


  const pending =
    await queryControl(
      `
        INSERT INTO tenant_database_recovery_points (
          tenant_id,
          database_id,

          recovery_type,
          provider,

          source_database_name,
          source_schema_version,

          reason,

          status,

          requested_at,
          created_at,
          updated_at
        )

        VALUES (
          $1,
          $2,

          $3,
          $4,

          $5,
          $6,

          $7,

          'creating',

          NOW(),
          NOW(),
          NOW()
        )

        RETURNING *
      `,
      [
        tenantId,
        source.databaseId,

        recoveryType,
        source.provider,

        source.databaseName,
        source.schemaVersion,

        input.reason ??
        null,
      ],
    );


  const recoveryPointId =
    String(
      pending.rows[0]
        .id,
    );


  try {
    const providerResult =
      await provider
        .createRecoveryPoint({
          source: {
            tenantId:

              source.tenantId,

            databaseId:
              source.databaseId,

            databaseName:
              source.databaseName,

            databaseIdentifier:
              source.databaseIdentifier,

            databaseHost:
              source.databaseHost,

            databasePort:
              source.databasePort,

            schemaVersion:
              source.schemaVersion,

            provider:
              source.provider,
          },

          recoveryType,

          reason:
            input.reason ??
            null,
        });


    if (
      !providerResult
        .providerReference
    ) {
      throw new Error(
        'Backup provider did not return a recovery reference.',
      );
    }


    const status =
      providerResult.available
        ? 'available'
        : 'creating';


    const updated =
      await queryControl(
        `
          UPDATE tenant_database_recovery_points

          SET
            provider =
              $2,

            provider_reference =
              $3,

            status =
              $4,

            available_at =
              CASE
                WHEN $4 = 'available'
                THEN NOW()

                ELSE NULL
              END,

            expires_at =
              $5,

            metadata =
              $6::jsonb,

            failure_code =
              NULL,

            failure_message =
              NULL,

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
        `,
        [
          recoveryPointId,

          providerResult.provider,

          providerResult
            .providerReference,

          status,

          providerResult
            .expiresAt,

          JSON.stringify(
            providerResult
              .metadata ||
            {},
          ),
        ],
      );


    return mapRecoveryPoint(
      updated.rows[0],
    );
  } catch (
    error
  ) {
    console.error(
      `[SaMi] Recovery point creation failed for tenant ${tenantId}:`,
      error,
    );


    await queryControl(
      `
        UPDATE tenant_database_recovery_points

        SET
          status =
            'failed',

          failure_code =
            'RECOVERY_POINT_CREATION_FAILED',

          failure_message =
            $2,

          updated_at =
            NOW()

        WHERE id = $1
      `,
      [
        recoveryPointId,
        safeProviderFailureMessage(),
      ],
    );


    throw new TenantRecoveryError(
      'RECOVERY_POINT_CREATION_FAILED',
      safeProviderFailureMessage(),
    );
  }
}


/* ================================================================
   VERIFY RECOVERY POINT
   ================================================================ */

export async function verifyTenantRecoveryPoint(
  recoveryPointId:
    string,
): Promise<TenantRecoveryPoint> {
  const result =
    await queryControl(
      `
        SELECT *

        FROM tenant_database_recovery_points

        WHERE id = $1

        LIMIT 1
      `,
      [
        recoveryPointId,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    throw new TenantRecoveryError(
      'RECOVERY_POINT_NOT_FOUND',
      'The requested recovery point could not be found.',
    );
  }


  const recoveryPoint =
    mapRecoveryPoint(
      result.rows[0],
    );


  if (
    !recoveryPoint
      .providerReference
  ) {
    throw new TenantRecoveryError(
      'RECOVERY_POINT_NOT_AVAILABLE',
      'The recovery point does not yet have a provider reference.',
    );
  }


  const provider =
    getTenantBackupProvider(
      recoveryPoint.provider,
    );


  const verification =
    await provider
      .verifyRecoveryPoint(
        recoveryPoint
          .providerReference,
      );


  const status:
    TenantRecoveryPointStatus =
    verification.available
      ? 'available'
      : 'expired';


  const updated =
    await queryControl(
      `
        UPDATE tenant_database_recovery_points

        SET
          status =
            $2,

          available_at =
            CASE
              WHEN $2 =
                   'available'

              THEN COALESCE(
                available_at,
                NOW()
              )

              ELSE available_at
            END,

          expires_at =
            $3,

          last_verified_at =
            NOW(),

          updated_at =
            NOW()

        WHERE id = $1

        RETURNING *
      `,
      [
        recoveryPointId,
        status,
        verification.expiresAt,
      ],
    );


  return mapRecoveryPoint(
    updated.rows[0],
  );
}


/* ================================================================
   LIST RECOVERY POINTS
   ================================================================ */

export async function listTenantRecoveryPoints(
  tenantId:
    string,
): Promise<TenantRecoveryPoint[]> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  const result =
    await queryControl(
      `
        SELECT *

        FROM tenant_database_recovery_points

        WHERE tenant_id = $1

        ORDER BY
          created_at DESC
      `,
      [
        normalizedTenantId,
      ],
    );


  return result.rows.map(
    mapRecoveryPoint,
  );
}


/* ================================================================
   RECOVERY STATE
   ================================================================ */

export async function getTenantRecoveryState(
  tenantId:
    string,
): Promise<TenantRecoveryState> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  const result =
    await queryControl(
      `
        SELECT
          td.id,
          td.tenant_id,

          td.database_name,
          td.status,

          td.schema_version,

          td.deletion_requested_at,
          td.deleted_at,

          td.retention_until,
          td.purged_at,

          (
            SELECT COUNT(*)

            FROM
              tenant_database_recovery_points
                rp

            WHERE
              rp.tenant_id =
                td.tenant_id

              AND rp.status =
                  'available'

              AND (
                rp.expires_at
                  IS NULL

                OR

                rp.expires_at >
                  NOW()
              )
          )
            AS available_recovery_points

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
    throw new TenantRecoveryError(
      'TENANT_DATABASE_NOT_FOUND',
      'No database is registered for this workspace.',
    );
  }


  const row =
    result.rows[0];


  const purged =
    Boolean(
      row.purged_at,
    );


  const databaseStatus =
    typeof row.status ===
      'string'
      ? row.status
      : 'unknown';


  const retained =
    !purged;


  /**
   * This is intentionally called:
   *
   * recoverableFromRetainedDatabase
   *
   * NOT:
   *
   * backupAvailable
   *
   * because the original physical DB being retained is not the
   * same thing as having an independent backup.
   */
  const recoverableFromRetainedDatabase =
    retained &&
    (
      databaseStatus ===
        'deleted' ||
      databaseStatus ===
        'pending_deletion' ||
      databaseStatus ===
        'archived'
    );


  return {
    tenantId:
      String(
        row.tenant_id,
      ),

    databaseId:
      String(
        row.id,
      ),

    databaseName:
      String(
        row.database_name,
      ),

    databaseStatus,

    schemaVersion:
      typeof row.schema_version ===
        'string'
        ? row.schema_version
        : null,

    deletionRequestedAt:
      row.deletion_requested_at ??
      null,

    deletedAt:
      row.deleted_at ??
      null,

    retentionUntil:
      row.retention_until ??
      null,

    purgedAt:
      row.purged_at ??
      null,

    physicalDatabaseExpectedRetained:
      retained,

    recoverableFromRetainedDatabase,

    availableRecoveryPoints:
      Number(
        row.available_recovery_points ||
        0,
      ),
  };
}


/* ================================================================
   EXPIRE OLD RECOVERY POINT METADATA
   ================================================================ */

export async function expireTenantRecoveryPoints():
  Promise<number> {
  const result =
    await queryControl(
      `
        UPDATE
          tenant_database_recovery_points

        SET
          status =
            'expired',

          updated_at =
            NOW()

        WHERE status =
              'available'

          AND expires_at
              IS NOT NULL

          AND expires_at <=
              NOW()

        RETURNING id
      `,
    );


  return result.rows.length;
}

/* ================================================================
   RESTORE RECOVERY POINT

   Safety rule:
   - restores only into a FRESH database name
   - never overwrites the currently registered production database
   - registry cutover is a separate explicit administrative action
   ================================================================ */

export async function restoreTenantRecoveryPoint(
  input: {
    recoveryPointId: string;
    targetDatabaseName: string;
  },
) {
  const recoveryPointId =
    typeof input.recoveryPointId === 'string'
      ? input.recoveryPointId.trim()
      : '';

  const targetDatabaseName =
    typeof input.targetDatabaseName === 'string'
      ? input.targetDatabaseName.trim()
      : '';

  if (!recoveryPointId || !targetDatabaseName) {
    throw new TenantRecoveryError(
      'RECOVERY_POINT_NOT_AVAILABLE',
      'A recovery point and fresh restore target are required.',
    );
  }

  const result = await queryControl(
    `
      SELECT *
      FROM tenant_database_recovery_points
      WHERE id = $1
      LIMIT 1
    `,
    [recoveryPointId],
  );

  if (result.rows.length === 0) {
    throw new TenantRecoveryError(
      'RECOVERY_POINT_NOT_FOUND',
      'The requested recovery point could not be found.',
    );
  }

  const recoveryPoint = mapRecoveryPoint(result.rows[0]);

  if (
    recoveryPoint.status !== 'available' ||
    !recoveryPoint.providerReference
  ) {
    throw new TenantRecoveryError(
      'RECOVERY_POINT_NOT_AVAILABLE',
      'The requested recovery point is not available for restore.',
    );
  }

  const provider = getTenantBackupProvider(recoveryPoint.provider);

  return provider.restoreRecoveryPoint({
    providerReference: recoveryPoint.providerReference,
    tenantId: recoveryPoint.tenantId,
    sourceDatabaseName: recoveryPoint.sourceDatabaseName,
    targetDatabaseName,
  });
}


/* ================================================================
   DELETE RECOVERY POINT
   ================================================================ */

export async function deleteTenantRecoveryPoint(
  recoveryPointId: string,
): Promise<void> {
  const normalizedId =
    typeof recoveryPointId === 'string'
      ? recoveryPointId.trim()
      : '';

  if (!normalizedId) {
    throw new TenantRecoveryError(
      'RECOVERY_POINT_NOT_FOUND',
      'The requested recovery point could not be found.',
    );
  }

  const result = await queryControl(
    `
      SELECT *
      FROM tenant_database_recovery_points
      WHERE id = $1
      LIMIT 1
    `,
    [normalizedId],
  );

  if (result.rows.length === 0) {
    throw new TenantRecoveryError(
      'RECOVERY_POINT_NOT_FOUND',
      'The requested recovery point could not be found.',
    );
  }

  const recoveryPoint = mapRecoveryPoint(result.rows[0]);

  if (recoveryPoint.providerReference) {
    const provider = getTenantBackupProvider(recoveryPoint.provider);
    await provider.deleteRecoveryPoint(recoveryPoint.providerReference);
  }

  await queryControl(
    `
      UPDATE tenant_database_recovery_points
      SET
        status = 'deleted',
        updated_at = NOW()
      WHERE id = $1
    `,
    [normalizedId],
  );
}
