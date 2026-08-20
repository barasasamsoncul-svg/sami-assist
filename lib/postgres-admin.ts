import { Pool } from "pg";

const host = process.env.POSTGRES_HOST;
const port = Number(process.env.POSTGRES_PORT || 5432);
const database = process.env.POSTGRES_DB;
const user = process.env.POSTGRES_ADMIN_USER;
const password = process.env.POSTGRES_ADMIN_PASSWORD;

if (!host || !database || !user || !password) {
  throw new Error(
    "Missing PostgreSQL configuration. Required: POSTGRES_HOST, POSTGRES_DB, POSTGRES_ADMIN_USER, POSTGRES_ADMIN_PASSWORD."
  );
}

export const postgresAdmin = new Pool({
  host,
  port,
  database,
  user,
  password,

  ssl: {
    rejectUnauthorized: false,
  },

  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  max: 10,
});