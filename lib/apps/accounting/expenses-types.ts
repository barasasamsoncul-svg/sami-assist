export type AccountingExpenseSettlementMode =
  | "employee_reimbursement"
  | "company_paid"
  | "corporate_card";

export type AccountingExpenseCategoryMapping = {
  id: string;
  category_id: string;
  category_name: string;
  expense_account_id: string;
  expense_account_code: string;
  expense_account_name: string;
  input_tax_account_id: string | null;
  recoverable_tax_percent: string;
  active: boolean;
};

export type AccountingExpenseReport = {
  id: string;
  report_number: string;
  employee_reference: string | null;
  period_start: string | null;
  period_end: string | null;
  total_amount: string;
  status: string;
  approved_at: string | null;
  reimbursement_status: string;
  settlement_mode: AccountingExpenseSettlementMode | null;
  posted_journal_id: string | null;
  gross_base_amount: string | null;
  reimbursed_amount: string;
  outstanding_amount: string;
  line_count: number;
  exception_count: number;
  missing_receipt_count: number;
};

export type AccountingExpenseLine = {
  id: string;
  expense_report_id: string;
  expense_date: string;
  category_id: string | null;
  category_name: string | null;
  description: string;
  amount: string;
  currency: string;
  merchant: string | null;
  receipt_file_id: string | null;
  policy_exception: boolean;
};

export type AccountingExpenseCategory = {
  id: string;
  name: string;
  description: string | null;
};

export type AccountingExpenseReimbursement = {
  id: string;
  expense_report_id: string;
  report_number: string;
  payment_date: string;
  payment_account_id: string;
  payment_account_code: string;
  payment_account_name: string;
  amount: string;
  status: string;
  posted_journal_id: string;
  reversal_journal_id: string | null;
  notes: string | null;
};

export type AccountingExpenseAccount = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  system_role: string | null;
};

export type AccountingExpensesWorkspace = {
  companyId: string;
  expensesAvailable: boolean;
  currency: string;
  reports: AccountingExpenseReport[];
  lines: AccountingExpenseLine[];
  categories: AccountingExpenseCategory[];
  mappings: AccountingExpenseCategoryMapping[];
  reimbursements: AccountingExpenseReimbursement[];
  accounts: AccountingExpenseAccount[];
  setup: {
    defaultExpenseAccountId: string | null;
    employeeExpensePayableAccountId: string | null;
    corporateCardClearingAccountId: string | null;
  };
  metrics: {
    approvedUnposted: number;
    postedOutstanding: string;
    reimbursedThisMonth: string;
    policyExceptions: number;
    missingReceipts: number;
  };
};
