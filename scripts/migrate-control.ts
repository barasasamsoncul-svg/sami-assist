import crypto from 'node:crypto';
import {
  readdir,
  readFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';

dotenv.config({
  path:
    '.env.local',
});

dotenv.config();


const MIGRATION_DIRECTORY =
  path.join(
    process.cwd(),
    'lib',
    'schema',
    'control-migrations',
  );

const MIGRATION_LOCK_KEY =
  'sami:control-schema-migrations';


function checksum(
  value: string,
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      value,
      'utf8',
    )
    .digest(
      'hex',
    );
}


async function main() {
  const {
    getControlPool,
  } =
    await import(
      '../lib/db/control'
    );

  const pool =
    getControlPool();

  const client =
    await pool.connect();

  try {
    await client.query(
      `
        SELECT
          pg_advisory_lock(
            hashtext(
              $1
            )
          )
      `,
      [
        MIGRATION_LOCK_KEY,
      ],
    );

    await client.query(
      `
        CREATE TABLE IF NOT EXISTS control_schema_migrations (
          migration_key TEXT PRIMARY KEY,
          checksum CHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
    );

    const files =
      (
        await readdir(
          MIGRATION_DIRECTORY,
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

    if (
      files.length ===
        0
    ) {
      throw new Error(
        'No SaMi control database migrations were found.',
      );
    }

    let applied =
      0;

    let skipped =
      0;

    console.log(
      '\nSaMi control database migrations\n',
    );

    for (
      const file
      of files
    ) {
      const migrationPath =
        path.join(
          MIGRATION_DIRECTORY,
          file,
        );

      const sql =
        await readFile(
          migrationPath,
          'utf8',
        );

      const migrationChecksum =
        checksum(
          sql,
        );

      const existing =
        await client.query(
          `
            SELECT
              checksum,
              applied_at
            FROM control_schema_migrations
            WHERE migration_key = $1
            LIMIT 1
          `,
          [
            file,
          ],
        );

      if (
        existing.rows.length ===
          1
      ) {
        const storedChecksum =
          String(
            existing.rows[0]
              .checksum ||
            '',
          );

        if (
          storedChecksum !==
            migrationChecksum
        ) {
          throw new Error(
            `Migration ${file} was already applied with a different checksum. Never edit an applied control migration; create a new migration instead.`,
          );
        }

        skipped +=
          1;

        console.log(
          'SKIP  ' +
          file,
        );

        continue;
      }

      await client.query(
        'BEGIN',
      );

      try {
        await client.query(
          sql,
        );

        await client.query(
          `
            INSERT INTO control_schema_migrations (
              migration_key,
              checksum,
              applied_at
            )
            VALUES (
              $1,
              $2,
              NOW()
            )
          `,
          [
            file,
            migrationChecksum,
          ],
        );

        await client.query(
          'COMMIT',
        );

        applied +=
          1;

        console.log(
          'APPLY ' +
          file,
        );
      } catch (
        error
      ) {
        await client.query(
          'ROLLBACK',
        );

        throw error;
      }
    }

    console.log(
      `\nPASS  Control DB migrations complete. Applied: ${applied}; skipped: ${skipped}.\n`,
    );
  } finally {
    try {
      await client.query(
        `
          SELECT
            pg_advisory_unlock(
              hashtext(
                $1
              )
            )
        `,
        [
          MIGRATION_LOCK_KEY,
        ],
      );
    } catch {
      // Connection teardown also releases PostgreSQL advisory locks.
    }

    client.release();

    await pool
      .end()
      .catch(
        () =>
          undefined,
      );
  }
}


main()
  .catch(
    error => {
      console.error(
        error instanceof
          Error
          ? error.message
          : 'Unknown control database migration failure.',
      );

      process.exitCode =
        1;
    },
  );
