ALTER TABLE public.errands
  ADD COLUMN IF NOT EXISTS pickup_latitude double precision CHECK (pickup_latitude IS NULL OR pickup_latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS pickup_longitude double precision CHECK (pickup_longitude IS NULL OR pickup_longitude BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS destination_latitude double precision CHECK (destination_latitude IS NULL OR destination_latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS destination_longitude double precision CHECK (destination_longitude IS NULL OR destination_longitude BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS route_distance_meters integer CHECK (route_distance_meters IS NULL OR route_distance_meters >= 0),
  ADD COLUMN IF NOT EXISTS route_duration_seconds integer CHECK (route_duration_seconds IS NULL OR route_duration_seconds >= 0);

CREATE TABLE IF NOT EXISTS public.errand_live_locations (
  errand_id uuid PRIMARY KEY REFERENCES public.errands(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters double precision CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  heading_degrees double precision CHECK (heading_degrees IS NULL OR heading_degrees BETWEEN 0 AND 360),
  speed_meters_per_second double precision CHECK (speed_meters_per_second IS NULL OR speed_meters_per_second >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS errand_live_locations_provider_updated_idx
  ON public.errand_live_locations(provider_id, updated_at DESC);

INSERT INTO public.schema_migrations(version)
VALUES ('2026-10-26-sami-errands-location-tracking')
ON CONFLICT (version) DO NOTHING;
