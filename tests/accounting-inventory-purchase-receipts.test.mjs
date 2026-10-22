import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('Accounting valuation captures posted Purchase receipts with confirmed PO-line cost', async () => {
  const service = await source('lib/apps/accounting/inventory-valuation.ts');
  const start = service.indexOf('async function backfillSourceEvents');
  const end = service.indexOf('function builtInTreatment', start);
  const backfill = service.slice(start, end);

  assert.match(backfill, /input\.runtime\.purchaseReceipts/);
  assert.match(backfill, /receipt\.status = 'posted'/);
  assert.match(backfill, /receipt_line\.quantity_received/);
  assert.match(backfill, /receipt_line\.quantity_received - receipt_line\.quantity_rejected/);
  assert.match(backfill, /product\.cost_price/);
  assert.match(backfill, /order_item\.unit_cost/);
  assert.match(backfill, /'backfill_current_standard_cost'/);
  assert.match(backfill, /'purchaseOrderUnitCost', order_item\.unit_cost/);
  assert.match(backfill, /'standardCostUnitCost', product\.cost_price/);
  assert.match(backfill, /'valuationCostBasis', 'product_standard_cost'/);
  assert.match(backfill, /'purchase:receipt-line:'/);
  assert.match(backfill, /ON CONFLICT \(company_id, source_event_key\)[\s\S]*?DO NOTHING/);
  assert.match(backfill, /'costProvenance', 'confirmed_purchase_order_line'/);
});

test('Purchase receipt valuation posts Inventory Asset against GRNI, not COGS or an unbalanced journal', async () => {
  const service = await source('lib/apps/accounting/inventory-valuation.ts');
  const start = service.indexOf('function builtInTreatment');
  const end = service.indexOf('async function eventTreatment', start);
  const classifier = service.slice(start, end);
  assert.match(classifier, /movementType === 'purchase_receipt'[\s\S]*?sourceType === 'purchase_receipt'[\s\S]*?return 'receive_inventory'/);
  const treatmentStart = service.indexOf('async function eventTreatment');
  const treatmentEnd = service.indexOf('async function postingAccounts', treatmentStart);
  assert.match(service.slice(treatmentStart, treatmentEnd), /purchaseOrderUnitCost/);
  assert.match(service.slice(treatmentStart, treatmentEnd), /return 'review'/);

  const effectStart = service.indexOf('function treatmentEffect');
  const effectEnd = service.indexOf('async function currentReconciliation', effectStart);
  assert.match(service.slice(effectStart, effectEnd), /'receive_inventory'[\s\S]*?return q/);

  const postingStart = service.indexOf('const accounts =');
  const postingEnd = service.indexOf('const journal =', postingStart);
  const posting = service.slice(postingStart, postingEnd);
  assert.match(posting, /treatment ===\s*'receive_inventory'/);
  assert.match(posting, /accounts\.grni/);
  assert.match(posting, /debitAccount = accounts\.asset/);
  assert.match(posting, /creditAccount = accounts\.grni/);
  assert.match(posting, /Map a Goods Received Not Invoiced liability account/);
  assert.match(posting, /Map a Purchase Price Variance expense account/);
  assert.match(posting, /actualPurchaseValue/);
  assert.match(posting, /varianceCents =\s*actualPurchaseCents - valueCents/);
  assert.match(posting, /accountId: accounts\.priceVariance/);
  assert.match(posting, /purchase price variance/);
});

test('GRNI configuration is company-scoped, typed as a liability, and exposed in Accounting controls', async () => {
  const [schema, service, ui] = await Promise.all([
    source('lib/apps/accounting/inventory-valuation-schema.ts'),
    source('lib/apps/accounting/inventory-valuation.ts'),
    source('app/apps/accounting/AccountingInventoryValuation.tsx'),
  ]);

  assert.match(schema, /goods_received_not_invoiced_account_id UUID REFERENCES public\.accounts\(id\)/);
  assert.match(schema, /purchase_price_variance_account_id UUID REFERENCES public\.accounts\(id\)/);
  assert.match(schema, /sync_purchase_receipts BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(schema, /'purchase_receipt'/);
  assert.match(schema, /'backfill_current_standard_cost'/);
  assert.match(schema, /'receive_inventory'/);

  assert.match(service, /function liabilityAccount/);
  assert.match(service, /'Goods Received Not Invoiced'[\s\S]*?liabilityAccount/);
  assert.match(service, /'Purchase Price Variance'[\s\S]*?expenseAccount/);
  assert.match(service, /sync_purchase_receipts =\s*EXCLUDED\.sync_purchase_receipts/);

  assert.match(ui, /Goods Received Not Invoiced \(GRNI\)/);
  assert.match(ui, /Purchase Price Variance \(PPV\)/);
  assert.match(ui, /purchasePriceVarianceAccountId/);
  assert.match(ui, /liabilityAccounts/);
  assert.match(ui, /syncPurchaseReceipts/);
  assert.match(ui, /Receive purchased goods \(Inventory Asset \/ GRNI\)/);
});
