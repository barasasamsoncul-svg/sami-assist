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
