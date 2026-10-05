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
  unitCost: number | null;
  costTotal: number | null;
  marginAmount: number | null;
  marginPercent: number | null;
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
    acceptedByName: string | null;
    acceptedByEmail: string | null;
    acceptanceNote: string | null;
    rejectedAt: string | null;
    convertedAt: string | null;
    lines: SalesQuoteLine[];
    optionalItems: Array<{
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
    }>;
    revisions: Array<{
      id: string;
      revisionNumber: number;
      reason: string | null;
      createdAt: string;
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


export type SalesOrderLine = {
  id: string;
  catalogItemId: string | null;
  description: string;
  sku: string | null;
  unit: string;
  quantity: number;
  deliveredQuantity: number;
  invoicedQuantity: number;
  returnedQuantity: number;
  creditedQuantity: number;
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
    shipments: Array<{
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
      items: Array<{
        id: string;
        salesOrderLineId: string;
        quantity: number;
      }>;
    }>;
    returns: Array<{
      id: string;
      returnNumber: string;
      status: string;
      reason: string;
      requestedAt: string;
      approvedAt: string | null;
      receivedAt: string | null;
      creditedAt: string | null;
      refundedAt: string | null;
      items: Array<{
        id: string;
        salesOrderLineId: string;
        quantity: number;
      }>;
      credits: Array<{
        id: string;
        invoiceId: string;
        creditNoteId: string;
        creditNoteNumber: string;
        amount: number;
        availableCredit: number;
        refundedAmount: number;
      }>;
    }>;
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
    canUseBillingCustomers: boolean;
    canManageBillingCustomers: boolean;
    canUseCatalog: boolean;
    canManageCatalog: boolean;
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
  }>;
  catalogItems: Array<{
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
  }>;
  pricelists: Array<{
    id: string;
    name: string;
    code: string | null;
    currency: string;
    billingCustomerId: string | null;
    validFrom: string | null;
    validUntil: string | null;
    priority: number;
    isActive: boolean;
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
  notes?: unknown;
  terms?: unknown;
  internalNotes?: unknown;
  lines?: unknown;
};
