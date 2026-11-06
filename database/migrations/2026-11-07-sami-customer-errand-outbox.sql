
BEGIN;

-- Durable Customer-side events awaiting delivery to the
-- SaMi integration layer.
--
-- The Customer and Runner applications retain separate
-- databases. This table is the Customer backend's outbox.

CREATE TABLE IF NOT EXISTS public.customer_errand_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  errand_id uuid NOT NULL
    REFERENCES public.errands(id)
    ON DELETE RESTRICT,

  event_type text NOT NULL
    CHECK (
      event_type IN (
        'errand.requested',
        'errand.cancelled',
        'errand.customer_confirmed',
        'errand.disputed'
      )
    ),

  event_version smallint NOT NULL DEFAULT 1
    CHECK (event_version > 0),

  payload jsonb NOT NULL
    CHECK (jsonb_typeof(payload) = 'object'),

  attempts integer NOT NULL DEFAULT 0
    CHECK (attempts >= 0),

  available_at timestamptz NOT NULL DEFAULT now(),

  locked_at timestamptz,

  published_at timestamptz,

  dead_lettered_at timestamptz,

  last_error text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT customer_errand_outbox_event_unique
    UNIQUE (errand_id, event_type, event_version)
);

-- Efficiently find pending events available for delivery.
CREATE INDEX IF NOT EXISTS
  customer_errand_outbox_pending_idx
ON public.customer_errand_outbox (
  available_at,
  created_at
)
WHERE published_at IS NULL
  AND dead_lettered_at IS NULL;

-- Efficiently inspect the integration history of an errand.
CREATE INDEX IF NOT EXISTS
  customer_errand_outbox_errand_idx
ON public.customer_errand_outbox (
  errand_id,
  created_at DESC
);

GRANT SELECT, INSERT, UPDATE
ON public.customer_errand_outbox
TO sami_errands_app;

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-07-sami-customer-errand-outbox')
ON CONFLICT (version) DO NOTHING;

COMMIT;
