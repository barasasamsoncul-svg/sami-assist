import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales quotation register searches and filters on the server before paging', async () => {
  const queries = await source('lib/apps/sales/queries.ts');
  const start = queries.indexOf('export async function getSalesQuoteRegisterPage(');
  const end = queries.indexOf('\nexport async function getSalesOrderRegisterPage(', start);
  assert.ok(start >= 0 && end > start, 'quotation register query must be present');

  const implementation = queries.slice(start, end);
  assert.match(implementation, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(implementation, /quote\.company_id = \$1/);
  assert.match(implementation, /quote\.deleted_at IS NULL/);
  assert.match(implementation, /quote\.quote_number ILIKE/);
  assert.match(implementation, /quote\.effective_status/);
  assert.match(implementation, /quote\.approval_status/);
  assert.match(implementation, /LIMIT \$4 OFFSET \$5/);
  assert.match(implementation, /limit \+ 1/);
  assert.match(implementation, /totalCount: num\(countRow\.all_count\)/);
  assert.match(implementation, /filteredTotalCount: num\(countRow\.filtered_total\)/);
  assert.match(implementation, /FROM quote_rows quote\s+WHERE TRUE\s+\$\{searchSql\}/);
  assert.match(implementation, /hasMore/);
  assert.match(implementation, /AS awaiting_response/);
  assert.match(implementation, /AS needs_approval/);
  assert.match(implementation, /AS expiring_soon/);
  assert.match(implementation, /queueCounts:/);
});

test('Sales order register searches, filters and sorts on the server before paging', async () => {
  const queries = await source('lib/apps/sales/queries.ts');
  const start = queries.indexOf('export async function getSalesOrderRegisterPage(');
  assert.ok(start >= 0, 'sales order register query must be present');
  const implementation = queries.slice(start);

  assert.match(implementation, /requireSalesContext\(\)/);
  assert.match(implementation, /SALES_PERMISSIONS\.ORDER_VIEW/);
  assert.match(implementation, /SALES_PERMISSIONS\.ORDER_MANAGE/);
  assert.match(implementation, /o\.company_id = \$1/);
  assert.match(implementation, /o\.deleted_at IS NULL/);
  assert.match(implementation, /o\.order_number ILIKE/);
  assert.match(implementation, /o\.fulfillment_status/);
  assert.match(implementation, /o\.invoice_status/);
  assert.match(implementation, /ORDER BY \$\{sortSql\[sortBy\]\}/);
  assert.match(implementation, /LIMIT \$4 OFFSET \$5/);
  assert.match(implementation, /limit \+ 1/);
  assert.match(implementation, /nextOffset: offset \+ rows\.length/);
  assert.match(implementation, /AS awaiting_fulfillment/);
  assert.match(implementation, /AS partially_invoiced/);
  assert.match(implementation, /queueCounts:/);
});

test('Sales API exposes register paging without accepting caller-provided SQL ordering', async () => {
  const [route, service, client, packageJsonText] = await Promise.all([
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('package.json'),
  ]);
  const packageJson = JSON.parse(packageJsonText);

  assert.match(route, /register === 'quotes'/);
  assert.match(route, /register === 'orders'/);
  assert.match(service, /getSalesQuoteRegisterPage/);
  assert.match(service, /getSalesOrderRegisterPage/);
  assert.match(client, /requestSalesRegisterPage/);
  assert.match(client, /offset: String\(quoteRecords\.length\)/);
  assert.match(client, /offset: String\(orderRecords\.length\)/);
  assert.match(client, /Load more quotations/);
  assert.match(client, /Load more sales orders/);
  assert.match(client, /quoteRegisterTotalCount/);
  assert.match(client, /orderRegisterTotalCount/);
  assert.match(client, /quoteRegisterQueueCounts\?\.\[option\.key\]/);
  assert.match(client, /orderRegisterQueueCounts\?\.\[option\.key\]/);
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-workspace-pagination\.test\.mjs/);
});


test('Sales workspace exposes bounded salesperson choices and only permits pipeline moves with manage permission', async () => {
  const queries = await source('lib/apps/sales/queries.ts');
  const workspaceStart = queries.indexOf('export async function getSalesWorkspaceData(');
  const workspaceEnd = queries.indexOf('\nexport async function ', workspaceStart + 20);
  const workspace = queries.slice(workspaceStart, workspaceEnd);
  const capabilitiesStart = queries.indexOf('function salesCapabilities(');
  const capabilitiesEnd = queries.indexOf('function invoicingTablesAvailable(', capabilitiesStart);
  const capabilities = queries.slice(capabilitiesStart, capabilitiesEnd);

  assert.match(workspace, /ORDER BY tu\.is_owner DESC,[\s\S]{0,200}LIMIT 500/);
  assert.match(workspace, /AND tu\.user_id = \$2/);
  assert.match(workspace, /const currentSalespersonRow = defaultSalesperson\.rows\[0\]/);
  assert.match(workspace, /defaultSalesperson: currentSalespersonRow[\s\S]*?id: str\(currentSalespersonRow\.id\)/);
  assert.match(capabilities, /canMovePipeline:\s*can\([\s\S]*?SALES_PERMISSIONS\s*\.PIPELINE_MANAGE,\s*\),/);
  assert.doesNotMatch(capabilities.slice(capabilities.indexOf('canMovePipeline:'), capabilities.indexOf('canManagePipelineStages:')), /PIPELINE_VIEW/);
});

 
test('Saved Sales order views accept either order-view or order-manage permission', async () => {
  const views = await source('lib/apps/sales/saved-views.ts');
  const helperStart = views.indexOf('function canViewOrders(');
  const helperEnd = views.indexOf('\n}', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'canViewOrders helper must be present');
  const helper = views.slice(helperStart, helperEnd + 2);
  assert.match(helper, /SALES_PERMISSIONS\.ORDER_VIEW/);
  assert.match(helper, /\|\|/);
  assert.match(helper, /SALES_PERMISSIONS\.ORDER_MANAGE/);

  for (const functionName of [
    'getSalesSavedOrderViews',
    'saveSalesSavedOrderView',
    'deleteSalesSavedOrderView',
  ]) {
    const start = views.indexOf('export async function ' + functionName + '(');
    const end = views.indexOf('\nexport async function ', start + 10);
    assert.ok(start >= 0 && end > start, functionName + ' must be present');
    const implementation = views.slice(start, end);
    assert.match(implementation, /requireSalesContext\(\)/);
    assert.match(implementation, /canViewOrders\(context\)/);
    assert.doesNotMatch(implementation, /requireSalesContext\(SALES_PERMISSIONS\.ORDER_VIEW\)/);
  }
});
