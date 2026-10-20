/* -------------------------------------------------------------------------- */
/*  View / queue types                                                        */
/* -------------------------------------------------------------------------- */

export const SALES_QUOTE_STATUS_VIEWS = [
  'all',
  'draft',
  'needs_approval',
  'awaiting_response',
  'accepted',
  'converted',
  'closed_without_sale',
  'expired',
  'expiring_soon',
] as const;
export type SalesQuoteStatusView = (typeof SALES_QUOTE_STATUS_VIEWS)[number];

export const SALES_ORDER_STATUS_VIEWS = [
  'all',
  'awaiting_fulfillment',
  'partially_fulfilled',
  'fulfilled',
  'not_invoiced',
  'partially_invoiced',
  'invoiced',
] as const;
export type SalesOrderStatusView = (typeof SALES_ORDER_STATUS_VIEWS)[number];

export const SALES_ORDER_SORTS = [
  'newest',
  'oldest',
  'value_high',
  'value_low',
  'delivery_first',
  'invoice_first',
  'customer_az',
] as const;
export type SalesOrderSortBy = (typeof SALES_ORDER_SORTS)[number];

export const SALES_PIPELINE_VIEW_TYPES = ['leads', 'opportunities'] as const;
export type SalesPipelineViewType = (typeof SALES_PIPELINE_VIEW_TYPES)[number];

export const SALES_PIPELINE_STATUS_VIEWS = [
  'all',
  'new',
  'contacted',
  'qualified',
  'disqualified',
  'converted',
  'open',
  'won',
  'lost',
] as const;
export type SalesPipelineStatusView = (typeof SALES_PIPELINE_STATUS_VIEWS)[number];

export const SALES_LEAD_SCORE_VIEWS = ['all', 'high', 'medium', 'low'] as const;
export type SalesLeadScoreView = (typeof SALES_LEAD_SCORE_VIEWS)[number];

/* -------------------------------------------------------------------------- */
/*  Saved views                                                               */
/* -------------------------------------------------------------------------- */

export type SalesSavedQuoteView = {
  id: string;
  name: string;
  statusView: SalesQuoteStatusView;
  searchQuery: string;
  createdAt: string;
};

export type SalesSavedOrderView = {
  id: string;
  name: string;
  statusView: SalesOrderStatusView;
  searchQuery: string;
  sortBy: SalesOrderSortBy;
  createdAt: string;
};

export type SalesSavedPipelineView = {
  id: string;
  name: string;
  viewType: SalesPipelineViewType;
  statusView: SalesPipelineStatusView;
  scoreView: SalesLeadScoreView;
  searchQuery: string;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/*  Domain statuses                                                           */
/* -------------------------------------------------------------------------- */

export const SALES_QUOTE_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'accepted',
  'rejected',
  'expired',
  'cancelled',
  'converted',
] as const;
export type SalesQuoteStatus = (typeof SALES_QUOTE_STATUSES)[number];

export const SALES_ORDER_STATUSES = ['confirmed', 'cancelled', 'closed'] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const SALES_FULFILLMENT_STATUSES = ['not_started', 'partial', 'fulfilled'] as const;
export type SalesFulfillmentStatus = (typeof SALES_FULFILLMENT_STATUSES)[number];

export const SALES_INVOICE_STATUSES = ['not_invoiced', 'partial', 'invoiced'] as const;
export type SalesInvoiceStatus = (typeof SALES_INVOICE_STATUSES)[number];

