import "server-only";
import { Pool, type QueryResultRow } from "pg";
let pool: Pool | undefined;
function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured for this deployment.");
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, application_name: "sami-errands" });
  return pool;
}
export function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) { return getPool().query<T>(text, values); }
export function databasePool(): Pool { return getPool(); }