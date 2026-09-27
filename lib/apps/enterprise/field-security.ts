import type {
  PermissionContext,
} from '@/lib/auth/permission-context';

import type {
  EnterpriseField,
} from '@/lib/apps/enterprise/service';


const SENSITIVE_BUSINESS_FIELDS:
  Record<
    string,
    ReadonlySet<
      string
    >
  > = {
  'employees:employees':
    new Set([
      'salary',
    ]),
  'payroll:payroll_employees':
    new Set([
      'basic_salary',
      'tax_number',
      'bank_details',
    ]),
  'payroll:payroll_components':
    new Set([
      'default_amount',
      'percentage_rate',
      'taxable',
      'statutory',
    ]),
  'payroll:payroll_employee_components':
    new Set([
      'amount_override',
      'percentage_override',
    ]),
  'payroll:payslips':
    new Set([
      'gross_amount',
      'deduction_amount',
      'employer_contribution_amount',
      'net_amount',
    ]),
  'payroll:payslip_lines':
    new Set([
      'quantity',
      'rate',
      'amount',
    ]),
  'payroll:payroll_run_lines':
    new Set([
      'gross_amount',
      'deductions',
      'net_amount',
    ]),
  'marketplace:marketplace_sellers':
    new Set([
      'payout_account',
    ]),
  'benefits:benefit_plans':
    new Set([
      'employer_cost',
      'employee_cost',
    ]),
  'commissions:commission_entries':
    new Set([
      'base_amount',
      'commission_amount',
    ]),
  'commissions:commission_plans':
    new Set([
      'rate',
    ]),
  'billing:billing_accounts':
    new Set([
      'credit_limit',
    ]),
  'fixed_assets:fixed_assets':
    new Set([
      'acquisition_cost',
      'salvage_value',
    ]),
  'fixed_assets:asset_depreciation_entries':
    new Set([
      'depreciation_amount',
      'accumulated_depreciation',
      'book_value',
    ]),
  'payments:payment_accounts':
    new Set([
      'account_number',
      'bank_account',
      'wallet_number',
    ]),
  'accounting:accounting_bank_accounts':
    new Set([
      'account_number_last4',
      'opening_balance',
    ]),
  'accounting:accounting_bank_statement_lines':
    new Set([
      'amount',
      'external_reference',
    ]),
  'projects:project_budgets':
    new Set([
      'budget_amount',
      'approved_amount',
    ]),
  'projects:project_budget_lines':
    new Set([
      'planned_amount',
      'actual_amount',
      'committed_amount',
    ]),
  'projects:project_resources':
    new Set([
      'hourly_cost',
    ]),
  'purchase:purchase_requisitions':
    new Set([
      'estimated_total',
    ]),
  'purchase:purchase_requisition_lines':
    new Set([
      'estimated_unit_cost',
    ]),
  'expenses:expense_policies':
    new Set([
      'daily_limit',
      'per_claim_limit',
      'receipt_required_above',
    ]),
  'expenses:expense_reports':
    new Set([
      'total_amount',
    ]),
  'expenses:expense_report_lines':
    new Set([
      'amount',
    ]),
  'fixed_assets:asset_impairments':
    new Set([
      'previous_book_value',
      'impairment_amount',
      'new_book_value',
    ]),
  'fixed_assets:asset_insurance_policies':
    new Set([
      'insured_value',
      'premium_amount',
    ]),
  'tax:withholding_certificates':
    new Set([
      'gross_amount',
      'withheld_amount',
    ]),
  'billing:billing_account_balances':
    new Set([
      'invoiced_amount',
      'paid_amount',
      'credit_amount',
      'outstanding_amount',
      'overdue_amount',
    ]),
  'billing:billing_dunning_cases':
    new Set([
      'overdue_amount',
    ]),
  'payments:payment_batches':
    new Set([
      'total_amount',
    ]),
  'payments:payment_batch_items':
    new Set([
      'amount',
    ]),
  'payments:payment_refunds':
    new Set([
      'amount',
      'external_reference',
    ]),
  'payments:payment_disputes':
    new Set([
      'disputed_amount',
    ]),
  'commissions:commission_payouts':
    new Set([
      'gross_commission',
      'adjustments',
      'payable_amount',
    ]),
  'commissions:commission_payout_lines':
    new Set([
      'amount',
      'adjustment_amount',
    ]),
};


export function canAccessEnterpriseSensitiveFields(
  context:
    PermissionContext,
  moduleKey:
    string,
) {
  return (
    context.isOwner ||
    context.permissionSet.has(
      (
        moduleKey +
        '.record.settings'
      )
        .toLowerCase(),
    )
  );
}


export function sensitiveEnterpriseFieldNames(
  moduleKey:
    string,
  table:
    string,
) {
  return (
    SENSITIVE_BUSINESS_FIELDS[
      moduleKey +
      ':' +
      table
    ] ||
    new Set<string>()
  );
}


export function filterEnterpriseFieldsForAccess(
  moduleKey:
    string,
  table:
    string,
  fields:
    EnterpriseField[],
  context:
    PermissionContext,
) {
  if (
    canAccessEnterpriseSensitiveFields(
      context,
      moduleKey,
    )
  ) {
    return fields;
  }

  const sensitive =
    sensitiveEnterpriseFieldNames(
      moduleKey,
      table,
    );

  if (
    sensitive.size ===
      0
  ) {
    return fields;
  }

  return fields.filter(
    field =>
      !sensitive.has(
        field.key,
      ),
  );
}
