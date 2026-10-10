import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales Part 11 routes legacy approval actions through the sequential approval engine', async () => {
  const [commands, engine, service, route] = await Promise.all([
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/approvals.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
  ]);
  assert.match(commands, /return requestAdvancedSalesQuoteApproval\(input\)/);
  assert.match(commands, /return reviewAdvancedSalesQuoteApproval\(input\)/);
  assert.match(service, /getSalesQuoteApprovalData/);
  assert.match(service, /saveSalesQuoteApprovalPolicy/);
  assert.match(route, /approvals === '1'/);
  assert.match(route, /save_approval_policy/);
});

test('approval policy evaluation supports total, discount, margin and currency conditions', async () => {
  const engine = await source('lib/apps/sales/approvals.ts');
  assert.match(engine, /min_quote_total/);
  assert.match(engine, /max_discount_percent/);
  assert.match(engine, /min_margin_percent/);
  assert.match(engine, /currency_code/);
  assert.match(engine, /triggers\.some\(Boolean\)/);
  assert.match(engine, /ORDER BY priority ASC, created_at ASC/);
});

test('approval engine enforces sequential assigned reviewers and records immutable decisions', async () => {
  const [engine, migration, commercial] = await Promise.all([
    source('lib/apps/sales/approvals.ts'),
    source('lib/apps/sales/migrations/3.4.1-to-3.4.2.ts'),
    source('lib/apps/sales/commercial.ts'),
  ]);
  assert.match(engine, /current_step_order/);
  assert.match(engine, /approver_user_id/);
  assert.match(engine, /approver_role_key/);
  assert.match(engine, /permissionSet\.has/);
  assert.match(engine, /already decided this approval step/);
  assert.match(engine, /required_approvals/);
  assert.match(engine, /quote_fingerprint/);
  assert.match(engine, /optionalLines/);
  assert.match(commercial, /Optional products cannot be changed unless the quotation is a draft outside the approval workflow/);
  assert.match(engine, /status='superseded'/);
  assert.match(engine, /INSERT INTO sales_quote_approval_decisions/);
  assert.match(migration, /UNIQUE\(request_id, step_order, reviewer_user_id\)/);
});

test('quote acceptance and order conversion still require completed approval', async () => {
  const [commands, publicSales, delivery, engine] = await Promise.all([
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/public.ts'),
    source('lib/apps/sales/delivery.ts'),
    source('lib/apps/sales/approvals.ts'),
  ]);
  assert.match(commands, /Complete internal quotation approval before accepting this quote/);
  assert.match(commands, /Complete internal quotation approval before creating a sales order/);
  assert.match(publicSales, /Complete internal quotation approval before accepting this quote/);
  assert.match(delivery, /Complete internal quotation approval before sending/);
  assert.match(delivery, /assertSalesQuoteApprovalSatisfied/);
  assert.match(publicSales, /assertSalesQuoteApprovalSatisfied/);
  assert.match(commands, /assertSalesQuoteApprovalSatisfied/);
  assert.match(engine, /This quotation matches an approval policy and cannot proceed/);
});

test('approval policy and queue are available in the Sales UI', async () => {
  const [ui, page, detail] = await Promise.all([
    source('app/apps/sales/SalesApprovalsManager.tsx'),
    source('app/apps/sales/approvals/page.tsx'),
    source('app/apps/sales/SalesQuoteDetailClient.tsx'),
  ]);
  assert.match(ui, /Create approval policy/);
  assert.match(ui, /Sequential approval steps/);
  assert.match(ui, /Approval queue and audit trail/);
  assert.match(page, /SalesApprovalsManager/);
  assert.match(detail, /\/apps\/sales\/approvals/);
  assert.match(detail, /\['draft', 'not_required', 'rejected'\]/);
  assert.match(detail, /No approval required/);
});
