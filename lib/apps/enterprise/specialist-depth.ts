import 'server-only';

import {
  isSpecialistEnterpriseModuleKey,
  type SpecialistEnterpriseModuleKey,
} from '@/lib/apps/enterprise/specialist-catalog';

import {
  financeSpecialistDepthSql,
} from '@/lib/apps/enterprise/specialist-finance-depth';

import {
  peopleSpecialistDepthSql,
} from '@/lib/apps/enterprise/specialist-people-depth';


import {
  specialistBreadthDepthSql,
} from '@/lib/apps/enterprise/specialist-breadth-depth';


import {
  commerceParityDepthSql,
} from '@/lib/apps/enterprise/strict-parity-commerce-depth';

import {
  peopleMarketingParityDepthSql,
} from '@/lib/apps/enterprise/strict-parity-people-marketing-depth';




function accountingSql() {
  return `
CREATE TABLE IF NOT EXISTS public.accounting_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year_start_month SMALLINT NOT NULL DEFAULT 1,
  fiscal_year_start_day SMALLINT NOT NULL DEFAULT 1,
  default_receivable_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_payable_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  retained_earnings_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  output_tax_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  input_tax_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_cash_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  fx_gain_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  fx_loss_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  write_off_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  rounding_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  rounding_method VARCHAR(30) NOT NULL DEFAULT 'half_up',
  global_lock_date DATE,
  lock_posted_entries BOOLEAN NOT NULL DEFAULT TRUE,
  require_open_period BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  CHECK (fiscal_year_start_day BETWEEN 1 AND 31),
  CHECK (rounding_method IN ('half_up','half_even'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_settings_active
  ON public.accounting_settings(company_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  lock_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (ends_on >= starts_on),
  CHECK (status IN ('open','closing','closed'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_fiscal_periods_company
  ON public.accounting_fiscal_periods(company_id, starts_on, ends_on)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ledger_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  name VARCHAR(160) NOT NULL,
  bank_name VARCHAR(160),
  account_number_last4 VARCHAR(4),
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  opening_balance NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','inactive','closed'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_bank_accounts_company
  ON public.accounting_bank_accounts(company_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES public.accounting_bank_accounts(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  description TEXT,
  external_reference VARCHAR(255),
  amount NUMERIC(19,4) NOT NULL,
  matched_journal_line_id UUID REFERENCES public.journal_lines(id) ON DELETE SET NULL,
  reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'unmatched',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (reconciliation_status IN ('unmatched','suggested','matched','excluded'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_statement_company_status
  ON public.accounting_bank_statement_lines(company_id, reconciliation_status, transaction_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_reconciliation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  match_text VARCHAR(255),
  min_amount NUMERIC(19,4),
  max_amount NUMERIC(19,4),
  target_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  priority INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (priority >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_reconciliation_rules_company
  ON public.accounting_reconciliation_rules(company_id, priority)
  WHERE deleted_at IS NULL;
`;
}


function inventorySql() {
  return `
CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_number VARCHAR(160) NOT NULL,
  manufactured_on DATE,
  expires_on DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (expires_on IS NULL OR manufactured_on IS NULL OR expires_on >= manufactured_on),
  CHECK (status IN ('active','quarantined','expired','consumed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_lots_company_product_number
  ON public.inventory_lots(company_id, product_id, lot_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  quantity NUMERIC(19,4) NOT NULL,
  source_type VARCHAR(80),
  source_reference VARCHAR(160),
  required_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (quantity > 0),
  CHECK (status IN ('active','allocated','consumed','released','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_company_product
  ON public.stock_reservations(company_id, product_id, warehouse_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_reorder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  min_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  max_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  reorder_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (min_quantity >= 0),
  CHECK (max_quantity >= min_quantity),
  CHECK (reorder_quantity >= 0),
  CHECK (lead_time_days >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reorder_company_product_warehouse
  ON public.inventory_reorder_rules(company_id, product_id, warehouse_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  adjustment_number VARCHAR(100) NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  counted_quantity NUMERIC(19,4) NOT NULL,
  system_quantity NUMERIC(19,4) NOT NULL,
  difference_quantity NUMERIC(19,4) NOT NULL,
  reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (counted_quantity >= 0),
  CHECK (system_quantity >= 0),
  CHECK (status IN ('draft','submitted','approved','posted','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_adjustment_number
  ON public.inventory_adjustments(company_id, adjustment_number)
  WHERE deleted_at IS NULL;
`;
}