export const SALES_APPROVAL_STATUSES = [
  'not_required',
  'pending',
  'approved',
  'rejected',
] as const;
export type SalesApprovalStatus = (typeof SALES_APPROVAL_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/*  Line items                                                                */
/* -------------------------------------------------------------------------- */

export type SalesDiscountType = 'percent' | 'fixed';

export type SalesQuoteLine = {
  id: string;
  catalogItemId: string | null;
  description: string;
  sku: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  costTotal: number | null;
  marginAmount: number | null;
  marginPercent: number | null;
  discountType: SalesDiscountType;
  discountValue: number;
  discountAmount: number;
  taxName: string | null;
  taxRate: number;
  taxAmount: number;
  subtotal: number;
  lineTotal: number;
};

export type SalesQuoteOptionalItem = {
  id: string;
  catalogItemId: string | null;
  description: string;
  sku: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  taxName: string | null;
  taxRate: number;
  isSelected: boolean;
};

export type SalesOrderLine = {
  id: string;
  catalogItemId: string | null;
  description: string;
  sku: string | null;
  unit: string;
  quantity: number;
  shippedQuantity: number;
  plannedQuantity: number;
  deliveredQuantity: number;
  invoicedQuantity: number;
  returnedQuantity: number;
  creditedQuantity: number;
  invoiceableQuantity: number;
  unitPrice: number;
  unitCost: number | null;
  costTotal: number | null;
  marginAmount: number | null;
  marginPercent: number | null;
  discountType: SalesDiscountType;
  discountValue: number;
  taxName: string | null;
  taxRate: number;
  lineTotal: number;
};

/* -------------------------------------------------------------------------- */
/*  Summaries                                                                 */
/* -------------------------------------------------------------------------- */

export type SalesQuoteSummary = {
  id: string;
  quoteNumber: string;
  status: string;
  quoteDate: string;
  validUntil: string | null;
  currency: string;
  baseCurrency: string;
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateSource: string;
  baseTotalAmount: number;
  customerName: string;
  customerEmail: string | null;
  totalAmount: number;
  currentRevision: number;
  templateId: string | null;
  pricelistId: string | null;
  marginAmount: number | null;
  marginPercent: number | null;
  reference: string | null;
  approvalStatus: string;
  salesOrderId: string | null;
  latestInvoiceId: string | null;
  createdAt: string | null;
};

export type SalesOrderSummary = {
  id: string;
  orderNumber: string;
  quoteId: string | null;
  quoteNumber: string | null;
  latestInvoiceId: string | null;
  reference: string | null;
  status: string;
  fulfillmentStatus: string;
  invoiceStatus: string;
  orderDate: string;
  currency: string;
  baseCurrency: string;
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateSource: string;
  baseTotalAmount: number;
  customerName: string;
  totalAmount: number;
  deliveredPercent: number;
  invoicedPercent: number;
};

/* -------------------------------------------------------------------------- */
/*  Details                                                                   */
/* -------------------------------------------------------------------------- */

export type SalesQuoteRevision = {
  id: string;
  revisionNumber: number;
  reason: string | null;
  createdAt: string;
};

export type SalesQuoteCustomerRevisionRequest = {
  id: string;
  requesterName: string | null;
  requesterEmail: string | null;
  reason: string;
  createdAt: string;
};

export type SalesQuoteStatusHistoryEntry = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  createdAt: string;
};

export type SalesDeliveryLogEntry = {
  id: string;
  channel: string;
  provider: string | null;
  status: string;
  errorCode: string | null;
  createdAt: string;
};

export type SalesQuoteDetail = SalesQuoteSummary & {
  canWithdrawApproval: boolean;
  billingCustomerId: string | null;
  salespersonUserId: string | null;
  customerPhone: string | null;
  customerTaxId: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  depositType: 'none' | 'percent' | 'fixed';
  depositValue: number;
  depositRequiredAmount: number;
  notes: string | null;
  terms: string | null;
  internalNotes: string | null;
  approvalRequestedAt: string | null;
  approvedAt: string | null;
  approvalRejectedAt: string | null;
  approvalRejectionReason: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
  acceptedByEmail: string | null;
  acceptanceNote: string | null;
  acceptedSignatureConsentText: string | null;
  rejectedAt: string | null;
  convertedAt: string | null;
  lines: SalesQuoteLine[];
  optionalItems: SalesQuoteOptionalItem[];
  revisions: SalesQuoteRevision[];
  customerRevisionRequests: SalesQuoteCustomerRevisionRequest[];
  history: SalesQuoteStatusHistoryEntry[];
  deliveries: SalesDeliveryLogEntry[];
};

export type SalesShipmentItem = {
  id: string;
  salesOrderLineId: string;
  quantity: number;
};

export type SalesShipment = {
  id: string;
  shipmentNumber: string;
  status: string;
  carrier: string | null;
  serviceLevel: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  recipientName: string | null;
  proofNote: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  inventoryPostedAt: string | null;
  items: SalesShipmentItem[];
};

export type SalesReturnItem = {
  id: string;
  salesOrderLineId: string;
  quantity: number;
};

export type SalesReturnCredit = {
  id: string;
  invoiceId: string;
  creditNoteId: string;
  creditNoteNumber: string;
  amount: number;
  availableCredit: number;
  refundedAmount: number;
};

