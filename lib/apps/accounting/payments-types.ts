export type AccountingPaymentAccountMapping = {
  id: string;
  payment_account_id: string;
  payment_account_name: string;
  payment_provider: string | null;
  financial_account_id: string;
  financial_account_name: string;
  fee_expense_account_id: string | null;
  fee_expense_account_code: string | null;
  fee_expense_account_name: string | null;
  active: boolean;
};

export type AccountingOperationalPayment = {
  id: string;
  payment_account_id: string | null;
  payment_account_name: string | null;
  direction: "inbound" | "outbound";
  amount: string;
  currency: string;
  paid_at: string | null;
  external_reference: string | null;
  counterparty_name: string | null;
  status: string;
  accounting_status: string;
  posted_journal_id: string | null;
  unsettled_base_amount: string;
  allocation_count: number;
  unposted_allocation_count: number;
};

export type AccountingPaymentAllocation = {
  id: string;
  payment_id: string;
  resource_type: string;
  resource_id: string;
  amount: string;
  status: string;
  accounting_status: string;
  posted_journal_id: string | null;
};

export type AccountingPaymentSettlement = {
  id: string;
  settlement_number: string;
  payment_account_id: string;
  payment_account_name: string;
  financial_account_id: string;
  financial_account_name: string;
  settlement_date: string;
  currency: string;
  inbound_amount: string;
  outbound_amount: string;
  fee_amount: string;
  net_amount: string;
  provider_reference: string | null;
  status: string;
  posted_journal_id: string;
  reversal_journal_id: string | null;
};

export type AccountingPaymentsWorkspace = {
  companyId: string;
  currency: string;
  paymentsAvailable: boolean;
  paymentAccounts: Array<{
    id: string;
    name: string;
    provider: string | null;
    account_reference: string | null;
    currency: string;
    status: string;
  }>;
  financialAccounts: Array<{
    id: string;
    name: string;
    account_type: string;
    currency: string;
    ledger_account_id: string | null;
    status: string;
  }>;
  ledgerAccounts: Array<{
    id: string;
    code: string;
    name: string;
    account_type: string;
  }>;
  mappings: AccountingPaymentAccountMapping[];
  payments: AccountingOperationalPayment[];
  allocations: AccountingPaymentAllocation[];
  settlements: AccountingPaymentSettlement[];
  setup: {
    outstandingReceiptsAccountId: string | null;
    outstandingPaymentsAccountId: string | null;
    unappliedReceiptsAccountId: string | null;
    unappliedPaymentsAccountId: string | null;
    feeExpenseAccountId: string | null;
    disputeAccountId: string | null;
  };
  metrics: {
    unpostedPayments: number;
    unsettledInbound: string;
    unsettledOutbound: string;
    unpostedAllocations: number;
    settlementsThisMonth: string;
  };
};
