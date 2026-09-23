import 'server-only';

import {
  readdir,
} from 'node:fs/promises';
import path from 'node:path';

import {
  queryControl,
} from '@/lib/db/control';


const CONTROL_MIGRATION_DIRECTORY =
  path.join(
    process.cwd(),
    'lib',
    'schema',
    'control-migrations',
  );


function migrationNumber(
  key:
    string,
) {
  const match =
    key.match(
      /^(\d+)/,
    );

  return match
    ? Number(
        match[1],
      )
    : null;
}


export async function getControlMigrationStatus() {
  const files =
    (
      await readdir(
        CONTROL_MIGRATION_DIRECTORY,
      )
    )
      .filter(
        file =>
          /^\d+.*\.sql$/i.test(
            file,
          ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
            'en',
            {
              numeric:
                true,
            },
          ),
      );

  let appliedRows:
    Array<
      Record<
        string,
        unknown
      >
    > =
    [];

  try {
    const result =
      await queryControl(
        `
          SELECT
            migration_key,
            checksum,
            applied_at
          FROM control_schema_migrations
          ORDER BY
            migration_key ASC
        `,
      );

    appliedRows =
      result.rows;
  } catch (
    error
  ) {
    const code =
      error &&
      typeof error ===
        'object' &&
      'code' in
        error
        ? String(
            (
              error as {
                code?:
                  unknown;
              }
            ).code ||
            '',
          )
        : '';

    if (
      code !==
        '42P01'
    ) {
      throw error;
    }

    /*
     * A brand-new Control DB may not have the migration ledger yet.
     * Platform Health must still render and show every discovered
     * migration as pending instead of crashing.
     */
    appliedRows =
      [];
  }

  const applied =
    new Map(
      appliedRows.map(
        row => [
          String(
            row.migration_key,
          ),
          {
            migrationKey:
              String(
                row.migration_key,
              ),
            checksum:
              String(
                row.checksum ||
                '',
              ),
            appliedAt:
              row.applied_at
                ? new Date(
                    row.applied_at,
                  ).toISOString()
                : null,
          },
        ],
      ),
    );

  const migrations =
    files.map(
      migrationKey => {
        const record =
          applied.get(
            migrationKey,
          );

        return {
          migrationKey,
          number:
            migrationNumber(
              migrationKey,
            ),
          applied:
            Boolean(
              record,
            ),
          appliedAt:
            record
              ?.appliedAt ||
            null,
        };
      },
    );

  const pending =
    migrations.filter(
      migration =>
        !migration.applied,
    );

  const latestExpected =
    migrations[
      migrations.length -
      1
    ] ||
    null;

  const latestApplied =
    [...migrations]
      .reverse()
      .find(
        migration =>
          migration.applied,
      ) ||
    null;

  return {
    expectedCount:
      migrations.length,
    appliedCount:
      migrations.length -
      pending.length,
    pendingCount:
      pending.length,
    latestExpected,
    latestApplied,
    pending:
      pending.map(
        migration =>
          migration.migrationKey,
      ),
    migrations,
  };
}
