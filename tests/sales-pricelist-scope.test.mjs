import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('product-specific pricelist rules require active catalogue items from the same company before replacing rules', async () => {
  const sourceText = await source('lib/apps/sales/commercial.ts');
  const saveStart = sourceText.indexOf('export async function saveSalesPricelist(');
  const saveEnd = sourceText.indexOf('export async function resolveSalesPricelistUnitPrice(', saveStart);
  assert.ok(saveStart >= 0 && saveEnd > saveStart, 'pricelist save function must exist');
  const save = sourceText.slice(saveStart, saveEnd);
  const validationIndex = save.indexOf('const validCatalogItems = await client.query(');
  const deleteIndex = save.indexOf('DELETE FROM sales_pricelist_rules');
  assert.ok(validationIndex >= 0, 'catalogue membership query must exist');
  assert.ok(deleteIndex > validationIndex, 'validate all referenced products before deleting existing rules');
  assert.match(save, /FROM invoicing_catalog_items[\s\S]*?WHERE company_id = \$1[\s\S]*?id = ANY\(\$2::uuid\[\]\)[\s\S]*?is_active = TRUE[\s\S]*?deleted_at IS NULL/);
  assert.match(save, /validCatalogItems\.rows\.length !== scopedCatalogItemIds\.length/);
  assert.match(save, /Every product-specific pricelist rule must reference an active catalogue item in this company/);
  assert.match(save, /catch \([\s\S]*?await client\.query\([\s\S]*?'ROLLBACK'/);
});

test('pricelist scope validation is included in the Sales CI regression suite', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-pricelist-scope\.test\.mjs/);
});


test('effective-dated pricelist resolution and issued quote-price snapshots are exercised against PostgreSQL', async () => {
  const [integrationTest, packageJson] = await Promise.all([
    source('tests/erp-parity-integration.test.ts'),
    source('package.json'),
  ]);

  assert.match(integrationTest, /ERP parity: effective-dated Sales pricelists and quote-line snapshots execute in PostgreSQL/);
  assert.match(integrationTest, /createSalesQuoteTransaction/);
  assert.match(integrationTest, /resolveSalesPricelistUnitPrice/);
  assert.match(integrationTest, /valid_from/);
  assert.match(integrationTest, /valid_until/);
  assert.match(integrationTest, /unit_price/);
  assert.match(packageJson.scripts['test:erp-integration'], /tests\/erp-parity-integration\.test\.ts/);
});
