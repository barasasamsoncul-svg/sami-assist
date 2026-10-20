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
  const requestPublicStart = engine.indexOf('export async function requestAdvancedSalesQuoteApproval(');
  const requestTransactionStart = engine.indexOf('export async function requestAdvancedSalesQuoteApprovalTransaction(', requestPublicStart);
  const reviewPublicStart = engine.indexOf('export async function reviewAdvancedSalesQuoteApproval(');
  const reviewTransactionStart = engine.indexOf('export async function reviewAdvancedSalesQuoteApprovalTransaction(', reviewPublicStart);
  assert.ok(requestPublicStart >= 0 && requestTransactionStart > requestPublicStart);
  assert.ok(reviewPublicStart > requestTransactionStart && reviewTransactionStart > reviewPublicStart);
  const requestPublic = engine.slice(requestPublicStart, requestTransactionStart);
  const reviewPublic = engine.slice(reviewPublicStart, reviewTransactionStart);
  assert.match(requestPublic, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_EDIT\)/);
  assert.match(requestPublic, /requestAdvancedSalesQuoteApprovalTransaction\(input, context\)/);
  assert.match(reviewPublic, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_INTERNAL_APPROVE\)/);
  assert.match(reviewPublic, /reviewAdvancedSalesQuoteApprovalTransaction\(input, context\)/);
  assert.match(service, /getSalesQuoteApprovalData/);
  assert.match(service, /saveSalesQuoteApprovalPolicy/);
  assert.match(route, /approvals === '1'/);
  assert.match(route, /save_approval_policy/);
});

