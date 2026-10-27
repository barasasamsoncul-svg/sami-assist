import "server-only";
import { databasePool } from "@/lib/db";

const REQUIRED_LOCATION_COLUMNS = [
  "pickup_latitude",
  "pickup_longitude",
  "destination_latitude",
  "destination_longitude",
  "route_distance_meters",
  "route_duration_seconds",
] as const;

let ready: Promise<void> | null = null;

/**
 * Check that the owner-applied location migration is available.
 *
 * The application connects with a least-privilege database role and must not
 * attempt ALTER TABLE or CREATE TABLE on a live request.
 */
export async function ensureErrandLocationSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const client = await databasePool().connect();
      try {
        const result = await client.query<{ schema_ready: boolean }>(
          `
            SELECT
              to_regclass('public.errand_live_locations') IS NOT NULL
              AND (
                SELECT count(*) = cardinality($1::text[])
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'errands'
                  AND column_name = ANY($1::text[])
              ) AS schema_ready
          `,
          [[...REQUIRED_LOCATION_COLUMNS]],
        );

        if (!result.rows[0]?.schema_ready) {
          throw new Error(
            "Errand location schema is missing. Apply database/migrations/2026-10-26-sami-errands-location-tracking.sql with the database-owner role.",
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
