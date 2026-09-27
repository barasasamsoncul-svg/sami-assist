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