function warehouseSql() {
  return `
CREATE TABLE IF NOT EXISTS public.warehouse_putaway_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_reference UUID,
  source_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  destination_location_id UUID NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (priority >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_warehouse_putaway_rules_company
  ON public.warehouse_putaway_rules(company_id, priority)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_picking_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_number VARCHAR(100) NOT NULL,
  assigned_user_id UUID,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','ready','in_progress','completed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_picking_batch_number
  ON public.warehouse_picking_batches(company_id, batch_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_picking_batch_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.warehouse_picking_batches(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL REFERENCES public.warehouse_operations(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence > 0),
  CHECK (status IN ('active','completed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_batch_operation
  ON public.warehouse_picking_batch_operations(company_id, batch_id, operation_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  package_number VARCHAR(120) NOT NULL,
  current_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  weight NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (weight >= 0),
  CHECK (status IN ('open','packed','in_transit','delivered','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_package_number
  ON public.warehouse_packages(company_id, package_number)
  WHERE deleted_at IS NULL;
`;
}


function payrollSql() {
  return `
CREATE TABLE IF NOT EXISTS public.payroll_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  component_type VARCHAR(30) NOT NULL,
  calculation_type VARCHAR(30) NOT NULL DEFAULT 'fixed',
  default_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  percentage_rate NUMERIC(9,4) NOT NULL DEFAULT 0,
  taxable BOOLEAN NOT NULL DEFAULT TRUE,
  statutory BOOLEAN NOT NULL DEFAULT FALSE,
  sequence INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (component_type IN ('earning','deduction','employer_contribution')),
  CHECK (calculation_type IN ('fixed','percentage')),
  CHECK (default_amount >= 0),
  CHECK (percentage_rate >= 0 AND percentage_rate <= 100),
  CHECK (sequence >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_component_code
  ON public.payroll_components(company_id, code)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payroll_employee_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.payroll_components(id) ON DELETE RESTRICT,
  amount_override NUMERIC(19,4),
  percentage_override NUMERIC(9,4),
  effective_from DATE,
  effective_to DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount_override IS NULL OR amount_override >= 0),
  CHECK (percentage_override IS NULL OR (percentage_override >= 0 AND percentage_override <= 100)),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_payroll_employee_components_employee
  ON public.payroll_employee_components(company_id, payroll_employee_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  payroll_employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE RESTRICT,
  payslip_number VARCHAR(120) NOT NULL,
  gross_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  deduction_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  employer_contribution_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  net_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (gross_amount >= 0),
  CHECK (deduction_amount >= 0),
  CHECK (employer_contribution_amount >= 0),
  CHECK (net_amount >= 0),
  CHECK (status IN ('draft','computed','approved','paid','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payslip_number
  ON public.payslips(company_id, payslip_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payslip_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payslip_id UUID NOT NULL REFERENCES public.payslips(id) ON DELETE CASCADE,
  component_id UUID REFERENCES public.payroll_components(id) ON DELETE SET NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  line_type VARCHAR(30) NOT NULL,
  quantity NUMERIC(19,4) NOT NULL DEFAULT 1,
  rate NUMERIC(19,4) NOT NULL DEFAULT 1,
  amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (line_type IN ('earning','deduction','employer_contribution')),
  CHECK (quantity >= 0),
  CHECK (rate >= 0),
  CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_payslip_lines_payslip
  ON public.payslip_lines(company_id, payslip_id)
  WHERE deleted_at IS NULL;
`;
}


