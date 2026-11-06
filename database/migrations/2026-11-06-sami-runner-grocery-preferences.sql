
-- SaMi customer grocery request preferences.
-- Stores the customer's preferred execution time and additional
-- instructions without introducing a separate shopping-list workflow.

ALTER TABLE public.grocery_errand_details
  ADD COLUMN IF NOT EXISTS preferred_time text NOT NULL DEFAULT 'asap',
  ADD COLUMN IF NOT EXISTS scheduled_time text,
  ADD COLUMN IF NOT EXISTS customer_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.grocery_errand_details'::regclass
      AND conname = 'grocery_errand_details_preferred_time_check'
  ) THEN
    ALTER TABLE public.grocery_errand_details
      ADD CONSTRAINT grocery_errand_details_preferred_time_check
      CHECK (preferred_time IN ('asap', 'scheduled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.grocery_errand_details'::regclass
      AND conname = 'grocery_errand_details_scheduled_time_check'
  ) THEN
    ALTER TABLE public.grocery_errand_details
      ADD CONSTRAINT grocery_errand_details_scheduled_time_check
      CHECK (
        (
          preferred_time = 'asap'
          AND scheduled_time IS NULL
        )
        OR
        (
          preferred_time = 'scheduled'
          AND scheduled_time IS NOT NULL
          AND length(trim(scheduled_time)) BETWEEN 2 AND 120
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.grocery_errand_details'::regclass
      AND conname = 'grocery_errand_details_customer_notes_check'
  ) THEN
    ALTER TABLE public.grocery_errand_details
      ADD CONSTRAINT grocery_errand_details_customer_notes_check
      CHECK (
        customer_notes IS NULL
        OR length(customer_notes) <= 1000
      );
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.grocery_errand_details
  TO sami_errands_app;

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-06-sami-runner-grocery-preferences')
ON CONFLICT (version) DO NOTHING;
