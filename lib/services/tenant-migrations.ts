import 'server-only';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type {
  PoolClient,
} from 'pg';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  CURRENT_TENANT_CORE_VERSION,
  TENANT_CORE_MIGRATIONS,
  type TenantCoreMigration,
} from '@/lib/schema/tenant-migrations/manifest';


/* ================================================================
   TYPES
   ================================================================ */

export interface TenantMigrationResult {
  tenantId: string;

  previousVersion: string;
  currentVersion: string;

  targetVersion: string;

  appliedMigrations: string[];

  changed: boolean;
}


type RegistryRecord = {
  databaseId: string;
  databaseName: string;
  schemaVersion: string | null;
};


/* ================================================================
   ERROR
   ================================================================ */

export class TenantMigrationError
  extends Error {
  readonly code:
    | 'TENANT_DATABASE_NOT_FOUND'
    | 'TENANT_SCHEMA_VERSION_NOT_FOUND'
    | 'TENANT_SCHEMA_VERSION_INVALID'
    | 'TENANT_MIGRATION_PATH_MISSING'
    | 'TENANT_MIGRATION_FILE_MISSING'
    | 'TENANT_MIGRATION_CHECKSUM_MISMATCH'
    | 'TENANT_MIGRATION_FAILED';

  constructor(
    code:
      TenantMigrationError['code'],

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'TenantMigrationError';

    this.code =
      code;
  }
}


/* ================================================================
   REGISTRY
   ================================================================ */

