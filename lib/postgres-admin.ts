import { Pool } from "pg";

const globalForPostgres =
  globalThis as unknown as {
    postgresAdminPool:
      | Pool
      | undefined;
  };

export const postgresAdmin =
  globalForPostgres.postgresAdminPool ??
  new Pool({
    host:
      process.env.POSTGRES_HOST,

    port: Number(
      process.env.POSTGRES_PORT || 5432
    ),

    user:
      process.env.POSTGRES_ADMIN_USER,

    password:
      process.env.POSTGRES_ADMIN_PASSWORD,

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