export type SalesReturn = {
  id: string;
  returnNumber: string;
  status: string;
  reason: string;
  requestedAt: string;
  approvedAt: string | null;
  receivedAt: string | null;
  creditedAt: string | null;
  refundedAt: string | null;
  items: SalesReturnItem[];
  credits: SalesReturnCredit[];
};

export type SalesInvoiceBatch = {
  batchId: string;
  invoiceId: string | null;
  sourceReference: string;
  status: string;
  createdAt: string;
};

export type SalesOrderStatusHistoryEntry = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  createdAt: string;
};

export type SalesOrderDetail = SalesOrderSummary & {
  billingCustomerId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerTaxId: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  reference: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  costTotal: number | null;
  marginAmount: number | null;
  marginPercent: number | null;
  marginCommissionStale: boolean;
  depositType: 'none' | 'percent' | 'fixed';
  depositValue: number;
  depositRequiredAmount: number;
  depositReceivedAmount: number;
  depositStatus: string;
  depositRetainerId: string | null;
  depositPaymentId: string | null;
  notes: string | null;
  terms: string | null;
  lines: SalesOrderLine[];
  shipments: SalesShipment[];
  returns: SalesReturn[];
  invoices: SalesInvoiceBatch[];
  history: SalesOrderStatusHistoryEntry[];
};

/* -------------------------------------------------------------------------- */
/*  Pipeline                                                                  */
/* -------------------------------------------------------------------------- */

export type SalesPipelineStage = {
  id: string;
  code: string;
  name: string;
  sequence: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  foldInKanban: boolean;
  description: string | null;
  color: string | null;
  isActive: boolean;
  quoteCount: number;
  openValue: number;
  weightedValue: number;
};

export type SalesStageHistoryEntry = {
  id: string;
  fromStageId: string | null;
  fromStageName: string | null;
  toStageId: string | null;
  toStageName: string | null;
  fromProbability: number | null;
  toProbability: number | null;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
};

export type SalesPipelineBoardData = {
  stages: SalesPipelineStage[];
  quotes: SalesQuoteSummary[];
  totals: {
    openPipeline: number;
    weightedPipeline: number;
    byStage: Array<{
      stageId: string;
      openValue: number;
      weightedValue: number;
      quoteCount: number;
    }>;
  };
};

/* -------------------------------------------------------------------------- */
/*  Capabilities                                                              */
/* -------------------------------------------------------------------------- */

export type SalesCapabilities = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canSend: boolean;
  canApprove: boolean;
  canApproveInternally: boolean;
  canConvert: boolean;
  canCancel: boolean;
  canViewOrders: boolean;
  canManageOrders: boolean;
  canViewReports: boolean;
  canManageSettings: boolean;
  canRevise: boolean;
  canManageOptionalProducts: boolean;
  canViewPricing: boolean;
  canManagePricing: boolean;
  canViewMargin: boolean;
  canManageMargin: boolean;
  canViewOrganization: boolean;
  canManageTeams: boolean;
  canManageTargets: boolean;
  canViewCommissions: boolean;
  canManageCommissions: boolean;
  canViewOperations: boolean;
  canViewShipping: boolean;
  canManageShipping: boolean;
  canViewReturns: boolean;
  canManageReturns: boolean;
  canManageDeposits: boolean;
  canViewForecast: boolean;
  canViewPipeline: boolean;
  canManagePipeline: boolean;
  canMovePipeline: boolean;
  canManagePipelineStages: boolean;
  canUseBillingCustomers: boolean;
  canManageBillingCustomers: boolean;
  canUseCatalog: boolean;
  canManageCatalog: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Workspace data                                                            */
/* -------------------------------------------------------------------------- */

export type SalesSalesperson = {
  id: string;
  name: string;
  email: string;
};

export type SalesCurrencyAmount = {
  currency: string;
  amount: number;
};

export type SalesBillingCustomer = {
  id: string;
  customerType: string;
  name: string;
  legalName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  registrationNumber: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  countryCode: string | null;
  currency: string;
  creditLimit: number | null;
  notes: string | null;
  status: string;
};

export type SalesTaxRate = {
  id: string;
  name: string;
  rate: number;
  taxType: string;
  countryCode: string | null;
  priceIncluded: boolean;
  isDefault: boolean;
  validFrom: string | null;
  validTo: string | null;
};

