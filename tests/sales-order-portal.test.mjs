import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales customer order portal uses hashed expiring tokens with explicit rotation and revocation', async () => {
  const [schema, migration, portal, service, route, ui, runtime, manifest] = await Promise.all([
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/3.4.15-to-3.4.16.ts'),
    source('lib/apps/sales/order-portal.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesOrderDetailClient.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
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

  assert.match(migration, /fromVersion: '3.4.15'/);
  assert.match(migration, /toVersion: '3.4.16'/);
  assert.match(runtime, /SALES_3_4_15_TO_3_4_16/);
  assert.match(manifest, /version: '3.4.18'/);
  assert.match(schema, /uq_sales_orders_v2_public_portal_token/);

  assert.match(portal, /randomBytes\(32\)/);
  assert.match(portal, /createHash\('sha256'\)/);
  assert.match(portal, /INTERVAL '1 day'/);
  assert.match(portal, /public_portal_token_expires_at > NOW\(\)/);
  assert.match(portal, /pg_advisory_xact_lock/);
  assert.match(portal, /SALES_PERMISSIONS\.ORDER_MANAGE/);
  assert.match(portal, /sales\.order\.portal_link_created/);
  assert.match(portal, /sales\.order\.portal_link_revoked/);
  assert.match(portal, /unit_price/);
  assert.match(portal, /discount_amount/);
  assert.match(portal, /tax_amount/);
  assert.match(portal, /line_total/);
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
  assert.match(page, /Unit price/);
  assert.match(page, /Discount/);
  assert.match(page, /Line total/);
  assert.match(page, /Delivered/);
  assert.match(page, /index: false/);
  assert.match(api, /X-Robots-Tag/);
});
