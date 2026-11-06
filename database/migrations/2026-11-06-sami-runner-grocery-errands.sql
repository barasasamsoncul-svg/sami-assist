
-- SaMi Groceries: runner-centred errand workflow.
-- A grocery request is an instruction for a runner, not a marketplace order.
-- The physical shop is only a customer-specified task location.

ALTER TABLE public.service_pricing
  DROP CONSTRAINT IF EXISTS service_pricing_category_check;

ALTER TABLE public.service_pricing
  ADD CONSTRAINT service_pricing_category_check
  CHECK (
    category IN (
      'shopping',
      'groceries',
      'clothing_retail',
      'pickup_delivery',
      'documents_admin',
      'personal_errand',
      'queue_appointments',
      'business_support',
      'local_assistance',
      'other'
    )
  );

ALTER TABLE public.errands
  DROP CONSTRAINT IF EXISTS errands_category_check;

ALTER TABLE public.errands
  ADD CONSTRAINT errands_category_check
  CHECK (
    category IN (
      'shopping',
      'groceries',
      'clothing_retail',
      'pickup_delivery',
      'documents_admin',
      'personal_errand',
      'queue_appointments',
      'business_support',
      'local_assistance',
      'other'
    )
  );

-- One grocery task detail record belongs to one base errand.
CREATE TABLE IF NOT EXISTS public.grocery_errand_details (
  errand_id uuid PRIMARY KEY
    REFERENCES public.errands(id) ON DELETE CASCADE,

  preferred_store_name text
    CHECK (
      preferred_store_name IS NULL
      OR length(trim(preferred_store_name)) BETWEEN 2 AND 200
    ),

  preferred_store_area text
    CHECK (
      preferred_store_area IS NULL
      OR length(trim(preferred_store_area)) <= 200
    ),

  store_instructions text
    CHECK (
      store_instructions IS NULL
      OR length(trim(store_instructions)) <= 2000
    ),

  purchase_budget_amount numeric(12,2)
    CHECK (
      purchase_budget_amount IS NULL
      OR purchase_budget_amount BETWEEN 0 AND 100000000
    ),

  substitution_policy text NOT NULL DEFAULT 'ask_first'
    CHECK (
      substitution_policy IN (
        'ask_first',
        'allow_similar',
        'do_not_substitute'
      )
    ),

  delivery_mode text NOT NULL DEFAULT 'deliver'
    CHECK (
      delivery_mode IN (
        'deliver',
        'customer_collect'
      )
    ),

  delivery_instructions text
    CHECK (
      delivery_instructions IS NULL
      OR length(trim(delivery_instructions)) <= 3000
    ),

  workflow_status text NOT NULL DEFAULT 'submitted'
    CHECK (
      workflow_status IN (
        'submitted',
        'assigned',
        'accepted',
        'shopping',
        'awaiting_customer_approval',
        'purchased',
        'ready_for_collection',
        'out_for_delivery',
        'arrived',
        'handed_over',
        'completed',
        'issue',
        'cancelled'
      )
    ),

  delivery_tracking_started_at timestamptz,
  delivery_tracking_stopped_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (
    delivery_tracking_stopped_at IS NULL
    OR delivery_tracking_started_at IS NOT NULL
  ),

  CHECK (
    delivery_tracking_stopped_at IS NULL
    OR delivery_tracking_stopped_at >= delivery_tracking_started_at
  ),

  -- Tracking may run only during the delivery leg.
  CHECK (
    workflow_status <> 'out_for_delivery'
    OR (
      delivery_mode = 'deliver'
      AND delivery_tracking_started_at IS NOT NULL
      AND delivery_tracking_stopped_at IS NULL
    )
  ),

  -- Once delivery tracking has started, it must stop before the task
  -- reaches arrival, handover, completion, collection, issue or cancellation.
  CHECK (
    delivery_tracking_started_at IS NULL
    OR delivery_tracking_stopped_at IS NOT NULL
    OR workflow_status = 'out_for_delivery'
  )
);

CREATE INDEX IF NOT EXISTS grocery_errand_details_status_idx
  ON public.grocery_errand_details(workflow_status, updated_at DESC);