test('approval policy evaluation supports total, discount, margin and currency conditions', async () => {
  const [engine, policy] = await Promise.all([
    source('lib/apps/sales/approvals.ts'),
    source('lib/apps/sales/approval-policy.ts'),
  ]);
  assert.match(policy, /min_quote_total/);
  assert.match(policy, /max_discount_percent/);
  assert.match(policy, /min_margin_percent/);
  assert.match(policy, /currency_code/);
  assert.match(policy, /triggers\.some\(Boolean\)/);
  assert.match(engine, /salesQuoteApprovalPolicyMatches\(policy, quote\)/);
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
  assert.match(engine, /requesterUserIds\.includes\(context\.userId\)/);
  assert.match(engine, /cannot approve or reject their own request/);
  assert.match(engine, /required_approvals/);
  assert.match(engine, /quote_fingerprint/);
  assert.match(engine, /optionalLines/);
  assert.match(commercial, /Optional products cannot be changed unless the quotation is a draft outside the approval workflow/);
  assert.match(engine, /cancelPendingSalesQuoteApproval\([\s\S]{0,150}'superseded'/);
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
  const [ui, page, section, detail, workspace] = await Promise.all([
    source('app/apps/sales/SalesApprovalsManager.tsx'),
    source('app/apps/sales/approvals/page.tsx'),
    source('app/apps/sales/SalesSectionPage.tsx'),
    source('app/apps/sales/SalesQuoteDetailClient.tsx'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
  ]);
  assert.match(ui, /Create approval policy/);
  assert.ok(ui.includes('Minimum quote total'));
  assert.match(ui, /Sequential approval steps/);
  assert.match(ui, /Pending decisions and completed audit trail/);
  assert.match(page, /SalesSectionPage view="approvals"/);
  assert.match(section, /view === 'approvals'[\s\S]{0,100}<SalesApprovalsManager \/>/);
  assert.match(detail, /\/apps\/sales\/approvals/);
  assert.match(detail, /\['draft', 'not_required', 'rejected'\]/);
  assert.match(detail, /No approval required/);
  assert.match(workspace, /approval/i);
});


test('Sales approval queue supports paginated retrieval and requester/editor withdrawal', async () => {
  const [engine, route, manager] = await Promise.all([
    source('lib/apps/sales/approvals.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesApprovalsManager.tsx'),
  ]);

  assert.ok(engine.includes('OFFSET $2 LIMIT $3'));
  assert.ok(engine.includes('COUNT(*)::int AS total_count'));
  assert.ok(engine.includes('hasMore: offset + requests.length < totalCount'));
  assert.ok(engine.includes("String(requested_by ?? '') === context.userId"));
  assert.ok(engine.includes('SALES_PERMISSIONS.QUOTE_EDIT'));
  assert.ok(route.includes('getSalesQuoteApprovalData({'));
  assert.ok(route.includes("offset: request.nextUrl.searchParams.get('offset')"));
  assert.ok(route.includes("limit: request.nextUrl.searchParams.get('limit')"));
  assert.ok(manager.includes('body.approvals.hasMore === true'));
  assert.match(manager, /request\\.canWithdraw\\s*\\?/);
  assert.ok(manager.includes("action: 'cancel_quote_approval'"));
  assert.ok(manager.includes('Load more'));
  assert.match(engine, /a-z0-9/);
  assert.match(engine, /roleKey/);
});

test('Sales approval requests can be cancelled or superseded through one pending-only helper', async () => {
  const [engine, service, route, manager] = await Promise.all([
    source('lib/apps/sales/approvals.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesApprovalsManager.tsx'),
  ]);

  const helperStart = engine.indexOf('async function cancelPendingSalesQuoteApproval(');
  const helperEnd = engine.indexOf('\n}', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helper = engine.slice(helperStart, helperEnd);
  assert.match(helper, /UPDATE sales_quote_approval_requests/);
  assert.match(helper, /WHERE company_id=\$1 AND quote_id=\$2 AND status='pending'/);
  assert.match(helper, /SET status=\$3, completed_at=NOW\(\), updated_at=NOW\(\)/);
  assert.match(helper, /RETURNING id/);

  assert.match(engine, /export async function cancelSalesQuoteApproval\(input: Record<string, unknown>\)/);
  assert.match(engine, /cancelPendingSalesQuoteApproval\([\s\S]{0,150}'cancelled'/);
  assert.match(engine, /cancelPendingSalesQuoteApproval\([\s\S]{0,150}'superseded'/);
  assert.match(service, /cancelSalesQuoteApproval/);
  assert.match(route, /cancel_quote_approval:\s*cancelSalesQuoteApproval/);
  assert.match(manager, /action: 'cancel_quote_approval'/);
});

test('approval satisfaction rejects approved quotes whose stored approval fingerprint is stale', async () => {
  const engine = await source('lib/apps/sales/approvals.ts');
  const start = engine.indexOf('export async function assertSalesQuoteApprovalSatisfied(');
  const end = engine.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start);
  const guard = engine.slice(start, end);

  assert.match(guard, /if \(\(matching \|\| legacyRequired\) && approvalStatus !== 'approved'\)/);
  const approvedQuery = guard.indexOf('SELECT quote_fingerprint FROM sales_quote_approval_requests');
  const statusGuard = guard.indexOf("if ((matching || legacyRequired) && approvalStatus !== 'approved')");
  assert.ok(approvedQuery > statusGuard, 'fingerprint comparison must follow the normal approval requirement guard');
  assert.match(guard, /status='approved'/);
  assert.match(guard, /ORDER BY completed_at DESC NULLS LAST, id DESC/);
  assert.match(guard, /approvalStatus === 'approved'/);
  assert.match(guard, /String\(approvedFingerprint\) !== snapshot\.fingerprint/);
  assert.match(guard, /Quotation terms changed after approval\. Resubmit for approval\./);
  assert.match(guard, /if \(matching \|\| legacyRequired\) \{/,
    'stale fingerprints from obsolete/superseded legacy approval requirements must not regress unrelated quotes');
});

test('approval request pagination uses an explicit bounded offset and limit and returns paging metadata', async () => {
  const engine = await source('lib/apps/sales/approvals.ts');
  const start = engine.indexOf('export async function getSalesQuoteApprovalData(');
  const end = engine.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start);
  const loader = engine.slice(start, end);

  assert.match(loader, /Math\.min\(rawOffset, 1_000_000\)/);
  assert.match(loader, /Math\.min\(rawLimit, 100\)/);
  assert.match(loader, /OFFSET \$2 LIMIT \$3/);
  assert.match(loader, /\[context\.companyId, offset, limit\]/);
  assert.match(loader, /return \{\s*policies: policies\.rows,\s*requests,\s*offset,\s*limit,\s*totalCount,\s*hasMore:/);
});
