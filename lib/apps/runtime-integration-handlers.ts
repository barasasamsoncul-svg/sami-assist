import 'server-only';

import type {
  SamiAppIntegrationWebhookHandler,
} from '@/lib/apps/runtime-integrations-types';
import {
  handleAccountingBankFeedWebhook,
  handleAccountingDocumentExtractorWebhook,
} from '@/lib/apps/accounting/integration-provider';
import {
  handleInvoicingPaymentGatewayWebhook,
} from '@/lib/apps/invoicing/integration-provider';

export const APP_RUNTIME_INTEGRATION_WEBHOOK_HANDLERS =
  new Map<string,SamiAppIntegrationWebhookHandler>([
    ['accounting_bank_feed',handleAccountingBankFeedWebhook],
    ['accounting_document_extractor',handleAccountingDocumentExtractorWebhook],
    ['invoicing_payment_gateway',handleInvoicingPaymentGatewayWebhook],
  ]);