export type SalesCatalogItem = {
  id: string;
  itemType: string;
  name: string;
  sku: string | null;
  description: string | null;
  unit: string;
  unitPrice: number;
  taxRateId: string | null;
  taxName: string | null;
  taxRate: number;
  unitCost: number | null;
  isVariant: boolean;
  variantId: string | null;
  baseCatalogItemId: string | null;
  baseProductName: string | null;
  variantLabel: string | null;
  variantAttributes: Array<{ name: string; value: string }>;
};

export type SalesPricelist = {
  id: string;
  name: string;
  code: string | null;
  currency: string;
  billingCustomerId: string | null;
  validFrom: string | null;
  validUntil: string | null;
  priority: number;
  isActive: boolean;
};

export type SalesTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
  notes: string | null;
  terms: string | null;
  footerText: string | null;
  primaryColor: string;
  secondaryColor: string;
};

export type SalesSettings = {
  defaultCurrency: string;
  defaultValidityDays: number;
  termsAndConditions: string | null;
  defaultNotes: string | null;
  emailMessage: string | null;
  primaryColor: string;
  secondaryColor: string;
  footerText: string | null;
  allowOnlineAcceptance: boolean;
  allowOnlineRejection: boolean;
  allowPartialInvoicing: boolean;
  requireBillingCustomerForInvoice: boolean;
  creditLimitEnforced: boolean;
  invoicePolicy: 'ordered' | 'delivered';
  lockConfirmedOrders: boolean;
  requireQuoteApproval: boolean;
  quoteApprovalThreshold: number;
};

export type SalesWorkspaceData = {
  company: {
    id: string;
    name: string;
    currency: string;
  };
  defaultSalesperson: SalesSalesperson | null;
  salespeople: SalesSalesperson[];
  currentSalespersonId: string | null;
  capabilities: SalesCapabilities;
  metrics: {
    quoteCount: number;
    draftCount: number;
    sentCount: number;
    acceptedCount: number;
    convertedCount: number;
    quoteValueByCurrency: SalesCurrencyAmount[];
    acceptedValueByCurrency: SalesCurrencyAmount[];
    orderValueByCurrency: SalesCurrencyAmount[];
    orderCount: number;
  };
  statusCounts: Array<{
    status: string;
    currency: string;
    count: number;
    amount: number;
  }>;
  monthly: Array<{
    month: string;
    currency: string;
    quoteCount: number;
    amount: number;
  }>;
  topCustomers: Array<{
    customerName: string;
    currency: string;
    quoteCount: number;
    amount: number;
  }>;
  quotes: SalesQuoteSummary[];
  orders: SalesOrderSummary[];
  billingCustomers: SalesBillingCustomer[];
  taxRates: SalesTaxRate[];
  catalogItems: SalesCatalogItem[];
  pricelists: SalesPricelist[];
  templates: SalesTemplate[];
  settings: SalesSettings;
};

/* -------------------------------------------------------------------------- */
/*  Register pagination                                                       */
/* -------------------------------------------------------------------------- */

export type SalesRegisterPage<T> = {
  rows: T[];
  offset: number;
  limit: number;
  totalCount: number;
  filteredTotalCount?: number;
  hasMore: boolean;
  nextOffset: number;
  queueCounts: Record<string, number>;
};

export type SalesQuoteRegisterPage = SalesRegisterPage<SalesQuoteSummary>;
export type SalesOrderRegisterPage = SalesRegisterPage<SalesOrderSummary>;

/* -------------------------------------------------------------------------- */
/*  Command inputs                                                            */
/* -------------------------------------------------------------------------- */

export type CreateSalesQuoteInput = {
  opportunityId?: unknown;
  salespersonUserId?: unknown;
  billingCustomerId?: unknown;
  templateId?: unknown;
  pricelistId?: unknown;
  quoteDate?: unknown;
  validUntil?: unknown;
  currency?: unknown;
  exchangeRate?: unknown;
  reference?: unknown;
  customerName?: unknown;
  customerEmail?: unknown;
  customerPhone?: unknown;
  customerTaxId?: unknown;
  billingAddress?: unknown;
  shippingAddress?: unknown;
  shippingTotal?: unknown;
  depositType?: unknown;
  depositValue?: unknown;
  notes?: unknown;
  terms?: unknown;
  internalNotes?: unknown;
  optionalItems?: unknown;
  overrideCreditLimit?: unknown;
  lines?: unknown;
};