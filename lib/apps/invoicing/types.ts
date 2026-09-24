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
  customerType: string;
  name: string;
  legalName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  countryCode: string | null;
  taxId: string | null;
  registrationNumber: string | null;
  currency: string;
  paymentTermsId: string | null;
  paymentTermsName: string | null;
  dueDays: number | null;
  creditLimit: number | null;
  notes: string | null;
  status: string;
  invoiceCount: number;
  invoicedTotal: number;
  paidTotal: number;
  outstandingTotal: number;
};

export type InvoicingCatalogItemSummary = {
  id: string;
  itemType: string;
  name: string;
  sku: string | null;
  description: string | null;
  unit: string;
  unitPrice: number;
  taxRateId: string | null;
  taxRateName: string | null;
  taxRate: number;
  isActive: boolean;
};

export type InvoicingTemplateSummary = {
  id: string;
  name: string;
  isDefault: boolean;
  layout: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string | null;
  logoUrl: string | null;
  fontFamily: string;
  showCompanyLogo: boolean;
  showCompanyAddress: boolean;
  showCompanyContact: boolean;
  showTaxId: boolean;
  showPaymentInstructions: boolean;
  showTaxBreakdown: boolean;
  showDiscount: boolean;
  footerText: string | null;
  termsText: string | null;
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
  sourceInvoiceId: string | null;
  sourceInvoiceNumber: string | null;
  status: string;
  intervalUnit: string;
  intervalCount: number;
  nextRunAt: string;
  autoSend: boolean;
  deliveryChannels: Array<
    'email' |
    'whatsapp' |
    'sms'
  >;
  currency: string;
};

export type InvoicingInvoiceLine = {
  id: string;
  catalogItemId: string | null;
  description: string;
  sku: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  discountAmount: number;
  taxRateId: string | null;
  taxName: string | null;
  taxRate: number;
  taxAmount: number;
  subtotal: number;
  lineTotal: number;
};

export type InvoicingInvoiceDetail = {
  id: string;
  invoiceNumber: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  reference: string | null;
  purchaseOrderNumber: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  roundingAdjustment: number;
  totalAmount: number;
  paidAmount: number;
  creditedAmount: number;
  balanceDue: number;
  taxCalculation: 'exclusive' | 'inclusive';
  notes: string | null;
  terms: string | null;
  paymentInstructions: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    billingAddress: string | null;
    taxId: string | null;
    paymentTermsName: string | null;
  };
  lines: InvoicingInvoiceLine[];
  payments: Array<{
    id: string;
    paymentNumber: string;
    paymentDate: string;
    amount: number;
    method: string;
    reference: string | null;
  }>;
  creditNotes: Array<{
    id: string;
    creditNoteNumber: string;
    issueDate: string;
    status: string;
    amount: number;
    reason: string;
  }>;
  history: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    createdAt: string;
  }>;
  deliveries: Array<{
    id: string;
    channel: string;
    provider: string | null;
    status: string;
    errorCode: string | null;
    createdAt: string;
  }>;
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
  templates: InvoicingTemplateSummary[];
  paymentTerms: Array<{
    id: string;
    name: string;
    description: string | null;
    dueDays: number;
    isDefault: boolean;
    isActive: boolean;
  }>;
  taxRates: Array<{
    id: string;
    name: string;
    rate: number;
    taxType: string;
    countryCode: string | null;
    isDefault: boolean;
    isActive: boolean;
  }>;
  catalogItems: InvoicingCatalogItemSummary[];
  settings: {
    defaultCurrency: string;
    defaultDueDays: number;
    defaultTemplateId: string | null;
    taxCalculation: string;
    allowPartialPayments: boolean;
    allowCreditNotes: boolean;
    requireApproval: boolean;
    autoSendRecurring: boolean;
    reminderEnabled: boolean;
    reminderChannels: Array<
      'email' |
      'whatsapp' |
      'sms'
    >;
    reminderDaysBefore: number;
    reminderDaysAfter: number[];
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
  templateId?: unknown;
  reference?: unknown;
  purchaseOrderNumber?: unknown;
  notes?: unknown;
  terms?: unknown;
  shippingTotal?: unknown;
  roundingAdjustment?: unknown;
  confirm?: unknown;
  lines?: unknown;
};
