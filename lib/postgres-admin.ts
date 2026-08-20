import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

let adminPool: Pool | null = null;

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

function getAdminPool(): Pool {
  if (adminPool) {
    return adminPool;
  }

  adminPool = new Pool({
    connectionString: getAdminDatabaseUrl(),

    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,

    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return adminPool;
}

export async function postgresAdminQuery<
  T extends QueryResultRow = QueryResultRow,
>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  return getAdminPool().query<T>(text, values);
}

export const postgresAdmin = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    return postgresAdminQuery<T>(text, values);
  },

  async connect(): Promise<PoolClient> {
    return getAdminPool().connect();
  },

  async end(): Promise<void> {
    if (!adminPool) {
      return;
    }

    const pool = adminPool;
    adminPool = null;

    await pool.end();
  },
};