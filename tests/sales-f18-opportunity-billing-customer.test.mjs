import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

function section(sourceText, startMarker, endMarker) {
  const start = sourceText.indexOf(startMarker);
  const end = sourceText.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
  return sourceText.slice(start, end);
}

test('salesperson resolver remains an exported pipeline helper', async () => {
  const pipeline = await source('lib/apps/sales/pipeline.ts');
  assert.match(pipeline, /export async function resolveActiveSalesperson\(/);
});

test('lead conversion best-effort links a billing customer only when customer-management permission is available', async () => {
  const pipeline = await source('lib/apps/sales/pipeline.ts');
  const fn = section(
    pipeline,
    'export async function convertSalesLeadToOpportunity(',
    'export async function createBillingCustomerForOpportunity(',
  );

  const opportunityInsert = fn.indexOf('const created = await client.query(');
  const permissionGate = fn.indexOf('const canManageBillingCustomers', opportunityInsert);
  const customerCreate = fn.indexOf('await createInvoicingCustomer(', permissionGate);
  const opportunityLink = fn.indexOf('UPDATE sales_opportunities', customerCreate);
  const leadConverted = fn.indexOf("SET status='converted'", opportunityLink);

  assert.ok(opportunityInsert >= 0);
  assert.ok(permissionGate > opportunityInsert);
  assert.ok(customerCreate > permissionGate);
  assert.ok(opportunityLink > customerCreate);
  assert.ok(leadConverted > opportunityLink);
  assert.match(fn, /INVOICING_PERMISSIONS\.CUSTOMER_MANAGE/);
  assert.match(fn, /leadRow\.email \|\| leadRow\.company_name \|\| leadRow\.contact_name/);
  assert.match(fn, /name: leadRow\.company_name \|\| leadRow\.name/);
  assert.match(fn, /email: leadRow\.email/);
  assert.match(fn, /phone: leadRow\.phone/);
  assert.match(fn, /billingCustomerId = existingInvoicingCustomerId\(customerError\)/);
  assert.match(fn, /catch \{\s*\/\/ Conversion and its audit history are the primary operation/);
});

test('opportunity billing-customer command enforces Invoicing permission and company-scoped idempotent linking', async () => {
  const pipeline = await source('lib/apps/sales/pipeline.ts');
  const fn = section(
    pipeline,
    'export async function createBillingCustomerForOpportunity(',
    'export async function updateSalesOpportunity(',
  );

  assert.match(fn, /requireSalesContext\(SALES_PERMISSIONS\.PIPELINE_VIEW\)/);
  assert.match(fn, /INVOICING_PERMISSIONS\.CUSTOMER_MANAGE/);
  assert.match(fn, /WHERE id=\$1 AND company_id=\$2 AND deleted_at IS NULL\s+FOR UPDATE/);
  assert.match(fn, /if \(opportunity\.billing_customer_id\)[\s\S]*?return \{ customerId \}/);
  assert.match(fn, /await createInvoicingCustomer\(\{[\s\S]*?email: opportunity\.email,[\s\S]*?phone: opportunity\.phone/s);
  assert.match(fn, /existingInvoicingCustomerId\(customerError\)/);
  assert.match(fn, /SET billing_customer_id=\$3,updated_by=\$4,updated_at=NOW\(\)/);
  assert.match(fn, /await client\.query\('COMMIT'\)/);
  assert.match(fn, /await client\.query\('ROLLBACK'\)/);
});

test('billing-customer command is exposed through Sales service and API action dispatch', async () => {
  const [service, route] = await Promise.all([
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
  ]);

  assert.match(service, /createBillingCustomerForOpportunity/);
  assert.match(route, /createBillingCustomerForOpportunity/);
  assert.match(route, /create_billing_customer_for_opportunity:\s*createBillingCustomerForOpportunity/);
});

test('SalesPipelineManager offers billing-customer creation for unlinked opportunities', async () => {
  const manager = await source('app/apps/sales/SalesPipelineManager.tsx');
  assert.match(manager, /action: 'create_billing_customer_for_opportunity'; opportunityId: string/);
  assert.match(manager, /!opportunity\.billing_customer_id|opportunity\.billing_customer_id \?/);
  assert.match(manager, /action: 'create_billing_customer_for_opportunity',[\s\S]*?opportunityId: opportunity\.id/);
  assert.match(manager, /Create billing customer/);
  assert.match(manager, /Billing customer linked/);
});

test('F18 opportunity billing-customer regression coverage is included in Sales CI', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-f18-opportunity-billing-customer\.test\.mjs/);
});
