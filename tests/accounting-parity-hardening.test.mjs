import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path){
  return readFile(new URL('../'+path,import.meta.url),'utf8');
}

test('Accounting 2.34 parity schema is additive and evidence preserving',async()=>{
  const schema=await source('lib/apps/accounting/parity-hardening-schema.ts');
  for(const table of [
    'accounting_document_extractions',
    'accounting_custom_reports',
    'accounting_custom_report_runs',
  ]) assert.match(schema,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table));
  assert.match(schema,/uq_accounting_document_extraction_request/);
  assert.match(schema,/idx_accounting_document_extractions_status/);
  assert.match(schema,/idx_accounting_custom_reports_company/);
  assert.doesNotMatch(schema,/DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test('financial provider connectors reuse authoritative services and current permissions',async()=>{
  const [
    runtime,
    accountingProvider,
    invoicingProvider,
    webhooks,
    paymentCore,
    commands,
    externalSettlement,
    statements,
    service,
  ]=await Promise.all([
    source('lib/apps/runtime-integrations.ts'),
    source('lib/apps/accounting/integration-provider.ts'),
    source('lib/apps/invoicing/integration-provider.ts'),
    source('lib/integrations/webhooks.ts'),
    source('lib/apps/invoicing/payment-core.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/external-settlement.ts'),
    source('lib/apps/accounting/statements.ts'),
    source('lib/services/workspace-integrations.ts'),
  ]);

  for(const key of [
    'accounting_bank_feed',
    'accounting_document_extractor',
    'invoicing_payment_gateway',
  ]) assert.match(runtime,new RegExp(key));

  assert.match(accountingProvider,/ingestNormalizedFeedTrusted/);
  assert.match(accountingProvider,/context\.integrationEventId/);
  assert.match(accountingProvider,/accounting\.record\.create/);
  assert.match(invoicingProvider,/invoicing\.payment\.record/);
  assert.match(invoicingProvider,/invoicing\.payment\.succeeded/);
  assert.match(externalSettlement,/recordInvoicePaymentCore/);
  assert.match(externalSettlement,/payment currency must match the invoice currency/i);
  assert.match(externalSettlement,/succeeded.*paid.*completed.*success/s);
  assert.match(commands,/recordInvoicePaymentCore/);
  assert.match(paymentCore,/postInvoicePaymentToAccounting/);
  assert.match(paymentCore,/postInvoicePaymentAllocationToAccounting/);
  assert.match(paymentCore,/invoicing-payment-idempotency/);
  assert.match(statements,/ingestNormalizedFeedTrusted/);
  assert.match(service,/requestedProviderKey/);

  assert.match(webhooks,/WEBHOOK_EVENT_CONFLICT/);
  assert.match(webhooks,/retryingFailedDelivery/);
  assert.match(webhooks,/APP_RUNTIME_INTEGRATION_WEBHOOK_HANDLERS/);
  assert.match(webhooks,/resolveAutomationWorkerRuntime/);
});

test('strict reconciliation only auto-closes unique exact high-confidence matches',async()=>{
  const [service,route,ui]=await Promise.all([
    source('lib/apps/accounting/reconciliation.ts'),
    source('app/api/apps/accounting/reconciliation/route.ts'),
    source('app/apps/accounting/AccountingReconciliation.tsx'),
  ]);
  assert.match(service,/confidence<95/);
  assert.match(service,/exactAmountRequired:true/);
  assert.match(service,/uniqueMatchRequired:true/);
  assert.match(service,/competing\.length>1/);
  assert.match(route,/auto-reconcile-strict/);
  assert.match(ui,/Strict auto-reconcile/);
});

test('document capture remains review-only and uses configured SaMi AI',async()=>{
  const [service,ui,route]=await Promise.all([
    source('lib/apps/accounting/document-extraction.ts'),
    source('app/apps/accounting/AccountingDocumentCapture.tsx'),
    source('app/api/apps/accounting/document-capture/route.ts'),
  ]);
  assert.match(service,/requireSamiAiProviderConfig/);
  assert.match(service,/assertAiMonthlyUsageAvailable/);
  assert.match(service,/getPrivateObjectBytes/);
  assert.match(service,/reviewRequired:true/);
  assert.match(service,/status='extracted'/);
  assert.doesNotMatch(service,/postBalancedLedgerJournal|postPayablesDocument|INSERT INTO accounting_vendor_documents/i);
  assert.match(ui,/No financial record was posted/);
  assert.match(route,/extractAccountingDocument/);
  assert.match(route,/reviewAccountingDocumentExtraction/);
});

test('custom reports are governed datasets rather than arbitrary SQL',async()=>{
  const [service,ui]=await Promise.all([
    source('lib/apps/accounting/custom-reports.ts'),
    source('app/apps/accounting/AccountingCustomReports.tsx'),
  ]);
  for(const dataset of [
    'general_ledger',
    'trial_balance',
    'receivables',
    'payables',
    'bank_reconciliation',
    'budget_variance',
  ]) assert.match(service,new RegExp(dataset));
  assert.match(service,/LIMIT 5000/);
  assert.match(service,/groupBy/);
  assert.match(ui,/SaMi never accepts custom SQL/);
  assert.match(ui,/Export current CSV/);
});

test('localization packs are versioned and never import statutory tax rates',async()=>{
  const [packs,route,ui]=await Promise.all([
    source('lib/apps/accounting/localization-packs.ts'),
    source('app/api/apps/accounting/international/route.ts'),
    source('app/apps/accounting/AccountingInternational.tsx'),
  ]);
  assert.match(packs,/packVersion/);
  assert.match(packs,/accounting_localization_pack_history/);
  assert.match(packs,/taxRatesImported:false/);
  assert.match(packs,/references tax codes that are not configured/i);
  assert.match(route,/import-pack/);
  assert.match(ui,/Import versioned pack/);
});

test('2.34 and 2.22 migrations and module extensions are registered',async()=>{
  const [manifest,migrations,accountingMigration,invoicingMigration,workspace,panel,catalog,depth,hooks]=await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.33.0-to-2.34.0.ts'),
    source('lib/apps/invoicing/migrations/2.21.0-to-2.22.0.ts'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),
  ]);

  assert.match(manifest,/key:\s*"accounting"[\s\S]*version:\s*'2\.34\.0'/);
  assert.match(manifest,/key:\s*"accounting"[\s\S]*integrationProviders:\s*true/);
  assert.match(manifest,/key:\s*"invoicing"[\s\S]*version:\s*'2\.22\.0'/);
  assert.match(manifest,/key:\s*"invoicing"[\s\S]*integrationProviders:\s*true/);
  assert.match(migrations,/ACCOUNTING_2_33_0_TO_2_34_0/);
  assert.match(migrations,/INVOICING_2_21_0_TO_2_22_0/);
  assert.match(accountingMigration,/fromVersion:'2\.33\.0'[\s\S]*toVersion:'2\.34\.0'/);
  assert.match(invoicingMigration,/fromVersion:'2\.21\.0'[\s\S]*toVersion:'2\.22\.0'/);
  assert.match(workspace,/document-capture[\s\S]*AccountingDocumentCapture/);
  assert.match(workspace,/custom-reports[\s\S]*AccountingCustomReports/);
  assert.match(panel,/"document-capture"/);
  assert.match(panel,/"custom-reports"/);
  assert.match(catalog,/accounting_document_extractions/);
  assert.match(catalog,/accounting_custom_reports/);
  assert.match(depth,/ACCOUNTING_PARITY_HARDENING_SQL/);
  assert.match(hooks,/accounting_document_extractions/);
  assert.match(hooks,/accounting_custom_reports/);
});
