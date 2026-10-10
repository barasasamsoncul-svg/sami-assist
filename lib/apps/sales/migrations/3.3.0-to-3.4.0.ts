import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.sales_pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    code VARCHAR(60),
    name VARCHAR(120) NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 10,
    probability NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    stage_type VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (stage_type IN ('open','won','lost')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, name)
  );

  ALTER TABLE public.sales_pipeline_stages
    ADD COLUMN IF NOT EXISTS code VARCHAR(60);

  ALTER TABLE public.sales_pipeline_stages
    ADD COLUMN IF NOT EXISTS is_won BOOLEAN NOT NULL DEFAULT FALSE;

  ALTER TABLE public.sales_pipeline_stages
    ADD COLUMN IF NOT EXISTS is_lost BOOLEAN NOT NULL DEFAULT FALSE;

  ALTER TABLE public.sales_pipeline_stages
    ADD COLUMN IF NOT EXISTS fold_in_kanban BOOLEAN NOT NULL DEFAULT FALSE;

  ALTER TABLE public.sales_pipeline_stages
    ADD COLUMN IF NOT EXISTS description TEXT;

  ALTER TABLE public.sales_pipeline_stages
    ADD COLUMN IF NOT EXISTS color VARCHAR(20);

  ALTER TABLE public.sales_pipeline_stages
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pipeline_stages_code
    ON public.sales_pipeline_stages(company_id, LOWER(BTRIM(code)))
    WHERE deleted_at IS NULL AND code IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_pipeline_stages_company
    ON public.sales_pipeline_stages(company_id, is_active, sequence, name);

  CREATE TABLE IF NOT EXISTS public.sales_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    lead_number VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'new'
      CHECK (status IN ('new','contacted','qualified','disqualified','converted')),
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    contact_name VARCHAR(255),
    email VARCHAR(320),
    phone VARCHAR(80),
    source VARCHAR(120),
    notes TEXT,
    salesperson_user_id UUID,
    sales_team_id UUID,
    territory_id UUID,
    converted_opportunity_id UUID,
    disqualification_reason TEXT,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_leads_number
    ON public.sales_leads(company_id, lead_number) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_sales_leads_company_status
    ON public.sales_leads(company_id, status, created_at DESC) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    opportunity_number VARCHAR(100) NOT NULL,
    lead_id UUID REFERENCES public.sales_leads(id) ON DELETE SET NULL,
    billing_customer_id UUID,
    stage_id UUID NOT NULL REFERENCES public.sales_pipeline_stages(id),
    name VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255),
    contact_name VARCHAR(255),
    email VARCHAR(320),
    phone VARCHAR(80),
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    expected_value NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (expected_value >= 0),
    probability NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    expected_close_date DATE,
    salesperson_user_id UUID,
    sales_team_id UUID,
    territory_id UUID,
    source VARCHAR(120),
    notes TEXT,
    won_at TIMESTAMPTZ,
    lost_at TIMESTAMPTZ,
    lost_reason TEXT,
    latest_quote_id UUID REFERENCES public.sales_quotes(id) ON DELETE SET NULL,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_opportunities_number
    ON public.sales_opportunities(company_id, opportunity_number) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_sales_opportunities_pipeline
    ON public.sales_opportunities(company_id, stage_id, expected_close_date)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_opportunity_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    opportunity_id UUID NOT NULL REFERENCES public.sales_opportunities(id) ON DELETE CASCADE,
    from_stage_id UUID REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL,
    to_stage_id UUID NOT NULL REFERENCES public.sales_pipeline_stages(id),
    probability NUMERIC(5,2) NOT NULL,
    reason TEXT,
    changed_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sales_opportunity_stage_history
    ON public.sales_opportunity_stage_history(opportunity_id, created_at DESC);

  ALTER TABLE public.sales_sequences DROP CONSTRAINT IF EXISTS sales_sequences_document_type_check;
  ALTER TABLE public.sales_sequences ADD CONSTRAINT sales_sequences_document_type_check
    CHECK (document_type IN ('quote','order','shipment','return','lead','opportunity'));

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES public.sales_opportunities(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_quotes_opportunity
    ON public.sales_quotes(company_id, opportunity_id) WHERE opportunity_id IS NOT NULL AND deleted_at IS NULL;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS expected_close_date DATE;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS probability_override NUMERIC(5,2)
      CHECK (
        probability_override IS NULL
        OR (probability_override >= 0 AND probability_override <= 100)
      );

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS last_stage_change_at TIMESTAMPTZ;

  CREATE INDEX IF NOT EXISTS idx_sales_quotes_stage
    ON public.sales_quotes(company_id, stage_id, quote_date DESC)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_quotes_expected_close
    ON public.sales_quotes(company_id, expected_close_date)
    WHERE deleted_at IS NULL AND expected_close_date IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.sales_quote_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
    from_stage_id UUID REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL,
    to_stage_id UUID REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL,
    from_probability NUMERIC(5,2),
    to_probability NUMERIC(5,2),
    reason TEXT,
    changed_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sales_quote_stage_history_quote
    ON public.sales_quote_stage_history(company_id, quote_id, created_at DESC);

  INSERT INTO public.sales_pipeline_stages (
    company_id,
    code,
    name,
    sequence,
    probability,
    stage_type,
    is_won,
    is_lost,
    fold_in_kanban,
    description
  )
  SELECT
    companies.company_id,
    stage.code,
    stage.name,
    stage.sequence,
    stage.probability,
    stage.stage_type,
    stage.is_won,
    stage.is_lost,
    stage.fold_in_kanban,
    'Seeded on upgrade to Sales 3.4.0'
  FROM (
    SELECT DISTINCT company_id
    FROM public.sales_quotes
  ) companies
  CROSS JOIN (
    VALUES
      ('draft',     'Draft',     10,  10.00, 'open', FALSE, FALSE, FALSE),
      ('sent',      'Sent',      20,  30.00, 'open', FALSE, FALSE, FALSE),
      ('viewed',    'Viewed',    30,  50.00, 'open', FALSE, FALSE, FALSE),
      ('accepted',  'Accepted',  40,  80.00, 'open', FALSE, FALSE, TRUE),
      ('converted', 'Converted', 50, 100.00, 'won',  TRUE,  FALSE, TRUE)
  ) AS stage(code, name, sequence, probability, stage_type, is_won, is_lost, fold_in_kanban)
  ON CONFLICT (company_id, name) DO NOTHING;

  UPDATE public.sales_pipeline_stages
  SET
    is_won = TRUE
  WHERE
    stage_type = 'won'
    AND is_won = FALSE;

  UPDATE public.sales_pipeline_stages
  SET
    is_lost = TRUE
  WHERE
    stage_type = 'lost'
    AND is_lost = FALSE;

  UPDATE public.sales_quotes quote
  SET
    stage_id = stage.id,
    stage_entered_at =
      COALESCE(quote.stage_entered_at, quote.updated_at, quote.created_at),
    last_stage_change_at =
      COALESCE(quote.last_stage_change_at, quote.updated_at, quote.created_at)
  FROM public.sales_pipeline_stages stage
  WHERE
    quote.stage_id IS NULL
    AND stage.company_id = quote.company_id
    AND stage.deleted_at IS NULL
    AND LOWER(BTRIM(stage.code)) = LOWER(BTRIM(quote.status));
`;


export const SALES_3_3_0_TO_3_4_0:
  SamiModuleMigrationDefinition = {
    key:
      'sales-3.3.0-to-3.4.0',
    moduleKey:
      'sales',
    namespace:
      'sales',
    fromVersion:
      '3.3.0',
    toVersion:
      '3.4.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };