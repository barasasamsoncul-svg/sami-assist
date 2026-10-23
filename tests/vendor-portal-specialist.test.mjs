import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(file) { return (await readFile(file, 'utf8')).replace(/\r\n/g, '\n'); }

test('Vendor Portal is versioned, Purchase-dependent and owns its 2.4.0 migration', async () => {
  const [manifest, registry, migration, schema, pkg] = await Promise.all([
    source('lib/modules/additional-first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/vendor_portal/migrations/2.3.0-to-2.4.0.ts'),
    source('lib/apps/vendor_portal/schema.sql'),
    source('package.json'),
  ]);
  const at = manifest.indexOf('key: "vendor_portal"');
  assert.notEqual(at, -1);
  const entry = manifest.slice(at, at + 600);
  assert.match(entry, /version:\s*'2\.4\.0'/);
  assert.match(entry, /depends:\s*\["purchase"\]/);
  assert.match(entry, /optionalDepends:\s*\["documents"\]/);
  assert.match(registry, /VENDOR_PORTAL_2_3_0_TO_2_4_0/);
  assert.match(migration, /fromVersion: '2\.3\.0'/);
  assert.match(migration, /toVersion: '2\.4\.0'/);
  for (const item of [
    'public_token_hash','public_token_expires_at','invitation_email_status',
    'uq_vendor_portal_rfq_responses_company_rfq','uq_vendor_portal_rfqs_public_token',
    'fk_vendor_portal_rfqs_company_account','fk_vendor_portal_responses_company_rfq',
  ]) {
    assert.ok(migration.includes(item), 'migration misses ' + item);
  }
  assert.doesNotMatch(schema, /module remains non-installable/i);
  const scripts = JSON.parse(pkg).scripts;
  assert.match(scripts['test:all'], /test:vendor-portal/);
  assert.match(scripts['test:ci'], /test:vendor-portal/);
});

test('Vendor Portal operations are company-scoped and synchronize offers back to Purchase', async () => {
  const service = await source('lib/apps/vendor_portal/service.ts');
  assert.match(service, /requireEnterpriseModuleTableContext/);
  assert.match(service, /item\.companyId !== first\.companyId/);
  assert.match(service, /item\.tenantId !== first\.tenantId/);
  assert.match(service, /item\.userId !== first\.userId/);
  assert.match(service, /createVendorPortalAccount/);
  assert.match(service, /issueVendorPortalRfq/);
  assert.match(service, /sendWorkspaceNotificationEmail/);
  assert.match(service, /createHash\('sha256'\)/);
  assert.match(service, /randomBytes\(32\)/);
  assert.match(service, /public_token_expires_at>NOW\(\)/);
  assert.match(service, /public\.supplier_rfq_responses/);
  assert.match(service, /public\.supplier_rfqs/);
  assert.match(service, /status='submitted'/);
  assert.match(service, /Only a submitted supplier response can be accepted or rejected/);
  assert.match(service, /WHERE supplier\.company_id=\$1/);
});

test('Vendor Portal internal API is same-origin protected and request-size bounded', async () => {
  const route = await source('app/api/apps/vendor_portal/operations/route.ts');
  assert.match(route, /MAX_BODY_BYTES/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /Cross-origin Vendor Portal requests are not allowed/);
  assert.match(route, /create-account/);
  assert.match(route, /issue-rfq/);
  assert.match(route, /decide-response/);
  assert.match(route, /cancel-rfq/);
  assert.match(route, /Cache-Control/);
});

test('Supplier-facing RFQ API only accepts bounded same-origin submissions and pages are noindex', async () => {
  const [route, page, client] = await Promise.all([
    source('app/api/public/vendor-portal/[tenantId]/[token]/route.ts'),
    source('app/vendor/rfq/[tenantId]/[token]/page.tsx'),
    source('app/vendor/rfq/VendorRfqResponseClient.tsx'),
  ]);
  assert.match(route, /MAX_BODY_BYTES/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /submitPublicVendorPortalResponse/);
  assert.match(route, /Cache-Control/);
  assert.match(page, /index: false/);
  assert.match(page, /force-dynamic/);
  assert.match(client, /Submit quotation/);
  assert.match(client, /Do not forward the link/);
  assert.match(client, /credentials: 'same-origin'/);
});

test('Vendor Portal uses a dedicated Sales-style shell and blocks generic mutation bypasses', async () => {
  const [workspace, shell, client, panel, hooks] = await Promise.all([
    source('app/apps/vendor_portal/VendorPortalWorkspace.tsx'),
    source('app/apps/vendor_portal/VendorPortalModuleShell.tsx'),
    source('app/apps/vendor_portal/VendorPortalWorkspaceClient.tsx'),
    source('app/apps/vendor_portal/VendorPortalOperationsPanel.tsx'),
    source('lib/apps/enterprise/domain-hooks.ts'),
  ]);
  assert.match(workspace, /VendorPortalModuleShell/);
  assert.doesNotMatch(workspace, /<AppSurfaceShell/);
  assert.match(shell, /data-sami-app="vendor_portal"/);
  assert.match(shell, /aria-label="Vendor Portal navigation"/);
  assert.match(client, /VendorPortalOperationsPanel/);
  assert.match(panel, /Create a portal account/);
  assert.match(panel, /Send RFQ invitation/);
  assert.match(panel, /Accept offer/);
  assert.match(panel, /The decision was synchronized to Purchase/);
  assert.match(hooks, /Vendor Portal supplier accounts, invitations and responses must be changed through validated Vendor Portal workflows/);
});
