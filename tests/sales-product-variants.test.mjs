import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales product variants have an additive 3.4.19 migration and runtime registration', async () => {
  const [manifest, migration, runtime, schema] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/migrations/3.4.18-to-3.4.19.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/sales/schema.sql'),
  ]);

  assert.match(manifest, /key: "sales"[\s\S]*?version: '3\.4\.19'/);
  assert.match(migration, /fromVersion: '3\.4\.18'/);
  assert.match(migration, /toVersion: '3\.4\.19'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.sales_product_variants/);
  assert.match(migration, /uq_sales_product_variants_sku/);
  assert.match(runtime, /SALES_3_4_18_TO_3_4_19/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS public\.sales_product_variants/);
});

test('variant create, update and archive stay company-scoped and transactional', async () => {
  const variants = await source('lib/apps/sales/product-variants.ts');

  assert.match(variants, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_CREATE\)/);
  assert.match(variants, /invoicing\.catalog\.manage/);
  assert.match(variants, /WHERE id=\$1 AND company_id=\$2/);
  assert.match(variants, /pg_advisory_xact_lock/);
  assert.match(variants, /await client\.query\('BEGIN'\)/);
  assert.match(variants, /await client\.query\('COMMIT'\)/);
  assert.match(variants, /await client\.query\('ROLLBACK'\)/);
  assert.match(variants, /SALES_PERMISSIONS\.MARGIN_MANAGE/);
  assert.match(variants, /sales\.product\.variant\.created/);
  assert.match(variants, /sales\.product\.variant\.updated/);
  assert.match(variants, /sales\.product\.variant\.archived/);
  assert.match(variants, /variant_catalog_item_id/);
  assert.doesNotMatch(variants, /input\.companyId|input\.tenantId/);
});

test('bulk import validates bounds, reports each row and can import variant rows by base SKU', async () => {
  const [variants, service, route] = await Promise.all([
    source('lib/apps/sales/product-variants.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
  ]);

  assert.match(variants, /rows\.length > 200/);
  assert.match(variants, /baseProductSku/);
  assert.match(variants, /variantAttributes/);
  assert.match(variants, /item\.company_id=\$1/);
  assert.match(variants, /row: rowNumber, success: false/);
  assert.match(variants, /row: rowNumber, success: true/);
  assert.match(service, /bulkImportSalesCatalogItems/);
  assert.match(route, /bulk_import_catalog_items:\s*bulkImportSalesCatalogItems/);
  assert.match(route, /create_product_variant:\s*createSalesProductVariant/);
  assert.match(route, /update_product_variant:\s*updateSalesProductVariant/);
  assert.match(route, /archive_product_variant:\s*archiveSalesProductVariant/);
});

test('catalogue management capability matches the Sales and shared-catalogue permissions', async () => {
  const queries = await source('lib/apps/sales/queries.ts');
  assert.match(
    queries,
    /canManageCatalog:\s*can\([\s\S]*?QUOTE_CREATE[\s\S]*?can\([\s\S]*?QUOTE_EDIT[\s\S]*?crossCan\([\s\S]*?INVOICING_CATALOG_MANAGE/,
  );
});

test('catalogue UI provides CSV import/export plus variant create, edit and archive', async () => {
  const [manager, composer, optionalEditor] = await Promise.all([
    source('app/apps/sales/SalesProductCatalogueManager.tsx'),
    source('app/apps/sales/SalesQuoteComposer.tsx'),
    source('app/apps/sales/SalesOptionalProductsEditor.tsx'),
  ]);

  assert.match(manager, /function parseCsv/);
  assert.match(manager, /function downloadCsv/);
  assert.match(manager, /Import CSV/);
  assert.match(manager, /Export CSV/);
  assert.match(manager, /baseProductSku/);
  assert.match(manager, /variantAttributes/);
  assert.match(manager, /create_product_variant/);
  assert.match(manager, /update_product_variant/);
  assert.match(manager, /archive_product_variant/);
  assert.match(manager, /Product variants/);
  assert.ok(manager.includes("char === '\\n'"), 'CSV parser must split real newline characters');
  assert.ok(manager.includes("join('\\r\\n')"), 'CSV export must use CRLF row separators');
  assert.match(composer, /item\.isVariant[\s\S]*?\? item\.name/);
  assert.match(optionalEditor, /product\.isVariant[\s\S]*?\? product\.name/);
});
