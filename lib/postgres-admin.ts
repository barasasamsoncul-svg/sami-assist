import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { Pool } from "pg";

const globalForPostgres =
  globalThis as unknown as {
    postgresAdminPool:
      | Pool
      | undefined;
  };

const password = process.env.POSTGRES_ADMIN_PASSWORD;

if (!password) {
  throw new Error(
    "POSTGRES_ADMIN_PASSWORD is not configured. Check .env.local."
  );
}

export const postgresAdmin =
  globalForPostgres.postgresAdminPool ??
  new Pool({
    host: process.env.POSTGRES_HOST,

    port: Number(
      process.env.POSTGRES_PORT || 5432
    ),

    user: process.env.POSTGRES_ADMIN_USER,

    password,

    database: "sami_control",

    ssl: {
      rejectUnauthorized: false,
    },

    max: 10,

    idleTimeoutMillis: 30_000,

    connectionTimeoutMillis: 10_000,
  });

if (
  process.env.NODE_ENV !== "production"
) {
  globalForPostgres.postgresAdminPool =
    postgresAdmin;
}