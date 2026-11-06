
-- SaMi customer grocery errand photo attachments.
-- Image bytes are stored privately in Cloudflare R2.
-- PostgreSQL stores metadata and the R2 object key only.

CREATE TABLE IF NOT EXISTS public.grocery_errand_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  errand_id uuid NOT NULL
    REFERENCES public.errands(id)
    ON DELETE CASCADE,

  uploaded_by uuid NOT NULL
    REFERENCES public.users(id)
    ON DELETE RESTRICT,

  storage_key text NOT NULL UNIQUE
    CHECK (
      length(trim(storage_key)) BETWEEN 20 AND 500
      AND storage_key NOT LIKE '%..%'
      AND storage_key NOT LIKE '%\%'
    ),

  original_file_name text NOT NULL
    CHECK (
      length(trim(original_file_name)) BETWEEN 1 AND 255
    ),

  content_type text NOT NULL
    CHECK (content_type = 'image/jpeg'),

  size_bytes integer NOT NULL
    CHECK (size_bytes BETWEEN 1 AND 5242880),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grocery_errand_photos_timeline_idx
  ON public.grocery_errand_photos(errand_id, created_at ASC);

CREATE INDEX IF NOT EXISTS grocery_errand_photos_uploader_idx
  ON public.grocery_errand_photos(uploaded_by, created_at DESC);

GRANT SELECT, INSERT, DELETE
  ON TABLE public.grocery_errand_photos
  TO sami_errands_app;

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-06-sami-grocery-photos')
ON CONFLICT (version) DO NOTHING;
