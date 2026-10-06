import 'server-only';

import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';

const SQL = `
  CREATE TABLE IF NOT EXISTS public.sales_pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
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
`;

export const SALES_3_3_0_TO_3_4_0: SamiModuleMigrationDefinition = {
  key: 'sales-3.3.0-to-3.4.0',
  moduleKey: 'sales',
  namespace: 'sales',
  fromVersion: '3.3.0',
  toVersion: '3.4.0',
  run: async client => executeSafeSamiModuleMigrationSql(client, SQL),
};
