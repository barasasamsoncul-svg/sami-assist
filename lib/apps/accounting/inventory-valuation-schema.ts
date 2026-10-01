export const ACCOUNTING_INVENTORY_VALUATION_SQL = `
ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS inventory_asset_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cogs_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS inventory_gain_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS inventory_loss_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.accounting_inventory_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  valuation_method VARCHAR(30) NOT NULL DEFAULT 'standard_cost',
  valuation_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  inventory_asset_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  cogs_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  inventory_gain_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  inventory_loss_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  sync_sales_movements BOOLEAN NOT NULL DEFAULT TRUE,
  sync_adjustments BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (valuation_method IN ('standard_cost')),
  CHECK (status IN ('active','archived'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_inventory_settings_active
  ON public.accounting_inventory_settings(company_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_inventory_product_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  inventory_asset_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  cogs_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_inventory_product_mapping
  ON public.accounting_inventory_product_mappings(company_id,product_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_inventory_product_mapping_active
  ON public.accounting_inventory_product_mappings(company_id,active)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_inventory_source_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL,
  source_id UUID NOT NULL,
  source_event_key VARCHAR(255) NOT NULL,
  event_date DATE NOT NULL,
  movement_type VARCHAR(80) NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  quantity_effect NUMERIC(19,4) NOT NULL,
  unit_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  value_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  cost_source VARCHAR(40) NOT NULL DEFAULT 'movement_snapshot',
  cost_estimated BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  posted_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  sync_run_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (source_type IN ('stock_movement','inventory_adjustment')),
  CHECK (cost_source IN ('movement_snapshot','backfill_current_standard_cost')),
  CHECK (status IN ('pending','posted','review','ignored','reversed')),
  CHECK (unit_cost >= 0),
  CHECK (value_amount >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_inventory_source_event
  ON public.accounting_inventory_source_events(company_id,source_event_key)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_inventory_source_status
  ON public.accounting_inventory_source_events(company_id,status,event_date,id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_inventory_source_product
  ON public.accounting_inventory_source_events(company_id,product_id,event_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_inventory_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  backfilled_count INTEGER NOT NULL DEFAULT 0,
  posted_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  generated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('running','completed','completed_with_errors','failed')),
  CHECK (backfilled_count >= 0 AND posted_count >= 0 AND review_count >= 0 AND failed_count >= 0)
);
CREATE INDEX IF NOT EXISTS idx_accounting_inventory_sync_runs
  ON public.accounting_inventory_sync_runs(company_id,started_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.accounting_inventory_source_events
  ADD CONSTRAINT accounting_inventory_source_events_sync_run_id_fkey
  FOREIGN KEY (sync_run_id)
  REFERENCES public.accounting_inventory_sync_runs(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.accounting_inventory_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  valuation_method VARCHAR(30) NOT NULL DEFAULT 'standard_cost',
  stock_value NUMERIC(19,2) NOT NULL DEFAULT 0,
  gl_value NUMERIC(19,2) NOT NULL DEFAULT 0,
  difference_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  adjustment_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  generated_by UUID,
  posted_by UUID,
  reversed_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (valuation_method IN ('standard_cost')),
  CHECK (status IN ('draft','balanced','posted','reversed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_inventory_reconciliation_runs
  ON public.accounting_inventory_reconciliation_runs(company_id,as_of_date DESC,generated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_inventory_reconciliation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.accounting_inventory_reconciliation_runs(id) ON DELETE CASCADE,
  inventory_asset_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  stock_value NUMERIC(19,2) NOT NULL DEFAULT 0,
  gl_value NUMERIC(19,2) NOT NULL DEFAULT 0,
  difference_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  product_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (product_count >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_inventory_reconciliation_line
  ON public.accounting_inventory_reconciliation_lines(company_id,run_id,inventory_asset_account_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.accounting_capture_stock_movement_valuation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cfg RECORD;
  standard_cost NUMERIC(19,4);
  signed_quantity NUMERIC(19,4);
  event_status VARCHAR(20);
BEGIN
  IF NEW.company_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO cfg
  FROM public.accounting_inventory_settings
  WHERE company_id=NEW.company_id
    AND enabled=TRUE
    AND status='active'
    AND deleted_at IS NULL
  LIMIT 1;

  IF cfg.company_id IS NULL OR NEW.created_at::date < cfg.valuation_start_date OR cfg.sync_sales_movements=FALSE THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(cost_price,0)::numeric(19,4)
  INTO standard_cost
  FROM public.products
  WHERE id=NEW.product_id
    AND company_id=NEW.company_id
    AND deleted_at IS NULL
  LIMIT 1;

  IF NEW.movement_type='sales_delivery' THEN
    signed_quantity := -ABS(NEW.quantity);
    event_status := 'pending';
  ELSIF NEW.movement_type='sales_return' THEN
    signed_quantity := ABS(NEW.quantity);
    event_status := 'pending';
  ELSE
    signed_quantity := 0;
    event_status := 'review';
  END IF;

  INSERT INTO public.accounting_inventory_source_events(
    company_id,source_type,source_id,source_event_key,event_date,movement_type,
    product_id,warehouse_id,quantity_effect,unit_cost,value_amount,cost_source,cost_estimated,status,
    metadata,created_by,updated_by
  ) VALUES(
    NEW.company_id,'stock_movement',NEW.id,
    'inventory:stock-movement:'||NEW.id::text,
    NEW.created_at::date,NEW.movement_type,NEW.product_id,NEW.warehouse_id,
    signed_quantity,COALESCE(standard_cost,0),
    ROUND(ABS(signed_quantity)*COALESCE(standard_cost,0),2),
    'movement_snapshot',FALSE,event_status,
    jsonb_build_object('reference',NEW.reference),
    NEW.created_by,NEW.updated_by
  )
  ON CONFLICT(company_id,source_event_key) WHERE deleted_at IS NULL DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.accounting_capture_inventory_adjustment_valuation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cfg RECORD;
  standard_cost NUMERIC(19,4);
BEGIN
  IF NEW.company_id IS NULL OR NEW.deleted_at IS NOT NULL OR NEW.status<>'posted' THEN
    RETURN NEW;
  END IF;

  IF TG_OP='UPDATE' AND OLD.status='posted' THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO cfg
  FROM public.accounting_inventory_settings
  WHERE company_id=NEW.company_id
    AND enabled=TRUE
    AND status='active'
    AND deleted_at IS NULL
  LIMIT 1;

  IF cfg.company_id IS NULL OR COALESCE(NEW.posted_at,NEW.updated_at,NEW.created_at)::date < cfg.valuation_start_date OR cfg.sync_adjustments=FALSE THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(cost_price,0)::numeric(19,4)
  INTO standard_cost
  FROM public.products
  WHERE id=NEW.product_id
    AND company_id=NEW.company_id
    AND deleted_at IS NULL
  LIMIT 1;

  INSERT INTO public.accounting_inventory_source_events(
    company_id,source_type,source_id,source_event_key,event_date,movement_type,
    product_id,warehouse_id,quantity_effect,unit_cost,value_amount,cost_source,cost_estimated,status,
    metadata,created_by,updated_by
  ) VALUES(
    NEW.company_id,'inventory_adjustment',NEW.id,
    'inventory:adjustment:'||NEW.id::text,
    COALESCE(NEW.posted_at,NEW.updated_at,NEW.created_at)::date,
    CASE WHEN NEW.difference_quantity>=0 THEN 'inventory_adjustment_gain' ELSE 'inventory_adjustment_loss' END,
    NEW.product_id,NEW.warehouse_id,NEW.difference_quantity,
    COALESCE(standard_cost,0),
    ROUND(ABS(NEW.difference_quantity)*COALESCE(standard_cost,0),2),
    'movement_snapshot',FALSE,
    CASE WHEN NEW.difference_quantity=0 THEN 'ignored' ELSE 'pending' END,
    jsonb_build_object('adjustmentNumber',NEW.adjustment_number,'reason',NEW.reason),
    NEW.created_by,NEW.updated_by
  )
  ON CONFLICT(company_id,source_event_key) WHERE deleted_at IS NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounting_capture_stock_movement_valuation ON public.stock_movements;
CREATE TRIGGER trg_accounting_capture_stock_movement_valuation
AFTER INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.accounting_capture_stock_movement_valuation();

DROP TRIGGER IF EXISTS trg_accounting_capture_inventory_adjustment_valuation ON public.inventory_adjustments;
CREATE TRIGGER trg_accounting_capture_inventory_adjustment_valuation
AFTER INSERT OR UPDATE OF status ON public.inventory_adjustments
FOR EACH ROW
EXECUTE FUNCTION public.accounting_capture_inventory_adjustment_valuation();
`;
