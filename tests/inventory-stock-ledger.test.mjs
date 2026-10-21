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
 assert.match(m,/products_sku_key/);assert.match(m,/warehouses_code_key/);assert.match(m,/uq_products_company_sku/);assert.match(m,/uq_products_company_barcode/);assert.match(m,/uq_warehouses_company_code/);assert.match(m,/FOREIGN KEY \(company_id,product_id\)/);assert.match(m,/FOREIGN KEY \(company_id,warehouse_id\)/);assert.match(m,/NOT VALID/);assert.match(m,/ambiguous legacy ownership is never guessed/i);
});

test('Inventory generic mutations cannot bypass the stock ledger',async()=>{
 const h=await source('lib/apps/enterprise/domain-hooks.ts');
 assert.match(h,/Stock balances are derived from the stock movement ledger/);assert.match(h,/Stock reservations are controlled by the Sales and Inventory reservation workflows/);assert.match(h,/Posted stock movements are immutable/);assert.match(h,/FOR SHARE OF product, warehouse/);assert.match(h,/product\.company_id = \$3/);assert.match(h,/warehouse\.company_id = \$3/);assert.match(h,/WHERE stock_levels\.company_id = EXCLUDED\.company_id/);assert.match(h,/Insufficient unreserved stock for this movement/);
});

test('Purchase is explicitly dependent on Inventory',async()=>{
 const f=await source('lib/modules/first-party.ts');const s=f.indexOf('key: "purchase"'),e=f.indexOf('defineSamiModule({',s+12);assert.match(f.slice(s,e),/depends:\s*\['inventory'\]/);
});
