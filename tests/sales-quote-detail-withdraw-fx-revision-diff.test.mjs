import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('pending quote detail exposes the authorized Withdraw approval request form between review and delivery', async () => {
  const [detail, queries, types, approvals, route] = await Promise.all([
    source('app/apps/sales/SalesQuoteDetailClient.tsx'),
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/approvals.ts'),
    source('app/api/apps/sales/route.ts'),
  ]);

  const review = detail.indexOf('Review approval');
  const withdraw = detail.indexOf('Withdraw approval request');
  const delivery = detail.indexOf('Deliver quotation');
  assert.ok(review >= 0 && withdraw > review && delivery > withdraw);
  assert.match(detail, /quote\.approvalStatus === 'pending'[\s\S]{0,100}quote\.canWithdrawApproval/);
  assert.match(detail, /action: 'cancel_quote_approval'/);
  assert.match(queries, /canWithdrawApproval =\s*activeApprovalRequest\.rows\.length === 1/);
  assert.match(queries, /String\(activeApprovalRequest\.rows\[0\]\?\.requested_by \?\? ''\) === context\.userId/);
  assert.match(queries, /FROM sales_quote_approval_requests[\s\S]{0,170}status = 'pending'/);
  assert.match(types, /canWithdrawApproval: boolean/);
  assert.match(approvals, /Only the requester or a Sales quote editor can withdraw this approval request/);
  assert.match(route, /cancel_quote_approval:\s*cancelSalesQuoteApproval/);
});

test('draft invoice creation blocks missing and invalid foreign-currency rates through SaMiOverlay before confirmation', async () => {
  const detail = await source('app/apps/sales/SalesQuoteDetailClient.tsx');
  const submitAt = detail.indexOf("const rawExchangeRate = form.get('exchangeRate')");
  const confirmAt = detail.indexOf('confirmAction({', submitAt);
  assert.ok(submitAt >= 0 && confirmAt > submitAt);
  const guard = detail.slice(submitAt, confirmAt);
  assert.match(guard, /quote\.currency !== workspace\.company\.currency/);
  assert.match(guard, /!enteredRate/);
  assert.match(guard, /Number\.isFinite\(Number\(enteredRate\)\)/);
  assert.match(guard, /Number\(enteredRate\) <= 0/);
  assert.match(guard, /showError\(/);
  assert.match(guard, /Enter the exchange rate to ' \+ workspace\.company\.currency \+ ' before saving\./);
  assert.doesNotMatch(detail, /name="exchangeRate"[\s\S]{0,180}required/);
});

test('revision comparison endpoint is company-scoped, read-only, and hides margin fields without permission', async () => {
  const [route, service, queries] = await Promise.all([
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/service.ts'),
    source('lib/apps/sales/queries.ts'),
  ]);

  assert.match(route, /revisionDiff === '1'[\s\S]{0,350}getSalesQuoteRevisionDiff/);
  assert.match(route, /revisionNumber: request\.nextUrl\.searchParams\.get\('revisionNumber'\)/);
  assert.match(service, /getSalesQuoteRevisionDiff/);
  assert.match(queries, /export async function getSalesQuoteRevisionDiff/);
  assert.match(queries, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(queries, /FROM sales_quote_revisions[\s\S]{0,180}quote_id = \$1 AND company_id = \$2 AND revision_number = \$3/);
  assert.match(queries, /salesCapabilities\([\s\S]{0,150}\)\.canViewMargin/);
  assert.match(queries, /if \(canViewMargin\)[\s\S]{0,230}margin_percent/);
  assert.match(queries, /comparedToRevisionNumber: currentRevision/);
  assert.match(queries, /hasComparison: true/);
  assert.match(queries, /currentSnapshot\.lines/);
});

test('quote revision rows request a comparison and render added, removed, and changed values in an accessible modal', async () => {
  const detail = await source('app/apps/sales/SalesQuoteDetailClient.tsx');
  assert.match(detail, /revisionDiff: '1'/);
  assert.match(detail, /quoteId: quote\.id/);
  assert.match(detail, /revisionNumber: String\(revisionNumber\)/);
  assert.match(detail, /Compare with previous revision/);
  assert.match(detail, /role="dialog"/);
  assert.match(detail, /aria-modal="true"/);
  assert.match(detail, /revisionDiff\.changes\.map/);
  assert.match(detail, /change\.type === 'added'/);
  assert.match(detail, /change\.type === 'removed'/);
  assert.match(detail, /change\.before \?\? '—'/);
  assert.match(detail, /change\.after \?\? '—'/);
  assert.match(detail, /Close revision comparison/);
});
