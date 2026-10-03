export const ACCOUNTING_DIMENSIONS_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_dimension_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  require_department_on_expense BOOLEAN NOT NULL DEFAULT FALSE,
  require_project_on_income BOOLEAN NOT NULL DEFAULT FALSE,
  auto_apply_rules BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.accounting_analytic_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_project_id UUID,
  code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  starts_on DATE,
  ends_on DATE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('open','closed','archived')),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_analytic_project_source
  ON public.accounting_analytic_projects(company_id,source_project_id)
  WHERE source_project_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_analytic_project_code
  ON public.accounting_analytic_projects(company_id,LOWER(code))
  WHERE code IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_analytic_project_status
  ON public.accounting_analytic_projects(company_id,status,name)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_dimension_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  source_module VARCHAR(80),
  department_id UUID REFERENCES public.departments(id) ON DELETE RESTRICT,
  analytic_project_id UUID REFERENCES public.accounting_analytic_projects(id) ON DELETE RESTRICT,
  basis_points INTEGER NOT NULL DEFAULT 10000,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (basis_points BETWEEN 1 AND 10000),
  CHECK (priority BETWEEN 1 AND 100000),
  CHECK (department_id IS NOT NULL OR analytic_project_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_accounting_dimension_rules_match
  ON public.accounting_dimension_rules(company_id,enabled,account_id,source_module,priority)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_journal_line_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  journal_line_id UUID NOT NULL REFERENCES public.journal_lines(id) ON DELETE CASCADE,
  allocation_set_id UUID NOT NULL,
  revision_number INTEGER NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE RESTRICT,
  analytic_project_id UUID REFERENCES public.accounting_analytic_projects(id) ON DELETE RESTRICT,
  basis_points INTEGER NOT NULL,
  line_net_amount NUMERIC(19,2) NOT NULL,
  allocation_amount NUMERIC(19,2) NOT NULL,
  origin VARCHAR(20) NOT NULL DEFAULT 'manual',
  rule_id UUID REFERENCES public.accounting_dimension_rules(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (revision_number > 0),
  CHECK (basis_points BETWEEN 1 AND 10000),
  CHECK (department_id IS NOT NULL OR analytic_project_id IS NOT NULL),
  CHECK (origin IN ('manual','rule','reversal','import'))
);

CREATE INDEX IF NOT EXISTS idx_accounting_line_dimensions_active
  ON public.accounting_journal_line_dimensions(company_id,journal_line_id,revision_number)
  WHERE active=TRUE;

CREATE INDEX IF NOT EXISTS idx_accounting_line_dimensions_department
  ON public.accounting_journal_line_dimensions(company_id,department_id,journal_line_id)
  WHERE active=TRUE AND department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_line_dimensions_project
  ON public.accounting_journal_line_dimensions(company_id,analytic_project_id,journal_line_id)
  WHERE active=TRUE AND analytic_project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.accounting_dimension_budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.accounting_budget_versions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE RESTRICT,
  analytic_project_id UUID REFERENCES public.accounting_analytic_projects(id) ON DELETE RESTRICT,
  amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (department_id IS NOT NULL OR analytic_project_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_dimension_budget_line
  ON public.accounting_dimension_budget_lines(
    company_id,
    version_id,
    account_id,
    period_start,
    COALESCE(department_id,'00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(analytic_project_id,'00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_dimension_budget_reporting
  ON public.accounting_dimension_budget_lines(company_id,period_start,department_id,analytic_project_id)
  WHERE deleted_at IS NULL;
`;
