import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(file) { return (await readFile(file, 'utf8')).replace(/\r\n/g, '\n'); }

test('Shipping is versioned with Inventory required and Sales, ecommerce and Warehouse optional', async () => {
  const [manifest, registry, migration, schema] = await Promise.all([
    source('lib/modules/additional-first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/shipping/migrations/1.0.0-to-1.1.0.ts'),
    source('lib/apps/shipping/schema.sql'),
  ]);
  const at = manifest.indexOf('key: "shipping"');
  assert.notEqual(at, -1);
  const entry = manifest.slice(at, at + 600);
  assert.match(entry, /version:\s*'1\.1\.0'/);
  assert.match(entry, /depends:\s*\["inventory"\]/);
  assert.match(entry, /optionalDepends:\s*\["sales","ecommerce","warehouse"\]/);
  assert.match(registry, /SHIPPING_1_0_0_TO_1_1_0/);
  assert.match(migration, /fromVersion:\s*'1\.0\.0'/);
  assert.match(migration, /toVersion:\s*'1\.1\.0'/);
  for (const name of ['shipping_rate_quotes','shipping_labels','idx_shipments_company_recent','idx_shipment_events_company_shipment_recent']) {
    assert.ok(migration.includes(name), 'migration misses ' + name);
    assert.ok(schema.includes(name), 'fresh-install schema misses ' + name);
  }
});

test('Shipping operations are company-scoped and shipment state transitions are guarded', async () => {
  const service = await source('lib/apps/shipping/service.ts');
  assert.match(service, /requireEnterpriseModuleTableContext/);
  assert.match(service, /item\.companyId !== first\.companyId/);
  assert.match(service, /item\.tenantId !== first\.tenantId/);
  assert.match(service, /WHERE company_id=\$1 AND id=\$2 AND deleted_at IS NULL FOR UPDATE/);
  assert.match(service, /ALLOWED_TRANSITIONS/);
  assert.match(service, /Shipment not found in the selected company/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /Carrier booking and label purchase are not performed automatically/);
  assert.match(service, /trackingUrl/);
  assert.match(service, /https:/);
});

test('Shipping API bounds writes and handles create, transition and milestone actions', async () => {
  const route = await source('app/api/apps/shipping/operations/route.ts');
  assert.match(route, /MAX_BODY_BYTES/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /Cross-origin Shipping requests are not allowed/);
  assert.match(route, /createShippingShipment/);
  assert.match(route, /transitionShippingShipment/);
  assert.match(route, /recordShippingMilestone/);
  assert.match(route, /Cache-Control/);
});

test('Shipping owns a dedicated layout and specialist operational workspace', async () => {
  const [workspace, shell, client, panel] = await Promise.all([
    source('app/apps/shipping/ShippingWorkspace.tsx'),
    source('app/apps/shipping/ShippingModuleShell.tsx'),
    source('app/apps/shipping/ShippingWorkspaceClient.tsx'),
    source('app/apps/shipping/ShippingOperationsPanel.tsx'),
  ]);
  assert.match(workspace, /ShippingModuleShell/);
  assert.doesNotMatch(workspace, /AppSurfaceShell/);
  assert.match(shell, /data-sami-app="shipping"/);
  assert.match(shell, /data-shipping-shell="standalone"/);
  assert.match(client, /ShippingOperationsPanel/);
  assert.match(panel, /Create shipment/);
  assert.match(panel, /Apply status transition/);
  assert.match(panel, /Record milestone/);
  assert.match(panel, /does not book a carrier/);
});
