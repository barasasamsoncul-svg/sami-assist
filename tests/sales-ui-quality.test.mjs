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
  assert.match(quoteRoute, /appKey\s*=\s*"sales"/);
  assert.match(orderRoute, /appKey\s*=\s*"sales"/);
});
