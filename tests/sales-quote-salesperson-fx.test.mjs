import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('quote composer exposes a salesperson selector and includes the selected user in its save payload', async () => {
  const [composer, types, queries, workspace] = await Promise.all([
    source('app/apps/sales/SalesQuoteComposer.tsx'),
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/queries.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
  ]);

  assert.match(composer, /initialQuote\s*\?\s*initialQuote\.salespersonUserId \?\? ''\s*:\s*currentSalespersonId \?\? ''/);
  assert.match(composer, /aria-label="Salesperson"/);
  assert.match(composer, /<option value="">Self \(me\)<\/option>/);
  assert.match(composer, /salespeople\.map\(person =>/);
  assert.match(workspace, /salespeople=\{initialData\.salespeople\}/);
  assert.match(workspace, /currentSalespersonId=\{initialData\.currentSalespersonId\}/);
  assert.match(composer, /salespersonUserId: salespersonUserId \|\| undefined/);
  assert.match(types, /salespeople: Array<\{[\s\S]{0,100}id: string;[\s\S]{0,100}name: string;[\s\S]{0,100}email: string;/);
  assert.match(types, /salespersonUserId: string \| null/);
  assert.match(queries, /FROM tenant_users tu[\s\S]{0,240}tu\.status = 'active'[\s\S]{0,120}tu\.member_type = 'internal'/);
  assert.match(queries, /salespeople: salespeople\.rows\.map/);
  assert.match(queries, /quote\.salesperson_user_id/);
});

test('foreign-currency quote submission requires a positive manual FX rate and uses the branded local error callback', async () => {
  const [composer, workspace, detail] = await Promise.all([
    source('app/apps/sales/SalesQuoteComposer.tsx'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesQuoteDetailClient.tsx'),
  ]);

  assert.match(composer, /currency !== data\.company\.currency/);
  assert.match(composer, /!manualExchangeRate/);
  assert.match(composer, /Number\.isFinite\(Number\(manualExchangeRate\)\)/);
  assert.match(composer, /Enter the exchange rate to '\s*\+ data\.company\.currency \+ ' before saving\.'/);
  assert.match(composer, /onLocalError\?\./);
  assert.match(composer, /Manual FX rate to/);
  assert.match(composer, /Required before saving when the quotation currency differs from the company currency/);
  assert.match(composer, /type="number"\s+value=\{\s*manualExchangeRate/);
  assert.match(workspace, /onLocalError=\{\(message\) => showError\('Exchange rate required', message\)\}/);
  assert.match(detail, /onLocalError=\{\(message\) => showError\('Exchange rate required', message\)\}/);
});

test('selected salespeople are validated against workspace membership and persisted for create and edit', async () => {
  const [commands, types, pipeline] = await Promise.all([
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/pipeline.ts'),
  ]);

  assert.match(types, /export type CreateSalesQuoteInput = \{[\s\S]{0,160}salespersonUserId\?: unknown/);
  assert.match(commands, /resolveSalesperson:\s*\(ctx: Awaited<ReturnType<typeof requireSalesContext>>, value: unknown\) => Promise<string \| null>/);
  assert.match(commands, /resolveSalesperson:\s*resolveActiveSalesperson/);
  assert.match(pipeline, /export async function resolveActiveSalesperson/);
  assert.match(pipeline, /tu\.tenant_id = \$1[\s\S]{0,160}tu\.status = 'active'[\s\S]{0,120}tu\.member_type = 'internal'/);
  assert.match(commands, /userId:\s*salespersonUserId/);
  assert.match(commands, /salesperson_user_id = \$31/);
  assert.equal((commands.match(/deps\.resolveSalesperson\(context, input\.salespersonUserId\)/g) || []).length, 2);
});
