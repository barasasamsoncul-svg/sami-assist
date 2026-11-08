import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const MIGRATIONS_DIR = path.join(
  ROOT_DIR,
  "apps",
  "runner",
  "database",
  "migrations",
);

const MIGRATION_LOCK_ID = "73420520261107";

async function migrateRunnerDatabase() {
    const configuredConnectionString =
    process.env.RUNNER_DATABASE_MIGRATION_URL?.trim();

  if (!configuredConnectionString) {
    throw new Error(
      "RUNNER_DATABASE_MIGRATION_URL is missing. Configure it as a GitHub Actions production secret.",
    );
  }

  let migrationUrl;

  try {
    migrationUrl = new URL(configuredConnectionString);
  } catch {
    throw new Error(
      "RUNNER_DATABASE_MIGRATION_URL must be a valid PostgreSQL connection URL.",
    );
  }

  if (
    migrationUrl.protocol !== "postgres:" &&
    migrationUrl.protocol !== "postgresql:"
  ) {
    throw new Error(
      "RUNNER_DATABASE_MIGRATION_URL must use the PostgreSQL protocol.",
    );
  }

  migrationUrl.searchParams.set("sslmode", "verify-full");

  const connectionString = migrationUrl.toString();

  const client = new Client({
    connectionString,
    application_name: "sami-runner-database-migrations",
    connectionTimeoutMillis: 15000,
  });

  let lockAcquired = false;

  try {
    await client.connect();

    await client.query("SET lock_timeout = '10s'");
    await client.query("SET statement_timeout = '5min'");

    await client.query("SELECT pg_advisory_lock($1::bigint)", [
      MIGRATION_LOCK_ID,
    ]);

    lockAcquired = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    console.log(`Runner migrations found: ${files.length}`);

    let applied = 0;
    let skipped = 0;

    for (const file of files) {
      const version = file.replace(/\.sql$/i, "");

      const result = await client.query(
        `SELECT 1
         FROM public.schema_migrations
         WHERE version = $1
         LIMIT 1`,
        [version],
      );

      if (result.rowCount > 0) {
        console.log(`Already applied: ${version}`);
        skipped++;
        continue;
      }

      const migrationPath = path.join(MIGRATIONS_DIR, file);
      const sql = await readFile(migrationPath, "utf8");

      console.log(`Applying Runner migration: ${version}`);

      try {
        await client.query(sql);

        await client.query(
          `INSERT INTO public.schema_migrations (version)
           VALUES ($1)
           ON CONFLICT (version) DO NOTHING`,
          [version],
        );

        console.log(`Successfully applied: ${version}`);
        applied++;
      } catch (error) {
        throw new Error(`Runner migration failed: ${version}.`, {
          cause: error,
        });
      }
    }

    console.log("--------------------------------");
    console.log("Runner database migration complete.");
    console.log(`Applied: ${applied}`);
    console.log(`Already applied: ${skipped}`);
    console.log("--------------------------------");
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [
          MIGRATION_LOCK_ID,
        ]);
      } catch {
        console.error("Could not release Runner migration lock.");
      }
    }

    await client.end();
  }
}

migrateRunnerDatabase().catch((error) => {
  console.error("RUNNER DATABASE MIGRATION FAILED");
  console.error(error.message);

  if (error.cause) {
    console.error("Database error:", error.cause.message);
  }

  process.exitCode = 1;
});
