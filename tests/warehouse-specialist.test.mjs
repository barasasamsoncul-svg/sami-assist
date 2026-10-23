import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Warehouse is installed as version 1.1.0 with Inventory as a required dependency', async () => {
  const [manifest, runtimeMigrations, schema] = await Promise.all([
    source('lib/modules/additional-first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/warehouse/schema.sql'),
  ]);

  const at = manifest.indexOf('key: "warehouse"');
  assert.notEqual(at, -1);
  const warehouseManifest = manifest.slice(at, at + 500);
  assert.match(warehouseManifest, /version:\s*'2\.4\.0'/);
  assert.match(warehouseManifest, /depends:\s*\["inventory"\]/);
  assert.match(warehouseManifest, /optionalDepends:\s*\["barcode","shipping"\]/);
  assert.match(runtimeMigrations, /WAREHOUSE_2_3_0_TO_2_4_0/);
  assert.doesNotMatch(schema, /module remains non-installable/i);
});

test('Warehouse migration enforces same-company relationships without guessing at legacy ownership', async () => {
  const migration = await source('lib/apps/warehouse/migrations/2.3.0-to-2.4.0.ts');

  assert.match(migration, /fromVersion:\s*'2\.3\.0'/);
  assert.match(migration, /toVersion:\s*'2\.4\.0'/);
  assert.match(migration, /uq_warehouse_locations_company_id_id/);
  assert.match(migration, /FOREIGN KEY \(company_id, parent_location_id\)[\s\S]*REFERENCES public\.warehouse_locations\(company_id, id\)[\s\S]*NOT VALID/s);
  assert.match(migration, /FOREIGN KEY \(company_id, operation_id\)[\s\S]*REFERENCES public\.warehouse_operations\(company_id, id\)[\s\S]*NOT VALID/s);
  assert.match(migration, /FOREIGN KEY \(company_id, product_reference\)[\s\S]*REFERENCES public\.products\(company_id, id\)[\s\S]*NOT VALID/s);
  assert.match(migration, /FOREIGN KEY \(company_id, current_location_id\)[\s\S]*REFERENCES public\.warehouse_locations\(company_id, id\)[\s\S]*NOT VALID/s);
  assert.match(migration, /legacy duplicate code can prevent a unique index/i);
  assert.doesNotMatch(migration, /UPDATE\s+public\.warehouse_(locations|operations|operation_lines|packages)/i);
});

test('Warehouse workflow service enforces workspace, company and product/warehouse boundaries', async () => {
  const service = await source('lib/apps/warehouse/service.ts');

  assert.match(service, /requireEnterpriseModuleTableContext/);
  assert.match(service, /item\.companyId !== first\.companyId/);
  assert.match(service, /item\.tenantId !== first\.tenantId/);
  assert.match(service, /item\.userId !== first\.userId/);
  assert.match(service, /WHERE company_id = \$1 AND id = ANY\(\$2::uuid\[\]\)/);
  assert.match(service, /product\.company_id = rule\.company_id/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /requestedAssignee !== context\.userId/);
  assert.match(service, /Only pick operations can join a picking batch/);
  assert.match(service, /Complete every linked pick operation before closing the batch/);
  assert.match(service, /That package status transition is not allowed/);
});

test('Generic record and automation mutations cannot bypass Warehouse workflows', async () => {
  const [hooks, automation, service] = await Promise.all([
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/enterprise/automation.ts'),
    source('lib/apps/enterprise/service.ts'),
  ]);

  const hookAt = hooks.indexOf("moduleKey === 'warehouse'");
  assert.notEqual(hookAt, -1);
  const guard = hooks.slice(hookAt, hookAt + 900);
  for (const table of [
    'warehouse_locations',
    'warehouse_operations',
    'warehouse_operation_lines',
    'warehouse_putaway_rules',
    'warehouse_picking_batches',
    'warehouse_picking_batch_operations',
    'warehouse_packages',
  ]) {
    assert.ok(guard.includes(table), table);
  }
  assert.match(guard, /validated Warehouse workflows/);
  assert.match(automation, /assertEnterpriseDomainMutationAllowed/);
  assert.match(service, /assertDomainMutation\(/);
});

test('Warehouse UI uses the dedicated Sales-style shell and specialist operation tabs', async () => {
  const [workspace, client, panel, shell] = await Promise.all([
    source('app/apps/warehouse/WarehouseWorkspace.tsx'),
    source('app/apps/warehouse/WarehouseWorkspaceClient.tsx'),
    source('app/apps/warehouse/WarehouseOperationsPanel.tsx'),
    source('app/apps/warehouse/WarehouseModuleShell.tsx'),
  ]);

  assert.match(workspace, /WarehouseModuleShell/);
  assert.match(workspace, /loadStandaloneEnterpriseApp/);
  assert.doesNotMatch(workspace, /<AppSurfaceShell/);
  assert.match(client, /<WarehouseOperationsPanel/);
  assert.match(client, /<EnterpriseDataWorkspaceClient/);
  assert.match(panel, /data-warehouse-operations/);
  for (const label of ['Locations', 'Operations', 'Put-away rules', 'Picking waves', 'Packages']) {
    assert.ok(panel.includes(label), label);
  }
  assert.match(shell, /data-sami-app="warehouse"/);
  assert.match(shell, /aria-label="Warehouse navigation"/);
  assert.match(shell, /\/apps\/warehouse/);
});

test('Warehouse operations API is same-origin protected, no-store and request-size bounded', async () => {
  const route = await source('app/api/apps/warehouse/operations/route.ts');

  assert.match(route, /sec-fetch-site/);
  assert.match(route, /new URL\(origin\)\.origin === request\.nextUrl\.origin/);
  assert.match(route, /MAX_BODY_BYTES/);
  assert.match(route, /Buffer\.byteLength\(raw, 'utf8'\)/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /getWarehouseWorkspaceOverview/);
  assert.match(route, /runWarehouseAction/);
  assert.match(route, /TenantContextError/);
  assert.match(route, /CompanyContextError/);
});
