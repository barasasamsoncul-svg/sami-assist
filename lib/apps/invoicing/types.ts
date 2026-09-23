export type InvoicingStatus =
  | 'draft'
  | 'confirmed'
  | 'sent'
  | 'viewed'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'void'
  | 'written_off';

export type InvoicingInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  status: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  totalAmount: number;
  paidAmount: number;
  creditedAmount: number;
  balanceDue: number;
  daysOverdue: number;
  createdAt: string | null;
};

export type InvoicingCustomerSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  currency: string;
  status: string;
  invoiceCount: number;
  invoicedTotal: number;
  paidTotal: number;
  outstandingTotal: number;
};

export type InvoicingPaymentSummary = {
  id: string;
  paymentNumber: string;
  customerName: string | null;
  paymentDate: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  invoiceNumbers: string[];
};

export type InvoicingRecurringSummary = {
  id: string;
  name: string;
  customerName: string;
  status: string;
  intervalUnit: string;
  intervalCount: number;
  nextRunAt: string;
  autoSend: boolean;
  currency: string;
};

export type InvoicingWorkspaceData = {
  company: { id: string; name: string; currency: string };
  capabilities: {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canConfirm: boolean;
    canSend: boolean;
    canRecordPayment: boolean;
    canCredit: boolean;
    canManageCustomers: boolean;
    canManageCatalog: boolean;
    canManageRecurring: boolean;
    canViewReports: boolean;
    canManageSettings: boolean;
  };
  metrics: {
    invoiceCount: number;
    draftCount: number;
    sentCount: number;
    paidCount: number;
    overdueCount: number;
    invoicedTotal: number;
    paidTotal: number;
    outstandingTotal: number;
    overdueTotal: number;
  };
  aging: Array<{ bucket: string; amount: number; count: number }>;
  statusCounts: Array<{ status: string; count: number; amount: number }>;
  monthly: Array<{ month: string; invoiceCount: number; amount: number }>;
  invoices: InvoicingInvoiceSummary[];
  customers: InvoicingCustomerSummary[];
  payments: InvoicingPaymentSummary[];
  recurring: InvoicingRecurringSummary[];
  paymentTerms: Array<{ id: string; name: string; dueDays: number; isDefault: boolean }>;
  taxRates: Array<{ id: string; name: string; rate: number; isDefault: boolean }>;
  catalogItems: Array<{ id: string; name: string; sku: string | null; unit: string; unitPrice: number; taxRateId: string | null }>;
  settings: {
    defaultCurrency: string;
    defaultDueDays: number;
    taxCalculation: string;
    allowPartialPayments: boolean;
    allowCreditNotes: boolean;
    requireApproval: boolean;
    autoSendRecurring: boolean;
    reminderEnabled: boolean;
    paymentInstructions: string | null;
    bankDetails: string | null;
    termsAndConditions: string | null;
  };
};

export type CreateInvoiceLineInput = {
  catalogItemId?: unknown;
  description?: unknown;
  sku?: unknown;
  unit?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  discountType?: unknown;
  discountValue?: unknown;
  taxRateId?: unknown;
  taxRate?: unknown;
};

export type CreateInvoiceInput = {
  customerId?: unknown;
  invoiceDate?: unknown;
  dueDate?: unknown;
  currency?: unknown;
  reference?: unknown;
  purchaseOrderNumber?: unknown;
  notes?: unknown;
  terms?: unknown;
  shippingTotal?: unknown;
  roundingAdjustment?: unknown;
  confirm?: unknown;
  lines?: unknown;
};
