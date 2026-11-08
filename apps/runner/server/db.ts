
import "server-only";

import { Pool } from "pg";

const globalForRunnerDb = globalThis as typeof globalThis & {
  runnerPool?: Pool;
};

function getRunnerConnectionString(): string {
  const configured = process.env.RUNNER_DATABASE_URL?.trim();

  if (!configured) {
    throw new Error(
      "RUNNER_DATABASE_URL is not configured.",
    );
  }

  let connectionUrl: URL;

  try {
    connectionUrl = new URL(configured);
  } catch {
    throw new Error(
      "RUNNER_DATABASE_URL must be a valid PostgreSQL connection URL.",
    );
  }

  if (
    connectionUrl.protocol !== "postgres:" &&
    connectionUrl.protocol !== "postgresql:"
  ) {
    throw new Error(
      "RUNNER_DATABASE_URL must use the PostgreSQL protocol.",
    );
  }

  // Require TLS with certificate and hostname verification.
  connectionUrl.searchParams.set("sslmode", "verify-full");

  return connectionUrl.toString();
}

function createPool(): Pool {
  return new Pool({
    connectionString: getRunnerConnectionString(),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "sami-runner-api",
  });
}

export function databasePool(): Pool {
  if (!globalForRunnerDb.runnerPool) {
    globalForRunnerDb.runnerPool = createPool();
  }

  return globalForRunnerDb.runnerPool;
}

export async function query<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  sql: string,
  values: unknown[] = [],
) {
  return databasePool().query<T>(sql, values);
}
