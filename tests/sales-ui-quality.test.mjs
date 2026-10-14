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

  assert.match(queries, /GROUP BY status, base_currency/);
  assert.match(queries, /GROUP BY 1, base_currency/);
  assert.match(queries, /PARTITION BY currency[\\s\\S]*?WHERE currency_rank <= 10/);
  assert.match(queries, /GROUP BY base_currency[\\s\\S]*?ORDER BY base_currency/);
  assert.doesNotMatch(queries, /orders\\.rows\\.reduce/);
  assert.match(types, /quoteValueByCurrency: Array<{ currency: string; amount: number }>/);
  assert.match(types, /orderValueByCurrency: Array<{ currency: string; amount: number }>/);
  assert.match(workspace, /currencyTotalsLabel\\(\\s*data\\.metrics\\.quoteValueByCurrency/);
  assert.match(workspace, /item\\.month \\+ ' · ' \\+ item\\.currency/);
  assert.match(workspace, /item\\.customerName \\+ ' · ' \\+ item\\.currency/);
});
