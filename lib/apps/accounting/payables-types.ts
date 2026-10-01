export type PayablesDocumentType =
  | "bill"
  | "credit_note";

export type PayablesDocumentStatus =
  | "draft"
  | "approved"
  | "posted"
  | "partially_settled"
  | "settled"
  | "reversed"
  | "cancelled";

export type PayablesVendor = {
  id: string;
  vendor_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  tax_number: string | null;
  currency: string;
  payment_terms_days: number;
  status: string;
  outstanding_bills: string;
  available_credits: string;
  net_payable: string;
};

export type PayablesDocumentSummary = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  document_type: PayablesDocumentType;
  document_number: string;
  vendor_reference: string | null;
  document_date: string;
  due_date: string | null;
  currency: string;
  exchange_rate: string;
  base_currency: string;
  subtotal: string;
  tax_total: string;
  total_amount: string;
  status: PayablesDocumentStatus;
  posted_journal_id: string | null;
  reversed_journal_id: string | null;
  open_amount: string;
  base_open_amount: string;
};

export type PayablesTaxComponent = {
  id: string;
  tax_code_id: string;
  tax_group_id: string | null;
  tax_code_snapshot: string;
  tax_name_snapshot: string;
  rate_snapshot: string;
  recoverable_rate_snapshot: string;
  taxable_amount: string;
  tax_amount: string;
  recoverable_tax_amount: string;
  nonrecoverable_tax_amount: string;
  calculation: "exclusive" | "inclusive";
  sequence_no: number;
  compound: boolean;
};

export type PayablesDocumentLine = {
  id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_subtotal: string;
  tax_amount: string;
  line_total: string;
  tax_components: PayablesTaxComponent[];
};

export type PayablesCreditApplication = {
  id: string;
  credit_document_id: string;
  credit_document_number: string;
  bill_document_id: string;
  bill_document_number: string;
  amount: string;
  application_date: string;
  status: string;
};

export type PayablesDocumentDetail =
  PayablesDocumentSummary & {
    approved_at: string | null;
    posted_at: string | null;
    reversed_at: string | null;
    created_at: string;
    lines: PayablesDocumentLine[];
    applications: PayablesCreditApplication[];
  };

export type PayablesAgingRow = {
  bucket: "current" | "1-30" | "31-60" | "61-90" | "90+";
  amount: string;
  count: number;
};

export type PayablesAccountOption = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_control_account: boolean;
};

export type PayablesApplicationTarget = {
  id: string;
  document_number: string;
  vendor_reference: string | null;
  due_date: string | null;
  currency: string;
  exchange_rate: string;
  open_amount: string;
};

export type PayablesControlReconciliation = {
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  glBalance: string;
  subledgerBalance: string;
  difference: string;
  reconciled: boolean;
};

export type PayablesTaxCodeOption = {
  id: string;
  code: string;
  name: string;
  rate: string;
  calculation: "exclusive" | "inclusive";
  recoverable_rate: string;
};

export type PayablesTaxGroupOption = {
  id: string;
  code: string;
  name: string;
  calculation: "exclusive" | "inclusive";
  component_count: number;
};

export type AccountingPayablesWorkspace = {
  companyId: string;
  currency: string;
  filters: {
    page: number;
    bucket: "" | "current" | "1-30" | "31-60" | "61-90" | "90+";
    vendorId: string;
    search: string;
  };
  documentCount: number;
  vendors: PayablesVendor[];
  documents: PayablesDocumentSummary[];
  selected: PayablesDocumentDetail | null;
  accounts: PayablesAccountOption[];
  taxCodes: PayablesTaxCodeOption[];
  taxGroups: PayablesTaxGroupOption[];
  applicationTargets: PayablesApplicationTarget[];
  aging: PayablesAgingRow[];
  control: PayablesControlReconciliation;
  metrics: {
    outstandingBills: string;
    availableCredits: string;
    netPayable: string;
    overdue: string;
    billCount: number;
    overdueBillCount: number;
    vendorCount: number;
  };
  counts: {
    draft: number;
    approved: number;
    posted: number;
    reversed: number;
  };
};
