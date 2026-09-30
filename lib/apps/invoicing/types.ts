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
  customerAvailableCredit: number;
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
  fiscalPositionId: string | null;
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
  taxCategory: string | null;
  taxRateId: string | null;
  taxGroupId: string | null;
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
  designVersion: number;
  density: string;
  headerStyle: string;
  documentTitle: string;
  fromLabel: string;
  billToLabel: string;
  notesLabel: string;
  termsLabel: string;
  paymentLabel: string;
  footerAlignment: string;
  showStatus: boolean;
  showPageNumbers: boolean;
  showSku: boolean;
  showUnit: boolean;
  showQuantity: boolean;
  showUnitPrice: boolean;
  showLineTax: boolean;
  showLineDiscount: boolean;
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

export type InvoicingRetainerSummary = {
  id: string;
  retainerNumber: string;
  retainerType: string;
  customerId: string;
  customerName: string;
  paymentId: string;
  paymentNumber: string;
  receivedDate: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  method: string;
  reference: string | null;
  purpose: string | null;
  expectedUseDate: string | null;
  status: string;
  allocatedAmount: number;
  refundedAmount: number;
  availableAmount: number;
  reconciledAt: string | null;
  createdAt: string;
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

export type InvoicingPaymentPlanInstallmentSummary = {
  id: string;
  sequenceNo: number;
  label: string | null;
  dueDate: string;
  amount: number;
  paidAmount: number;
  balanceDue: number;
  status: string;
};

export type InvoicingPaymentPlanSummary = {
  id: string;
  planNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  name: string;
  status: string;
  currency: string;
  originalDueDate: string;
  finalDueDate: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  installmentCount: number;
  paidInstallments: number;
  overdueInstallments: number;
  nextDueDate: string | null;
  notes: string | null;
  activatedAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  installments: InvoicingPaymentPlanInstallmentSummary[];
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
  taxGroupId: string | null;
  taxName: string | null;
  taxRate: number;
  taxComponents: Array<Record<string, unknown>>;
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
  updatedAt: string | null;
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
    subtotal: number;
    taxTotal: number;
    amount: number;
    appliedAmount: number;
    refundedAmount: number;
    availableAmount: number;
    reason: string;
    applications: Array<{
      id: string;
      targetInvoiceId: string;
      targetInvoiceNumber: string;
      applicationType: string;
      amount: number;
      status: string;
      appliedAt: string;
      reversalReason: string | null;
    }>;
    refunds: Array<{
      id: string;
      refundNumber: string;
      refundDate: string;
      amount: number;
      method: string;
      reference: string | null;
      reason: string;
      status: string;
      reversalReason: string | null;
    }>;
  }>;
  history: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    createdAt: string;
  }>;
  auditTrail: Array<{
    id: string;
    sequenceNo: number;
    eventKey: string;
    action: string;
    actorUserId: string | null;
    actorType: string;
    source: string;
    entryHash: string;
    previousHash: string | null;
    occurredAt: string;
  }>;
  auditIntegrity: {
    hasEntries: boolean;
    verified: boolean;
    entryCount: number;
    firstSequence: number | null;
    lastSequence: number | null;
    lastHash: string | null;
  };
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

export type InvoicingCurrencySummary = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
  isBase: boolean;
};

export type InvoicingExchangeRateSummary = {
  id: string;
  currency: string;
  baseCurrency: string;
  rate: number;
  effectiveDate: string;
  sourceType: string;
  sourceName: string | null;
  note: string | null;
};

export type InvoicingCurrencyExposureSummary = {
  currency: string;
  baseCurrency: string;
  openInvoiceCount: number;
  invoicedAmount: number;
  openAmount: number;
  invoicedBaseAmount: number;
  openBaseAmount: number;
};

export type InvoicingTaxGroupSummary = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  taxType: string;
  countryCode: string | null;
  jurisdictionCode: string | null;
  calculationMode: string;
  isDefault: boolean;
  isActive: boolean;
  members: Array<{
    id: string;
    taxRateId: string;
    taxRateName: string;
    rate: number;
    sequenceNo: number;
    compound: boolean;
  }>;
};

export type InvoicingFiscalPositionSummary = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  countryCode: string | null;
  customerType: string | null;
  priority: number;
  autoApply: boolean;
  isDefault: boolean;
  isActive: boolean;
  mappings: Array<{
    id: string;
    sourceTaxRateId: string | null;
    sourceTaxGroupId: string | null;
    destinationTaxRateId: string | null;
    destinationTaxGroupId: string | null;
    exempt: boolean;
    label: string | null;
    sequenceNo: number;
  }>;
};

