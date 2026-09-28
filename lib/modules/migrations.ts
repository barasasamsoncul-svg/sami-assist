import 'server-only';

import type {
  Pool,
  PoolClient,
} from 'pg';

import {
  getSamiModuleManifest,
} from '@/lib/modules/registry';

import {
  APP_RUNTIME_MODULE_MIGRATIONS,
} from '@/lib/apps/runtime-migrations';

import type {
  SamiModuleMigrationDefinition,
  SamiModuleMigrationResult,
} from '@/lib/modules/migration-types';

import {
  SamiModuleMigrationError,
} from '@/lib/modules/migration-errors';

import {
  assertSafeSamiModuleMigrationSql,
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

export type {
  SamiModuleMigrationContext,
  SamiModuleMigrationDefinition,
  SamiModuleMigrationResult,
} from '@/lib/modules/migration-types';

export {
  SamiModuleMigrationError,
} from '@/lib/modules/migration-errors';

export {
  assertSafeSamiModuleMigrationSql,
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

/*
 * Code-owned business-module migrations are registered by app runtime
 * contributions. The kernel validates and executes them but never imports
 * individual business apps.
 */
export const APP_MODULE_MIGRATIONS:
  readonly SamiModuleMigrationDefinition[] =
  APP_RUNTIME_MODULE_MIGRATIONS;


const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function normalizeKey(
  value:
    string | null | undefined,
) {
  return (
    value ||
    ''
  )
    .trim()
    .toLowerCase();
}

function normalizeVersion(
  value:
    string,
) {
  const version =
    value
      .trim();

  if (
    !VERSION_PATTERN.test(
      version,
    )
  ) {
    throw new SamiModuleMigrationError(
      'MODULE_VERSION_INVALID',
      `Invalid SaMi module version "${value}". Use semantic x.y.z versions.`,
    );
  }

  return version;
}

function versionParts(
  value:
    string,
) {
  return normalizeVersion(
    value,
  )
    .split(
      '.',
    )
    .map(
      part =>
        Number(
          part,
        ),
    );
}

export function compareSamiModuleVersions(
  left:
    string,
  right:
    string,
) {
  const a =
    versionParts(
      left,
    );

  const b =
    versionParts(
      right,
    );

  for (
    let index =
      0;
    index <
      3;
    index +=
      1
  ) {
    if (
      a[index] !==
      b[index]
    ) {
      return (
        a[index] -
        b[index]
      );
    }
  }

  return 0;
}

function validateRegistryForModule(
  moduleKey:
    string,
) {
  const key =
    normalizeKey(
      moduleKey,
    );

  const manifest =
    getSamiModuleManifest(
      key,
    );

  if (
    !manifest
  ) {
    throw new SamiModuleMigrationError(
      'MODULE_MIGRATION_REGISTRY_INVALID',
      `SaMi module "${key}" is not registered.`,
    );
  }

  const namespace =
    normalizeKey(
      manifest
        .migrationNamespace,
    );

  if (
    !namespace
  ) {
    throw new SamiModuleMigrationError(
      'MODULE_MIGRATION_REGISTRY_INVALID',
      `SaMi module "${key}" does not declare a migration namespace.`,
    );
  }

  const migrations =
    APP_MODULE_MIGRATIONS
      .filter(
        migration =>
          normalizeKey(
            migration.moduleKey,
          ) ===
          key,
      );

  const keys =
    new Set<string>();

  const fromVersions =
    new Set<string>();

  for (
    const migration
    of migrations
  ) {
    const migrationKey =
      normalizeKey(
        migration.key,
      );

    const migrationNamespace =
      normalizeKey(
        migration.namespace,
      );

    if (
      !migrationKey ||
      keys.has(
        migrationKey,
      )
    ) {
      throw new SamiModuleMigrationError(
        'MODULE_MIGRATION_REGISTRY_INVALID',
        `SaMi module "${key}" has an empty or duplicate migration key.`,
      );
    }

    keys.add(
      migrationKey,
    );

    if (
      migrationNamespace !==
      namespace
    ) {
      throw new SamiModuleMigrationError(
        'MODULE_MIGRATION_REGISTRY_INVALID',
        `Migration "${migration.key}" does not match namespace "${manifest.migrationNamespace}".`,
      );
    }

    const fromVersion =
      normalizeVersion(
        migration.fromVersion,
      );

    const toVersion =
      normalizeVersion(
        migration.toVersion,
      );

    if (
      compareSamiModuleVersions(
        toVersion,
        fromVersion,
      ) <=
      0
    ) {
      throw new SamiModuleMigrationError(
        'MODULE_MIGRATION_REGISTRY_INVALID',
        `Migration "${migration.key}" must move forward from ${fromVersion} to ${toVersion}.`,
      );
    }

    if (
      fromVersions.has(
        fromVersion,
      )
    ) {
      throw new SamiModuleMigrationError(
        'MODULE_MIGRATION_REGISTRY_INVALID',
        `SaMi module "${key}" has more than one migration starting from ${fromVersion}.`,
      );
    }

    fromVersions.add(
      fromVersion,
    );
  }

  return {
    manifest,
    namespace,
    migrations,
  };
}

export function getSamiModuleMigrationPlan(
  moduleKey:
    string,
  currentVersion:
    string,
  targetVersion:
    string,
) {
  const current =
    normalizeVersion(
      currentVersion,
    );

  const target =
    normalizeVersion(
      targetVersion,
    );

  if (
    compareSamiModuleVersions(
      current,
      target,
    ) >
    0
  ) {
    throw new SamiModuleMigrationError(
      'MODULE_DOWNGRADE_UNSUPPORTED',
      `SaMi will not downgrade ${moduleKey} from ${current} to ${target}.`,
    );
  }

  if (
    current ===
    target
  ) {
    return [];
  }

  const {
    migrations,
  } =
    validateRegistryForModule(
      moduleKey,
    );

  const byFrom =
    new Map(
      migrations.map(
        migration => [
          normalizeVersion(
            migration
              .fromVersion,
          ),
          migration,
        ],
      ),
    );

  const plan:
    SamiModuleMigrationDefinition[] =
    [];

  const seen =
    new Set<string>();

  let version =
    current;

  while (
    version !==
    target
  ) {
    if (
      seen.has(
        version,
      )
    ) {
      throw new SamiModuleMigrationError(
        'MODULE_MIGRATION_REGISTRY_INVALID',
        `SaMi detected a migration cycle for module "${moduleKey}".`,
      );
    }

    seen.add(
      version,
    );

    const migration =
      byFrom.get(
        version,
      );

    if (
      !migration
    ) {
      throw new SamiModuleMigrationError(
        'MODULE_MIGRATION_PATH_MISSING',
        `No migration path exists for ${moduleKey} from ${version} to ${target}.`,
      );
    }

    const next =
      normalizeVersion(
        migration.toVersion,
      );

    if (
      compareSamiModuleVersions(
        next,
        target,
      ) >
      0
    ) {
      throw new SamiModuleMigrationError(
        'MODULE_MIGRATION_PATH_MISSING',
        `Migration "${migration.key}" would move ${moduleKey} beyond target version ${target}.`,
      );
    }

    plan.push(
      migration,
    );

    version =
      next;
  }

  return plan;
}

async function ensureMigrationLedger(
  client:
    PoolClient,
) {
  await client.query(
    `
      CREATE TABLE IF NOT EXISTS public.sami_module_migrations (
        module_key VARCHAR(120) NOT NULL,
        migration_namespace VARCHAR(120) NOT NULL,
        migration_key VARCHAR(180) NOT NULL,
        from_version VARCHAR(40) NOT NULL,
        to_version VARCHAR(40) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (
          module_key,
          migration_key
        )
      )
    `,
  );
}

export async function runSamiModuleMigrations(
  input: {
    tenantPool:
      Pool;
    moduleKey:
      string;
    currentVersion:
      string;
    targetVersion:
      string;
  },
): Promise<SamiModuleMigrationResult> {
  const moduleKey =
    normalizeKey(
      input.moduleKey,
    );

  const previousVersion =
    normalizeVersion(
      input.currentVersion,
    );

  const targetVersion =
    normalizeVersion(
      input.targetVersion,
    );

  const {
    manifest,
    namespace,
  } =
    validateRegistryForModule(
      moduleKey,
    );

  if (
    normalizeVersion(
      manifest.version,
    ) !==
    targetVersion
  ) {
    throw new SamiModuleMigrationError(
      'MODULE_MIGRATION_REGISTRY_INVALID',
      `Migration target ${targetVersion} does not match manifest version ${manifest.version} for ${moduleKey}.`,
    );
  }

  const plan =
    getSamiModuleMigrationPlan(
      moduleKey,
      previousVersion,
      targetVersion,
    );

  if (
    plan.length ===
      0
  ) {
    return {
      moduleKey,
      previousVersion,
      currentVersion:
        targetVersion,
      targetVersion,
      appliedMigrations:
        [],
      changed:
        false,
    };
  }

  const client =
    await input
      .tenantPool
      .connect();

  const appliedMigrations:
    string[] =
    [];

  try {
    await client.query(
      `
        SELECT pg_advisory_lock(
          hashtext($1)
        )
      `,
      [
        `sami:module-migration:${moduleKey}`,
      ],
    );

    await ensureMigrationLedger(
      client,
    );

    for (
      const migration
      of plan
    ) {
      const existing =
        await client.query(
          `
            SELECT
              from_version,
              to_version,
              migration_namespace
            FROM public.sami_module_migrations
            WHERE module_key = $1
              AND migration_key = $2
            LIMIT 1
          `,
          [
            moduleKey,
            migration.key,
          ],
        );

      if (
        existing.rows.length >
        0
      ) {
        const row =
          existing.rows[0];

        if (
          String(
            row.from_version,
          ) !==
            migration
              .fromVersion ||
          String(
            row.to_version,
          ) !==
            migration
              .toVersion ||
          String(
            row.migration_namespace,
          ) !==
            namespace
        ) {
          throw new SamiModuleMigrationError(
            'MODULE_MIGRATION_REGISTRY_INVALID',
            `Applied migration "${migration.key}" no longer matches its immutable registered definition.`,
          );
        }

        continue;
      }

      try {
        await client.query(
          'BEGIN',
        );

        await migration.run(
          client,
          {
            moduleKey,
            namespace,
            fromVersion:
              migration
                .fromVersion,
            toVersion:
              migration
                .toVersion,
          },
        );

        await client.query(
          `
            INSERT INTO public.sami_module_migrations (
              module_key,
              migration_namespace,
              migration_key,
              from_version,
              to_version,
              applied_at
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              NOW()
            )
          `,
          [
            moduleKey,
            namespace,
            migration.key,
            migration
              .fromVersion,
            migration
              .toVersion,
          ],
        );

        await client.query(
          'COMMIT',
        );

        appliedMigrations.push(
          migration.key,
        );
      } catch (
        error
      ) {
        try {
          await client.query(
            'ROLLBACK',
          );
        } catch {
          // Preserve the original migration error.
        }

        if (
          error instanceof
            SamiModuleMigrationError
        ) {
          throw error;
        }

        const databaseCode =
          error &&
          typeof error ===
            'object' &&
          'code' in
            error
            ? String(
                (
                  error as {
                    code?: unknown;
                  }
                ).code ||
                '',
              )
            : '';

        const databaseMessage =
          error instanceof
            Error
            ? error.message
            : 'Unknown database migration error.';

        console.error(
          '[SaMi Module Migration] migration failed:',
          {
            moduleKey,
            migrationKey:
              migration.key,
            databaseCode:
              databaseCode ||
              null,
            message:
              databaseMessage,
          },
        );

        throw new SamiModuleMigrationError(
          'MODULE_MIGRATION_FAILED',
          `Migration "${migration.key}" failed for module "${moduleKey}": ${databaseMessage}`,
        );
      }
    }

    return {
      moduleKey,
      previousVersion,
      currentVersion:
        targetVersion,
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
          `sami:module-migration:${moduleKey}`,
        ],
      );
    } catch {
      // Connection release also releases session advisory locks.
    }

    client.release();
  }
}
