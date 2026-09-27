export const SPECIALIST_ENTERPRISE_TABLES = {
  accounting: [
    'accounting_fiscal_periods',
    'accounting_bank_accounts',
    'accounting_bank_statement_lines',
    'accounting_reconciliation_rules',
  ],
  inventory: [
    'inventory_lots',
    'stock_reservations',
    'inventory_reorder_rules',
    'inventory_adjustments',
  ],
  warehouse: [
    'warehouse_putaway_rules',
    'warehouse_picking_batches',
    'warehouse_picking_batch_operations',
    'warehouse_packages',
  ],
  payroll: [
    'payroll_components',
    'payroll_employee_components',
    'payslips',
    'payslip_lines',
  ],
  crm: [
    'crm_stages',
    'crm_scoring_rules',
    'crm_forecasts',
    'crm_forecast_lines',
  ],
  projects: [
    'task_dependencies',
    'project_budgets',
    'project_budget_lines',
    'project_resources',
  ],
  helpdesk: [
    'helpdesk_sla_policies',
    'ticket_sla_tracking',
    'knowledge_articles',
    'ticket_escalations',
  ],
  manufacturing: [
    'work_centers',
    'manufacturing_routings',
    'manufacturing_routing_steps',
    'manufacturing_material_reservations',
  ],
  purchase: [
    'purchase_requisitions',
    'purchase_requisition_lines',
    'purchase_receipts',
    'purchase_receipt_lines',
  ],
  expenses: [
    'expense_policies',
    'expense_reports',
    'expense_report_lines',
    'expense_mileage_rates',
  ],
  fixed_assets: [
    'asset_categories',
    'asset_impairments',
    'asset_insurance_policies',
  ],
  tax: [
    'tax_codes',
    'tax_rules',
    'withholding_certificates',
  ],
  budgeting: [
    'budget_scenarios',
    'budget_scenario_lines',
    'budget_approvals',
  ],
  cash_flow: [
    'cash_flow_scenarios',
    'cash_flow_scenario_items',
    'liquidity_alerts',
  ],
  billing: [
    'billing_cycles',
    'billing_account_balances',
    'billing_dunning_cases',
  ],
  subscriptions: [
    'subscription_plan_prices',
    'subscription_changes',
    'subscription_usage_charges',
    'subscription_renewals',
  ],
  payments: [
    'payment_batches',
    'payment_batch_items',
    'payment_refunds',
    'payment_disputes',
  ],
  commissions: [
    'commission_tiers',
    'commission_payouts',
    'commission_payout_lines',
  ],
  employees: [
    'employee_contracts',
    'employee_emergency_contacts',
    'employee_lifecycle_events',
  ],
  recruitment: [
    'recruitment_requisitions',
    'applicant_sources',
    'interview_scorecards',
    'job_offers',
  ],
  attendance: [
    'attendance_exceptions',
    'attendance_corrections',
    'attendance_overtime_requests',
  ],
  shifts: [
    'open_shifts',
    'shift_swap_requests',
    'shift_availability',
  ],
  time_off: [
    'leave_balances',
    'leave_accruals',
    'leave_blackout_periods',
  ],
  timesheets: [
    'timesheet_periods',
    'timesheet_submissions',
    'timesheet_approvals',
  ],
  benefits: [
    'benefit_claims',
    'benefit_dependents',
    'benefit_contributions',
  ],
  appraisals: [
    'appraisal_competencies',
    'appraisal_competency_scores',
    'appraisal_feedback',
    'appraisal_calibrations',
  ],
  onboarding: [
    'onboarding_documents',
    'onboarding_checkins',
    'onboarding_equipment_assignments',
  ],
  learning: [
    'learning_assessments',
    'learning_assessment_attempts',
    'learning_certificates',
  ],
  org_chart: [
    'succession_plans',
    'succession_candidates',
    'position_requirements',
  ],
} as const;

export type SpecialistEnterpriseModuleKey =
  keyof typeof SPECIALIST_ENTERPRISE_TABLES;

export function isSpecialistEnterpriseModuleKey(
  value:
    string,
): value is SpecialistEnterpriseModuleKey {
  return Object.prototype
    .hasOwnProperty
    .call(
      SPECIALIST_ENTERPRISE_TABLES,
      value,
    );
}

export function specialistEnterpriseTables(
  moduleKey:
    string,
) {
  if (
    !isSpecialistEnterpriseModuleKey(
      moduleKey,
    )
  ) {
    return [];
  }

  return [
    ...SPECIALIST_ENTERPRISE_TABLES[
      moduleKey
    ],
  ];
}
