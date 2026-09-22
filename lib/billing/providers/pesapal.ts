import 'server-only';

import type {
  SamiBillingProvider,
} from '@/lib/billing/provider';

import {
  createPesaPalOrder,
} from '@/lib/services/pesapal';

export const pesapalBillingProvider:
  SamiBillingProvider = {
  key:
    'pesapal',

  name:
    'PesaPal',

  capabilities: {
    checkout:
      true,
    savePaymentMethodWithoutCharge:
      false,
    automaticRecurring:
      false,
    variableRecurringAmount:
      false,
    updateRecurringQuantity:
      false,
    customerPortal:
      false,
    mpesaCheckout:
      true,
  },

  isConfigured() {
    return Boolean(
      process.env
        .PESAPAL_CONSUMER_KEY
        ?.trim() &&
      process.env
        .PESAPAL_CONSUMER_SECRET
        ?.trim() &&
      process.env
        .PESAPAL_IPN_ID
        ?.trim(),
    );
  },

  async createCheckout(
    input,
  ) {
    const result =
      await createPesaPalOrder({
        tenantId:
          input.customer
            .tenantId,
        subscriptionId:
          input.customer
            .subscriptionId,
        amount:
          input.amount,
        email:
          input.customer
            .email,
        firstName:
          input.customer
            .firstName,
        lastName:
          input.customer
            .lastName,
        businessName:
          input.customer
            .businessName,
        phone:
          input.customer
            .phone ||
          null,
        plan:
          input.plan,
        selectedApps:
          input.selectedApps,
        origin:
          input.origin ||
          undefined,
        currency:
          input.currency,
        billableUsers:
          input.billableUsers,
        pricePerUserMonthly:
          input.pricePerUserMonthly,
      });

    return {
      provider:
        'pesapal',
      checkoutUrl:
        result.redirectUrl,
      providerReference:
        result.orderTrackingId,
    };
  },
};
