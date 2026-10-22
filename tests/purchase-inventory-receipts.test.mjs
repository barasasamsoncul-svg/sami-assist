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
  assert.match(specialistDepth, /ALTER TABLE public.products[\s\S]*?ADD COLUMN IF NOT EXISTS company_id UUID/);
  assert.match(specialistDepth, /ALTER TABLE public.warehouses[\s\S]*?ADD COLUMN IF NOT EXISTS company_id UUID/);
  assert.match(specialistDepth, /fk_purchase_products_company/);
  assert.match(specialistDepth, /fk_purchase_warehouses_company/);
  assert.match(specialistDepth, /ALTER TABLE public.purchase_orders[\s\S]*?ADD COLUMN IF NOT EXISTS company_id UUID/);
  assert.match(specialistDepth, /ALTER TABLE public.purchase_order_items[\s\S]*?ADD COLUMN IF NOT EXISTS company_id UUID/);
  assert.ok(
    specialistDepth.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_company_id_id') <
      specialistDepth.indexOf('fk_purchase_receipts_company_order'),
    'The composite purchase-order key must exist before the company-safe receipt FK is created.',
  );
  assert.match(specialistDepth, /uq_products_company_id_id/);
  assert.match(specialistDepth, /uq_warehouses_company_id_id/);
  assert.match(specialistDepth, /ALTER TABLE public\.purchase_order_items[\s\S]*?ADD COLUMN IF NOT EXISTS product_reference UUID/);
  assert.match(specialistDepth, /ADD COLUMN IF NOT EXISTS warehouse_reference UUID/);
  assert.match(specialistDepth, /fk_purchase_order_items_company_product/);
  assert.match(specialistDepth, /fk_purchase_order_items_company_order/);
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

test('Purchase uses a dedicated Sales-style workspace shell rather than the generic app surface shell', async () => {
  const [shell, workspace] = await Promise.all([
    source('app/apps/purchase/PurchaseModuleShell.tsx'),
    source('app/apps/purchase/PurchaseWorkspace.tsx'),
  ]);

  assert.match(shell, /data-purchase-shell="standalone"/);
  assert.match(shell, /aria-label="Purchase navigation"/);
  assert.match(shell, /WorkspaceAppSwitcher/);
  assert.match(shell, /WorkspaceTenantSwitcher/);
  assert.match(shell, /WorkspaceNotificationCenter/);
  assert.doesNotMatch(shell, /<AppSurfaceShell/);
  assert.match(workspace, /PurchaseModuleShell/);
  assert.match(workspace, /PurchaseWorkspaceClient/);
  assert.doesNotMatch(workspace, /AppSurfaceShell/);
});


test('Purchase supplier master syncs idempotently into Accounting AP vendors when Accounting is installed', async () => {
  const [sync, hooks, accountingSchema, purchaseSchema] = await Promise.all([
    source('lib/apps/purchase/accounting-supplier-sync.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/specialist-finance-depth.ts'),
  ]);

  assert.match(sync, /to_regclass\('public\.accounting_vendors'\)/);
  assert.match(sync, /purchase_supplier_id/);
  assert.match(sync, /uq_accounting_vendors_company_purchase_supplier/);
  assert.match(sync, /ON CONFLICT \(company_id, purchase_supplier_id\)/);
  assert.match(sync, /WHERE purchase_supplier_id IS NOT NULL AND deleted_at IS NULL/);
  assert.match(sync, /input\.operation === 'delete'/);
  assert.match(sync, /status='inactive'/);
  assert.match(sync, /input\.companyId/);
  assert.match(sync, /SELECT id::text[\s\S]*?FROM public\.suppliers[\s\S]*?company_id = \$2/);
  assert.match(sync, /FOR SHARE/);
  assert.match(sync, /Purchase supplier is not part of the active company/);

  assert.match(hooks, /syncPurchaseSupplierToAccounting/);
  assert.match(hooks, /moduleKey === 'purchase'[\s\S]*?table === 'suppliers'/);
  assert.match(accountingSchema, /ADD COLUMN IF NOT EXISTS purchase_supplier_id UUID/);
  assert.match(accountingSchema, /uq_accounting_vendors_company_purchase_supplier/);
  assert.match(accountingSchema, /fk_accounting_vendors_company_purchase_supplier/);
  assert.match(accountingSchema, /to_regclass\('public\.suppliers'\)/);
  assert.match(purchaseSchema, /fk_accounting_vendors_company_purchase_supplier/);
  assert.match(purchaseSchema, /uq_purchase_suppliers_company_id_id/);
  assert.match(purchaseSchema, /to_regclass\('public\.accounting_vendors'\)/);
});