-- The requested items are plain task instructions.
-- They are not catalogue products.
CREATE TABLE IF NOT EXISTS public.grocery_errand_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  errand_id uuid NOT NULL
    REFERENCES public.grocery_errand_details(errand_id)
    ON DELETE CASCADE,

  requested_item text NOT NULL
    CHECK (length(trim(requested_item)) BETWEEN 2 AND 200),

  requested_quantity numeric(12,3) NOT NULL
    CHECK (requested_quantity > 0 AND requested_quantity <= 1000000),

  requested_unit text NOT NULL DEFAULT 'item'
    CHECK (length(trim(requested_unit)) BETWEEN 1 AND 32),

  item_preferences text
    CHECK (
      item_preferences IS NULL
      OR length(trim(item_preferences)) <= 1000
    ),

  item_instructions text
    CHECK (
      item_instructions IS NULL
      OR length(trim(item_instructions)) <= 1500
    ),

  maximum_unit_price numeric(12,2)
    CHECK (
      maximum_unit_price IS NULL
      OR maximum_unit_price BETWEEN 0 AND 100000000
    ),

  substitution_rule text NOT NULL DEFAULT 'ask_customer'
    CHECK (
      substitution_rule IN (
        'ask_customer',
        'similar_ok',
        'no_substitution'
      )
    ),

  runner_status text NOT NULL DEFAULT 'requested'
    CHECK (
      runner_status IN (
        'requested',
        'found',
        'unavailable',
        'awaiting_customer_approval',
        'purchased',
        'not_purchased'
      )
    ),

  found_item_description text
    CHECK (
      found_item_description IS NULL
      OR length(trim(found_item_description)) <= 500
    ),

  actual_quantity numeric(12,3)
    CHECK (
      actual_quantity IS NULL
      OR actual_quantity > 0
    ),

  actual_unit_price numeric(12,2)
    CHECK (
      actual_unit_price IS NULL
      OR actual_unit_price >= 0
    ),

  runner_note text
    CHECK (
      runner_note IS NULL
      OR length(trim(runner_note)) <= 1500
    ),

  sort_order integer NOT NULL DEFAULT 0
    CHECK (sort_order >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grocery_errand_items_order_idx
  ON public.grocery_errand_items(errand_id, sort_order, created_at);


-- A runner must request a customer decision before making a
-- substitution, price change or quantity change that requires approval.
CREATE TABLE IF NOT EXISTS public.grocery_item_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  item_id uuid NOT NULL
    REFERENCES public.grocery_errand_items(id)
    ON DELETE CASCADE,

  created_by uuid NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,

  proposal_type text NOT NULL
    CHECK (
      proposal_type IN (
        'substitution',
        'price_change',
        'quantity_change'
      )
    ),

  proposed_item_description text
    CHECK (
      proposed_item_description IS NULL
      OR length(trim(proposed_item_description)) <= 500
    ),

  proposed_quantity numeric(12,3)
    CHECK (
      proposed_quantity IS NULL
      OR proposed_quantity > 0
    ),

  proposed_unit text
    CHECK (
      proposed_unit IS NULL
      OR length(trim(proposed_unit)) BETWEEN 1 AND 32
    ),

  proposed_unit_price numeric(12,2)
    CHECK (
      proposed_unit_price IS NULL
      OR proposed_unit_price >= 0
    ),

  reason text NOT NULL
    CHECK (length(trim(reason)) BETWEEN 2 AND 1500),

  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'approved',
        'rejected'
      )
    ),

  decided_by uuid
    REFERENCES public.users(id) ON DELETE SET NULL,

  decision_note text
    CHECK (
      decision_note IS NULL
      OR length(trim(decision_note)) <= 1000
    ),

  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,

  CHECK (
    proposal_type <> 'substitution'
    OR proposed_item_description IS NOT NULL
  ),

  CHECK (
    (
      status = 'pending'
      AND decided_by IS NULL
      AND decided_at IS NULL
    )
    OR
    (
      status IN ('approved', 'rejected')
      AND decided_by IS NOT NULL
      AND decided_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS grocery_item_proposals_item_created_idx
  ON public.grocery_item_proposals(item_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS grocery_item_one_pending_proposal_idx
  ON public.grocery_item_proposals(item_id)
  WHERE status = 'pending';


-- Detailed runner/customer task timeline.
CREATE TABLE IF NOT EXISTS public.grocery_errand_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  errand_id uuid NOT NULL
    REFERENCES public.grocery_errand_details(errand_id)
    ON DELETE CASCADE,

  actor_id uuid
    REFERENCES public.users(id) ON DELETE SET NULL,

  event_type text NOT NULL
    CHECK (length(trim(event_type)) BETWEEN 3 AND 80),

  from_status text,
  to_status text,

  note text
    CHECK (
      note IS NULL
      OR length(trim(note)) <= 2000
    ),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grocery_errand_events_timeline_idx
  ON public.grocery_errand_events(errand_id, created_at ASC);


-- Purchase evidence uploaded by the runner.
-- The storage key points to the receipt object in SaMi storage.
CREATE TABLE IF NOT EXISTS public.grocery_purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  errand_id uuid NOT NULL
    REFERENCES public.grocery_errand_details(errand_id)
    ON DELETE CASCADE,

  uploaded_by uuid NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,

  storage_key text NOT NULL UNIQUE
    CHECK (length(trim(storage_key)) BETWEEN 1 AND 500),

  receipt_total_amount numeric(12,2)
    CHECK (
      receipt_total_amount IS NULL
      OR receipt_total_amount >= 0
    ),

  currency char(3) NOT NULL DEFAULT 'KES',

  note text
    CHECK (
      note IS NULL
      OR length(trim(note)) <= 1000
    ),

  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grocery_purchase_receipts_errand_idx
  ON public.grocery_purchase_receipts(errand_id, uploaded_at DESC);


-- Application database permissions.
GRANT SELECT, INSERT, UPDATE
  ON public.grocery_errand_details
  TO sami_errands_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.grocery_errand_items
  TO sami_errands_app;

GRANT SELECT, INSERT, UPDATE
  ON public.grocery_item_proposals
  TO sami_errands_app;

GRANT SELECT, INSERT
  ON public.grocery_errand_events
  TO sami_errands_app;

GRANT SELECT, INSERT
  ON public.grocery_purchase_receipts
  TO sami_errands_app;

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-06-sami-runner-grocery-errands')
ON CONFLICT (version) DO NOTHING;
