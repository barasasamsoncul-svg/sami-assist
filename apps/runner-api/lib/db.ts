import "server-only";

import { Pool } from "pg";

const globalForRunnerDb = globalThis as typeof globalThis & {
  runnerPool?: Pool;
};

function createPool(): Pool {
  const connectionString = process.env.RUNNER_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("RUNNER_DATABASE_URL is not configured.");
  }

  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
    application_name: "sami-runner-api",
  });
}

export function databasePool(): Pool {
  if (!globalForRunnerDb.runnerPool) {
    globalForRunnerDb.runnerPool = createPool();
  }
  return globalForRunnerDb.runnerPool;
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  values: unknown[] = [],
) {
  return databasePool().query<T>(sql, values);
}