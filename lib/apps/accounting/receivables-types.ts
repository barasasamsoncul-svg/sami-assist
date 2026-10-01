export type ReceivablesAgingBucket =
  | "current"
  | "1-30"
  | "31-60"
  | "61-90"
  | "90+";

export type ReceivablesControlReconciliation = {
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  glBalance: string;
  subledgerBalance: string;
  difference: string;
  reconciled: boolean;
};

export type ReceivablesAgingRow = {
  bucket: ReceivablesAgingBucket;
  amount: string;
  count: number;
};

export type ReceivablesCustomerExposure = {
  customerId: string;
  customerName: string;
  customerStatus: string;
  customerCurrency: string;
  creditLimit: string | null;
  invoiceCount: number;
  outstanding: string;
  overdue: string;
  maxDaysOverdue: number;
  creditAvailable: string;
};

export type ReceivablesOpenItem = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  baseCurrency: string;
  exchangeRate: string;
  totalAmount: string;
  balanceDue: string;
  baseBalanceDue: string;
  effectiveStatus: string;
  daysOverdue: number;
  agingBucket: string;
};

export type ReceivablesCustomerCredit = {
  customerId: string;
  customerName: string;
  unappliedReceipts: string;
  unusedCreditNotes: string;
  totalCredit: string;
};

export type AccountingReceivablesWorkspace = {
  available: boolean;
  unavailableReason: string | null;
  companyId: string;
  currency: string;
  filters: {
    page: number;
    bucket: ReceivablesAgingBucket | "";
    customerId: string | "";
    search: string;
  };
  metrics: {
    outstanding: string;
    overdue: string;
    current: string;
    customerCredits: string;
    openInvoiceCount: number;
    overdueInvoiceCount: number;
    customersWithBalance: number;
    dsoDays: number | null;
  };
  receivableControl: ReceivablesControlReconciliation;
  customerCreditControl: ReceivablesControlReconciliation;
  aging: ReceivablesAgingRow[];
  customers: ReceivablesCustomerExposure[];
  customerCredits: ReceivablesCustomerCredit[];
  openItems: ReceivablesOpenItem[];
  openItemCount: number;
  selectedCustomer: ReceivablesCustomerExposure | null;
};