function crmSql() {
  return `
CREATE TABLE IF NOT EXISTS public.crm_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type VARCHAR(30) NOT NULL DEFAULT 'opportunity',
  name VARCHAR(120) NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 100,
  probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (entity_type IN ('lead','opportunity')),
  CHECK (sequence >= 0),
  CHECK (probability >= 0 AND probability <= 100),
  CHECK (NOT (is_won AND is_lost)),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_crm_stages_company_entity
  ON public.crm_stages(company_id, entity_type, sequence)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  field_key VARCHAR(120) NOT NULL,
  operator VARCHAR(30) NOT NULL,
  comparison_value TEXT,
  score_delta INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (operator IN ('equals','contains','greater_than','less_than','is_set')),
  CHECK (priority >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_crm_scoring_rules_company
  ON public.crm_scoring_rules(company_id, priority)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  owner_reference UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (target_amount >= 0),
  CHECK (status IN ('draft','active','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_crm_forecasts_company_period
  ON public.crm_forecasts(company_id, period_start, period_end)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_forecast_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  forecast_id UUID NOT NULL REFERENCES public.crm_forecasts(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  forecast_category VARCHAR(30) NOT NULL DEFAULT 'pipeline',
  amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  weighted_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (forecast_category IN ('pipeline','best_case','commit','closed')),
  CHECK (amount >= 0),
  CHECK (probability >= 0 AND probability <= 100),
  CHECK (weighted_amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_crm_forecast_lines_forecast
  ON public.crm_forecast_lines(company_id, forecast_id)
  WHERE deleted_at IS NULL;
`;
}


function projectsSql() {
  return `
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(30) NOT NULL DEFAULT 'finish_to_start',
  lag_days INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (task_id <> depends_on_task_id),
  CHECK (dependency_type IN ('finish_to_start','start_to_start','finish_to_finish','start_to_finish')),
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_dependencies_pair
  ON public.task_dependencies(company_id, task_id, depends_on_task_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.project_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  budget_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  approved_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (budget_amount >= 0),
  CHECK (approved_amount >= 0),
  CHECK (status IN ('draft','submitted','approved','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_project_budgets_project
  ON public.project_budgets(company_id, project_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.project_budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.project_budgets(id) ON DELETE CASCADE,
  category VARCHAR(120) NOT NULL,
  planned_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  committed_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (planned_amount >= 0),
  CHECK (actual_amount >= 0),
  CHECK (committed_amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_project_budget_lines_budget
  ON public.project_budget_lines(company_id, budget_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.project_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  resource_type VARCHAR(30) NOT NULL DEFAULT 'user',
  resource_reference UUID,
  role_name VARCHAR(120),
  allocation_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
  hourly_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  starts_on DATE,
  ends_on DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (resource_type IN ('user','equipment','vendor')),
  CHECK (allocation_percent >= 0 AND allocation_percent <= 100),
  CHECK (hourly_cost >= 0),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_project_resources_project
  ON public.project_resources(company_id, project_id, status)
  WHERE deleted_at IS NULL;
`;
}


function helpdeskSql() {
  return `
CREATE TABLE IF NOT EXISTS public.helpdesk_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  priority VARCHAR(30),
  first_response_minutes INTEGER NOT NULL DEFAULT 60,
  resolution_minutes INTEGER NOT NULL DEFAULT 480,
  business_hours_only BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (first_response_minutes > 0),
  CHECK (resolution_minutes > 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_helpdesk_sla_policies_company
  ON public.helpdesk_sla_policies(company_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.ticket_sla_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sla_policy_id UUID REFERENCES public.helpdesk_sla_policies(id) ON DELETE SET NULL,
  first_response_due_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  resolution_due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  breached_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','met','breached','paused','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_sla_tracking_ticket
  ON public.ticket_sla_tracking(company_id, ticket_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  summary TEXT,
  body TEXT NOT NULL,
  category VARCHAR(120),
  published_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','published','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_article_slug
  ON public.knowledge_articles(company_id, slug)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.ticket_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  escalated_to UUID,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('open','acknowledged','resolved','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_escalations_ticket
  ON public.ticket_escalations(company_id, ticket_id, status)
  WHERE deleted_at IS NULL;
`;
}


