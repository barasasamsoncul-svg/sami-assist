
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

// Customer migrations are maintained in the central database folder
// and the dedicated Customer Mobile application folder.
const MIGRATIONS_DIRS = [
  path.join(ROOT_DIR, "database", "migrations"),
  path.join(ROOT_DIR, "apps", "mobile", "database", "migrations"),
];

// Prevent simultaneous Customer migration executions.
const MIGRATION_LOCK_ID = "73420520261104";

async function getMigrationFiles() {
  const files = (
    await Promise.all(
      MIGRATIONS_DIRS.map(async (directory) => {
        const entries = await readdir(directory, {
          withFileTypes: true,
        });

        return entries
          .filter(
            (entry) =>
              entry.isFile() && entry.name.endsWith(".sql")
          )
          .map((entry) => ({
            file: entry.name,
            directory,
          }));
      })
    )
  )
    .flat()
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.directory.localeCompare(b.directory)
    );

  // Prevent ambiguous migration versions across directories.
  const versions = new Map();

  for (const migration of files) {
    const version = migration.file.replace(/\.sql$/i, "");

    if (versions.has(version)) {
      throw new Error(
        `Duplicate migration version detected: ${version}. ` +
          `Locations: ${versions.get(version)} and ${migration.directory}`
      );
    }

    versions.set(version, migration.directory);
  }

  console.log(
    `Found ${files.length} Customer migration file(s) across ${MIGRATIONS_DIRS.length} directories.`
  );

  return files;
}

async function migrate() {
  const connectionString =
    process.env.DATABASE_MIGRATION_URL?.trim();

  if (!connectionString) {
    throw new Error(
      "DATABASE_MIGRATION_URL is missing. Configure it as a GitHub Actions production secret."
    );
  }

  // Discover and validate migration files before connecting.
  const files = await getMigrationFiles();

  const client = new Client({
    connectionString,
    application_name: "sami-database-migrations",
    connectionTimeoutMillis: 15000,
  });

  let lockAcquired = false;

  try {
    await client.connect();

    await client.query("SET lock_timeout = '10s'");
    await client.query("SET statement_timeout = '5min'");

    // Acquire a database-level lock so deployments cannot
    // execute Customer migrations simultaneously.
    await client.query(
      "SELECT pg_advisory_lock($1::bigint)",
      [MIGRATION_LOCK_ID]
    );

    lockAcquired = true;

    // Ensure the migration tracking table exists.
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    let applied = 0;
    let skipped = 0;

    for (const migration of files) {
      const { file, directory } = migration;
      const version = file.replace(/\.sql$/i, "");

      // Skip migrations already recorded in the database.
      const result = await client.query(
        `SELECT 1
         FROM public.schema_migrations
         WHERE version = $1
         LIMIT 1`,
        [version]
      );

      if (result.rowCount > 0) {
        console.log(`Already applied: ${version}`);
        skipped++;
        continue;
      }

      const migrationPath = path.join(directory, file);
      const sql = await readFile(migrationPath, "utf8");

      console.log(`Applying Customer migration: ${version}`);

      await client.query("BEGIN");

      try {
        await client.query(sql);

        // Record the migration after successful execution.
        // ON CONFLICT protects against duplicate tracking entries.
        await client.query(
          `INSERT INTO public.schema_migrations (version)
           VALUES ($1)
           ON CONFLICT (version) DO NOTHING`,
          [version]
        );

        await client.query("COMMIT");

        console.log(`Successfully applied: ${version}`);
        applied++;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);

        throw new Error(
          `Customer migration failed: ${version}. The transaction was rolled back.`,
          { cause: error }
        );
      }
    }

    console.log("--------------------------------");
    console.log("Customer database migration complete.");
    console.log(`Applied: ${applied}`);
    console.log(`Already applied: ${skipped}`);
    console.log("--------------------------------");
  } finally {
    if (lockAcquired) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock($1::bigint)",
          [MIGRATION_LOCK_ID]
        );
      } catch {
        console.error(
          "Could not release Customer migration lock."
        );
      }
    }

    await client.end();
  }
}

migrate().catch((error) => {
  console.error("CUSTOMER DATABASE MIGRATION FAILED");
  console.error(error.message);

  if (error.cause) {
    console.error("Database error:", error.cause.message);
  }

  process.exitCode = 1;
});
