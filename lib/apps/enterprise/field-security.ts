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
