import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  SamiModuleMigrationError,
} from '@/lib/modules/migration-errors';

const DESTRUCTIVE_SQL_PATTERN =
  /\b(?:DROP\s+(?:TABLE|SCHEMA|DATABASE|COLUMN)|TRUNCATE\s+|DELETE\s+FROM\s+[^;]+(?:;|$))\b/i;

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
