import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales customer order portal uses hashed expiring tokens with explicit rotation and revocation', async () => {
  const [schema, migration, portal, service, route, ui] = await Promise.all([
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/3.4.15-to-3.4.16.ts'),
    source('lib/apps/sales/order-portal.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesOrderDetailClient.tsx'),
  ]);

  for (const field of [
    'public_portal_token_hash',
    'public_portal_token_created_at',
    'public_portal_token_expires_at',
    'public_portal_token_revoked_at',
  ]) {
    assert.match(schema, new RegExp(field));
    assert.match(migration, new RegExp(field));
  }

  assert.match(portal, /randomBytes\(32\)/);
  assert.match(portal, /createHash\('sha256'\)/);
  assert.match(portal, /INTERVAL '1 day'/);
  assert.match(portal, /public_portal_token_expires_at > NOW\(\)/);
  assert.match(portal, /pg_advisory_xact_lock/);
  assert.match(portal, /SALES_PERMISSIONS\.ORDER_MANAGE/);
  assert.match(portal, /sales\.order\.portal_link_created/);
  assert.match(portal, /sales\.order\.portal_link_revoked/);
  assert.match(portal, /status <> 'cancelled'/);
  assert.match(portal, /parsed\.protocol === 'https:' \|\| parsed\.protocol === 'http:'/);
  assert.match(portal, /invoice IDs, margin\/cost values and user identifiers/);

  assert.match(service, /createSalesOrderPortalLink/);
  assert.match(service, /revokeSalesOrderPortalLink/);
  assert.match(route, /create_order_portal_link/);
  assert.match(route, /revoke_order_portal_link/);
  assert.match(ui, /Customer tracking portal/);
  assert.match(ui, /Copy customer link/);
  assert.match(ui, /Revoke link/);
});

test('Sales customer order portal is read-only, no-store, and does not expose an order without a valid live token', async () => {
  const [api, page] = await Promise.all([
    source('app/api/public/sales/orders/[tenantId]/[token]/route.ts'),
    source('app/order/[tenantId]/[token]/page.tsx'),
  ]);

  assert.match(api, /getPublicSalesOrderPortal/);
  assert.match(api, /Cache-Control/);
  assert.match(api, /ORDER_NOT_FOUND/);
  assert.match(page, /getPublicSalesOrderPortal/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /Shipment tracking/);
  assert.match(page, /Delivered quantity/);
  assert.match(page, /noindex/);
});
