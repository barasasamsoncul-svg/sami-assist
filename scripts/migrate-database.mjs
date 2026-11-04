
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const MIGRATIONS_DIR = path.join(ROOT_DIR, "database", "migrations");

// Shared lock prevents two deployment jobs from applying migrations together.
const MIGRATION_LOCK_ID = "73420520261104";

async function migrate() {
  const connectionString = process.env.DATABASE_MIGRATION_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_MIGRATION_URL is missing. Configure it as a GitHub Actions secret."
    );
  }

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

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    console.log(`Found ${files.length} migration file(s).`);

    let applied = 0;
    let skipped = 0;

    for (const file of files) {
      const version = file.replace(/\.sql$/i, "");

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

      const migrationPath = path.join(MIGRATIONS_DIR, file);
      const sql = await readFile(migrationPath, "utf8");

      console.log(`Applying: ${version}`);

      await client.query("BEGIN");

      try {
        await client.query(sql);

        // Some existing migration files already record themselves.
        // ON CONFLICT makes this safe for both styles.
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
        await client.query("ROLLBACK");
        throw new Error(
          `Migration failed: ${version}. The transaction was rolled back.`,
          { cause: error }
        );
      }
    }

    console.log("--------------------------------");
    console.log("Database migration check complete.");
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
        console.error("Could not release migration lock.");
      }
    }

    await client.end();
  }
}

migrate().catch((error) => {
  console.error("DATABASE MIGRATION FAILED");
  console.error(error.message);

  if (error.cause) {
    console.error("Database error:", error.cause.message);
  }

  process.exitCode = 1;
});
