BEGIN;

-- Idle online presence is separate from customer-visible active-trip tracking.
-- runner_live_locations.job_id remains NOT NULL and continues to represent
-- only accepted/in-progress errand movement.
CREATE TABLE IF NOT EXISTS public.runner_presence_locations (
  runner_id uuid PRIMARY KEY
    REFERENCES public.runner_accounts(id) ON DELETE CASCADE,
  latitude double precision NOT NULL
    CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL
    CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters double precision
    CHECK (accuracy_meters IS NULL OR accuracy_meters BETWEEN 0 AND 10000),
  heading_degrees double precision
    CHECK (heading_degrees IS NULL OR heading_degrees BETWEEN 0 AND 360),
  speed_meters_per_second double precision
    CHECK (speed_meters_per_second IS NULL OR speed_meters_per_second BETWEEN 0 AND 150),
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runner_presence_locations_captured_idx
  ON public.runner_presence_locations(captured_at DESC);

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-20-runner-online-presence-locations')
ON CONFLICT (version) DO NOTHING;

COMMIT;
