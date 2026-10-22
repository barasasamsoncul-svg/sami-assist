import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('Purchase receipt posting fails closed when the Inventory dependency is not ready', async () => {
  const transitions = await source('lib/apps/enterprise/specialist-finance-transitions.ts');

  assert.match(transitions, /const requiredInventoryTables = \[/);
  assert.match(transitions, /'products'[\s\S]*?'warehouses'[\s\S]*?'stock_movements'[\s\S]*?'stock_levels'/);
  assert.match(transitions, /Inventory must be installed and ready before this purchase receipt can be posted/);
  assert.doesNotMatch(
    transitions.slice(
      transitions.indexOf('async function postPurchaseReceiptToInventory'),
      transitions.indexOf('async function reimburseExpenseReport'),
    ),
    /if \(\s*!hasInventory\s*\)\s*\{\s*return;/,
    'A receipt must never become posted when Inventory could not receive the stock.',
  );
});

test('Purchase receipt posting validates status, order, product, warehouse, and receipt quantities', async () => {
  const transitions = await source('lib/apps/enterprise/specialist-finance-transitions.ts');

  const start = transitions.indexOf('async function postPurchaseReceiptToInventory');
  const end = transitions.indexOf('async function reimburseExpenseReport', start);
  const posting = transitions.slice(start, end);

  assert.match(posting, /receiptStatus !== 'received' && receiptStatus !== 'inspected'/);
  assert.match(posting, /String\(order\.status \|\| ''\)\.toLowerCase\(\) !== 'confirmed'/);
  assert.match(posting, /purchase_order_item_id::text/);
  assert.match(posting, /product_reference::text/);
  assert.match(posting, /purchase_order_id = \$3/);
  assert.match(posting, /productId !== orderProductId/);
  assert.match(posting, /quantity_rejected/);
  assert.match(posting, /acceptedQuantity \+ priorQuantity[\s\S]*?orderedQuantity/);
  assert.match(posting, /product\.company_id = \$1/);
  assert.match(posting, /warehouse\.company_id = \$1/);
  assert.match(posting, /FOR SHARE OF product, warehouse/);
});

test('Purchase receipts post idempotently to the shared company-scoped Inventory ledger', async () => {
  const transitions = await source('lib/apps/enterprise/specialist-finance-transitions.ts');

  const start = transitions.indexOf('async function postPurchaseReceiptToInventory');
  const end = transitions.indexOf('async function reimburseExpenseReport', start);
  const posting = transitions.slice(start, end);

  assert.match(posting, /movementReference = 'purchase_receipt:' \+ receiptId \+ ':' \+ line\.id/);
  assert.match(posting, /movement_type,[\s\S]*?VALUES \([\s\S]*?'purchase_receipt'/);
  assert.match(posting, /existing\.product_id/);
  assert.match(posting, /existing\.warehouse_id/);
  assert.match(posting, /ON CONFLICT \(product_id, warehouse_id\)[\s\S]*?WHERE stock_levels\.company_id = EXCLUDED\.company_id/);
  assert.match(posting, /updated_by/);
  assert.match(posting, /INSERT INTO stock_levels/);
});

test('Purchase product and warehouse links are company-safe and additive for existing workspaces', async () => {
  const [purchaseSchema, specialistDepth] = await Promise.all([
    source('lib/apps/purchase/schema.sql'),
    source('lib/apps/enterprise/specialist-finance-depth.ts'),
  ]);

  assert.match(purchaseSchema, /CREATE TABLE IF NOT EXISTS public\.purchase_order_items \([\s\S]*?product_reference UUID/);
  assert.match(specialistDepth, /ALTER TABLE public\.purchase_order_items[\s\S]*?ADD COLUMN IF NOT EXISTS product_reference UUID/);
  assert.match(specialistDepth, /ADD COLUMN IF NOT EXISTS warehouse_reference UUID/);
  assert.match(specialistDepth, /fk_purchase_order_items_company_product/);
  assert.match(specialistDepth, /fk_purchase_receipts_company_warehouse/);
  assert.match(specialistDepth, /fk_purchase_receipt_lines_company_po_item/);
  assert.match(specialistDepth, /NOT VALID/);
});

test('Purchase orders cannot be manually marked received before every line is fully posted to Inventory', async () => {
  const service = await source('lib/apps/enterprise/service.ts');

  assert.match(service, /context\.moduleKey ===\s*'purchase'[\s\S]*?table ===\s*'purchase_orders'[\s\S]*?next ===\s*'received'/);
  assert.match(service, /receiptCoverage/);
  assert.match(service, /outstanding_line_count/);
  assert.match(service, /receipt\.status = 'posted'/);
  assert.match(service, /A purchase order can be marked received only after every ordered line has been fully received and posted through Inventory/);
});
