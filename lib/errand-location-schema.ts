import "server-only";
import { databasePool } from "@/lib/db";

let ready: Promise<void> | null = null;

/**
 * Additive, backwards-compatible location migration. It runs lazily from authenticated
 * requests so the existing Preview database is upgraded without changing the ERP DB.
 */
export async function ensureErrandLocationSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const client = await databasePool().connect();
      try {
        await client.query("BEGIN");
        await client.query("ALTER TABLE errands ADD COLUMN IF NOT EXISTS pickup_latitude double precision");
        await client.query("ALTER TABLE errands ADD COLUMN IF NOT EXISTS pickup_longitude double precision");
        await client.query("ALTER TABLE errands ADD COLUMN IF NOT EXISTS destination_latitude double precision");
        await client.query("ALTER TABLE errands ADD COLUMN IF NOT EXISTS destination_longitude double precision");
        await client.query("ALTER TABLE errands ADD COLUMN IF NOT EXISTS route_distance_meters integer");
        await client.query("ALTER TABLE errands ADD COLUMN IF NOT EXISTS route_duration_seconds integer");
        await client.query(`
          CREATE TABLE IF NOT EXISTS errand_live_locations (
            errand_id uuid PRIMARY KEY REFERENCES errands(id) ON DELETE CASCADE,
            provider_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
            longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
            accuracy_meters double precision CHECK(accuracy_meters IS NULL OR accuracy_meters >= 0),
            heading_degrees double precision CHECK(heading_degrees IS NULL OR heading_degrees BETWEEN 0 AND 360),
            speed_meters_per_second double precision CHECK(speed_meters_per_second IS NULL OR speed_meters_per_second >= 0),
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
        await client.query("CREATE INDEX IF NOT EXISTS errand_live_locations_provider_updated_idx ON errand_live_locations(provider_id,updated_at DESC)");
        await client.query("INSERT INTO schema_migrations(version) VALUES('2026-10-26-sami-errands-location-tracking') ON CONFLICT DO NOTHING");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        ready = null;
        throw error;
      } finally {
        client.release();
      }
    })();
  }
  return ready;
}
