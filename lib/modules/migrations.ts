import 'server-only';

import type {
  Pool,
  PoolClient,
} from 'pg';

import {
  getSamiModuleManifest,
} from '@/lib/modules/registry';

import {
  INVOICING_1_0_0_TO_2_0_0,
} from '@/lib/apps/invoicing/migrations/1.0.0-to-2.0.0';

import {
  INVOICING_2_0_0_TO_2_1_0,
} from '@/lib/apps/invoicing/migrations/2.0.0-to-2.1.0';

import {
  INVOICING_2_1_0_TO_2_2_0,
} from '@/lib/apps/invoicing/migrations/2.1.0-to-2.2.0';

import {
  ENTERPRISE_SUITE_MIGRATIONS,
} from '@/lib/apps/enterprise/hardening';

import {
  SALES_1_0_0_TO_2_0_0,
} from '@/lib/apps/sales/migrations/1.0.0-to-2.0.0';

export type SamiModuleMigrationContext = {
  moduleKey: string;
  namespace: string;
  fromVersion: string;
  toVersion: string;
};

export type SamiModuleMigrationDefinition = {
  key: string;
  moduleKey: string;
  namespace: string;
  fromVersion: string;
  toVersion: string;
  run:
    (
      client:
        PoolClient,
      context:
        SamiModuleMigrationContext,
    ) =>
      Promise<void>;
};

export type SamiModuleMigrationResult = {
  moduleKey: string;
  previousVersion: string;
  currentVersion: string;
  targetVersion: string;
  appliedMigrations: string[];
  changed: boolean;
};

export class SamiModuleMigrationError
  extends Error {
  readonly code:
    | 'MODULE_VERSION_INVALID'
    | 'MODULE_DOWNGRADE_UNSUPPORTED'
    | 'MODULE_MIGRATION_PATH_MISSING'
    | 'MODULE_MIGRATION_REGISTRY_INVALID'
    | 'MODULE_MIGRATION_UNSAFE'
    | 'MODULE_MIGRATION_FAILED';

  constructor(
    code:
      SamiModuleMigrationError['code'],
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'SamiModuleMigrationError';

    this.code =
      code;
  }
}

/*
 * Code-owned business-module migrations.
 *
 * When a module gains a new version, import its immutable migration
 * definition here and append it to this array. Database rows can record
 * state but can never create executable migration code.
 *
 * Example future import:
 *
 * import { CRM_1_0_0_TO_1_1_0 }
 *   from '@/lib/apps/crm/migrations/1.0.0-to-1.1.0';
 */
export const APP_MODULE_MIGRATIONS:
  readonly SamiModuleMigrationDefinition[] =
  [
    INVOICING_1_0_0_TO_2_0_0,
    INVOICING_2_0_0_TO_2_1_0,
    INVOICING_2_1_0_TO_2_2_0,
    SALES_1_0_0_TO_2_0_0,
    ...ENTERPRISE_SUITE_MIGRATIONS,
  ];

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const DESTRUCTIVE_SQL_PATTERN =
  /\b(?:DROP\s+(?:TABLE|SCHEMA|DATABASE|COLUMN)|TRUNCATE\s+|DELETE\s+FROM\s+[^;]+(?:;|$))\b/i;

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

export function assertSafeSamiModuleMigrationSql(
  sql:
    string,
) {
  const normalized =
    sql.trim();

  if (
    !normalized
  ) {
    throw new SamiModuleMigrationError(
      'MODULE_MIGRATION_UNSAFE',
      'SaMi module migration SQL cannot be empty.',
    );
  }

  if (
    DESTRUCTIVE_SQL_PATTERN.test(
      normalized,
    )
  ) {
    throw new SamiModuleMigrationError(
      'MODULE_MIGRATION_UNSAFE',
      'SaMi module migrations are additive by default. DROP, TRUNCATE and bulk DELETE operations require a separately reviewed data-migration strategy.',
    );
  }

  return normalized;
}

export async function executeSafeSamiModuleMigrationSql(
  client:
    PoolClient,
  sql:
    string,
) {
  await client.query(
    assertSafeSamiModuleMigrationSql(
      sql,
    ),
  );
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

        throw new SamiModuleMigrationError(
          'MODULE_MIGRATION_FAILED',
          `Migration "${migration.key}" failed for module "${moduleKey}".`,
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
