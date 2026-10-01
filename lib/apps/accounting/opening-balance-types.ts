export type OpeningBalanceSourceType =
  | "manual"
  | "csv"
  | "migration";

export type OpeningBalanceStatus =
  | "draft"
  | "validated"
  | "posted"
  | "cancelled";

export type OpeningBalanceLine = {
  id: string;
  row_number: number;
  source_row_key: string | null;
  account_code_input: string;
  account_id: string | null;
  account_code: string | null;
  account_name: string | null;
  account_type: string | null;
  description: string;
  raw_debit: string;
  raw_credit: string;
  debit: string | null;
  credit: string | null;
  subledger_type: string;
  subledger_reference: string | null;
  subledger_name: string | null;
  validation_status: string;
  validation_messages: string[];
};

export type OpeningBalanceBatchSummary = {
  id: string;
  name: string;
  as_of_date: string;
  source_type: OpeningBalanceSourceType;
  status: OpeningBalanceStatus;
  import_key: string;
  validated_at: string | null;
  posted_at: string | null;
  posted_journal_id: string | null;
  created_at: string;
  line_count: number;
  valid_count: number;
  warning_count: number;
  error_count: number;
  debit_total: string;
  credit_total: string;
  difference: string;
};

export type OpeningBalanceReconciliation = {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  requiredSubledger: "customer" | "vendor";
  controlBalance: string;
  subledgerBalance: string;
  difference: string;
  counterparties: number;
  complete: boolean;
};

export type OpeningBalanceBatchDetail =
  OpeningBalanceBatchSummary & {
    validation_summary: Record<string, unknown>;
    lines: OpeningBalanceLine[];
    reconciliation: OpeningBalanceReconciliation[];
    line_page: number;
    line_page_size: number;
    line_total_count: number;
  };

export type OpeningBalanceAccount = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
};

export type OpeningBalanceWorkspace = {
  companyId: string;
  currency: string;
  batches: OpeningBalanceBatchSummary[];
  selected: OpeningBalanceBatchDetail | null;
  accounts: OpeningBalanceAccount[];
  counts: {
    draft: number;
    validated: number;
    posted: number;
    cancelled: number;
  };
};
