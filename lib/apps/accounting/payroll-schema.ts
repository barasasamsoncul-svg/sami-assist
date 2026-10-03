export const ACCOUNTING_PAYROLL_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_payroll_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  salary_expense_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  net_payable_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  deductions_payable_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  employer_cost_expense_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  employer_cost_payable_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  require_employee_dimension_mapping BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.accounting_payroll_component_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  component_code VARCHAR(120) NOT NULL,
  component_name VARCHAR(255),
  component_type VARCHAR(30) NOT NULL,
  debit_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  credit_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (component_type IN ('earning','deduction','statutory','employer_cost'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_payroll_component_mapping
  ON public.accounting_payroll_component_mappings(company_id,LOWER(component_code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_payroll_component_mapping_active
  ON public.accounting_payroll_component_mappings(company_id,component_type,enabled)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_payroll_employee_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_employee_id UUID NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE RESTRICT,
  analytic_project_id UUID REFERENCES public.accounting_analytic_projects(id) ON DELETE RESTRICT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (department_id IS NOT NULL OR analytic_project_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_payroll_employee_dimension
  ON public.accounting_payroll_employee_dimensions(company_id,payroll_employee_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_payroll_employee_dimension_department
  ON public.accounting_payroll_employee_dimensions(company_id,department_id)
  WHERE deleted_at IS NULL AND department_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.accounting_payroll_run_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL,
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  total_gross NUMERIC(19,2) NOT NULL,
  total_deductions NUMERIC(19,2) NOT NULL,
  total_net NUMERIC(19,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'posted',
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  posted_by UUID,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversed_by UUID,
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('posted','reversed')),
  CHECK (total_gross >= 0 AND total_deductions >= 0 AND total_net >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_payroll_run_posting
  ON public.accounting_payroll_run_postings(company_id,payroll_run_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_payroll_posting_request
  ON public.accounting_payroll_run_postings(company_id,request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_payroll_run_posting_status
  ON public.accounting_payroll_run_postings(company_id,status,posted_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_payroll_run_posting_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_posting_id UUID NOT NULL REFERENCES public.accounting_payroll_run_postings(id) ON DELETE CASCADE,
  payroll_employee_id UUID NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE RESTRICT,
  analytic_project_id UUID REFERENCES public.accounting_analytic_projects(id) ON DELETE RESTRICT,
  gross_amount NUMERIC(19,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (gross_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_accounting_payroll_run_allocation_posting
  ON public.accounting_payroll_run_posting_allocations(company_id,run_posting_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_payroll_run_allocation_dimension
  ON public.accounting_payroll_run_posting_allocations(company_id,department_id,analytic_project_id)
  WHERE deleted_at IS NULL;
`;
