import 'server-only';

import type {
  SamiIntegrationProviderDefinition,
} from '@/lib/integrations/types';
import type {
  SamiAppIntegrationWebhookHandler,
  SamiAppIntegrationSyncHandler,
} from '@/lib/apps/runtime-integrations-types';

import {
  ACCOUNTING_BANK_FEED_PROVIDER,
  ACCOUNTING_DOCUMENT_EXTRACTOR_PROVIDER,
  handleAccountingBankFeedWebhook,
  handleAccountingDocumentExtractorWebhook,
} from '@/lib/apps/accounting/integration-provider';

import {
  INVOICING_PAYMENT_GATEWAY_PROVIDER,
  handleInvoicingPaymentGatewayWebhook,
} from '@/lib/apps/invoicing/integration-provider';

export const APP_RUNTIME_INTEGRATION_PROVIDERS:
  SamiIntegrationProviderDefinition[] = [
    ACCOUNTING_BANK_FEED_PROVIDER,
    ACCOUNTING_DOCUMENT_EXTRACTOR_PROVIDER,
    INVOICING_PAYMENT_GATEWAY_PROVIDER,
  ];

export const APP_RUNTIME_INTEGRATION_WEBHOOK_HANDLERS =
  new Map<string,SamiAppIntegrationWebhookHandler>([
    ['accounting_bank_feed',handleAccountingBankFeedWebhook],
    ['accounting_document_extractor',handleAccountingDocumentExtractorWebhook],
    ['invoicing_payment_gateway',handleInvoicingPaymentGatewayWebhook],
  ]);

export const APP_RUNTIME_INTEGRATION_SYNC_HANDLERS =
  new Map<string,SamiAppIntegrationSyncHandler>();
