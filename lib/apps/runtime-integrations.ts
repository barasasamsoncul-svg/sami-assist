import 'server-only';

import type {
  SamiIntegrationProviderDefinition,
} from '@/lib/integrations/types';

export const APP_RUNTIME_INTEGRATION_PROVIDERS:
  SamiIntegrationProviderDefinition[] = [
    {
      key:'accounting_bank_feed',
      name:'Accounting Bank Feed',
      description:'Receive verified normalized bank, cash or mobile-money transactions from a bank, aggregator or provider bridge and import them into Accounting.',
      category:'finance',
      iconKey:'landmark',
      connectionType:'webhook',
      websiteUrl:null,
      docsUrl:null,
      capabilities:['inbound_webhook','automation_triggers'],
      moduleKey:'accounting',
    },
    {
      key:'accounting_document_extractor',
      name:'Accounting Document Extractor',
      description:'Receive verified OCR/document extraction results for private Accounting documents, including PDFs handled by an external provider bridge.',
      category:'finance',
      iconKey:'scan-line',
      connectionType:'webhook',
      websiteUrl:null,
      docsUrl:null,
      capabilities:['inbound_webhook','automation_triggers'],
      moduleKey:'accounting',
    },
    {
      key:'invoicing_payment_gateway',
      name:'Invoice Payment Gateway',
      description:'Receive verified normalized payment events from a gateway or provider bridge and settle SaMi invoices automatically.',
      category:'commerce',
      iconKey:'credit-card',
      connectionType:'webhook',
      websiteUrl:null,
      docsUrl:null,
      capabilities:['inbound_webhook','automation_triggers'],
      moduleKey:'invoicing',
    },
  ];
