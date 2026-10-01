export type AccountingStatementSourceType =
  | "csv"
  | "ofx"
  | "qif"
  | "feed"
  | "manual";

export type AccountingStatementBatch = {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  source_type: AccountingStatementSourceType;
  source_filename: string | null;
  statement_from: string | null;
  statement_to: string | null;
  opening_balance: string | null;
  closing_balance: string | null;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  error_rows: number;
  status: string;
  imported_at: string;
};

export type AccountingStatementImportRow = {
  id: string;
  batch_id: string;
  row_number: number;
  transaction_date: string | null;
  value_date: string | null;
  description: string | null;
  external_reference: string | null;
  external_transaction_id: string | null;
  counterparty: string | null;
  amount: string | null;
  import_status: string;
  error_message: string | null;
  statement_line_id: string | null;
  duplicate_of_line_id: string | null;
};

export type AccountingBankFeedConnection = {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  provider_key: string;
  provider_label: string;
  external_account_reference: string | null;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
};

export type AccountingStatementsWorkspace = {
  companyId: string;
  currency: string;
  accounts: Array<{
    id: string;
    name: string;
    account_type: string;
    currency: string;
    status: string;
  }>;
  batches: AccountingStatementBatch[];
  rows: AccountingStatementImportRow[];
  connections: AccountingBankFeedConnection[];
  metrics: {
    importedThisMonth: number;
    duplicatesThisMonth: number;
    errorsThisMonth: number;
    activeFeeds: number;
  };
};
