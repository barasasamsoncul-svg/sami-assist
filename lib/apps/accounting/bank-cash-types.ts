export type AccountingFinancialAccountType =
  | "bank"
  | "cash"
  | "mobile_money";

export type AccountingFinancialAccount = {
  id: string;
  ledger_account_id: string | null;
  ledger_code: string | null;
  ledger_name: string | null;
  name: string;
  account_type: AccountingFinancialAccountType;
  institution_name: string | null;
  branch_name: string | null;
  account_holder_name: string | null;
  account_reference_masked: string | null;
  mobile_money_provider: string | null;
  currency: string;
  allow_overdraft: boolean;
  overdraft_limit: string;
  status: string;
  book_balance: string;
  foreign_balance: string;
  unreconciled_count: number;
};

export type AccountingInternalTransfer = {
  id: string;
  transfer_number: string;
  transfer_date: string;
  source_bank_account_id: string;
  source_name: string;
  destination_bank_account_id: string;
  destination_name: string;
  currency: string;
  amount: string;
  reference: string | null;
  notes: string | null;
  status: string;
  posted_journal_id: string;
  reversal_journal_id: string | null;
};

export type AccountingBankCashWorkspace = {
  companyId: string;
  currency: string;
  accounts: AccountingFinancialAccount[];
  transfers: AccountingInternalTransfer[];
  ledgerAccounts: Array<{
    id: string;
    code: string;
    name: string;
    account_type: string;
  }>;
  metrics: {
    bankBalance: string;
    cashBalance: string;
    mobileMoneyBalance: string;
    activeAccounts: number;
    unreconciledLines: number;
  };
};