export type InvoicingTaxRuleSummary = {
  id: string;
  name: string;
  priority: number;
  countryCode: string | null;
  customerType: string | null;
  taxCategory: string | null;
  sourceTaxRateId: string | null;
  sourceTaxGroupId: string | null;
  destinationTaxRateId: string | null;
  destinationTaxGroupId: string | null;
  action: string;
  validFrom: string | null;
  validTo: string | null;
  stopProcessing: boolean;
  isActive: boolean;
};

export type InvoicingTaxExemptionSummary = {
  id: string;
  customerId: string;
  customerName: string;
  exemptionType: string;
  certificateNumber: string | null;
  taxType: string | null;
  countryCode: string | null;
  validFrom: string | null;
  validTo: string | null;
  reason: string;
  status: string;
};

export type InvoicingTaxLocalizationSummary = {
  id: string;
  name: string;
  countryCode: string;
  jurisdictionCode: string | null;
  taxRegistrationNumber: string | null;
  defaultTaxType: string;
  filingFrequency: string;
  isDefault: boolean;
  isActive: boolean;
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
    canAllocatePayment: boolean;
    canReconcilePayment: boolean;
    canRefundPayment: boolean;
    canReversePayment: boolean;
    canCredit: boolean;
    canViewCredits: boolean;
    canIssueCredit: boolean;
    canApplyCredit: boolean;
    canRefundCredit: boolean;
    canCancelCredit: boolean;
    canViewCustomers: boolean;
    canManageCustomers: boolean;
    canViewCatalog: boolean;
    canManageCatalog: boolean;
    canViewRetainers: boolean;
    canManageRetainers: boolean;
    canViewPaymentPlans: boolean;
    canManagePaymentPlans: boolean;
    canViewRecurring: boolean;
    canManageRecurring: boolean;
    canRunRecurring: boolean;
    canViewReminders: boolean;
    canSendReminder: boolean;
    canManageReminders: boolean;
    canManageDunning: boolean;
    canViewPortal: boolean;
    canManagePortal: boolean;
    canViewCurrencies: boolean;
    canManageCurrencies: boolean;
    canViewTax: boolean;
    canManageTax: boolean;
    canManagePaymentTerms: boolean;
    canViewTemplates: boolean;
    canManageTemplates: boolean;
    canViewEtims: boolean;
    canConfigureEtims: boolean;
    canSubmitEtimsInvoice: boolean;
    canSubmitEtimsCredit: boolean;
    canViewEInvoicing: boolean;
    canConfigureEInvoicing: boolean;
    canManageEInvoicingParticipants: boolean;
    canGenerateEInvoice: boolean;
    canGenerateEInvoiceCredit: boolean;
    canSubmitEInvoice: boolean;
    canSubmitEInvoiceCredit: boolean;
    canExportEInvoice: boolean;
    canViewAudit: boolean;
    canViewReports: boolean;
    canExportReports: boolean;
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
  retainers: InvoicingRetainerSummary[];
  paymentPlans: InvoicingPaymentPlanSummary[];
  currencies: InvoicingCurrencySummary[];
  exchangeRates: InvoicingExchangeRateSummary[];
  currencyExposure: InvoicingCurrencyExposureSummary[];
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
    code: string | null;
    rate: number;
    taxType: string;
    countryCode: string | null;
    jurisdictionCode: string | null;
    priceIncluded: boolean;
    validFrom: string | null;
    validTo: string | null;
    isDefault: boolean;
    isActive: boolean;
    invoiceLineCount: number;
    taxAmount: number;
  }>;
  taxGroups: InvoicingTaxGroupSummary[];
  fiscalPositions: InvoicingFiscalPositionSummary[];
  taxRules: InvoicingTaxRuleSummary[];
  taxExemptions: InvoicingTaxExemptionSummary[];
  taxLocalizations: InvoicingTaxLocalizationSummary[];
  catalogItems: InvoicingCatalogItemSummary[];
  settings: {
    defaultCurrency: string;
    baseCurrency: string;
    exchangeRateMode: string;
    allowCrossCurrencyPayments: boolean;
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
  taxGroupId?: unknown;
  taxRate?: unknown;
};

export type CreateInvoiceInput = {
  idempotencyKey?: unknown;
  expectedUpdatedAt?: unknown;
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
