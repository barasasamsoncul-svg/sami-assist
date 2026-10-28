import "server-only";
import { databasePool } from "@/lib/db";

let ready: Promise<void> | null = null;

/**
 * Calling is enabled only after the additive owner-applied call migration exists.
 * Never run CREATE/ALTER TABLE from an authenticated application request.
 */
export async function ensureErrandCallSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const client = await databasePool().connect();
      try {
        const result = await client.query<{ schema_ready: boolean }>(`
          SELECT
            to_regclass('public.errand_calls') IS NOT NULL
            AND to_regclass('public.errand_call_signals') IS NOT NULL AS schema_ready
        `);
        if (!result.rows[0]?.schema_ready) {
          throw new Error(
            "Errand calling schema is missing. Apply database/migrations/2026-10-28-sami-errand-voice-calls.sql with the database-owner role.",
          );
        }
      } finally {
        client.release();
      }
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}
