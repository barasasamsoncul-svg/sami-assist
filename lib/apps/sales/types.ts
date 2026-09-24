export type SalesQuoteStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'converted';


export type SalesOrderStatus =
  | 'confirmed'
  | 'cancelled'
  | 'closed';

export type SalesFulfillmentStatus =
  | 'not_started'
  | 'partial'
  | 'fulfilled';

export type SalesInvoiceStatus =
  | 'not_invoiced'
  | 'partial'
  | 'invoiced';


export type SalesQuoteLine = {
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
  taxName: string | null;
  taxRate: number;
  taxAmount: number;
  subtotal: number;
  lineTotal: number;
};


export type SalesQuoteSummary = {
  id: string;
  quoteNumber: string;
  status: string;
  quoteDate: string;
  validUntil: string | null;
  currency: string;
  customerName: string;
  customerEmail: string | null;
  totalAmount: number;
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
  status: string;
  fulfillmentStatus: string;
  invoiceStatus: string;
  orderDate: string;
  currency: string;
  customerName: string;
  totalAmount: number;
  deliveredPercent: number;
  invoicedPercent: number;
};


export type SalesQuoteDetail =
  SalesQuoteSummary & {
    billingCustomerId: string | null;
    customerPhone: string | null;
    customerTaxId: string | null;
    billingAddress: string | null;
    shippingAddress: string | null;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    shippingTotal: number;
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
    rejectedAt: string | null;
    convertedAt: string | null;
    lines: SalesQuoteLine[];
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


export type SalesOrderLine = {
  id: string;
  catalogItemId: string | null;
  description: string;
  sku: string | null;
  unit: string;
  quantity: number;
  deliveredQuantity: number;
  invoicedQuantity: number;
  invoiceableQuantity: number;
  unitPrice: number;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  taxName: string | null;
  taxRate: number;
  lineTotal: number;
};


export type SalesOrderDetail =
  SalesOrderSummary & {
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
    notes: string | null;
    terms: string | null;
    lines: SalesOrderLine[];
    invoices: Array<{
      batchId: string;
      invoiceId: string | null;
      sourceReference: string;
      status: string;
      createdAt: string;
    }>;
    history: Array<{
      id: string;
      fromStatus: string | null;
      toStatus: string;
      reason: string | null;
      createdAt: string;
    }>;
  };


export type SalesWorkspaceData = {
  company: {
    id: string;
    name: string;
    currency: string;
  };
  capabilities: {
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
    canUseBillingCustomers: boolean;
    canUseCatalog: boolean;
  };
  metrics: {
    quoteCount: number;
    draftCount: number;
    sentCount: number;
    acceptedCount: number;
    convertedCount: number;
    quoteValue: number;
    acceptedValue: number;
    orderValue: number;
  };
  statusCounts: Array<{
    status: string;
    count: number;
    amount: number;
  }>;
  monthly: Array<{
    month: string;
    quoteCount: number;
    amount: number;
  }>;
  topCustomers: Array<{
    customerName: string;
    quoteCount: number;
    amount: number;
  }>;
  quotes: SalesQuoteSummary[];
  orders: SalesOrderSummary[];
  billingCustomers: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    taxId: string | null;
    billingAddress: string | null;
    shippingAddress: string | null;
    currency: string;
  }>;
  catalogItems: Array<{
    id: string;
    name: string;
    sku: string | null;
    description: string | null;
    unit: string;
    unitPrice: number;
    taxName: string | null;
    taxRate: number;
  }>;
  templates: Array<{
    id: string;
    name: string;
    isDefault: boolean;
    notes: string | null;
    terms: string | null;
    footerText: string | null;
    primaryColor: string;
    secondaryColor: string;
  }>;
  settings: {
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
    invoicePolicy: 'ordered' | 'delivered';
    lockConfirmedOrders: boolean;
    requireQuoteApproval: boolean;
    quoteApprovalThreshold: number;
  };
};


export type CreateSalesQuoteInput = {
  billingCustomerId?: unknown;
  templateId?: unknown;
  quoteDate?: unknown;
  validUntil?: unknown;
  currency?: unknown;
  reference?: unknown;
  customerName?: unknown;
  customerEmail?: unknown;
  customerPhone?: unknown;
  customerTaxId?: unknown;
  billingAddress?: unknown;
  shippingAddress?: unknown;
  shippingTotal?: unknown;
  notes?: unknown;
  terms?: unknown;
  internalNotes?: unknown;
  lines?: unknown;
};
