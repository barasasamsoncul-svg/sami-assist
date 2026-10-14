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

test('base catalogue editor exposes internal cost only to authorized users and persists metadata on create/update', async () => {
  const [manager, salesCommands, invoicingCommands] = await Promise.all([
    source('app/apps/sales/SalesProductCatalogueManager.tsx'),
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/invoicing/commands.ts'),
  ]);

  assert.match(manager, /label="Unit cost \(internal\)"/);
  assert.match(manager, /data\.capabilities\.canManageMargin \? \(/);
  assert.match(manager, /data\.capabilities\.canManageMargin && draft\.unitCost\.trim\(\) !== ''/);
  assert.match(salesCommands, /export async function createSalesCatalogItem[\s\S]*?crossPermission\(context, SALES_PERMISSIONS\.MARGIN_MANAGE\)[\s\S]*?standardCost === undefined \? undefined : \{ standardCost \}/);
  assert.match(salesCommands, /export async function updateSalesCatalogItem[\s\S]*?crossPermission\(context, SALES_PERMISSIONS\.MARGIN_MANAGE\)[\s\S]*?standardCost === undefined \? undefined : \{ standardCost \}/);
  assert.match(invoicingCommands, /export async function updateInvoicingCatalogItem\([\s\S]*?standardCost\?: number/);
  assert.match(invoicingCommands, /SET metadata = COALESCE\(metadata, '\{\}'::jsonb\) \|\| \$3::jsonb/);
});

test('base catalogue CSV imports preserve authorized unit costs in metadata and reject unauthorized cost writes', async () => {
  const [salesCommands, invoicingCommands, variants] = await Promise.all([
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/sales/product-variants.ts'),
  ]);

  assert.match(salesCommands, /rawCost = input\.unitCost/);
  assert.match(salesCommands, /crossPermission\(context, SALES_PERMISSIONS\.MARGIN_MANAGE\)/);
  assert.match(salesCommands, /if \(error instanceof SalesError\) \{\s*throw error;/);
  assert.match(salesCommands, /createInvoicingCatalogItem\([\s\S]*?standardCost === undefined \? undefined : \{ standardCost \}/);
  assert.match(invoicingCommands, /standardCost\?: number/);
  assert.match(invoicingCommands, /metadata[\s\S]*?standardCost: options\.standardCost[\s\S]*?unitCost: options\.standardCost/);
  assert.match(variants, /const optionalUnitCost = cleanText\(row\.unitCost, 60\);[\s\S]*?\.\.\.\(optionalUnitCost \? \{ unitCost: optionalUnitCost \} : \{\}\)/);
});

test('new variants inherit the base product cost unless an authorized user overrides it', async () => {
  const variants = await source('lib/apps/sales/product-variants.ts');

  assert.match(variants, /default_tax_group_id,metadata/);
  assert.match(variants, /baseMetadata\.standardCost \?\? baseMetadata\.unitCost \?\? 0/);
  assert.match(variants, /input\.unitCost \?\? inheritedUnitCost/);
  assert.match(variants, /: inheritedUnitCost/);
  assert.match(variants, /requireCostPermission\(context, input\.unitCost\)/);
  assert.match(variants, /function canViewSalesCost\(context: Context\)[\s\S]*?MARGIN_VIEW/);
  assert.equal((variants.match(/canViewSalesCost\(context\) \? \{ unitCost \} : \{\}/g) || []).length, 2);
  assert.match(variants, /sales\.product\.variant\.created'[\s\S]{0,220}\{baseCatalogItemId,catalogItemId,sku,attributes,unitPrice\}\)/);
  assert.match(variants, /sales\.product\.variant\.updated'[\s\S]{0,220}\{variantId,sku,attributes,unitPrice\}\)/);
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

test('catalogue tax rates are company-scoped and UI can assign the shared Invoicing rate', async () => {
  const [queries, types, manager] = await Promise.all([
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/types.ts'),
    source('app/apps/sales/SalesProductCatalogueManager.tsx'),
  ]);

  assert.match(queries, /FROM invoicing_tax_rates[\s\S]*?WHERE company_id = \$1[\s\S]*?is_active = TRUE[\s\S]*?deleted_at IS NULL/);
  assert.match(queries, /taxRates: taxRates\.rows\.map/);
  assert.match(types, /taxRates: Array<\{[\s\S]*?id: string;[\s\S]*?name: string;[\s\S]*?rate: number;/);
  assert.match(manager, /<span className="text-xs font-black">Tax rate<\/span>/);
  assert.match(manager, /data\.taxRates\.map/);
  assert.match(manager, /set\('taxRateId', event\.target\.value\)/);
  assert.match(manager, /taxName:[\s\S]*?selectedTax\?\.name/);
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
  assert.match(manager, /Tax rate/);
  assert.match(manager, /data\.taxRates\.map/);
  assert.ok(manager.includes("char === '\\n'"), 'CSV parser must split real newline characters');
  assert.ok(manager.includes("join('\\r\\n')"), 'CSV export must use CRLF row separators');
  assert.match(composer, /item\.isVariant[\s\S]*?\? item\.name/);
  assert.match(optionalEditor, /product\.isVariant[\s\S]*?\? product\.name/);
});



test('saved catalogue quote lines keep server-authoritative SKU, unit and tax; ad-hoc lines may supply their own', async () => {
  const commands = await source('lib/apps/sales/commands.ts');

  assert.ok(
    commands.includes(`sku:
        nullableText(
          catalog
            ? catalog.sku
            : item.sku,`),
    'Saved catalogue lines must snapshot the catalogue SKU, not a client-submitted SKU.',
  );
  assert.ok(
    commands.includes(`unit:
        cleanText(
          catalog
            ? catalog.unit
            : item.unit || 'unit',`),
    'Saved catalogue lines must use the catalogue unit.',
  );
  assert.ok(
    commands.includes(`const taxRate =
      numberInput(
        catalog
          ? catalog.tax_rate ?? 0
          : item.taxRate ?? 0,`),
    'Saved catalogue lines must use the catalogue tax rate, not a client-submitted rate.',
  );
  assert.ok(
    commands.includes(`taxName:
        nullableText(
          catalog
            ? catalog.tax_name
            : item.taxName,`),
    'Saved catalogue lines must use the catalogue tax name, not a client-submitted name.',
  );
});
