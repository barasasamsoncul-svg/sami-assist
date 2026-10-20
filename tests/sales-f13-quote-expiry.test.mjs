import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('Sales expiry sweep scans active tenant databases and skips tenants without Sales', async () => {
  const expiry = await source('lib/apps/sales/expiry.ts');
  assert.match(expiry, /export async function expireOverdueSalesQuotes\(\): Promise<ExpireOverdueResult>\s*\{/);
  assert.match(expiry, /FROM tenant_databases td[\s\S]*INNER JOIN tenants t/);
  assert.match(expiry, /getTenantPoolByTenantId\(tenantId\)/);
  assert.match(expiry, /to_regclass\('public\.sales_quotes'\)/);
  assert.match(expiry, /failures\.length > 0/);
});

test('Sales expiry uses locked 500-row batches and writes status, history, and activity transactionally', async () => {
  const expiry = await source('lib/apps/sales/expiry.ts');
  assert.match(expiry, /const QUOTE_EXPIRY_BATCH_SIZE = 500/);
  assert.match(expiry, /status IN \('sent', 'viewed'\)[\s\S]*valid_until < CURRENT_DATE[\s\S]*deleted_at IS NULL/);
  assert.match(expiry, /LIMIT \$1\s+FOR UPDATE SKIP LOCKED/);
  assert.match(expiry, /for \(let batch = 0; batch < MAX_BATCHES_PER_TENANT; batch \+= 1\)/);
  assert.match(expiry, /updated_by = NULL/);
  assert.match(expiry, /expired_at = COALESCE\(expired_at, NOW\(\)\)/);
  assert.match(expiry, /public_enabled = FALSE/);
  assert.match(expiry, /INSERT INTO sales_quote_status_history/);
  assert.match(expiry, /await recordSalesActivity\(client, \{/);
  assert.match(expiry, /userId: null/);
  assert.match(expiry, /type: 'sales\.quote\.expired'/);
  assert.match(expiry, /await client\.query\('ROLLBACK'\)/);
});

test('hourly internal cron route is authenticated and tracked as a platform job', async () => {
  const route = await source('app/api/internal/sales/expire-quotes/route.ts');
  const vercel = JSON.parse(await source('vercel.json'));
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /crypto\.timingSafeEqual/);
  assert.match(route, /runTrackedPlatformJob/);
  assert.match(route, /expireOverdueSalesQuotes\(\)/);
  assert.ok(vercel.crons.some(cron =>
    cron.path === '/api/internal/sales/expire-quotes' &&
    cron.schedule === '0 * * * *'
  ));
});
