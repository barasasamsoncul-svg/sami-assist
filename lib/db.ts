
import "server-only";

import { Pool, type QueryResultRow } from "pg";

let pool: Pool | undefined;

function getDatabaseConnectionString(): string {
  const configured = process.env.DATABASE_URL?.trim();

  if (!configured) {
    throw new Error(
      "DATABASE_URL is not configured for this deployment.",
    );
  }

  let connectionUrl: URL;

  try {
    connectionUrl = new URL(configured);
  } catch {
    throw new Error(
      "DATABASE_URL must be a valid PostgreSQL connection URL.",
    );
  }

  if (
    connectionUrl.protocol !== "postgres:" &&
    connectionUrl.protocol !== "postgresql:"
  ) {
    throw new Error(
      "DATABASE_URL must use the PostgreSQL protocol.",
    );
  }

  // Explicitly retain full TLS certificate and hostname verification.
  connectionUrl.searchParams.set("sslmode", "verify-full");

  return connectionUrl.toString();
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseConnectionString(),
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "sami-errands",
    });
  }

  return pool;
}

export function query<
  T extends QueryResultRow = QueryResultRow,
>(
  text: string,
  values: unknown[] = [],
) {
  return getPool().query<T>(text, values);
}

export function databasePool(): Pool {
  return getPool();
}
