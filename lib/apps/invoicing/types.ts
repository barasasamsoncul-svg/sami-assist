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
  reminderMode: string;
  reminderPauseUntil: string | null;
  reminderPauseReason: string | null;
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
  reminderMode: string;
  reminderPauseUntil: string | null;
  reminderPauseReason: string | null;
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
  status: string;
  customerId: string | null;
  customerName: string | null;
  paymentDate: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  method: string;
  reference: string | null;
  allocatedAmount: number;
  refundedAmount: number;
  unappliedAmount: number;
  reconciledAt: string | null;
  reconciliationReference: string | null;
  reconciliationNotes: string | null;
  invoiceNumbers: string[];
  allocations: Array<{
    id: string;
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    status: string;
    operationKey: string | null;
  }>;
  refunds: Array<{
    id: string;
    refundNumber: string;
    refundDate: string;
    amount: number;
    status: string;
    reason: string;
  }>;
};

export type InvoicingDunningStageSummary = {
  id: string;
  stageKey: string;
  name: string;
  sequenceNo: number;
  offsetDays: number;
  severity: string;
  channels: Array<
    'email' |
    'whatsapp' |
    'sms'
  >;
  autoSend: boolean;
  retryLimit: number;
  retryDelayMinutes: number;
  subjectTemplate: string | null;
  messageTemplate: string | null;
};

export type InvoicingDunningPolicySummary = {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  stages: InvoicingDunningStageSummary[];
};

export type InvoicingReminderSummary = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  policyId: string | null;
  stageId: string | null;
  stageName: string;
  severity: string;
  reminderType: string;
  channel: string;
  source: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  scheduledFor: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
};

export type InvoicingPortalAccessSummary = {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  status: string;
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export type InvoicingPortalMessageSummary = {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  direction: string;
  category: string;
  subject: string | null;
  body: string;
  promisedAmount: number | null;
  promisedDate: string | null;
  status: string;
  createdAt: string;
};

export type InvoicingRecurringRunSummary = {
  id: string;
  scheduledFor: string;
  status: string;
  attemptCount: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  deliveryStatus: string;
  deliveryErrorCode: string | null;
  startedAt: string;
  lastAttemptAt: string;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
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
  startDate: string;
  endDate: string | null;
  nextRunAt: string;
  maxOccurrences: number | null;
  runCount: number;
  consecutiveFailures: number;
  maxRetryAttempts: number;
  lastInvoiceId: string | null;
  lastInvoiceNumber: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  retryAfter: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  completionReason: string | null;
  autoSend: boolean;
  deliveryChannels: Array<
    'email' |
    'whatsapp' |
    'sms'
  >;
  currency: string;
  runs: InvoicingRecurringRunSummary[];
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

export type InvoicingDocumentSnapshotSummary = {
  id: string;
  versionNo: number;
  isPrimary: boolean;
  reason: string;
  sourceStatus: string;
  rendererVersion: string;
  payloadSha256: string;
  pdfSha256: string;
  pdfSizeBytes: number;
  createdAt: string;
  createdBy: string | null;
};

export type InvoicingInvoiceDetail = {
  id: string;
  invoiceNumber: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  serviceDate: string | null;
  currency: string;
  exchangeRate: number;
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
  templateId: string | null;
  notes: string | null;
  terms: string | null;
  paymentInstructions: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    billingAddress: string | null;
    shippingAddress: string | null;
    taxId: string | null;
    paymentTermsName: string | null;
  };
  lines: InvoicingInvoiceLine[];
  payments: Array<{
    id: string;
    paymentNumber: string;
    status: string;
    paymentDate: string;
    amount: number;
    method: string;
    reference: string | null;
    allocationId: string;
    allocationStatus: string;
    operationKey: string | null;
    reconciledAt: string | null;
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
    documentSnapshotId: string | null;
    createdAt: string;
  }>;
  documentSnapshots: InvoicingDocumentSnapshotSummary[];
};

export type InvoicingWorkspaceData = {
  company: { id: string; name: string; currency: string };
  capabilities: {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canConfirm: boolean;
    canCancel: boolean;
    canSend: boolean;
    canViewPayments: boolean;
    canRecordPayment: boolean;
    canCredit: boolean;
    canViewCustomers: boolean;
    canManageCustomers: boolean;
    canViewCatalog: boolean;
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
  dunningPolicies: InvoicingDunningPolicySummary[];
  reminders: InvoicingReminderSummary[];
  portalAccess: InvoicingPortalAccessSummary[];
  portalMessages: InvoicingPortalMessageSummary[];
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
    portalEnabled: boolean;
    portalAccessDays: number;
    portalAllowMessages: boolean;
    portalShowPaymentHistory: boolean;
    portalShowCreditNotes: boolean;
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
  serviceDate?: unknown;
  currency?: unknown;
  exchangeRate?: unknown;
  templateId?: unknown;
  reference?: unknown;
  purchaseOrderNumber?: unknown;
  shippingAddress?: unknown;
  notes?: unknown;
  terms?: unknown;
  shippingTotal?: unknown;
  roundingAdjustment?: unknown;
  confirm?: unknown;
  lines?: unknown;
};
