import { Pool, QueryResult, QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __samiAdminPool: Pool | undefined;
}

function getAdminDatabaseUrl(): string {
  const url =
    process.env.ADMIN_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (!url) {
    throw new Error(
      "Missing ADMIN_DATABASE_URL, DATABASE_URL, or POSTGRES_URL."
    );
  }

  return url;
}

function createAdminPool(): Pool {
  return new Pool({
    connectionString: getAdminDatabaseUrl(),

    ssl:
      process.env.NODE_ENV === "development"
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: false },

    max: Number(process.env.ADMIN_DB_POOL_MAX || 10),

    idleTimeoutMillis: 30_000,

    connectionTimeoutMillis: 10_000,
  });
}

export const postgresAdmin =
  globalThis.__samiAdminPool ?? createAdminPool();

if (process.env.NODE_ENV !== "production") {
  globalThis.__samiAdminPool = postgresAdmin;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  return postgresAdmin.query<T>(text, values);
}

export async function testAdminDatabaseConnection(): Promise<void> {
  await postgresAdmin.query("SELECT 1");
}

export async function closeAdminDatabase(): Promise<void> {
  await postgresAdmin.end();
}