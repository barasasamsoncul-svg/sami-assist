import { postgresAdmin } from "./postgres-admin";

export async function createTenantDatabase(
  databaseName: string
) {
  // Validate database name
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error("Invalid database name.");
  }

  // Check if database already exists
  const existingDatabase = await postgresAdmin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [databaseName]
  );

  if (existingDatabase.rowCount && existingDatabase.rowCount > 0) {
    throw new Error(
      `Database "${databaseName}" already exists.`
    );
  }

  // PostgreSQL does not allow parameters for database identifiers,
  // so the validated name is safely quoted here.
  const safeDatabaseName = `"${databaseName.replace(/"/g, '""')}"`;

  // Create the new tenant database
  await postgresAdmin.query(
    `CREATE DATABASE ${safeDatabaseName} TEMPLATE sami_tenant_template`
  );

  return {
    success: true,
    databaseName,
  };
}