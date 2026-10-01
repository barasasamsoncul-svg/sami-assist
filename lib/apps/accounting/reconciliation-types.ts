export type AccountingReconciliationRule = {
  id: string;
  bank_account_id: string | null;
  name: string;
  match_text: string | null;
  min_amount: string | null;
  max_amount: string | null;
  target_account_id: string | null;
  target_account_code: string | null;
  target_account_name: string | null;
  match_field: string;
  match_operator: string;
  direction: string;
  days_tolerance: number;
  amount_tolerance: string;
  auto_apply: boolean;
  priority: number;
  status: string;
};

export type AccountingReconciliationSuggestion = {
  id: string;
  statement_line_id: string;
  suggestion_type: "existing" | "rule";
  journal_line_id: string | null;
  rule_id: string | null;
  confidence: number;
  suggested_amount: string;
  reason: string;
  journal_number: string | null;
  journal_date: string | null;
  journal_description: string | null;
  target_account_code: string | null;
  target_account_name: string | null;
};

export type AccountingReconciliationStatementLine = {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  transaction_date: string;
  value_date: string | null;
  description: string | null;
  external_reference: string | null;
  counterparty: string | null;
  amount: string;
  currency: string;
  exchange_rate: string;
  base_amount: string;
  reconciliation_status: string;
  source_type: string;
  suggestion_count: number;
  top_confidence: number | null;
};

export type AccountingReconciliationCandidate = {
  journal_line_id: string;
  journal_id: string;
  journal_number: string;
  journal_date: string;
  reference: string | null;
  journal_description: string | null;
  line_description: string | null;
  journal_amount: string;
  reconciled_amount: string;
  remaining_amount: string;
};

export type AccountingReconciliationRecord = {
  id: string;
  reconciliation_number: string;
  bank_account_name: string;
  statement_line_id: string;
  reconciliation_date: string;
  method: string;
  statement_amount: string;
  statement_currency: string | null;
  statement_foreign_amount: string | null;
  statement_exchange_rate: string | null;
  matched_amount: string;
  difference_amount: string;
  status: string;
  adjustment_journal_id: string | null;
  reversal_journal_id: string | null;
  notes: string | null;
};

export type AccountingReconciliationWorkspace = {
  companyId: string;
  currency: string;
  accounts: Array<{
    id: string;
    name: string;
    ledger_account_id: string | null;
    account_type: string;
    currency: string;
    status: string;
  }>;
  statementLines: AccountingReconciliationStatementLine[];
  selectedStatementLine: AccountingReconciliationStatementLine | null;
  candidates: AccountingReconciliationCandidate[];
  suggestions: AccountingReconciliationSuggestion[];
  rules: AccountingReconciliationRule[];
  reconciliations: AccountingReconciliationRecord[];
  targetAccounts: Array<{
    id: string;
    code: string;
    name: string;
    account_type: string;
  }>;
  metrics: {
    unmatched: number;
    suggested: number;
    matchedThisMonth: number;
    excluded: number;
  };
};