function manufacturingSql() {
  return `
CREATE TABLE IF NOT EXISTS public.work_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  capacity NUMERIC(19,4) NOT NULL DEFAULT 1,
  cost_per_hour NUMERIC(19,4) NOT NULL DEFAULT 0,
  efficiency_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (capacity > 0),
  CHECK (cost_per_hour >= 0),
  CHECK (efficiency_percent > 0 AND efficiency_percent <= 100),
  CHECK (status IN ('active','maintenance','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_center_code
  ON public.work_centers(company_id, code)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.manufacturing_routings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bom_id UUID REFERENCES public.boms(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  version VARCHAR(50),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','active','archived'))
);
CREATE INDEX IF NOT EXISTS idx_manufacturing_routings_bom
  ON public.manufacturing_routings(company_id, bom_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.manufacturing_routing_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  routing_id UUID NOT NULL REFERENCES public.manufacturing_routings(id) ON DELETE CASCADE,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  operation_name VARCHAR(200) NOT NULL,
  setup_minutes NUMERIC(19,4) NOT NULL DEFAULT 0,
  run_minutes_per_unit NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence > 0),
  CHECK (setup_minutes >= 0),
  CHECK (run_minutes_per_unit >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_manufacturing_routing_steps_routing
  ON public.manufacturing_routing_steps(company_id, routing_id, sequence)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.manufacturing_material_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  manufacturing_order_id UUID NOT NULL REFERENCES public.manufacturing_orders(id) ON DELETE CASCADE,
  component_product_id UUID,
  required_quantity NUMERIC(19,4) NOT NULL,
  reserved_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  consumed_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  warehouse_reference UUID,
  lot_reference VARCHAR(160),
  status VARCHAR(30) NOT NULL DEFAULT 'required',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (required_quantity > 0),
  CHECK (reserved_quantity >= 0),
  CHECK (consumed_quantity >= 0),
  CHECK (reserved_quantity <= required_quantity),
  CHECK (consumed_quantity <= required_quantity),
  CHECK (status IN ('required','reserved','partially_reserved','consumed','released','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_manufacturing_material_reservations_order
  ON public.manufacturing_material_reservations(company_id, manufacturing_order_id, status)
  WHERE deleted_at IS NULL;
`;
}


export function specialistDepthSql(
  moduleKey:
    string,
) {
  if (
    !isSpecialistEnterpriseModuleKey(
      moduleKey,
    )
  ) {
    return '';
  }

  const key:
    SpecialistEnterpriseModuleKey =
    moduleKey;

  let coreSql =
    '';

  switch (
    key
  ) {
    case 'accounting':
      coreSql =
        accountingSql();
      break;
    case 'inventory':
      coreSql =
        inventorySql();
      break;
    case 'warehouse':
      coreSql =
        warehouseSql();
      break;
    case 'payroll':
      coreSql =
        payrollSql();
      break;
    case 'crm':
      coreSql =
        crmSql();
      break;
    case 'projects':
      coreSql =
        projectsSql();
      break;
    case 'helpdesk':
      coreSql =
        helpdeskSql();
      break;
    case 'manufacturing':
      coreSql =
        manufacturingSql();
      break;
  }

  return [
    coreSql,
    financeSpecialistDepthSql(
      key,
    ),
    peopleSpecialistDepthSql(
      key,
    ),
    specialistBreadthDepthSql(
      key,
    ),
    commerceParityDepthSql(
      key,
    ),
    peopleMarketingParityDepthSql(
      key,
    ),
  ]
    .filter(
      sql =>
        sql.trim(),
    )
    .join(
      '\n',
    );
}
