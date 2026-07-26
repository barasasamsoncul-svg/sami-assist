import fs from "fs/promises";
import path from "path";
import { Pool } from "pg";
import { postgresAdmin } from "./postgres-admin";

export async function createTenantDatabase(
  databaseName: string
) {
  // Validate database name
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error("Invalid database name.");
  }

  // Check whether database already exists
  const existingDatabase = await postgresAdmin.query(
    `
    SELECT 1
    FROM pg_database
    WHERE datname = $1
    `,
    [databaseName]
  );

  if (
    existingDatabase.rowCount &&
    existingDatabase.rowCount > 0
  ) {
    throw new Error(
      `Database "${databaseName}" already exists.`
    );
  }

  // PostgreSQL does not allow parameters
  // for database identifiers.
  // The name has already been strictly validated.
  await postgresAdmin.query(
    `CREATE DATABASE "${databaseName}"`
  );

  return {
    success: true,
    databaseName,
  };
}

export async function initializeTenantDatabase(
  databaseName: string
) {
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error("Invalid database name.");
  }

  const databaseHost =
    process.env.POSTGRES_HOST ||
    "localhost";

  const databasePort = Number(
    process.env.POSTGRES_PORT || 5432
  );

  const databaseUser =
    process.env.POSTGRES_ADMIN_USER ||
    "postgres";

  const databasePassword =
    process.env.POSTGRES_ADMIN_PASSWORD;

  if (!databasePassword) {
    throw new Error(
      "POSTGRES_ADMIN_PASSWORD is not configured."
    );
  }

  // Load the exact tenant schema
  // generated from sami_tenant_template.
  const schemaPath = path.join(
    process.cwd(),
    "lib",
    "sami_tenant_schema.sql"
  );

  const schemaSql =
    await fs.readFile(
      schemaPath,
      "utf8"
    );

  // Connect directly to the newly created
  // tenant database.
  const tenantPool = new Pool({
  host: databaseHost,

  port: databasePort,

  user: databaseUser,

  password: databasePassword,

  database: databaseName,

  ssl: {
    rejectUnauthorized: false,
  },

  max: 2,

  idleTimeoutMillis: 30_000,

  connectionTimeoutMillis: 10_000,
});

  try {
    // Execute the complete tenant schema.
    await tenantPool.query(schemaSql);

    return {
      success: true,
      databaseName,
    };
  } finally {
    await tenantPool.end();
  }
}