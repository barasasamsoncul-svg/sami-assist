import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('cancelled and rejected quote status changes cancel pending approval requests before the quote update', async () => {
  const [commands, approvals] = await Promise.all([
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/approvals.ts'),
  ]);
  assert.match(approvals, /export async function cancelPendingSalesQuoteApproval/);
  const start = commands.indexOf('export async function changeSalesQuoteStatus');
  const end = commands.indexOf('export async function requestSalesQuoteApproval', start);
  const body = commands.slice(start, end);
  const cancelAt = body.indexOf('cancelPendingSalesQuoteApproval(');
  const updateAt = body.indexOf('status = $3::varchar(30)', cancelAt);
  assert.ok(cancelAt >= 0 && updateAt > cancelAt);
  assert.match(body, /cancelledApprovalRequestIds/);
  assert.match(body, /\['cancelled', 'rejected'\]/);
});

test('the walk-in invoice fallback is only used when the billing customer setting is explicitly false', async () => {
  const commands = await source('lib/apps/sales/commands.ts');
  assert.match(commands, /settings\.require_billing_customer_for_invoice === false/);
  assert.match(commands, /getOrCreateSalesWalkInCustomer/);
  assert.match(commands, /!isSyntheticWalkInCustomer/);
  assert.match(commands, /BILLING_CUSTOMER_REQUIRED/);
  assert.match(commands, /async function getOrCreateSalesWalkInCustomer/);
  assert.ok(commands.includes('Walk-in / unnamed customer'));
  assert.match(commands, /crossPermission\(context, 'invoicing\.invoice\.create'\)/);
});

test('duplicate quote copies salesperson only with pipeline access and preserves F10 optional products and deposit values', async () => {
  const commands = await source('lib/apps/sales/commands.ts');
  const start = commands.indexOf('export async function duplicateSalesQuote');
  const end = commands.indexOf('export async function changeSalesQuoteStatus', start);
  const body = commands.slice(start, end);
  assert.match(body, /salespersonUserId:[\s\S]{0,220}SALES_PERMISSIONS\.PIPELINE_VIEW[\s\S]{0,220}SALES_PERMISSIONS\.PIPELINE_MANAGE/);
  assert.match(body, /FROM sales_quote_optional_items/);
  assert.match(body, /optionalItems:\s*optionalItems\.rows\.map/);
  assert.match(body, /depositType:\s*row\.deposit_type/);
  assert.match(body, /depositValue:\s*row\.deposit_value/);
});

test('credit enforcement checks base-currency exposure and requires quote-approval permission for an override', async () => {
  const [commands, types, schema, migration, registry, manifest] = await Promise.all([
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/3.4.21-to-3.4.22.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);
  assert.match(commands, /invoicing_aging_base/);
  assert.match(commands, /base_balance_due/);
  assert.match(commands, /input\.overrideCreditLimit === true/);
  assert.match(commands, /crossPermission\([\s\S]{0,120}SALES_PERMISSIONS\.QUOTE_APPROVE/);
  assert.equal((commands.match(/await enforceSalesCustomerCreditLimit\(/g) || []).length, 2);
  assert.match(types, /creditLimitEnforced\?: boolean/);
  assert.match(schema, /credit_limit_enforced BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS credit_limit_enforced BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(registry, /SALES_3_4_21_TO_3_4_22/);
  assert.match(manifest, /key: "sales",[\s\S]{0,80}version: '3\.4\.22'/);
});

test('Sales quote snapshot validates supplied customer email format', async () => {
  const commands = await source('lib/apps/sales/commands.ts');
  assert.match(commands, /Enter a valid customer email\./);
  assert.match(commands, /suppliedCustomerEmail/);
  assert.match(commands, /test\(suppliedCustomerEmail\)/);
});
