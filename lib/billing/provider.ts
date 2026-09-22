import 'server-only';

export type SamiBillingProviderKey =
  | 'stripe'
  | 'paystack'
  | 'pesapal';

export type SamiBillingProviderCapabilities = {
  checkout:
    boolean;
  savePaymentMethodWithoutCharge:
    boolean;
  automaticRecurring:
    boolean;
  variableRecurringAmount:
    boolean;
  updateRecurringQuantity:
    boolean;
  customerPortal:
    boolean;
  mpesaCheckout:
    boolean;
};

export type SamiBillingCustomer = {
  tenantId:
    string;
  subscriptionId:
    string;
  email:
    string;
  firstName:
    string;
  lastName:
    string;
  businessName:
    string;
  phone?:
    string | null;
};

export type SamiBillingCheckoutInput = {
  customer:
    SamiBillingCustomer;
  plan:
    string;
  amount:
    number;
  currency:
    string;
  billableUsers:
    number;
  pricePerUserMonthly:
    number;
  selectedApps:
    string[];
  origin?:
    string | null;
};

export type SamiBillingCheckoutResult = {
  provider:
    SamiBillingProviderKey;
  checkoutUrl:
    string;
  providerReference:
    string;
};

export type SamiBillingSetupInput = {
  customer:
    SamiBillingCustomer;
  origin?:
    string | null;
};

export type SamiBillingSetupResult = {
  provider:
    SamiBillingProviderKey;
  providerCustomerId:
    string;
  setupReference:
    string;
  clientSecret:
    string | null;
  redirectUrl:
    string | null;
};

export type SamiBillingSetupStatus = {
  provider:
    SamiBillingProviderKey;
  setupReference:
    string;
  status:
    string;
  providerCustomerId:
    string;
  providerPaymentMethodId:
    string | null;
};

export type SamiBillingRecurringInput = {
  customer:
    SamiBillingCustomer;
  providerCustomerId:
    string;
  providerPaymentMethodId?:
    string | null;
  plan:
    string;
  currency:
    string;
  pricePerUserMonthly:
    number;
  billableUsers:
    number;
  trialEndsAt?:
    Date | string | null;
};

export type SamiBillingRecurringResult = {
  provider:
    SamiBillingProviderKey;
  providerSubscriptionId:
    string;
  providerCustomerId:
    string;
  providerPaymentMethodId:
    string | null;
  status:
    string;
};

export type SamiBillingRecurringUpdateInput = {
  providerSubscriptionId:
    string;
  pricePerUserMonthly:
    number;
  billableUsers:
    number;
  currency:
    string;
};

export type SamiBillingPortalInput = {
  providerCustomerId:
    string;
  returnUrl:
    string;
};

export type SamiBillingProvider = {
  key:
    SamiBillingProviderKey;
  name:
    string;
  capabilities:
    Readonly<
      SamiBillingProviderCapabilities
    >;

  isConfigured:
    () =>
      boolean;

  createCheckout:
    (
      input:
        SamiBillingCheckoutInput,
    ) =>
      Promise<
        SamiBillingCheckoutResult
      >;

  createPaymentMethodSetup?:
    (
      input:
        SamiBillingSetupInput,
    ) =>
      Promise<
        SamiBillingSetupResult
      >;

  getPaymentMethodSetupStatus?:
    (
      setupReference:
        string,
    ) =>
      Promise<
        SamiBillingSetupStatus
      >;

  createRecurringSubscription?:
    (
      input:
        SamiBillingRecurringInput,
    ) =>
      Promise<
        SamiBillingRecurringResult
      >;

  updateRecurringSubscription?:
    (
      input:
        SamiBillingRecurringUpdateInput,
    ) =>
      Promise<
        SamiBillingRecurringResult
      >;

  createCustomerPortal?:
    (
      input:
        SamiBillingPortalInput,
    ) =>
      Promise<{
        url:
          string;
      }>;

  scheduleRecurringCancellation?:
    (
      providerSubscriptionId:
        string,
    ) =>
      Promise<void>;

  cancelRecurringSubscription?:
    (
      providerSubscriptionId:
        string,
    ) =>
      Promise<void>;
};
