import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('quote revisions supersede pending approval requests and record the closed request IDs', async () => {
  const [approvals, commercial] = await Promise.all([
    source('lib/apps/sales/approvals.ts'),
    source('lib/apps/sales/commercial.ts'),
  ]);
  assert.match(approvals, /export async function cancelPendingSalesQuoteApproval/);
  assert.match(approvals, /return result\.rows\.map\(row => String\(row\.id\)\)/);
  const revisionInsert = commercial.indexOf('INSERT INTO sales_quote_revisions');
  const cancel = commercial.indexOf("cancelPendingSalesQuoteApproval(client, context.companyId, quoteId, 'superseded')", revisionInsert);
  const quoteUpdate = commercial.indexOf('UPDATE sales_quotes', revisionInsert);
  assert.ok(revisionInsert >= 0 && cancel > revisionInsert && quoteUpdate > cancel);
  assert.match(commercial, /type:\s*'sales\.quote\.revised'[\s\S]*?metadata:\s*\{[\s\S]*?cancelledApprovalRequestIds/);
});

test('quote authoring resolves an explicitly selected active salesperson through the shared pipeline resolver', async () => {
  const [commands, pipeline, types] = await Promise.all([
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/pipeline.ts'),
    source('lib/apps/sales/types.ts'),
  ]);
  assert.match(pipeline, /export async function resolveActiveSalesperson/);
  assert.match(commands, /resolveSalesperson:\s*\(ctx: Awaited<ReturnType<typeof requireSalesContext>>, value: unknown\) => Promise<string \| null>/);
  assert.match(commands, /resolveSalesperson:\s*resolveActiveSalesperson/);
  assert.equal((commands.match(/deps\.resolveSalesperson\(context, input\.salespersonUserId\)/g) || []).length, 2);
  assert.match(commands, /userId:\s*salespersonUserId/);
  assert.match(commands, /salesperson_user_id = \$31/);
  assert.doesNotMatch(commands, /assertActiveInternalWorkspaceSalesperson/);
  assert.match(types, /salespersonUserId\?: unknown/);
});

test('duplicating a quotation copies optional product snapshots without selecting them automatically', async () => {
  const [commands, types] = await Promise.all([
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/types.ts'),
  ]);
  assert.match(commands, /async function insertOptionalItems\(/);
  assert.match(commands, /await insertOptionalItems\(client, companyId, quoteId, optionalItems, userId\)/);
  assert.match(commands, /FROM sales_quote_optional_items/);
  assert.match(commands, /optionalItems:\s*optionalItems\.rows\.map/);
  assert.match(commands, /is_selected, selected_at/);
  assert.match(commands, /FALSE,NULL/);
  assert.match(types, /optionalItems\?: unknown/);
});

test('quote-level pipeline fields are removed and a 3.4.20-to-3.4.21 decommissioning migration is registered', async () => {
  const [types, queries, schema, migration, registry] = await Promise.all([
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/3.4.20-to-3.4.21.ts'),
    source('lib/apps/runtime-migrations.ts'),
  ]);
  const summary = types.slice(types.indexOf('export type SalesQuoteSummary'), types.indexOf('export type SalesOrderSummary'));
  assert.doesNotMatch(summary, /stageId|stageCode|stageName|expectedCloseDate|probability/);
  assert.doesNotMatch(queries, /quote\.stage_id|quote\.expected_close_date|quote\.probability_override|sales_quote_stage_history/);
  assert.doesNotMatch(schema, /ALTER TABLE public\.sales_quotes\s+ADD COLUMN IF NOT EXISTS stage_id/);
  assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS public\.sales_quote_stage_history/);
  assert.match(migration, /DROP TABLE IF EXISTS public\.sales_quote_stage_history/);
  for (const column of ['last_stage_change_at', 'stage_entered_at', 'probability_override', 'expected_close_date', 'stage_id']) {
    assert.match(migration, new RegExp('DROP COLUMN IF EXISTS ' + column));
  }
  assert.match(registry, /SALES_3_4_20_TO_3_4_21/);
});
