import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(file) { return (await readFile(file, 'utf8')).replace(/\r\n/g, '\n'); }

test('Barcode has a versioned install manifest and migration-backed lookup indexes', async () => {
  const [manifest, registry, migration, schema] = await Promise.all([
    source('lib/modules/additional-first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/barcode/migrations/2.3.0-to-2.4.0.ts'),
    source('lib/apps/barcode/schema.sql'),
  ]);
  const at = manifest.indexOf('key: "barcode"');
  assert.notEqual(at, -1);
  const entry = manifest.slice(at, at + 500);
  assert.match(entry, /version:\s*'2\.4\.0'/);
  assert.match(entry, /depends:\s*\["inventory"\]/);
  assert.match(entry, /optionalDepends:\s*\["warehouse"\]/);
  assert.match(registry, /BARCODE_2_3_0_TO_2_4_0/);
  assert.match(migration, /fromVersion:\s*'2\.3\.0'/);
  assert.match(migration, /toVersion:\s*'2\.4\.0'/);
  for (const name of ['idx_barcode_scan_events_company_recent','idx_barcode_identifiers_company_code_lookup','idx_barcode_identifiers_company_entity','idx_barcode_rules_company_active']) {
    assert.ok(migration.includes(name), name + ' migration index missing');
    assert.ok(schema.includes(name), name + ' fresh-install index missing');
  }
  assert.doesNotMatch(schema, /module remains non-installable/i);
});

test('Barcode scan resolution and audit reads are company and tenant scoped', async () => {
  const service = await source('lib/apps/barcode/service.ts');
  assert.match(service, /requireEnterpriseModuleTableContext/);
  assert.match(service, /item\.companyId !== first\.companyId/);
  assert.match(service, /item\.tenantId !== first\.tenantId/);
  assert.match(service, /product\.company_id = \$1/);
  assert.match(service, /identifier\.company_id = product\.company_id/);
  assert.match(service, /product\.is_active = TRUE/);
  assert.match(service, /ambiguous/);
  assert.match(service, /matchCount/);
  assert.match(service, /effect: 'scan-only'/);
  assert.match(service, /LIMIT 50/);
});

test('Barcode API rejects cross-origin writes and bounds JSON payloads', async () => {
  const route = await source('app/api/apps/barcode/scans/route.ts');
  assert.match(route, /MAX_BODY_BYTES/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /Cross-origin Barcode requests are not allowed/);
  assert.match(route, /getBarcodeWorkspaceOverview/);
  assert.match(route, /recordBarcodeScan/);
  assert.match(route, /TenantContextError/);
  assert.match(route, /CompanyContextError/);
  assert.match(route, /EnterpriseModuleError/);
  assert.match(route, /Cache-Control/);
});

test('Barcode uses dedicated Sales-style shell and specialized scanning workspace', async () => {
  const [workspace, shell, client, panel] = await Promise.all([
    source('app/apps/barcode/BarcodeWorkspace.tsx'),
    source('app/apps/barcode/BarcodeModuleShell.tsx'),
    source('app/apps/barcode/BarcodeWorkspaceClient.tsx'),
    source('app/apps/barcode/BarcodeScannerPanel.tsx'),
  ]);
  assert.match(workspace, /BarcodeModuleShell/);
  assert.doesNotMatch(workspace, /AppSurfaceShell/);
  assert.match(shell, /data-sami-app="barcode"/);
  assert.match(shell, /data-barcode-shell="standalone"/);
  assert.match(client, /BarcodeScannerPanel/);
  assert.match(panel, /Record scan/);
  assert.match(panel, /does not change stock quantities/);
  assert.match(panel, /matched/);
  assert.match(panel, /unmatched/);
  assert.match(panel, /ambiguous/);
});