async function getRegistryRecord(
  tenantId:
    string,
): Promise<RegistryRecord> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          database_name,
          schema_version

        FROM tenant_databases

        WHERE tenant_id = $1
          AND status = 'active'

        LIMIT 1
      `,
      [
        tenantId,
      ],
    );

  if (
    result.rows.length === 0
  ) {
    throw new TenantMigrationError(
      'TENANT_DATABASE_NOT_FOUND',
      'No active tenant database is registered.',
    );
  }

  const row =
    result.rows[0];

  return {
    databaseId:
      String(
        row.id,
      ),

    databaseName:
      String(
        row.database_name,
      ),

    schemaVersion:
      typeof row.schema_version ===
        'string'
        ? row.schema_version
        : null,
  };
}


/* ================================================================
   VERSION
   ================================================================ */

function parseVersion(
  version:
    string,
): [
  number,
  number,
  number,
] {
  const match =
    /^(\d+)\.(\d+)\.(\d+)$/.exec(
      version.trim(),
    );

  if (
    !match
  ) {
    throw new TenantMigrationError(
      'TENANT_SCHEMA_VERSION_INVALID',
      `Invalid tenant schema version: ${version}`,
    );
  }

  return [
    Number(
      match[1],
    ),

    Number(
      match[2],
    ),

    Number(
      match[3],
    ),
  ];
}


function compareVersions(
  left:
    string,

  right:
    string,
): number {
  const a =
    parseVersion(
      left,
    );

  const b =
    parseVersion(
      right,
    );

  for (
    let index = 0;
    index < 3;
    index++
  ) {
    if (
      a[index] >
      b[index]
    ) {
      return 1;
    }

    if (
      a[index] <
      b[index]
    ) {
      return -1;
    }
  }

  return 0;
}


/* ================================================================
   TENANT-SIDE VERSION
   ================================================================ */

async function getTenantSideVersion(
  client:
    PoolClient,
): Promise<string> {
  const result =
    await client.query(
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

  if (
    result.rows.length === 0 ||
    typeof result.rows[0].version !==
      'string'
  ) {
    throw new TenantMigrationError(
      'TENANT_SCHEMA_VERSION_NOT_FOUND',
      'Tenant core schema version could not be determined.',
    );
  }

  return result.rows[0]
    .version
    .trim();
}


/* ================================================================
   SQL FILE
   ================================================================ */

function getMigrationFilePath(
  migration:
    TenantCoreMigration,
): string {
  return path.join(
    process.cwd(),
    'lib',
    'schema',
    'tenant-migrations',
    'migrations',
    migration.fileName,
  );
}


function loadMigrationSql(
  migration:
    TenantCoreMigration,
): {
  sql: string;
  checksum: string;
} {
  const filePath =
    getMigrationFilePath(
      migration,
    );

  if (
    !fs.existsSync(
      filePath,
    )
  ) {
    throw new TenantMigrationError(
      'TENANT_MIGRATION_FILE_MISSING',
      `Migration file not found: ${migration.fileName}`,
    );
  }

  const sql =
    fs.readFileSync(
      filePath,
      'utf8',
    );

  if (
    !sql.trim()
  ) {
    throw new TenantMigrationError(
      'TENANT_MIGRATION_FILE_MISSING',
      `Migration file is empty: ${migration.fileName}`,
    );
  }

  const checksum =
    crypto
      .createHash(
        'sha256',
      )
      .update(
        sql,
        'utf8',
      )
      .digest(
        'hex',
      );

  return {
    sql,
    checksum,
  };
}


/* ================================================================
   MIGRATION HISTORY
   ================================================================ */

async function markMigrationRunning(
  input: {
    tenantId: string;
    databaseId: string;
    migration: TenantCoreMigration;
    checksum: string;
  },
): Promise<void> {
  await queryControl(
    `
      INSERT INTO tenant_database_migrations (
        tenant_id,
        database_id,
        migration_key,
        scope,
        from_version,
        to_version,
        checksum,
        status,
        started_at,
        created_at,
        updated_at
      )

      VALUES (
        $1,
        $2,
        $3,
        'core',
        $4,
        $5,
        $6,
        'running',
        NOW(),
        NOW(),
        NOW()
      )

      ON CONFLICT (
        tenant_id,
        migration_key
      )

      DO UPDATE SET
        database_id =
          EXCLUDED.database_id,

        checksum =
          EXCLUDED.checksum,

        status =
          'running',

        started_at =
          NOW(),

        completed_at =
          NULL,

        failed_at =
          NULL,

        error_code =
          NULL,

        error_message =
          NULL,

        updated_at =
          NOW()
    `,
    [
      input.tenantId,
      input.databaseId,
      input.migration.key,
      input.migration.fromVersion,
      input.migration.toVersion,
      input.checksum,
    ],
  );
}


async function markMigrationCompleted(
  tenantId:
    string,

  migrationKey:
    string,
): Promise<void> {
  await queryControl(
    `
      UPDATE tenant_database_migrations

      SET
        status =
          'completed',

        completed_at =
          NOW(),

        failed_at =
          NULL,

        error_code =
          NULL,

        error_message =
          NULL,

        updated_at =
          NOW()

      WHERE tenant_id = $1
        AND migration_key = $2
    `,
    [
      tenantId,
      migrationKey,
    ],
  );
}


async function markMigrationFailed(
  tenantId:
    string,

  migrationKey:
    string,

  error:
    unknown,
): Promise<void> {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown tenant migration error';

  await queryControl(
    `
      UPDATE tenant_database_migrations

      SET
        status =
          'failed',

        failed_at =
          NOW(),

        error_code =
          'TENANT_MIGRATION_FAILED',

        error_message =
          $3,

        updated_at =
          NOW()

      WHERE tenant_id = $1
        AND migration_key = $2
    `,
    [
      tenantId,
      migrationKey,
      message.slice(
        0,
        5000,
      ),
    ],
  );
}


async function repairCompletedMigrationHistory(
  input: {
    tenantId: string;
    databaseId: string;
    client: PoolClient;
    currentVersion: string;
  },
): Promise<void> {
  const installed =
    await input.client.query(
      `
        SELECT
          version,
          installed_at
        FROM core_schema_version
        ORDER BY installed_at, version
      `,
    );

  const installedByVersion =
    new Map<
      string,
      Date | string
    >();

  for (
    const row
    of installed.rows
  ) {
    if (
      typeof row.version ===
        'string' &&
      row.installed_at
    ) {
      installedByVersion.set(
        row.version.trim(),
        row.installed_at,
      );
    }
  }

  for (
    const migration
    of TENANT_CORE_MIGRATIONS
  ) {
    if (
      compareVersions(
        migration.toVersion,
        input.currentVersion,
      ) >
      0
    ) {
      continue;
    }

    const installedAt =
      installedByVersion.get(
        migration.toVersion,
      );

    if (
      !installedAt
    ) {
      continue;
    }

    const {
      checksum,
    } =
      loadMigrationSql(
        migration,
      );

    await queryControl(
      `
        INSERT INTO tenant_database_migrations (
          tenant_id,
          database_id,
          migration_key,
          scope,
          from_version,
          to_version,
          checksum,
          status,
          started_at,
          completed_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'core',
          $4,
          $5,
          $6,
          'completed',
          $7,
          $7,
          $7,
          NOW()
        )
        ON CONFLICT (
          tenant_id,
          migration_key
        )
        DO UPDATE SET
          database_id =
            EXCLUDED.database_id,
          checksum =
            COALESCE(
              tenant_database_migrations.checksum,
              EXCLUDED.checksum
            ),
          status =
            'completed',
          started_at =
            COALESCE(
              tenant_database_migrations.started_at,
              EXCLUDED.started_at
            ),
          completed_at =
            COALESCE(
              tenant_database_migrations.completed_at,
              EXCLUDED.completed_at
            ),
          failed_at =
            NULL,
          error_code =
            NULL,
          error_message =
            NULL,
          updated_at =
            NOW()
      `,
      [
        input.tenantId,
        input.databaseId,
        migration.key,
        migration.fromVersion,
        migration.toVersion,
        checksum,
        installedAt,
      ],
    );
  }
}


/* ================================================================
   APPLY ONE MIGRATION
   ================================================================ */

async function applyMigration(
  input: {
    tenantId: string;
    databaseId: string;
    client: PoolClient;
    migration: TenantCoreMigration;
  },
): Promise<void> {
  const {
    sql,
    checksum,
  } =
    loadMigrationSql(
      input.migration,
    );

  await markMigrationRunning({
    tenantId:
      input.tenantId,

    databaseId:
      input.databaseId,

    migration:
      input.migration,

    checksum,
  });

  try {
    await input.client.query(
      'BEGIN',
    );

    const actualVersion =
      await getTenantSideVersion(
        input.client,
      );

    if (
      actualVersion !==
      input.migration.fromVersion
    ) {
      throw new TenantMigrationError(
        'TENANT_SCHEMA_VERSION_INVALID',

        `Migration ${input.migration.key} expected version ${input.migration.fromVersion}, but tenant is ${actualVersion}.`,
      );
    }

    await input.client.query(
      sql,
    );

    await input.client.query(
      `
        INSERT INTO core_schema_version (
          version,
          installed_at
        )

        VALUES (
          $1,
          NOW()
        )

        ON CONFLICT (version)
        DO NOTHING
      `,
      [
        input.migration
          .toVersion,
      ],
    );

    await input.client.query(
      'COMMIT',
    );

    await queryControl(
      `
        UPDATE tenant_databases

        SET
          schema_version =
            $2,

          last_migrated_at =
            NOW(),

          updated_at =
            NOW()

        WHERE tenant_id =
              $1
      `,
      [
        input.tenantId,
        input.migration
          .toVersion,
      ],
    );

    await markMigrationCompleted(
      input.tenantId,
      input.migration.key,
    );
  } catch (
    error
  ) {
    try {
      await input.client.query(
        'ROLLBACK',
      );
    } catch (
      rollbackError
    ) {
      console.error(
        '[SaMi] Tenant migration rollback failed:',
        rollbackError,
      );
    }

    await markMigrationFailed(
      input.tenantId,
      input.migration.key,
      error,
    );

    throw error;
  }
}


/* ================================================================
   PUBLIC RUNNER
   ================================================================ */

export async function runTenantCoreMigrations(
  tenantId:
    string,

  targetVersion =
    CURRENT_TENANT_CORE_VERSION,
): Promise<TenantMigrationResult> {
  const registry =
    await getRegistryRecord(
      tenantId,
    );

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const client =
    await pool.connect();

  try {
    /**
     * One migration operation per tenant DB at a time.
     */
    await client.query(
      `
        SELECT pg_advisory_lock(
          hashtext($1)
        )
      `,
      [
        `sami:tenant-migration:${tenantId}`,
      ],
    );

    const initialVersion =
      await getTenantSideVersion(
        client,
      );

    if (
      compareVersions(
        initialVersion,
        targetVersion,
      ) > 0
    ) {
      throw new TenantMigrationError(
        'TENANT_SCHEMA_VERSION_INVALID',

        `Tenant schema ${initialVersion} is newer than platform target ${targetVersion}.`,
      );
    }

    let currentVersion =
      initialVersion;

    const appliedMigrations:
      string[] = [];

    while (
      currentVersion !==
      targetVersion
    ) {
      const migration =
        TENANT_CORE_MIGRATIONS.find(
          item =>
            item.fromVersion ===
            currentVersion,
        );

      if (
        !migration
      ) {
        throw new TenantMigrationError(
          'TENANT_MIGRATION_PATH_MISSING',

          `No migration path exists from ${currentVersion} to ${targetVersion}.`,
        );
      }

      if (
        compareVersions(
          migration.toVersion,
          targetVersion,
        ) > 0
      ) {
        throw new TenantMigrationError(
          'TENANT_MIGRATION_PATH_MISSING',

          `Migration ${migration.key} would move beyond target version ${targetVersion}.`,
        );
      }

      await applyMigration({
        tenantId,

        databaseId:
          registry.databaseId,

        client,

        migration,
      });

      currentVersion =
        migration.toVersion;

      appliedMigrations.push(
        migration.key,
      );
    }

    /**
     * Repair Control DB version if the physical tenant DB is already
     * correct but registry metadata became stale.
     */
    if (
      registry.schemaVersion !==
      currentVersion
    ) {
      await queryControl(
        `
          UPDATE tenant_databases

          SET
            schema_version =
              $2,

            updated_at =
              NOW()

          WHERE tenant_id =
                $1
        `,
        [
          tenantId,
          currentVersion,
        ],
      );
    }

    await repairCompletedMigrationHistory({
      tenantId,
      databaseId:
        registry.databaseId,
      client,
      currentVersion,
    });

    return {
      tenantId,

      previousVersion:
        initialVersion,

      currentVersion,

      targetVersion,

      appliedMigrations,

      changed:
        appliedMigrations.length >
        0,
    };
  } finally {
    try {
      await client.query(
        `
          SELECT pg_advisory_unlock(
            hashtext($1)
          )
        `,
        [
          `sami:tenant-migration:${tenantId}`,
        ],
      );
    } catch (
      error
    ) {
      console.error(
        '[SaMi] Failed to release tenant migration lock:',
        error,
      );
    }

    client.release();
  }
}