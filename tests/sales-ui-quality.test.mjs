import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = async file => (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');

test('Sales surfaces share the scoped visual system and consistent workspace shell', async () => {
  const [styles, shell, appShell, section, navigation, approvalRoute, approvalUi, quoteRoute, orderRoute] = await Promise.all([
    source('app/globals.css'),
    source('app/apps/sales/SalesModuleShell.tsx'),
    source('app/components/apps/AppSurfaceShell.tsx'),
    source('app/apps/sales/SalesSectionPage.tsx'),
    source('lib/apps/sales/navigation.ts'),
    source('app/apps/sales/approvals/page.tsx'),
    source('app/apps/sales/SalesApprovalsManager.tsx'),
    source('app/apps/sales/quotes/[quoteId]/page.tsx'),
    source('app/apps/sales/orders/[orderId]/page.tsx'),
  ]);

  assert.match(styles, /main\[data-sami-app="sales"\]/);
  assert.match(styles, /--sales-card-radius/);
  assert.match(styles, /--sales-control-height/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(shell, /data-sales-active-view=\{activeSidebarKey\}/);
  assert.match(shell, /activePage\?\.description/);
  assert.match(shell, /aria-current/);
  assert.match(appShell, /data-sami-app=/);
  assert.match(navigation, /'approvals'/);
  assert.match(navigation, /Quote Approvals/);
  assert.match(section, /view === 'approvals'/);
  assert.match(approvalRoute, /SalesSectionPage view="approvals"/);
  assert.doesNotMatch(approvalUi, /mx-auto max-w-6xl space-y-5 p-4 sm:p-6/);
  assert.doesNotMatch(approvalUi, /<main\b/, 'approval content must not nest a main element inside the Sales shell');
  assert.match(quoteRoute, /appKey\s*=\s*"sales"/);
  assert.match(orderRoute, /appKey\s*=\s*"sales"/);
});

test('Sales workspace report and KPI amounts preserve their base currency', async () => {
  const [queries, types, workspace] = await Promise.all([
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/types.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
  ]);

  assert.ok(queries.includes('GROUP BY status, base_currency'));
  assert.ok(queries.includes('GROUP BY 1, base_currency'));
  assert.ok(queries.includes('PARTITION BY currency'));
  assert.ok(queries.includes('WHERE currency_rank <= 10'));
  assert.ok(queries.includes("status IN ('confirmed', 'closed')"));
  assert.ok(queries.includes('GROUP BY base_currency\n              ORDER BY base_currency'));
  assert.ok(!queries.includes('orders.rows.reduce'));
  assert.ok(types.includes('quoteValueByCurrency: Array<{ currency: string; amount: number }>'));
  assert.ok(types.includes('orderValueByCurrency: Array<{ currency: string; amount: number }>'));
  assert.ok(workspace.includes('currencyTotalsLabel(\n              data.metrics.quoteValueByCurrency,'));
  assert.ok(workspace.includes("item.month + ' · ' + item.currency"));
  assert.ok(workspace.includes("item.customerName + ' · ' + item.currency"));
  assert.equal((workspace.match(/money\(\s*item\.amount,\s*item\.currency/g) || []).length, 3);
});

test('Quotation PDF builder previews the same server-rendered PDF customers receive', async () => {
  const builder = await source('app/apps/sales/SalesQuotePdfBuilder.tsx');

  assert.match(builder, /<iframe[\s\S]{0,180}src=\{'\/api\/apps\/sales\/quotes\/' \+ selectedQuote\.id \+ '\/pdf'\}/);
  assert.match(builder, /className="h-\[720px\] w-full rounded-2xl border"/);
  assert.match(builder, /title="Quotation PDF preview"/);
  assert.match(builder, /This preview is rendered by the same server-side PDF service customers receive\./);
  assert.doesNotMatch(builder, /Commercial document/);
  assert.doesNotMatch(builder, /Line items, discounts, taxes, shipping, notes and terms are rendered securely/);
});
