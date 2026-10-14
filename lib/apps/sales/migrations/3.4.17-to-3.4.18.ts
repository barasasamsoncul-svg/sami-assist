import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  CREATE TABLE IF NOT EXISTS public.sales_pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 10,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pipelines_company_name
    ON public.sales_pipelines(company_id, LOWER(BTRIM(name)))
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pipelines_company_default
    ON public.sales_pipelines(company_id)
    WHERE is_default=TRUE AND is_active=TRUE AND deleted_at IS NULL;

  ALTER TABLE public.sales_pipeline_stages
    ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.sales_pipelines(id);

  INSERT INTO public.sales_pipelines (company_id, name, sequence, is_default, is_active)
  SELECT companies.company_id, 'Sales Pipeline', 10, TRUE, TRUE
  FROM (
    SELECT company_id FROM public.sales_pipeline_stages
    UNION
    SELECT company_id FROM public.sales_opportunities
    UNION
    SELECT company_id FROM public.sales_leads
  ) AS companies
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.sales_pipelines p
    WHERE p.company_id=companies.company_id
      AND p.is_default=TRUE
      AND p.is_active=TRUE
      AND p.deleted_at IS NULL
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.sales_pipeline_stages AS stage
  SET pipeline_id=p.id
  FROM public.sales_pipelines AS p
  WHERE p.company_id=stage.company_id
    AND p.is_default=TRUE
    AND p.is_active=TRUE
    AND p.deleted_at IS NULL
    AND stage.pipeline_id IS NULL;

  ALTER TABLE public.sales_pipeline_stages
    ALTER COLUMN pipeline_id SET NOT NULL;

  ALTER TABLE public.sales_pipeline_stages
    DROP CONSTRAINT IF EXISTS sales_pipeline_stages_company_id_name_key;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pipeline_stages_company_pipeline_name
    ON public.sales_pipeline_stages(company_id, pipeline_id, LOWER(BTRIM(name)));

  CREATE INDEX IF NOT EXISTS idx_sales_pipeline_stages_pipeline
    ON public.sales_pipeline_stages(company_id, pipeline_id, is_active, sequence, name);

  CREATE INDEX IF NOT EXISTS idx_sales_pipelines_company_active
    ON public.sales_pipelines(company_id, is_active, sequence, LOWER(name))
    WHERE deleted_at IS NULL;

  INSERT INTO public.sales_pipeline_stages
    (company_id, pipeline_id, name, sequence, probability, stage_type, is_active)
  SELECT p.company_id, p.id, seed.name, seed.sequence, seed.probability, seed.stage_type, TRUE
  FROM public.sales_pipelines p
  CROSS JOIN (
    VALUES
      ('Qualification',10,20,'open'),
      ('Proposal',20,50,'open'),
      ('Negotiation',30,75,'open'),
      ('Won',90,100,'won'),
      ('Lost',100,0,'lost')
  ) AS seed(name, sequence, probability, stage_type)
  WHERE p.is_default=TRUE
    AND p.is_active=TRUE
    AND p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.sales_pipeline_stages existing
      WHERE existing.company_id=p.company_id
        AND existing.pipeline_id=p.id
    )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.sales_pipeline_stages
    (company_id, pipeline_id, name, sequence, probability, stage_type, is_active)
  SELECT p.company_id, p.id, 'Won', 90, 100, 'won', TRUE
  FROM public.sales_pipelines p
  WHERE p.is_active=TRUE AND p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.company_id=p.company_id AND s.pipeline_id=p.id
        AND LOWER(BTRIM(s.name))='won'
    )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.sales_pipeline_stages
    (company_id, pipeline_id, name, sequence, probability, stage_type, is_active)
  SELECT p.company_id, p.id, 'Lost', 100, 0, 'lost', TRUE
  FROM public.sales_pipelines p
  WHERE p.is_active=TRUE AND p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.sales_pipeline_stages s
      WHERE s.company_id=p.company_id AND s.pipeline_id=p.id
        AND LOWER(BTRIM(s.name))='lost'
    )
  ON CONFLICT DO NOTHING;
`;

export const SALES_3_4_17_TO_3_4_18:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.17-to-3.4.18',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.17',
    toVersion: '3.4.18',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
