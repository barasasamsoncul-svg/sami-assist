import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
async function source(file){return (await readFile(path.join(root,file),'utf8')).replace(/\r\n/g,'\n');}

test('Inventory ledger upgrade is registered and versioned 2.3.0 to 2.4.0',async()=>{
 const [m,r,f]=await Promise.all([source('lib/apps/inventory/migrations/2.3.0-to-2.4.0.ts'),source('lib/apps/runtime-migrations.ts'),source('lib/modules/first-party.ts')]);
 assert.match(m,/moduleKey:\s*'inventory'/);assert.match(m,/fromVersion:\s*'2\.3\.0'/);assert.match(m,/toVersion:\s*'2\.4\.0'/);assert.match(r,/INVENTORY_2_3_0_TO_2_4_0/);
 const s=f.indexOf('key: "inventory"'),e=f.indexOf('defineSamiModule({',s+12);assert.match(f.slice(s,e),/version:\s*'2\.4\.0'/);
});

test('Inventory schema migration scopes identities and stock references by company',async()=>{
 const m=await source('lib/apps/inventory/migrations/2.3.0-to-2.4.0.ts');
 assert.match(m,/products_sku_key/);assert.match(m,/warehouses_code_key/);assert.match(m,/uq_products_company_sku/);assert.match(m,/uq_products_company_barcode/);assert.match(m,/uq_warehouses_company_code/);assert.match(m,/FOREIGN KEY \(company_id,product_id\)/);assert.match(m,/FOREIGN KEY \(company_id,warehouse_id\)/);assert.match(m,/NOT VALID/);assert.match(m,/ALTER COLUMN quantity TYPE NUMERIC\(19,4\)/);assert.match(m,/fk_stock_reservations_company_lot/);assert.match(m,/fk_inventory_lots_company_product/);assert.match(m,/ambiguous legacy ownership is never guessed/i);
});

test('Inventory generic mutations cannot bypass the stock ledger',async()=>{
 const h=await source('lib/apps/enterprise/domain-hooks.ts');
 assert.match(h,/Stock balances are derived from the stock movement ledger/);assert.match(h,/Stock reservations are controlled by the Sales and Inventory reservation workflows/);assert.match(h,/Posted stock movements are immutable/);assert.match(h,/FOR SHARE OF product, warehouse/);assert.match(h,/product\.company_id = \$3/);assert.match(h,/warehouse\.company_id = \$3/);assert.match(h,/WHERE stock_levels\.company_id = EXCLUDED\.company_id/);assert.match(h,/Insufficient unreserved stock for this movement/);
});

test('Purchase is explicitly dependent on Inventory',async()=>{
 const f=await source('lib/modules/first-party.ts');const s=f.indexOf('key: "purchase"'),e=f.indexOf('defineSamiModule({',s+12);assert.match(f.slice(s,e),/depends:\s*\['inventory'\]/);
});

test('Inventory runtime hardening applies the ledger contract for fresh installations too', async () => {
  const hardening = await source('lib/apps/enterprise/hardening.ts');
  const enterprise = await source('lib/apps/enterprise/service.ts');
  assert.match(hardening, /moduleKey === 'inventory'[\s\S]*inventoryLedgerIntegritySql/);
  assert.match(hardening, /CREATE UNIQUE INDEX IF NOT EXISTS uq_products_company_sku/);
  assert.match(hardening, /fk_stock_levels_company_product/);
  assert.match(hardening, /ALTER COLUMN quantity TYPE NUMERIC\(19,4\)/);
  assert.match(hardening, /fk_stock_reservations_company_lot/);
  assert.match(enterprise, /const ledgerManaged =[\s\S]*stock_movements[\s\S]*inventory_adjustments/);
  assert.match(enterprise, /!ledgerManaged[\s\S]*capabilities\.canCreate/);
  assert.match(enterprise, /!ledgerManaged[\s\S]*capabilities\.canEdit/);
  assert.match(enterprise, /!ledgerManaged[\s\S]*capabilities\.canDelete/);
});

test('Inventory movement retries retain idempotency only for an identical payload', async () => {
  const panel = await source('app/apps/inventory/InventoryStockControlPanel.tsx');
  assert.match(panel, /payloadFingerprintRef/);
  assert.match(panel, /payloadFingerprintRef\.current !== fingerprint/);
  assert.match(panel, /JSON\.stringify\(\{\.\.\.movementPayload,idempotencyKey:keyRef\.current\}\)/);
});

test('Inventory low-stock indicators honour active company-specific reorder rules', async () => {
  const service = await source('lib/apps/inventory/service.ts');
  assert.match(service, /LEFT JOIN public\.inventory_reorder_rules rule/);
  assert.match(service, /rule\.company_id = sl\.company_id/);
  assert.match(service, /COALESCE\(rule\.min_quantity, sl\.reorder_level\)/);
  assert.match(service, /rule\.status = 'active'/);
});

test('Inventory reads enforce view scope for every company-scoped stock data source', async () => {
  const service = await source('lib/apps/inventory/service.ts');
  const api = await source('app/api/apps/inventory/route.ts');
  assert.match(service, /requireEnterpriseModuleTableContext\('inventory', 'stock_levels', 'view'\)/);
  assert.match(service, /requireEnterpriseModuleTableContext\('inventory', 'stock_movements', 'view'\)/);
  assert.match(service, /requireEnterpriseModuleTableContext\('inventory', 'products', 'view'\)/);
  assert.match(service, /requireEnterpriseModuleTableContext\('inventory', 'warehouses', 'view'\)/);
  assert.match(service, /requireEnterpriseModuleTableContext\('inventory', 'stock_reservations', 'view'\)/);
  assert.match(service, /requireEnterpriseModuleTableContext\('inventory', 'inventory_reorder_rules', 'view'\)/);
  assert.match(service, /contexts\.some\(\(context\)/);
  assert.match(api, /sec-fetch-site/);
  assert.match(api, /MAX_BODY_BYTES/);
});
