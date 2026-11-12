-- SaMi Runner has exactly two service types:
-- 1. Pick Up & Deliver
-- 2. Shop & Deliver
--
-- Legacy selections are archived before conversion. Only clearly equivalent
-- legacy categories are mapped to the new service types:
-- - pickup_delivery and food_delivery -> pickup_deliver
-- - groceries, shopping, shopping_gifts and clothing_retail -> shop_deliver
-- Other legacy categories remain in the history table and are not carried
-- forward as active Runner services.

BEGIN;

-- Preserve the original service selections for audit and rollback reference.
CREATE TABLE IF NOT EXISTS public.runner_account_service_category_history (
  runner_id uuid NOT NULL
    REFERENCES public.runner_accounts(id) ON DELETE CASCADE,
  category_key text NOT NULL,
  selected_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  migration_version text NOT NULL,
  PRIMARY KEY (runner_id, category_key, migration_version)
);

INSERT INTO public.runner_account_service_category_history (
  runner_id,
  category_key,
  selected_at,
  migration_version
)
SELECT
  runner_id,
  category_key,
  selected_at,
  '2026-11-13-runner-two-service-types'
FROM public.runner_account_service_categories
WHERE category_key NOT IN ('pickup_deliver', 'shop_deliver')
ON CONFLICT (runner_id, category_key, migration_version) DO NOTHING;

-- Register the only two services that a Runner may select.
INSERT INTO public.runner_service_categories (
  category_key,
  label,
  description,
  display_order,
  is_active
)
VALUES
  (
    'pickup_deliver',
    'Pick Up & Deliver',
    'Collect a customer-specified item from its pickup location and deliver it to the requested destination.',
    10,
    true
  ),
  (
    'shop_deliver',
    'Shop & Deliver',
    'Purchase the items requested by the customer and deliver them to the requested destination.',
    20,
    true
  )
ON CONFLICT (category_key)
DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  is_active = true,
  updated_at = now();

-- Convert only legacy categories whose meaning clearly matches one of the
-- two new services. Multiple legacy selections collapse into one service.
INSERT INTO public.runner_account_service_categories (
  runner_id,
  category_key,
  selected_at
)
SELECT
  runner_id,
  CASE
    WHEN category_key IN ('pickup_delivery', 'food_delivery')
      THEN 'pickup_deliver'
    WHEN category_key IN (
      'groceries',
      'shopping',
      'shopping_gifts',
      'clothing_retail'
    )
      THEN 'shop_deliver'
  END AS new_category_key,
  min(selected_at) AS selected_at
FROM public.runner_account_service_categories
WHERE category_key IN (
  'pickup_delivery',
  'food_delivery',
  'groceries',
  'shopping',
  'shopping_gifts',
  'clothing_retail'
)
GROUP BY
  runner_id,
  CASE
    WHEN category_key IN ('pickup_delivery', 'food_delivery')
      THEN 'pickup_deliver'
    WHEN category_key IN (
      'groceries',
      'shopping',
      'shopping_gifts',
      'clothing_retail'
    )
      THEN 'shop_deliver'
  END
ON CONFLICT (runner_id, category_key)
DO UPDATE SET
  selected_at = LEAST(
    public.runner_account_service_categories.selected_at,
    EXCLUDED.selected_at
  );

-- Remove legacy values from the active selection relation only after they
-- have been archived and any supported selections have been converted.
DELETE FROM public.runner_account_service_categories
WHERE category_key NOT IN ('pickup_deliver', 'shop_deliver');

-- Category-specific document rules belonged to the retired broad errand
-- catalogue. Identity and transport requirements (category_key IS NULL)
-- remain active for both new service types.
UPDATE public.runner_onboarding_document_requirements
SET
  is_active = false,
  updated_at = now()
WHERE category_key IS NOT NULL
  AND category_key NOT IN ('pickup_deliver', 'shop_deliver');

-- Retire every old catalogue entry without deleting referenced rows.
UPDATE public.runner_service_categories
SET
  is_active = (category_key IN ('pickup_deliver', 'shop_deliver')),
  updated_at = now()
WHERE is_active IS DISTINCT FROM
  (category_key IN ('pickup_deliver', 'shop_deliver'));

-- Protect the catalogue: no other service key may be made active.
ALTER TABLE public.runner_service_categories
  DROP CONSTRAINT IF EXISTS runner_service_categories_active_type_check;

ALTER TABLE public.runner_service_categories
  ADD CONSTRAINT runner_service_categories_active_type_check
  CHECK (
    NOT is_active
    OR category_key IN ('pickup_deliver', 'shop_deliver')
  );

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-13-runner-two-service-types')
ON CONFLICT (version) DO NOTHING;

COMMIT;
