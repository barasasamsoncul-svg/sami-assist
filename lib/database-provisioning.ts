import fs from "fs/promises";
import path from "path";
import { Pool } from "pg";
import { postgresAdmin } from "./postgres-admin";
import { getAppSchemaPath } from "./app-registry";

export async function createTenantDatabase(databaseName: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error("Invalid database name.");
  }

  const existingDatabase = await postgresAdmin.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [databaseName]
  );

  if (existingDatabase.rowCount && existingDatabase.rowCount > 0) {
    throw new Error(`Database "${databaseName}" already exists.`);
  }

  await postgresAdmin.query(`CREATE DATABASE "${databaseName}"`);

  return { success: true, databaseName };
}

export async function initializeTenantDatabase(
  databaseName: string,
  appKeys: string[] = []
) {
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error("Invalid database name.");
  }

  const host = process.env.POSTGRES_HOST || "localhost";
  const port = Number(process.env.POSTGRES_PORT || 5432);
  const user = process.env.POSTGRES_ADMIN_USER || "postgres";
  const password = process.env.POSTGRES_ADMIN_PASSWORD;

  if (!password) {
    throw new Error("POSTGRES_ADMIN_PASSWORD is not configured.");
  }

  const corePath = path.join(process.cwd(), "lib", "sami_tenant_core.sql");
  const coreSql = await fs.readFile(corePath, "utf8");

  const pool = new Pool({
    host, port, user, password, database: databaseName,
    ssl: { rejectUnauthorized: false },
    max: 2, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,
  });

  const uniqueAppKeys = [...new Set(
    appKeys.filter((key) => typeof key === "string")
      .map((key) => key.trim()).filter(Boolean)
  )];

  const installedApps: string[] = [];
  const pendingApps: string[] = [];

  try {
    // Core is always installed.
    await pool.query(coreSql);

    // Each selected app installs only its own schema.
    for (const appKey of uniqueAppKeys) {
      const schemaPath = getAppSchemaPath(appKey);

      if (!schemaPath) {
        pendingApps.push(appKey);
        console.log(`Schema not implemented yet: ${appKey}`);
        continue;
      }

      const schemaSql = await fs.readFile(schemaPath, "utf8");
      await pool.query(schemaSql);
      installedApps.push(appKey);
      console.log(`Initialized app schema: ${appKey}`);
    }

    return {
      success: true,
      databaseName,
      appKeys: uniqueAppKeys,
      installedApps,
      pendingApps,
    };
  } finally {
    await pool.end();
  }
}
