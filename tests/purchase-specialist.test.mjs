import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(file) { return (await readFile(file, 'utf8')).replace(/\r\n/g, '\n'); }

test('Purchase exposes a dedicated workflow center using the existing specialist records', async () => {
  const [workspace, client, panel] = await Promise.all([
    source('app/apps/purchase/PurchaseWorkspace.tsx'),
    source('app/apps/purchase/PurchaseWorkspaceClient.tsx'),
    source('app/apps/purchase/PurchaseOperationsPanel.tsx'),
  ]);
  assert.match(workspace, /PurchaseModuleShell/);
  assert.doesNotMatch(workspace, /AppSurfaceShell/);
  assert.match(workspace, /requisitions.*orders.*receipts/);
  assert.match(workspace, /PurchaseWorkspaceClient/);
  assert.match(client, /PurchaseOperationsPanel/);
  assert.match(client, /EnterpriseDataWorkspaceClient/);
  assert.match(panel, /\/api\/apps\/purchase\/records/);
  assert.match(panel, /purchase_requisitions/);
  assert.match(panel, /purchase_orders/);
  assert.match(panel, /purchase_receipts/);
  assert.match(panel, /data-purchase-workspace="specialist"/);
});

test('Purchase actions route through server-guarded requisition, order and receipt transitions', async () => {
  const [panel, transitions, service, policy] = await Promise.all([
    source('app/apps/purchase/PurchaseOperationsPanel.tsx'),
    source('lib/apps/enterprise/specialist-finance-transitions.ts'),
    source('lib/apps/enterprise/service.ts'),
    source('lib/apps/enterprise/workflow-policy.ts'),
  ]);
  assert.match(panel, /action: 'transition'/);
  assert.match(panel, /statusField: 'status'/);
  assert.match(panel, /nextStatus: action\.next/);
  assert.match(panel, /window\.confirm/);
  assert.match(transitions, /validatePurchaseRequisitionForSubmission/);
  assert.match(transitions, /approvePurchaseRequisition/);
  assert.match(transitions, /convertPurchaseRequisitionToOrders/);
  assert.match(transitions, /postPurchaseReceiptToInventory/);
  assert.match(service, /receiptCoverage/);
  assert.match(service, /A purchase order can be marked received only after every ordered line has been fully received and posted through Inventory/);
  assert.match(policy, /'purchase:purchase_orders'/);
  assert.match(policy, /'purchase:purchase_requisitions'/);
  assert.match(policy, /'purchase:purchase_receipts'/);
});

test('Purchase Inventory receipt workflow is guarded and company scoped by existing posting service', async () => {
  const [tests, posting] = await Promise.all([
    source('tests/purchase-inventory-receipts.test.mjs'),
    source('lib/apps/enterprise/specialist-finance-transitions.ts'),
  ]);
  assert.match(tests, /fails closed when the Inventory dependency is not ready/);
  assert.match(tests, /posts idempotently to the shared company-scoped Inventory ledger/);
  assert.ok(posting.includes("const movementReference = 'purchase_receipt:' + receiptId + ':' + line.id;"));
  assert.ok(posting.includes('product.company_id = $1'));
  assert.ok(posting.includes('warehouse.company_id = $1'));
});

test('Purchase regression gate is included in CI and full test scripts', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.equal(packageJson.scripts['test:purchase-specialist'], 'node --test tests/purchase-specialist.test.mjs');
  assert.match(packageJson.scripts['test:all'], /npm run test:purchase-specialist/);
  assert.match(packageJson.scripts['test:ci'], /npm run test:purchase-specialist/);
});
