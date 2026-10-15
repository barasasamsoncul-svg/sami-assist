import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readFile,
} from 'node:fs/promises';

import path from 'node:path';


const root =
  process.cwd();


async function source(
  file,
) {
  return (
    await readFile(
      path.join(
        root,
        file,
      ),
      'utf8',
    )
  ).replace(
    /\r\n/g,
    '\n',
  );
}




test('Sales quote expiry normalizes PostgreSQL date values and preserves accepted or rejectable state transitions', async () => {
  const [commands, publicSales] = await Promise.all([
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/public.ts'),
  ]);

  assert.match(commands, /shouldExpireSalesQuoteBeforeAcceptance\(/);
  const internalStart = commands.indexOf('export async function changeSalesQuoteStatus(');
  const internalEnd = commands.indexOf('\n\nexport async function ', internalStart + 30);
  assert.ok(internalStart >= 0 && internalEnd > internalStart);
  const internal = commands.slice(internalStart, internalEnd);
  const expiryDecision = internal.indexOf('shouldExpireSalesQuoteBeforeAcceptance(');
  const expiryUpdate = internal.indexOf("status = 'expired'", expiryDecision);
  const expiryHistory = internal.indexOf('INSERT INTO sales_quote_status_history', expiryUpdate);
  const expiryCommit = internal.indexOf("'COMMIT'", expiryHistory);
  assert.ok(expiryDecision >= 0);
  assert.ok(expiryUpdate > expiryDecision);
  assert.ok(expiryHistory > expiryUpdate);
  assert.ok(expiryCommit > expiryHistory);
  assert.match(internal.slice(expiryDecision, expiryCommit), /public_enabled = FALSE/);
  assert.match(internal.slice(expiryDecision, expiryCommit), /sales\.quote\.expired/);
  assert.match(internal.slice(expiryDecision, expiryCommit), /Quotation expired before acceptance/);

  const publicGetStart = publicSales.indexOf('export async function getPublicSalesQuote(');
  const publicRespondStart = publicSales.indexOf('export async function respondToPublicSalesQuote(', publicGetStart);
  assert.ok(publicGetStart >= 0 && publicRespondStart > publicGetStart);
  const publicGet = publicSales.slice(publicGetStart, publicRespondStart);
  assert.match(publicGet, /isSalesQuoteExpired\(/);
  assert.match(publicGet, /validUntil:\s*salesDateOnly\(quote\.valid_until\)/);

  const response = publicSales.slice(publicRespondStart);
  assert.match(response, /isSalesQuoteExpired\(/);
  const onlyOpenStatuses = response.indexOf("['sent', 'viewed'].includes(current)");
  const expiryCheck = response.indexOf('isSalesQuoteExpired(');
  const expiryMutation = response.indexOf("status = 'expired'", expiryCheck);
  assert.ok(onlyOpenStatuses >= 0 && expiryCheck > onlyOpenStatuses,
    'public expiry mutation must be limited to open, customer-actionable quotes');
  assert.ok(expiryMutation > expiryCheck);
});

test('Sales quote-to-invoice checks invoicing and customer permissions before converting the quote', async () => {
  const commands = await source('lib/apps/sales/commands.ts');
  const start = commands.indexOf('export async function convertSalesQuoteToInvoice(');
  const end = commands.indexOf('export async function updateSalesOrderFulfillment(', start);
  assert.ok(start >= 0 && end > start, 'quote-to-invoice wrapper should have a bounded implementation');

  const conversion = commands.slice(start, end);
  const orderCreation = conversion.indexOf('await createSalesOrderFromQuote(');
  assert.ok(orderCreation > 0);
  assert.ok(
    conversion.indexOf('await requireInvoicingContext(') >= 0 &&
    conversion.indexOf('await requireInvoicingContext(') < orderCreation,
    'invoice permission and module access must be checked before order creation',
  );
  assert.ok(
    conversion.indexOf('INVOICING_PERMISSIONS.CUSTOMER_VIEW') < orderCreation,
    'customer access must be preflighted before order creation',
  );
  assert.ok(
    conversion.indexOf('INVOICING_PERMISSIONS.CUSTOMER_MANAGE') < orderCreation,
    'customer creation permission must be preflighted before order creation',
  );
  assert.match(conversion, /active_billing_customer_id/);
  assert.match(conversion, /hasAnyInvoicingPermission\([\s\S]*INVOICING_PERMISSIONS\.CUSTOMER_MANAGE/);
});

test('Sales v3 models commercial pricing, quote approval, order fulfillment and invoice state independently', async () => {
  const schema =
    await source(
      'lib/apps/sales/schema.sql',
    );

  for (
    const table
    of [
      'sales_settings',
      'sales_quote_templates',
      'sales_quotes',
      'sales_quote_items',
      'sales_quote_approval_history',
      'sales_quote_status_history',
      'sales_orders_v2',
      'sales_order_items_v2',
      'sales_order_invoice_batches',
      'sales_order_status_history',
      'sales_delivery_log',
    ]
  ) {
    assert.ok(
      schema.includes(
        'public.' +
        table,
      ),
      table,
    );
  }

  assert.match(
    schema,
    /approval_status/,
  );

  assert.match(
    schema,
    /fulfillment_status/,
  );

  assert.match(
    schema,
    /invoice_status/,
  );

  assert.match(
    schema,
    /shipping_invoiced/,
  );

  assert.match(
    schema,
    /delivered_quantity/,
  );

  assert.match(
    schema,
    /invoiced_quantity/,
  );
});


test('Sales context is tenant/company scoped and permission controlled', async () => {
  const context =
    await source(
      'lib/apps/sales/context.ts',
    );

  assert.match(
    context,
    /getPermissionContext/,
  );

  assert.match(
    context,
    /requireCompanyContext/,
  );

  assert.match(
    context,
    /getTenantPoolByTenantId/,
  );

  const authorityStart =
    context.indexOf(
      'export async function requireSalesContext',
    );

  const authorityEnd =
    context.indexOf(
      'export async function ensureSalesDefaults',
      authorityStart,
    );

  const authority =
    context.slice(
      authorityStart,
      authorityEnd,
    );

  assert.doesNotMatch(
    authority,
    /input\.tenantId|input\.companyId/,
    'Sales request authority must come from trusted session/workspace/company context.',
  );

  const route =
    await source(
      'app/api/apps/sales/route.ts',
    );

  assert.doesNotMatch(
    route,
    /payload\.tenantId|payload\.companyId|body\.tenantId|body\.companyId/,
    'The Sales browser API must never accept tenant/company authority from JSON input.',
  );

  for (
    const permission
    of [
      'sales.quote.view',
      'sales.quote.create',
      'sales.quote.edit',
      'sales.quote.send',
      'sales.quote.approve_internal',
      'sales.quote.convert',
      'sales.quote.revise',
      'sales.quote.optional.manage',
      'sales.pricing.view',
      'sales.pricing.manage',
      'sales.margin.view',
      'sales.margin.manage',
      'sales.order.manage',
      'sales.report.view',
      'sales.settings.manage',
    ]
  ) {
    assert.ok(
      context.includes(
        permission,
      ),
      permission,
    );
  }
});


test('Sales quote creation recomputes commercial totals server side', async () => {
  const commands =
    await source(
      'lib/apps/sales/commands.ts',
    );

  assert.match(
    commands,
    /function totals\(/,
  );

  assert.match(
    commands,
    /discountAmount/,
  );

  assert.match(
    commands,
    /taxAmount/,
  );

  assert.match(
    commands,
    /INSERT INTO sales_quote_items/,
  );

  assert.match(
    commands,
    /sku_snapshot/,
  );

  assert.match(
    commands,
    /tax_name_snapshot/,
  );

  assert.match(
    commands,
    /Only draft quotes can be edited/,
  );
});



test('Sales quote conversion marks the linked CRM opportunity won and records the stage transition', async () => {
  const commands = await source('lib/apps/sales/commands.ts');
  const helperStart = commands.indexOf('async function markSalesOpportunityWonFromAcceptedQuote(');
  const orderStart = commands.indexOf('export async function createSalesOrderFromQuote(');
  const invoiceStart = commands.indexOf('export async function convertSalesQuoteToInvoice(', orderStart);
  assert.ok(helperStart >= 0 && orderStart > helperStart && invoiceStart > orderStart);

  const helper = commands.slice(helperStart, orderStart);
  const quoteToOrder = commands.slice(orderStart, invoiceStart);
  assert.match(helper, /opportunity\.company_id = \$2/);
  assert.match(helper, /FOR UPDATE OF opportunity/);
  assert.match(helper, /stage_type = 'won'/);
  assert.match(helper, /UPDATE sales_opportunities[\s\S]*stage_id = \$3/);
  assert.match(helper, /won_at = COALESCE\(won_at, NOW\(\)\)/);
  assert.match(helper, /lost_at = NULL/);
  assert.match(helper, /INSERT INTO sales_opportunity_stage_history/);
  assert.match(helper, /sales\.opportunity\.won_from_order/);
  assert.match(helper, /quoteId: input\.quoteId/);
  assert.match(quoteToOrder, /row\.opportunity_id/);
  assert.equal(
    (quoteToOrder.match(/await markSalesOpportunityWonFromAcceptedQuote\(/g) || []).length,
    2,
    'Both first conversion and idempotent retries must reconcile the linked opportunity.',
  );
  assert.ok(
    quoteToOrder.indexOf('await markSalesOpportunityWonFromAcceptedQuote(') <
      quoteToOrder.lastIndexOf("'COMMIT'"),
    'Opportunity reconciliation must happen before the conversion transaction commits.',
  );
});

test('Sales internal approval is separate from customer acceptance', async () => {
  const [
    schema,
    commands,
    delivery,
  ] =
    await Promise.all([
      source(
        'lib/apps/sales/schema.sql',
      ),
      source(
        'lib/apps/sales/commands.ts',
      ),
      source(
        'lib/apps/sales/delivery.ts',
      ),
    ]);

  assert.match(
    schema,
    /require_quote_approval/,
  );

  assert.match(
    schema,
    /quote_approval_threshold/,
  );

  assert.match(
    commands,
    /requestSalesQuoteApproval/,
  );

  assert.match(
    commands,
    /reviewSalesQuoteApproval/,
  );

  assert.match(
    delivery,
    /Complete internal quotation approval before sending/,
  );
});



test('Sales quote approval threshold is evaluated in company base currency on create and edit', async () => {
  const commands = await source('lib/apps/sales/commands.ts');

  const createStart = commands.indexOf('export async function createSalesQuote(');
  const updateStart = commands.indexOf('export async function updateSalesQuoteDraft(', createStart);
  const duplicateStart = commands.indexOf('export async function duplicateSalesQuote(', updateStart);
  assert.ok(createStart >= 0 && updateStart > createStart && duplicateStart > updateStart);

  for (const [name, body] of [
    ['create', commands.slice(createStart, updateStart)],
    ['edit', commands.slice(updateStart, duplicateStart)],
  ]) {
    const baseTotal = body.indexOf('const baseTotalAmount =');
    const approvalDecision = body.indexOf('const approvalRequired =');
    assert.ok(baseTotal >= 0 && approvalDecision > baseTotal, name + ' must calculate company-base total before approval decision');
    const approvalExpression = body.slice(approvalDecision, body.indexOf('const approvalStatus =', approvalDecision));
    assert.match(approvalExpression, /salesQuoteRequiresLegacyApproval\([\s\S]*baseTotalAmount/);
    assert.ok(!approvalExpression.includes('calculated.totalAmount >='));
  }
});

test('Sales advanced approval queue supports approve and reason-required reject actions', async () => {
  const ui = await source('app/apps/sales/SalesApprovalsManager.tsx');
  const route = await source('app/api/apps/sales/route.ts');
  const approvals = await source('lib/apps/sales/approvals.ts');

  assert.ok(ui.includes("action: 'review_quote_approval'"));
  assert.ok(ui.includes("request.status === 'pending'"));
  assert.ok(ui.includes('Approve step'));
  assert.ok(ui.includes('Rejection reason *'));
  assert.ok(ui.includes('Confirm rejection'));
  assert.ok(ui.includes("decision === 'reject' && !reviewReason.trim()"));
  assert.ok(route.includes('review_quote_approval:'));
  assert.ok(approvals.includes('A reason is required when rejecting an approval request.'));
  assert.ok(approvals.includes('You are not an assigned approver for the current approval step.'));
});


test('Sales quotation detail combines lifecycle, revision, customer request and delivery records into a chronological activity feed', async () => {
  const ui = await source('app/apps/sales/SalesQuoteDetailClient.tsx');

  assert.ok(ui.includes('const quoteActivity = useMemo(() => ['));
  assert.ok(ui.includes("kind: 'Lifecycle'"));
  assert.ok(ui.includes("kind: 'Revision'"));
  assert.ok(ui.includes("kind: 'Customer request'"));
  assert.ok(ui.includes("kind: 'Delivery'"));
  assert.ok(ui.includes('sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())'));
  assert.ok(ui.includes('Quote activity'));
  assert.ok(ui.includes('quoteActivity.slice(0, 10)'));
  assert.ok(ui.includes('dateTime={event.at}'));
});


test('Sales delivery is secure, logged and multi-channel', async () => {
  const [
    delivery,
    publicQuote,
  ] =
    await Promise.all([
      source(
        'lib/apps/sales/delivery.ts',
      ),
      source(
        'lib/apps/sales/public.ts',
      ),
    ]);

  assert.match(
    delivery,
    /randomBytes\(/,
  );

  assert.match(
    delivery,
    /sha256/,
  );

  assert.match(
    delivery,
    /sendWorkspaceNotificationEmail/,
  );

  assert.match(
    delivery,
    /sendWorkspaceNotificationSms/,
  );

  assert.match(
    delivery,
    /sendInvoiceWhatsApp/,
  );

  assert.match(
    delivery,
    /sales_delivery_log/,
  );

  assert.match(
    publicQuote,
    /Viewed by customer/,
  );

  assert.match(
    publicQuote,
    /allow_online_acceptance/,
  );

  assert.match(
    publicQuote,
    /allow_online_rejection/,
  );
});


test('Sales quote-to-order is transaction-safe, idempotent, and invoice permission is checked before side effects', async () => {
  const commands =
    await source(
      'lib/apps/sales/commands.ts',
    );

  const orderStart =
    commands.indexOf(
      'export async function createSalesOrderFromQuote(',
    );
  const invoiceStart =
    commands.indexOf(
      'export async function convertSalesQuoteToInvoice(',
      orderStart,
    );
  const fulfillmentStart =
    commands.indexOf(
      'export async function updateSalesOrderFulfillment(',
      invoiceStart,
    );

  assert.ok(orderStart >= 0 && invoiceStart > orderStart && fulfillmentStart > invoiceStart);

  const quoteToOrder =
    commands.slice(
      orderStart,
      invoiceStart,
    );

  assert.match(quoteToOrder, /await client\.query\(\s*'BEGIN'/);
  assert.match(quoteToOrder, /pg_advisory_xact_lock/);
  assert.match(quoteToOrder, /FOR UPDATE/);
  assert.match(quoteToOrder, /row\.sales_order_id/);
  assert.match(quoteToOrder, /quote_id = \$3/);
  assert.match(quoteToOrder, /This quote references a missing, deleted, or mismatched sales order/);
  assert.match(quoteToOrder, /A sales order already references this quotation but the quotation link is missing/);
  assert.match(quoteToOrder, /Resolve the existing order link before retrying conversion/);
  assert.match(quoteToOrder, /This quotation is marked converted but has no linked sales order/);
  assert.match(quoteToOrder, /Resolve the record before retrying conversion/);
  assert.match(quoteToOrder, /INSERT INTO sales_order_items_v2/);
  assert.match(quoteToOrder, /sales_order_id = \$3/);
  assert.match(quoteToOrder, /Complete internal quotation approval before creating a sales order/);
  assert.match(quoteToOrder, /ROLLBACK/);

  const quoteToInvoice =
    commands.slice(
      invoiceStart,
      fulfillmentStart,
    );
  const permissionCheck =
    quoteToInvoice.indexOf(
      'await requireSalesContext(',
    );
  const orderManagePermission =
    quoteToInvoice.indexOf(
      '.ORDER_MANAGE',
      permissionCheck,
    );
  const orderCreation =
    quoteToInvoice.indexOf(
      'await createSalesOrderFromQuote(',
    );

  assert.ok(permissionCheck >= 0);
  assert.ok(orderManagePermission > permissionCheck);
  assert.ok(orderCreation > orderManagePermission,
    'Invoice permission must be confirmed before the quote is converted into an order.');
});


test('Sales order invoicing supports partial quantities without bypassing locked Invoicing', async () => {
  const commands =
    await source(
      'lib/apps/sales/commands.ts',
    );

  assert.match(
    commands,
    /createSalesOrderInvoice/,
  );

  assert.match(
    commands,
    /sales_order_invoice_batches/,
  );

  assert.match(
    commands,
    /idempotency_key/,
  );

  assert.match(
    commands,
    /pg_advisory_lock/,
  );

  assert.match(
    commands,
    /allow_partial_invoicing/,
  );

  assert.match(
    commands,
    /invoice_policy/,
  );

  assert.match(
    commands,
    /shipping_invoiced/,
  );

  assert.match(
    commands,
    /createInvoicingCustomer/,
  );

  assert.match(
    commands,
    /await createInvoice\(/,
  );

  assert.doesNotMatch(
    commands,
    /INSERT INTO invoicing_invoices/,
    'Sales must hand invoice creation to the locked Invoicing service.',
  );
});


test('Sales PDF and public quotation include complete commercial information', async () => {
  const [
    pdf,
    publicPage,
    publicApi,
  ] =
    await Promise.all([
      source(
        'lib/apps/sales/pdf.ts',
      ),
      source(
        'app/q/[tenantId]/[token]/page.tsx',
      ),
      source(
        'app/api/public/sales/[tenantId]/[token]/route.ts',
      ),
    ]);

  for (
    const text
    of [
      'QUOTATION',
      'PREPARED FOR',
      'QUOTE DETAILS',
      'Description',
      'COMMERCIAL SUMMARY',
      'TERMS & CONDITIONS',
    ]
  ) {
    assert.ok(
      pdf.includes(
        text,
      ),
      text,
    );
  }

  assert.match(
    publicPage,
    /View PDF/,
  );

  assert.match(
    publicPage,
    /PublicSalesQuoteActions/,
  );

  assert.match(
    publicApi,
    /respondToPublicSalesQuote/,
  );
});


test('Sales workspace includes professional operating surfaces, tutorials and overlays', async () => {
  const [
    workspace,
    composer,
    quoteDetail,
    orderDetail,
  ] =
    await Promise.all([
      source(
        'app/apps/sales/SalesWorkspaceClient.tsx',
      ),
      source(
        'app/apps/sales/SalesQuoteComposer.tsx',
      ),
      source(
        'app/apps/sales/SalesQuoteDetailClient.tsx',
      ),
      source(
        'app/apps/sales/SalesOrderDetailClient.tsx',
      ),
    ]);

  assert.match(
    workspace,
    /WorkspaceTutorial/,
  );

  assert.match(
    workspace,
    /SaMiOverlay/,
  );

  for (
    const section
    of [
      'Overview',
      'Quotations',
      'Sales orders',
      'Reports',
      'Settings',
    ]
  ) {
    assert.ok(
      workspace.includes(
        section,
      ),
      section,
    );
  }

  assert.match(
    composer,
    /Products & services/,
  );

  assert.match(
    composer,
    /Commercial summary/,
  );

  assert.match(
    quoteDetail,
    /Request approval/,
  );

  assert.match(
    quoteDetail,
    /Deliver quotation/,
  );

  assert.match(
    quoteDetail,
    /Create sales order/,
  );

  assert.match(
    orderDetail,
    /Order fulfillment/,
  );

  assert.match(
    orderDetail,
    /Create invoice/,
  );

  assert.match(
    orderDetail,
    /Invoice batches/,
  );
});


test('Sales API exposes the complete quotation-to-cash action surface', async () => {
  const api =
    await source(
      'app/api/apps/sales/route.ts',
    );

  assert.match(
    api,
    /sec-fetch-site/,
  );

  assert.match(
    api,
    /MAX_BODY_BYTES/,
  );

  for (
    const action
    of [
      'create_quote',
      'update_quote',
      'duplicate_quote',
      'revise_quote',
      'save_optional_items',
      'save_pricelist',
      'save_sales_territory',
      'save_sales_team',
      'save_sales_target',
      'save_commission_plan',
      'mark_commission_paid',
      'send_quote',
      'change_quote_status',
      'request_quote_approval',
      'review_quote_approval',
      'quote_to_order',
      'quote_to_invoice',
      'update_fulfillment',
      'create_order_invoice',
      'cancel_order',
      'update_settings',
      'save_template',
    ]
  ) {
    assert.ok(
      api.includes(
        action,
      ),
      action,
    );
  }
});


test('Sales v3 is registered into manifests, migrations, Search and SaMi AI', async () => {
  const [
    manifest,
    migrationEngine,
    runtimeMigrations,
    runtimeSearch,
    runtimeAi,
    search,
    ai,
  ] =
    await Promise.all([
      source(
        'lib/modules/first-party.ts',
      ),
      source(
        'lib/modules/migrations.ts',
      ),
      source(
        'lib/apps/runtime-migrations.ts',
      ),
      source(
        'lib/apps/runtime-search.ts',
      ),
      source(
        'lib/apps/runtime-ai.ts',
      ),
      source(
        'lib/search/registry.ts',
      ),
      source(
        'lib/ai/tool-registry.ts',
      ),
    ]);

  assert.match(
    migrationEngine,
    /APP_RUNTIME_MODULE_MIGRATIONS/,
  );

  assert.match(
    manifest,
    /key: "sales",[\s\S]*version: '3\.4\.19'/s,
  );

  assert.match(
    manifest,
    /sales\.quote\.approve_internal/,
  );

  assert.match(
    manifest,
    /sales\.order\.manage/,
  );

  assert.match(
    runtimeMigrations,
    /SALES_1_0_0_TO_2_0_0/,
  );

  assert.match(
    runtimeMigrations,
    /SALES_2_0_0_TO_2_1_0/,
  );

  assert.match(
    runtimeMigrations,
    /SALES_2_1_0_TO_2_2_0/,
  );

  assert.match(
    runtimeMigrations,
    /SALES_2_2_0_TO_3_0_0/,
  );

  assert.match(
    runtimeMigrations,
    /SALES_3_0_0_TO_3_1_0/,
  );

  const inventoryBridge =
    await source(
      'lib/apps/sales/inventory.ts',
    );

  assert.match(
    inventoryBridge,
    /stock_reservations/,
  );

  assert.match(
    inventoryBridge,
    /stock_movements/,
  );


  assert.match(
    inventoryBridge,
    /accounting_inventory_settings/,
    'Sales must detect the optional Accounting Inventory Valuation contract without requiring Accounting to be installed.',
  );

  assert.match(
    inventoryBridge,
    /accounting_inventory_source_events/,
    'Fulfillment must persist a valuation source event when Inventory Valuation is enabled.',
  );

  assert.match(
    inventoryBridge,
    /movement_snapshot/,
    'Sales fulfillment must snapshot product standard cost in the same transaction as the stock movement.',
  );

  assert.match(
    inventoryBridge,
    /ON CONFLICT[\s\S]*DO NOTHING/,
    'Valuation source-event capture must remain idempotent across fulfillment retries.',
  );

  assert.match(
    inventoryBridge,
    /Insufficient available stock/,
  );

  const salesAi =
    await source(
      'lib/apps/sales/ai-tools.ts',
    );

  assert.match(
    salesAi,
    /sales_quote_to_order/,
  );

  assert.match(
    salesAi,
    /sales_quote_to_invoice/,
  );

  assert.match(
    search,
    /APP_RUNTIME_SEARCH_PROVIDERS/,
  );

  assert.match(
    runtimeSearch,
    /SALES_SEARCH_PROVIDER/,
  );

  assert.match(
    ai,
    /APP_RUNTIME_AI_TOOLS/,
  );

  assert.match(
    runtimeAi,
    /SALES_AI_TOOLS/,
  );
});

test('Sales 2.2 captures signed customer quotation acceptance as auditable commercial evidence', async () => {
  const [
    schema,
    migration,
    publicQuote,
    publicActions,
    publicRoute,
  ] = await Promise.all([
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/2.1.0-to-2.2.0.ts'),
    source('lib/apps/sales/public.ts'),
    source('app/q/[tenantId]/[token]/PublicSalesQuoteActions.tsx'),
    source('app/api/public/sales/[tenantId]/[token]/route.ts'),
  ]);

  for (const field of [
    'accepted_by_name',
    'accepted_by_email',
    'acceptance_note',
  ]) {
    assert.match(schema, new RegExp(field));
    assert.match(migration, new RegExp(field));
    assert.match(publicQuote, new RegExp(field));
  }

  assert.match(publicQuote, /Enter the name of the person accepting this quotation/);
  assert.match(publicActions, /Accepted by/);
  assert.match(publicActions, /Acceptance note/);
  assert.match(publicActions, /signerName/);
  assert.match(publicRoute, /signerName/);
  assert.match(publicRoute, /acceptanceNote/);
});



test('Sales v3 commercial engine locks pricing, revision history, optional products and margin security', async () => {
  const [
    schema,
    migration,
    commercial,
    commands,
    queries,
    composer,
    detail,
  ] = await Promise.all([
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/2.2.0-to-3.0.0.ts'),
    source('lib/apps/sales/commercial.ts'),
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/queries.ts'),
    source('app/apps/sales/SalesQuoteComposer.tsx'),
    source('app/apps/sales/SalesQuoteDetailClient.tsx'),
  ]);

  for (const table of [
    'sales_pricelists',
    'sales_pricelist_rules',
    'sales_quote_revisions',
    'sales_quote_optional_items',
  ]) {
    assert.match(schema, new RegExp('public\\.' + table));
    assert.match(migration, new RegExp('public\\.' + table));
  }

  for (const field of [
    'current_revision',
    'pricelist_id',
    'unit_cost',
    'cost_total',
    'margin_amount',
    'margin_percent',
  ]) {
    assert.match(schema, new RegExp(field));
    assert.match(migration, new RegExp(field));
  }

  assert.match(commercial, /resolveSalesPricelistUnitPrice/);
  assert.match(commercial, /discount_percent/);
  assert.match(commercial, /markup_percent/);
  assert.match(commercial, /createSalesQuoteRevision/);
  assert.match(commercial, /snapshot JSONB|snapshot,/);
  assert.match(commercial, /saveSalesQuoteOptionalItems/);
  assert.match(commercial, /company_id = \$2|company_id = \$1/);

  assert.match(commands, /selected pricelist currency must match the quotation currency/);
  assert.match(commands, /metadata\.standardCost/);
  assert.match(commands, /SALES_PERMISSIONS[\s\S]*MARGIN_MANAGE/);
  assert.match(commands, /marginPercent/);
  assert.match(commands, /pricelist_id/);
  assert.match(commands, /sales_order_items_v2[\s\S]*unit_cost[\s\S]*margin_amount/);

  assert.match(queries, /canViewMargin/);
  assert.match(queries, /canManageMargin/);
  assert.match(queries, /sales_pricelists/);
  assert.match(queries, /sales_quote_revisions/);
  assert.match(queries, /sales_quote_optional_items/);

  assert.match(composer, /Pricelist/);
  assert.match(composer, /Unit cost/);
  assert.match(composer, /Estimated margin/);
  assert.match(detail, /Revision history/);
  assert.match(detail, /Optional products/);
  assert.match(detail, /Cost \/ margin/);
});

test('Sales v3 does not expose margin data to users without margin permissions', async () => {
  const queries = await source('lib/apps/sales/queries.ts');
  const composer = await source('app/apps/sales/SalesQuoteComposer.tsx');
  const detail = await source('app/apps/sales/SalesQuoteDetailClient.tsx');

  assert.match(queries, /access\.canViewMargin[\s\S]*row\.margin_amount/);
  assert.match(queries, /access\.canViewMargin[\s\S]*row\.metadata/);
  assert.match(composer, /canManageMargin[\s\S]*Unit cost/);
  assert.match(detail, /canViewMargin[\s\S]*Cost \/ margin/);
});


test('Sales v3 customer portal materializes selected optional products before acceptance', async () => {
  const [
    publicQuote,
    publicActions,
    publicRoute,
    migration,
  ] = await Promise.all([
    source('lib/apps/sales/public.ts'),
    source('app/q/[tenantId]/[token]/PublicSalesQuoteActions.tsx'),
    source('app/api/public/sales/[tenantId]/[token]/route.ts'),
    source('lib/apps/sales/migrations/2.2.0-to-3.0.0.ts'),
  ]);

  assert.match(migration, /sales_quote_optional_items[\s\S]*unit_cost/);
  assert.match(publicQuote, /selectedOptionalItemIds/);
  assert.match(publicQuote, /sales_quote_optional_items/);
  assert.match(publicQuote, /INSERT INTO sales_quote_items/);
  assert.match(publicQuote, /optional_products_selected/);
  assert.match(publicQuote, /margin_percent/);
  assert.match(publicActions, /Optional products/);
  assert.match(publicActions, /selectedOptionalItemIds/);
  assert.match(publicActions, /accepted quotation total will be recalculated securely/);
  assert.match(publicRoute, /selectedOptionalItemIds/);
});


test('Sales 3.1 models canonical teams territories targets and commissions', async () => {
  const [
    schema,
    migration,
    context,
    organization,
    commands,
    manifest,
    api,
    page,
    navigation,
    workspace,
    organizationUi,
  ] = await Promise.all([
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/3.0.0-to-3.1.0.ts'),
    source('lib/apps/sales/context.ts'),
    source('lib/apps/sales/organization.ts'),
    source('lib/apps/sales/commands.ts'),
    source('lib/modules/first-party.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/organization/page.tsx'),
    source('lib/apps/sales/navigation.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesOrganizationManager.tsx'),
  ]);

  for (const table of [
    'sales_territories',
    'sales_teams',
    'sales_team_members',
    'sales_targets',
    'sales_commission_plans',
    'sales_commission_assignments',
    'sales_commission_entries',
  ]) {
    assert.match(schema, new RegExp('public\\.' + table));
    assert.match(migration, new RegExp('public\\.' + table));
  }

  for (const permission of [
    'sales.team.view',
    'sales.team.manage',
    'sales.target.view',
    'sales.target.manage',
    'sales.commission.view',
    'sales.commission.manage',
  ]) {
    assert.match(context, new RegExp(permission.replaceAll('.', '\\.')));
    assert.match(manifest, new RegExp(permission.replaceAll('.', '\\.')));
  }

  assert.match(
    organization,
    /FROM tenant_users tu[\s\S]*INNER JOIN users u[\s\S]*member_type = 'internal'/,
    'Sales organization must reuse the canonical workspace user directory.',
  );

  assert.doesNotMatch(
    schema,
    /CREATE TABLE IF NOT EXISTS public\.sales_users/,
    'Sales must not create a second user directory.',
  );

  assert.match(organization, /resolveSalesAssignmentForUser/);
  assert.match(organization, /sales_team_members/);
  assert.match(organization, /sales_order\.sales_team_id/);
  assert.match(organization, /sales_order\.salesperson_user_id/);
  assert.match(organization, /actual_value/);
  assert.match(organization, /attainmentPercent/);

  assert.match(organization, /sourceEventKey/);
  assert.match(organization, /ON CONFLICT[\s\S]*DO NOTHING/);
  assert.match(organization, /status = 'reversed'/);
  assert.match(organization, /status = 'paid'/);
  assert.match(
    organization,
    /historical accruals[\s\S]*Create a new plan version/,
    'Commission commercial terms must be immutable after accrual evidence exists.',
  );

  assert.match(commands, /recordSalesOrderCommissionEntries/);
  assert.match(commands, /reverseSalesOrderCommissions/);
  assert.match(commands, /salesperson_user_id/);
  assert.match(commands, /sales_team_id/);
  assert.match(commands, /territory_id/);

  assert.match(
    commands,
    /INSERT INTO sales_quotes \([\s\S]*salesperson_user_id,[\s\S]*sales_team_id,[\s\S]*territory_id,[\s\S]*created_by,[\s\S]*updated_by[\s\S]*VALUES \([\s\S]*\$25,\$26,\$27,\$28,\$29,\$30,\$31,\$31/,
    'Quotation SQL placeholders must stay aligned after commercial and organization snapshots are added.',
  );

  assert.match(manifest, /sales\.territory\.company/);
  assert.match(manifest, /sales\.team\.company/);
  assert.match(manifest, /sales\.target\.company/);
  assert.match(manifest, /sales\.commission\.company/);

  for (const action of [
    'save_sales_territory',
    'save_sales_team',
    'save_sales_target',
    'save_commission_plan',
    'mark_commission_paid',
  ]) {
    assert.ok(api.includes(action), action);
  }

  assert.match(page, /SalesSectionPage view="organization"/);
  assert.ok(navigation.includes("'/apps/sales/organization'"), 'organization route is registered');
  assert.ok(navigation.includes('Teams & performance'), 'organization label is registered');
  assert.match(workspace, /SalesOrganizationManager/);
  assert.match(organizationUi, /Sales territories/);
  assert.match(organizationUi, /Sales teams/);
  assert.match(organizationUi, /New sales target/);
  assert.match(organizationUi, /Commission plan/);
  assert.match(organizationUi, /% achieved/);
  assert.match(organizationUi, /Mark paid/);
});


test('Sales 3.1 commission accrual remains tied to immutable order snapshots', async () => {
  const [
    migration,
    commands,
    organization,
  ] = await Promise.all([
    source('lib/apps/sales/migrations/3.0.0-to-3.1.0.ts'),
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/organization.ts'),
  ]);

  for (const snapshot of [
    'salesperson_user_id',
    'sales_team_id',
    'territory_id',
  ]) {
    assert.match(migration, new RegExp(snapshot));
  }

  assert.match(
    commands,
    /INSERT INTO sales_orders_v2[\s\S]*salesperson_user_id[\s\S]*sales_team_id[\s\S]*territory_id/,
  );

  assert.match(
    commands,
    /revenueAmount:[\s\S]*row\.subtotal[\s\S]*row\.discount_total/,
  );

  assert.match(
    commands,
    /marginAmount:[\s\S]*row\.margin_amount/,
  );

  assert.match(
    organization,
    /source_event_key VARCHAR\(255\) NOT NULL|source_event_key/,
  );

  assert.match(
    organization,
    /WHERE company_id = \$1[\s\S]*order_id = \$2[\s\S]*status = 'accrued'/,
    'Order cancellation must reverse only unpaid accrued commissions.',
  );
});


test('Sales 3.2 runs deposits, shipments, returns and forecasting through authoritative module boundaries', async () => {
  const [
    schema,
    migration,
    runtimeMigrations,
    context,
    operations,
    commands,
    manifest,
    api,
    page,
    navigation,
    workspace,
    operationsUi,
    orderUi,
    invoicingTypes,
    invoicingCommands,
  ] = await Promise.all([
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/3.1.0-to-3.2.0.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/sales/context.ts'),
    source('lib/apps/sales/operations.ts'),
    source('lib/apps/sales/commands.ts'),
    source('lib/modules/first-party.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/operations/page.tsx'),
    source('lib/apps/sales/navigation.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesOperationsManager.tsx'),
    source('app/apps/sales/SalesOrderDetailClient.tsx'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/commands.ts'),
  ]);

  assert.match(runtimeMigrations, /SALES_3_1_0_TO_3_2_0/);
  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.19'/s);

  for (const table of [
    'sales_shipments',
    'sales_shipment_items',
    'sales_returns',
    'sales_return_items',
    'sales_return_credits',
    'sales_return_credit_items',
    'sales_forecast_snapshots',
  ]) {
    assert.match(schema, new RegExp('public\\.' + table));
    assert.match(migration, new RegExp('public\\.' + table));
  }

  for (const field of [
    'deposit_required_amount',
    'deposit_received_amount',
    'deposit_retainer_id',
    'deposit_payment_id',
    'returned_quantity',
    'credited_quantity',
  ]) {
    assert.match(schema, new RegExp(field));
    assert.match(migration, new RegExp(field));
  }

  for (const permission of [
    'sales.shipping.view',
    'sales.shipping.manage',
    'sales.return.view',
    'sales.return.manage',
    'sales.deposit.manage',
    'sales.forecast.view',
  ]) {
    assert.match(context, new RegExp(permission.replaceAll('.', '\\.')));
    assert.match(manifest, new RegExp(permission.replaceAll('.', '\\.')));
  }

  assert.match(migration, /'shipment'/);
  assert.match(migration, /'return'/);
  assert.match(context, /'SHP-'/);
  assert.match(context, /'RMA-'/);

  assert.match(operations, /recordCustomerRetainer/);
  assert.match(operations, /retainerType:[\s\S]*'deposit'/);
  assert.match(operations, /allocateInvoicePayment/);
  assert.match(operations, /postSalesFulfillmentToInventory/);
  assert.match(operations, /issueInvoiceCreditNote/);
  assert.match(operations, /refundInvoiceCreditNote/);
  assert.match(
    operations,
    /available\.toFixed\([\s\S]*amount\.toFixed\(/,
    'Default Sales refund idempotency must change with the remaining credit state so a deliberate second partial refund is not collapsed into the first.',
  );
  assert.match(
    operations,
    /invoicing_credit_note_balances[\s\S]*invoicing_credit_note_refunds[\s\S]*refunded_amount = \$4/s,
    'Sales refund bookkeeping must reconcile from Invoicing authoritative balances so retries cannot double-count refunded totals.',
  );
  assert.match(operations, /RETURN_CREDIT_LINK_MISSING/);
  assert.match(operations, /weighted_pipeline/);
  assert.match(operations, /sales_forecast_snapshots/);

  assert.match(
    operations,
    /DEPOSIT_MANAGE[\s\S]*\? context\.pool\.query[\s\S]*deposit_required_amount/,
    'Deposit operational data must remain permission-scoped.',
  );

  assert.match(
    operations,
    /FORECAST_VIEW[\s\S]*\? context\.pool\.query[\s\S]*WITH quote_pipeline/,
    'Forecast data must remain permission-scoped.',
  );

  assert.match(
    commands,
    /Delivered quantity cannot be reduced directly[\s\S]*Create a Sales return/,
    'Direct fulfillment decrements must not bypass the formal return workflow.',
  );

  assert.match(invoicingTypes, /metadata\?: unknown/);
  assert.match(
    invoicingCommands,
    /metadata:[\s\S]*plainObject\([\s\S]*raw\.metadata/,
    'Invoice normalization must preserve trusted caller source metadata.',
  );
  assert.match(
    invoicingCommands,
    /INSERT INTO invoicing_invoice_items[\s\S]*metadata[\s\S]*::jsonb/,
    'Invoice items must persist source metadata.',
  );
  assert.match(
    commands,
    /sourceModule:[\s\S]*'sales'[\s\S]*salesOrderId:[\s\S]*salesOrderLineId/,
    'Sales-created invoice lines must carry exact Sales source identity.',
  );

  for (const action of [
    'set_deposit_requirement',
    'record_order_deposit',
    'apply_order_deposit',
    'create_shipment',
    'update_shipment_status',
    'create_return',
    'approve_return',
    'receive_return',
    'issue_return_credit',
    'refund_return_credit',
  ]) {
    assert.ok(api.includes(action), action);
  }

  assert.match(page, /SalesSectionPage view="operations"/);
  assert.ok(navigation.includes("'/apps/sales/operations'"), 'operations route is registered');
  assert.ok(navigation.includes('Operations'), 'operations label is registered');
  assert.match(workspace, /SalesOperationsManager/);
  assert.match(operationsUi, /Revenue outlook/);
  assert.match(operationsUi, /Shipments & tracking/);
  assert.match(operationsUi, /Returns, credits & refunds/);
  assert.match(operationsUi, /Customer deposits/);
  assert.match(orderUi, /Create shipment/);
  assert.match(orderUi, /Create return/);
  assert.match(orderUi, /Customer deposit/);
});

test('Sales 3.2 keeps stock return, invoice credit and cash refund as separate auditable events', async () => {
  const [
    migration,
    operations,
    orderUi,
  ] = await Promise.all([
    source('lib/apps/sales/migrations/3.1.0-to-3.2.0.ts'),
    source('lib/apps/sales/operations.ts'),
    source('app/apps/sales/SalesOrderDetailClient.tsx'),
  ]);

  assert.match(migration, /returned_quantity/);
  assert.match(migration, /credited_quantity/);
  assert.match(migration, /sales_return_credits/);
  assert.match(migration, /sales_return_credit_items/);

  assert.match(
    operations,
    /quantityDelta:[\s\S]*nextFulfilledQuantity/,
    'Receiving returned goods must reverse the authoritative delivered quantity through Inventory.',
  );

  assert.match(
    operations,
    /credited_quantity[\s\S]*LEAST\([\s\S]*returned_quantity/,
    'Invoice credit evidence must be bounded by physical returned quantity.',
  );

  assert.match(
    operations,
    /refundInvoiceCreditNote[\s\S]*available_credit[\s\S]*refunded_amount/,
    'Cash refunds must occur only from available customer credit.',
  );

  assert.match(orderUi, /Returned/);
  assert.match(orderUi, /Credited/);
});


test('Sales roadmap Part 2 exposes a standalone customer and contact workspace backed by the shared customer master', async () => {
  const [
    page,
    navigation,
    workspace,
    customerUi,
    queries,
    commands,
    route,
    types,
  ] = await Promise.all([
    source('app/apps/sales/customers/page.tsx'),
    source('lib/apps/sales/navigation.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesCustomersManager.tsx'),
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/commands.ts'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/types.ts'),
  ]);

  assert.match(page, /SalesSectionPage view="customers"/);
  assert.ok(navigation.includes("'/apps/sales/customers'"), 'customers route is registered');
  assert.ok(navigation.includes('Customers & contacts'), 'customers label is registered');
  assert.ok(navigation.includes('Customers & Contacts'), 'customer navigation label is registered');
  assert.match(workspace, /SalesCustomersManager/);
  assert.match(customerUi, /Roadmap Part 2/);
  assert.match(customerUi, /Customer identity & primary contact/);
  assert.match(customerUi, /create_customer/);
  assert.match(customerUi, /update_customer/);
  assert.match(customerUi, /Primary contact/);
  assert.match(queries, /customer_type/);
  assert.match(queries, /contact_name/);
  assert.match(queries, /registration_number/);
  assert.match(queries, /credit_limit/);
  assert.match(queries, /canManageBillingCustomers/);
  assert.match(commands, /createInvoicingCustomer/);
  assert.match(commands, /updateInvoicingCustomer/);
  assert.match(commands, /createSalesCustomer/);
  assert.match(commands, /updateSalesCustomer/);
  assert.match(route, /create_customer:[\s\S]*createSalesCustomer/);
  assert.match(route, /update_customer:[\s\S]*updateSalesCustomer/);
  assert.match(types, /contactName: string \| null/);
  assert.match(types, /canManageBillingCustomers: boolean/);
});


test('Sales roadmap Part 5 exposes quotation templates as a standalone Sales destination', async () => {
  const [
    page,
    navigation,
    workspace,
    templates,
    commands,
  ] = await Promise.all([
    source('app/apps/sales/templates/page.tsx'),
    source('lib/apps/sales/navigation.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesTemplatesManager.tsx'),
    source('lib/apps/sales/commands.ts'),
  ]);

  assert.match(page, /SalesSectionPage view="templates"/);
  assert.ok(navigation.includes("'/apps/sales/templates'"), 'templates route is registered');
  assert.ok(navigation.includes('Quotation templates'), 'templates label is registered');
  assert.match(workspace, /SalesTemplatesManager/);
  assert.match(templates, /Roadmap Part 5/);
  assert.match(templates, /Template library/);
  assert.match(templates, /save_template/);
  assert.match(templates, /Default notes/);
  assert.match(templates, /Default terms/);
  assert.match(templates, /Document footer/);
  assert.match(commands, /saveSalesQuoteTemplate/);
  assert.match(commands, /sales_quote_templates/);
});


test('Sales roadmap Parts 6 and 7 expose standalone PDF builder and product catalogue workspaces', async () => {
  const [
    pdfPage,
    cataloguePage,
    navigation,
    workspace,
    pdfBuilder,
    catalogue,
    commands,
    queries,
    route,
    types,
  ] = await Promise.all([
    source('app/apps/sales/pdf-builder/page.tsx'),
    source('app/apps/sales/catalogue/page.tsx'),
    source('lib/apps/sales/navigation.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesQuotePdfBuilder.tsx'),
    source('app/apps/sales/SalesProductCatalogueManager.tsx'),
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/queries.ts'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/types.ts'),
  ]);

  assert.match(pdfPage, /SalesSectionPage view="pdfBuilder"/);
  assert.match(cataloguePage, /SalesSectionPage view="catalogue"/);
  assert.ok(navigation.includes("'/apps/sales/pdf-builder'"), 'pdfBuilder route is registered');
  assert.ok(navigation.includes("'/apps/sales/catalogue'"), 'catalogue route is registered');
  assert.match(workspace, /SalesQuotePdfBuilder/);
  assert.match(workspace, /SalesProductCatalogueManager/);
  assert.match(pdfBuilder, /Roadmap Part 6/);
  assert.match(pdfBuilder, /apply_quote_template/);
  assert.match(pdfBuilder, /Open generated PDF/);
  assert.match(pdfBuilder, /\/api\/apps\/sales\/quotes\//);
  assert.match(catalogue, /Roadmap Part 7/);
  assert.match(catalogue, /create_catalog_item/);
  assert.match(catalogue, /update_catalog_item/);
  assert.match(catalogue, /Product catalogue/);
  assert.match(commands, /applySalesQuoteTemplate/);
  assert.match(commands, /quote\.template_applied/);
  assert.match(commands, /createSalesCatalogItem/);
  assert.match(commands, /updateSalesCatalogItem/);
  assert.match(queries, /template_id/);
  assert.match(queries, /item_type/);
  assert.match(queries, /canManageCatalog/);
  assert.match(route, /apply_quote_template:[\s\S]*applySalesQuoteTemplate/);
  assert.match(route, /create_catalog_item:[\s\S]*createSalesCatalogItem/);
  assert.match(route, /update_catalog_item:[\s\S]*updateSalesCatalogItem/);
  assert.match(types, /templateId: string \| null/);
  assert.match(types, /itemType: string/);
  assert.match(types, /canManageCatalog: boolean/);
});


test('Sales roadmap Parts 8 and 9 separate pricelist scope from advanced pricing rules', async () => {
  const [
    pricelistPage,
    advancedPricingPage,
    navigation,
    workspace,
    pricelists,
    advanced,
    commercial,
  ] = await Promise.all([
    source('app/apps/sales/pricelists/page.tsx'),
    source('app/apps/sales/advanced-pricing/page.tsx'),
    source('lib/apps/sales/navigation.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesPricelistsManager.tsx'),
    source('app/apps/sales/SalesAdvancedPricingManager.tsx'),
    source('lib/apps/sales/commercial.ts'),
  ]);

  assert.match(pricelistPage, /SalesSectionPage view="pricelists"/);
  assert.match(advancedPricingPage, /SalesSectionPage view="advancedPricing"/);
  assert.ok(navigation.includes("'/apps/sales/pricelists'"), 'pricelists route is registered');
  assert.ok(navigation.includes("'/apps/sales/advanced-pricing'"), 'advancedPricing route is registered');
  assert.match(workspace, /SalesPricelistsManager/);
  assert.match(workspace, /SalesAdvancedPricingManager/);
  assert.doesNotMatch(workspace, /SalesPricingManager/);
  assert.match(pricelists, /Roadmap Part 8/);
  assert.match(pricelists, /save_pricelist/);
  assert.doesNotMatch(pricelists, /rules:/);
  assert.match(advanced, /Roadmap Part 9/);
  assert.match(advanced, /discount_percent/);
  assert.match(advanced, /markup_percent/);
  assert.match(advanced, /minQuantity/);
  assert.match(advanced, /rules:/);
  assert.match(commercial, /input\.rules !==[\s\S]*undefined/);
  assert.match(commercial, /DELETE FROM sales_pricelist_rules/);
});


test('Sales roadmap Part 10 locks multi-currency values and exposes Currency & FX operations', async () => {
  const [
    currencies,
    migration,
    runtimeMigrations,
    modules,
    commands,
    queries,
    types,
    schema,
    route,
    service,
    page,
    navigation,
    workspace,
    currencyUi,
    composer,
  ] = await Promise.all([
    source('lib/apps/sales/currencies.ts'),
    source('lib/apps/sales/migrations/3.2.0-to-3.3.0.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/schema.sql'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/apps/sales/currencies/page.tsx'),
    source('lib/apps/sales/navigation.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesCurrenciesManager.tsx'),
    source('app/apps/sales/SalesQuoteComposer.tsx'),
  ]);

  assert.match(currencies, /resolveInvoicingExchangeRate/);
  assert.match(currencies, /saveInvoicingCurrency/);
  assert.match(currencies, /saveInvoicingExchangeRate/);
  assert.match(currencies, /resolveSalesExchangeRate/);
  assert.match(currencies, /salesBaseAmount/);
  assert.match(currencies, /manual_override/);
  assert.match(currencies, /No shared Currency Center is installed/);

  assert.match(migration, /fromVersion:[\s\S]*'3\.2\.0'/);
  assert.match(migration, /toVersion:[\s\S]*'3\.3\.0'/);
  assert.match(migration, /base_currency/);
  assert.match(migration, /exchange_rate NUMERIC\(19,8\)/);
  assert.match(migration, /base_total_amount/);
  assert.match(runtimeMigrations, /SALES_3_2_0_TO_3_3_0/);
  assert.match(modules, /key: "sales"[\s\S]*version: '3\.4\.19'/);

  assert.match(commands, /resolveSalesExchangeRate/);
  assert.match(commands, /salesBaseAmount/);
  assert.match(commands, /canKeepLockedRate/);
  assert.match(commands, /existingQuote[\s\S]*exchange_rate/);
  assert.match(commands, /exchange_rate_source/);
  assert.match(commands, /base_total_amount/);
  assert.match(commands, /input\.exchangeRate \?\?[\s\S]*orderRow\.exchange_rate/);

  assert.match(queries, /SUM\(base_total_amount\)/);
  assert.match(queries, /baseCurrency:/);
  assert.match(queries, /exchangeRate:/);
  assert.match(queries, /exchangeRateDate:/);
  assert.match(queries, /exchangeRateSource:/);
  assert.match(queries, /baseTotalAmount:/);

  assert.match(types, /baseCurrency: string/);
  assert.match(types, /exchangeRate: number/);
  assert.match(types, /exchangeRateDate: string/);
  assert.match(types, /exchangeRateSource: string/);
  assert.match(types, /baseTotalAmount: number/);
  assert.match(types, /exchangeRate\?: unknown/);

  assert.equal(
    (schema.match(/base_currency VARCHAR\(3\)/g) || []).length,
    2,
  );
  assert.equal(
    (schema.match(/exchange_rate NUMERIC\(19,8\)/g) || []).length,
    2,
  );
  assert.match(schema, /CHECK \(base_currency ~ '\^\[A-Z\]\{3\}\$'\)/);
  assert.match(schema, /idx_sales_quotes_currency_date/);
  assert.match(schema, /idx_sales_orders_currency_date/);

  assert.match(service, /getSalesCurrencyData/);
  assert.match(service, /saveSalesCurrency/);
  assert.match(service, /saveSalesExchangeRate/);
  assert.match(route, /currencies ===[\s\S]*getSalesCurrencyData/);
  assert.match(route, /save_currency:[\s\S]*saveSalesCurrency/);
  assert.match(route, /save_exchange_rate:[\s\S]*saveSalesExchangeRate/);

  assert.match(page, /SalesSectionPage view="currencies"/);
  assert.ok(navigation.includes("'/apps/sales/currencies'"), 'currencies route is registered');
  assert.ok(navigation.includes('Currency & FX'), 'currencies label is registered');
  assert.match(workspace, /SalesCurrenciesManager/);
  assert.match(workspace, /view ===[\s\S]*'currencies'/);
  assert.match(currencyUi, /Roadmap Part 10/);
  assert.match(currencyUi, /\/api\/apps\/sales\?currencies=1/);
  assert.match(currencyUi, /save_currency/);
  assert.match(currencyUi, /save_exchange_rate/);
  assert.match(currencyUi, /Quotation exposure/);
  assert.match(currencyUi, /Sales-order exposure/);

  assert.match(composer, /manualExchangeRate/);
  assert.match(composer, /Manual FX rate to/);
  assert.match(composer, /exchangeRate:[\s\S]*manualExchangeRate/);
});


test('Sales roadmap Part 11 owns tenant-scoped leads and opportunity pipeline', async () => {
  const [migration,runtime,manifest,context,pipeline,route,page,navigation,workspace,ui,schema,crmUi] = await Promise.all([
    source('lib/apps/sales/migrations/3.3.0-to-3.4.0.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/context.ts'),
    source('lib/apps/sales/pipeline.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/pipeline/page.tsx'),
    source('lib/apps/sales/navigation.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesPipelineBoard.tsx'),
    source('lib/apps/sales/schema.sql'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
  ]);
  assert.match(runtime,/SALES_3_3_0_TO_3_4_0/);
  assert.match(manifest,/key: "sales"[\s\S]*version: '3\.4\.19'/);
  for (const table of ['sales_pipeline_stages','sales_leads','sales_opportunities','sales_opportunity_stage_history']) {
    assert.match(migration,new RegExp('public\\.'+table));
    assert.match(schema,new RegExp('public\\.'+table));
  }
  for (const permission of ['sales.pipeline.view','sales.pipeline.manage']) {
    assert.match(context,new RegExp(permission.replaceAll('.','\\.')));
    assert.match(manifest,new RegExp(permission.replaceAll('.','\\.')));
  }
  assert.match(pipeline,/createSalesLead/);
  assert.match(pipeline,/convertSalesLeadToOpportunity/);
  assert.match(pipeline,/moveSalesOpportunity/);
  assert.match(pipeline,/sales_opportunity_stage_history/);
  assert.match(pipeline,/numberInput\(input\.expectedValue/);
  assert.match(pipeline,/input\.expectedCloseDate/);
  assert.match(pipeline,/context\.company\.currentCompany\.currency/);
  assert.match(pipeline,/lead\.rows\[0\]\.status === 'disqualified'/);
  assert.match(crmUi,/Expected deal value/);
  assert.match(crmUi,/Expected close date/);
  assert.match(crmUi,/Qualify lead/);
  assert.match(workspace,/defaultCurrency=\{initialData\.company\.currency\}/);
  assert.match(route,/pipeline === '1'/);
  assert.match(route,/create_lead/);
  assert.match(route,/convert_lead/);
  assert.match(route,/move_opportunity/);
  assert.match(page,/SalesSectionPage view="pipeline"/);
  assert.ok(navigation.includes("'/apps/sales/pipeline'"), 'pipeline route is registered');
  assert.match(workspace,/SalesPipelineBoard/);
  assert.match(ui,/Pipeline board/);
  assert.match(ui,/Weighted pipeline/);
  assert.match(ui,/New stage/);
});


test('Sales 3.4.1 migration is active and approval cannot be bypassed by acceptance or order conversion', async () => {
  const [
    manifest,
    migration,
    runtimeMigrations,
    commands,
    publicSales,
    delivery,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/migrations/3.4.0-to-3.4.1.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/public.ts'),
    source('lib/apps/sales/delivery.ts'),
  ]);

  assert.match(manifest, /key: "sales"[\s\S]*version: '3\.4\.19'/s);
  assert.match(migration, /fromVersion:[\s\S]*'3\.4\.0'/);
  assert.match(migration, /toVersion:[\s\S]*'3\.4\.1'/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS stage_id/);
  assert.match(runtimeMigrations, /SALES_3_4_0_TO_3_4_1/);

  assert.match(delivery, /Complete internal quotation approval before sending/);
  assert.match(publicSales, /q\.approval_status/);
  assert.match(publicSales, /Complete internal quotation approval before accepting this quote/);

  assert.match(commands, /approval_status[\s\S]*valid_until/);
  assert.match(commands, /Complete internal quotation approval before accepting this quote/);
  assert.match(commands, /Complete internal quotation approval before creating a sales order/);
});


test('Sales pipeline saved views persist user-scoped lead and opportunity filters through an additive migration', async () => {
  const [migration, schema, registry, manifest, types, savedViews, service, route, ui] = await Promise.all([
    source('lib/apps/sales/migrations/3.4.10-to-3.4.11.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/saved-views.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
  ]);

  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.19'/s);
  assert.ok(migration.includes("sales-3.4.10-to-3.4.11"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS public.sales_pipeline_saved_views"));
  assert.ok(migration.includes("uq_sales_pipeline_saved_views_owner_name"));
  assert.ok(migration.includes("idx_sales_pipeline_saved_views_owner"));
  assert.match(registry, /SALES_3_4_10_TO_3_4_11/);
  assert.ok(registry.indexOf('SALES_3_4_9_TO_3_4_10,') < registry.indexOf('SALES_3_4_10_TO_3_4_11,'));
  assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS public.sales_pipeline_saved_views"));
  assert.match(types, /export type SalesPipelineViewType = 'leads' \| 'opportunities'/);
  assert.match(types, /export type SalesSavedPipelineView/);
  assert.match(savedViews, /requireSalesContext\(SALES_PERMISSIONS\.PIPELINE_VIEW\)/);
  assert.match(savedViews, /WHERE company_id = \$1[\s\S]*AND user_id = \$2/);
  assert.match(savedViews, /MAX_SAVED_VIEWS = 25/);
  assert.match(savedViews, /ALLOWED_LEAD_PIPELINE_STATUSES/);
  assert.match(savedViews, /ALLOWED_OPPORTUNITY_PIPELINE_STATUSES/);
  assert.match(savedViews, /UPDATE sales_pipeline_saved_views[\s\S]*deleted_at = NOW\(\)/);
  assert.ok(service.includes('getSalesSavedPipelineViews'));
  assert.ok(route.includes("get('pipelineViews')"));
  assert.ok(route.includes('save_pipeline_view:'));
  assert.ok(route.includes('delete_pipeline_view:'));
  assert.ok(ui.includes('/api/apps/sales?pipelineViews=1'));
  assert.ok(ui.includes("save_pipeline_view"));
  assert.ok(ui.includes("delete_pipeline_view"));
  assert.ok(ui.includes('Save current lead view'));
  assert.ok(ui.includes('Save current opportunity view'));
  assert.ok(ui.includes('applySavedPipelineView'));
});


test('Sales opportunities support tenant-scoped activity planning, editing, rescheduling and completion', async () => {
  const [migration, schema, registry, manifest, pipeline, service, route, ui] = await Promise.all([
    source('lib/apps/sales/migrations/3.4.11-to-3.4.12.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/pipeline.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
  ]);

  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.19'/s);
  assert.match(migration, /sales-3\.4\.11-to-3\.4\.12/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.sales_opportunity_activities/);
  assert.match(migration, /idx_sales_opportunity_activities_due/);
  assert.match(registry, /SALES_3_4_11_TO_3_4_12/);
  assert.ok(registry.indexOf('SALES_3_4_10_TO_3_4_11,') < registry.indexOf('SALES_3_4_11_TO_3_4_12,'));
  assert.match(schema, /sales_opportunity_activities[\s\S]*opportunity_id UUID NOT NULL REFERENCES public\.sales_opportunities\(id\) ON DELETE CASCADE/);
  assert.match(schema, /idx_sales_opportunity_activities_due/);

  assert.match(pipeline, /export async function createSalesOpportunityActivity/);
  assert.match(pipeline, /export async function updateSalesOpportunityActivity/);
  assert.match(pipeline, /export async function editSalesOpportunityActivity/);
  assert.match(pipeline, /WHERE o\.id=\$1 AND o\.company_id=\$2 AND o\.deleted_at IS NULL/);
  assert.match(pipeline, /Follow-up activities can only be scheduled on open opportunities/);
  assert.match(pipeline, /UPDATE sales_opportunity_activities[\s\S]*status='planned'/);
  for (const exported of [
    'createSalesOpportunityActivity',
    'updateSalesOpportunityActivity',
    'editSalesOpportunityActivity',
  ]) {
    assert.ok(service.includes(exported), 'Sales service exports ' + exported);
  }
  for (const action of [
    'create_opportunity_activity',
    'update_opportunity_activity',
    'edit_opportunity_activity',
  ]) {
    assert.ok(route.includes(action), 'Sales API routes ' + action);
  }

  assert.match(ui, /opportunityActivities: SalesOpportunityActivity\[\]/);
  assert.match(ui, /recordType: 'opportunity'/);
  assert.match(ui, /Opportunity activities/);
  assert.match(ui, /Schedule opportunity follow-up/);
  assert.match(ui, /Edit \/ reschedule/);
  assert.match(ui, /updateActivity\(activity, 'completed'\)/);
  assert.match(ui, /recordType === 'lead' \? 'Lead' : 'Opportunity'/);
});



test('Sales API returns correct HTTP statuses for missing or invalid authentication context', async () => {
  const route = await source('app/api/apps/sales/route.ts');
  const handleErrorStart = route.indexOf('function handleError(');
  const handleErrorEnd = route.indexOf('export async function GET(', handleErrorStart);
  const handleError = route.slice(handleErrorStart, handleErrorEnd);

  assert.match(handleError, /error instanceof CompanyContextError/);
  assert.match(handleError, /error instanceof TenantContextError/);
  assert.match(handleError, /UNAUTHENTICATED:\s*401/);
  assert.match(handleError, /NO_WORKSPACE_SELECTED:\s*409/);
  assert.match(handleError, /WORKSPACE_DATABASE_UNAVAILABLE:\s*503/);
  assert.match(handleError, /contextErrorStatuses\[error\.code\]\s*\?\?\s*500/);
});


test('Sales Priority 3 secures public acceptance and tracks customer change requests end to end', async () => {
  const [route, publicService, portalActions, publicPage, queries, types, detailUi, signature] = await Promise.all([
    source('app/api/public/sales/[tenantId]/[token]/route.ts'),
    source('lib/apps/sales/public.ts'),
    source('app/q/[tenantId]/[token]/PublicSalesQuoteActions.tsx'),
    source('app/q/[tenantId]/[token]/page.tsx'),
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/types.ts'),
    source('app/apps/sales/SalesQuoteDetailClient.tsx'),
    source('lib/apps/sales/signature.ts'),
  ]);

  assert.match(route, /request_revision/);
  assert.match(route, /INVALID_INPUT/);
  assert.match(publicService, /input\.signatureConsent !== true/);
  assert.match(publicService, /input\.action === 'request_revision'/);
  assert.match(publicService, /sales\.quote\.customer_revision_requested/);
  assert.match(publicService, /acceptance_signature_consent_text/);
  assert.match(signature, /electronic signature/);
  assert.match(portalActions, /signatureConsentAccepted/);
  assert.match(portalActions, /SALES_QUOTE_ELECTRONIC_SIGNATURE_CONSENT/);
  assert.match(portalActions, /Request changes/);
  assert.match(publicPage, /PublicSalesQuoteActions/);
  assert.match(queries, /sales\.quote\.customer_revision_requested/);
  assert.match(queries, /acceptance_signature_consent_text/);
  assert.match(types, /acceptedSignatureConsentText: string \| null/);
  assert.match(types, /customerRevisionRequests: Array/);
  assert.match(detailUi, /Customer acceptance evidence/);
  assert.match(detailUi, /Customer change requests/);
  assert.match(publicPage, /Quotation acceptance recorded/);
  assert.match(publicPage, /This quotation page does not collect a payment/);
  assert.match(publicPage, /SaMi Invoicing/);
  assert.match(publicPage, /Quotation declined/);
  assert.match(publicPage, /Quotation expired/);
});


test('Sales Priority 4 keeps dispatch, delivery, Inventory posting and invoice eligibility consistent', async () => {
  const [schema, migration, runtime, manifest, operations, inventory, queries, types, commands, orderUi] = await Promise.all([
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/3.4.3-to-3.4.4.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/operations.ts'),
    source('lib/apps/sales/inventory.ts'),
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/commands.ts'),
    source('app/apps/sales/SalesOrderDetailClient.tsx'),
  ]);

  assert.match(migration, /sales-3\.4\.3-to-3\.4\.4/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS shipped_quantity NUMERIC\(18,4\)/);
  assert.match(schema, /shipped_quantity NUMERIC\(18,4\)/);
  assert.match(schema, /CHECK \(delivered_quantity <= shipped_quantity\)/);
  assert.match(runtime, /SALES_3_4_3_TO_3_4_4/);
  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.19'/s);

  assert.match(operations, /const shouldRecordDelivery =[\s\S]*String\(row\.status\) !== 'delivered'/);
  assert.match(operations, /SET shipped_quantity = \$4/);
  assert.match(operations, /SET delivered_quantity = \$4/);
  assert.match(operations, /if \(!inventoryResult\.integrated\)/);
  assert.match(operations, /INVENTORY_INTEGRATION_UNAVAILABLE/);
  assert.match(operations, /status NOT IN \([\s\S]*'cancelled',[\s\S]*'failed'/);
  assert.match(operations, /A sales-order line may appear only once in a shipment/);
  assert.match(inventory, /quantityDelta: number/);
  assert.match(inventory, /nextFulfilledQuantity: number/);
  assert.match(queries, /shipped_quantity/);
  assert.match(types, /shippedQuantity: number/);
  assert.match(commands, /quantityDelta: shippedDelta/);
  assert.match(orderUi, /Shipped/);
});


test('Sales Priority 9 supports searchable lead lifecycle, reassignment, disqualification and follow-up activities', async () => {
  const [manifest, migration, runtime, schema, pipeline, service, route, ui] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/migrations/3.4.5-to-3.4.6.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/pipeline.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
  ]);

  assert.ok(manifest.includes('key: "sales"') && manifest.includes("version: '3.4.19'"));
  assert.ok(migration.includes("sales-3.4.5-to-3.4.6"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS public.sales_lead_activities"));
  assert.match(runtime, /SALES_3_4_5_TO_3_4_6/);
  assert.match(schema, /idx_sales_lead_activities_due/);

  assert.match(pipeline, /resolveActiveSalesperson/);
  assert.match(pipeline, /FROM tenant_users tu/);
  assert.ok(pipeline.includes("tu.member_type = 'internal'"));
  assert.match(pipeline, /export async function updateSalesLead/);
  assert.match(pipeline, /A converted lead cannot be edited/);
  assert.match(pipeline, /export async function disqualifySalesLead/);
  assert.match(pipeline, /A reason is required to disqualify a lead/);
  assert.match(pipeline, /export async function reopenSalesLead/);
  assert.match(pipeline, /export async function createSalesLeadActivity/);
  assert.match(pipeline, /export async function updateSalesLeadActivity/);
  assert.ok(pipeline.includes("'completed',NOW()"));

  for (const action of ['update_lead', 'disqualify_lead', 'reopen_lead', 'create_lead_activity', 'update_lead_activity']) {
    assert.ok(route.includes(action), 'Sales API routes ' + action);
  }
  for (const exported of ['updateSalesLead', 'disqualifySalesLead', 'reopenSalesLead', 'createSalesLeadActivity', 'updateSalesLeadActivity']) {
    assert.ok(service.includes(exported), 'Sales service exports ' + exported);
  }

  assert.match(ui, /Search leads/);
  assert.match(ui, /Lead status/);
  assert.match(ui, /filteredLeads/);
  assert.match(ui, /Edit lead details/);
  assert.match(ui, /Assigned salesperson/);
  assert.match(ui, /Confirm disqualification/);
  assert.match(ui, /Schedule follow-up/);
  assert.match(ui, /updateActivity\(activity\.id, 'completed'\)/);
});


test('Sales Priority 10 warns on likely duplicate leads and requires explicit confirmation', async () => {
  const [pipeline, context, ui, route] = await Promise.all([
    source('lib/apps/sales/pipeline.ts'),
    source('lib/apps/sales/context.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('app/api/apps/sales/route.ts'),
  ]);

  assert.ok(pipeline.includes('LEAD_DUPLICATE_CONFIRMATION_REQUIRED'));
  assert.ok(pipeline.includes('input.confirmDuplicates !== true'));
  assert.ok(pipeline.includes('REGEXP_REPLACE'));
  assert.ok(pipeline.includes('LOWER(BTRIM(COALESCE(email,\'\')))'));
  assert.ok(pipeline.includes('LIMIT 10'));
  assert.ok(context.includes('LEAD_DUPLICATE_CONFIRMATION_REQUIRED'));

  assert.ok(ui.includes('Possible duplicate leads'));
  assert.ok(ui.includes('Create anyway'));
  assert.ok(ui.includes('confirmDuplicates: true'));
  assert.ok(ui.includes('body.code === \'LEAD_DUPLICATE_CONFIRMATION_REQUIRED\''));
  assert.ok(ui.includes('candidate.match_reason'));
  assert.ok(ui.includes('Edit lead details'));

  assert.ok(route.includes('...error.details'));
});


test('Sales Priority 11 provides a searchable follow-up agenda with due-date buckets and quick actions', async () => {
  const [ui, pipeline] = await Promise.all([
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('lib/apps/sales/pipeline.ts'),
  ]);

  assert.ok(ui.includes('Follow-up agenda'));
  for (const label of ['All planned', 'Overdue', 'Due today', 'Next 7 days', 'No due date']) {
    assert.ok(ui.includes(label), 'Follow-up agenda includes ' + label);
  }
  assert.ok(ui.includes('Search follow-ups'));
  assert.ok(ui.includes('filteredAgendaActivities'));
  assert.ok(ui.includes('aria-pressed={agendaFilter === option.key}'));
  assert.ok(ui.includes("updateActivity(activity.id, 'completed')"));
  assert.ok(ui.includes("updateActivity(activity.id, 'cancelled')"));
  assert.ok(ui.includes('activity.lead_name'));
  assert.ok(ui.includes('activity.lead_number'));

  assert.ok(pipeline.includes('l.name AS lead_name'));
  assert.ok(pipeline.includes('l.lead_number'));
  assert.ok(pipeline.includes("ORDER BY CASE WHEN a.status='planned' THEN 0 ELSE 1 END"));
});


test('Sales Priority 12 edits and reschedules only planned follow-up activities', async () => {
  const [ui, pipeline, service, route] = await Promise.all([
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('lib/apps/sales/pipeline.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
  ]);

  assert.ok(ui.includes('Edit follow-up'));
  assert.ok(ui.includes("action: 'edit_lead_activity'"));
  assert.ok(ui.includes('function beginActivityEdit'));
  assert.ok(ui.includes('function saveActivityEdit'));
  assert.ok(ui.includes('value={activityEditDraft.dueDate}'));
  assert.ok(ui.includes('value={activityEditDraft.assignedUserId}'));
  assert.ok(ui.includes('Save changes'));

  assert.match(pipeline, /export async function editSalesLeadActivity/);
  assert.ok(pipeline.includes("Only planned follow-up activities can be edited."));
  assert.ok(pipeline.includes("optionalPipelineDate(input.dueDate, 'Due date')"));
  assert.ok(pipeline.includes("SET activity_type=$3,subject=$4,description=$5,due_date=$6,assigned_user_id=$7"));
  assert.ok(service.includes('editSalesLeadActivity'));
  assert.ok(route.includes('edit_lead_activity:'));
  assert.ok(route.includes('editSalesLeadActivity'));
});


test('Sales Priority 13 supports searchable opportunity editing, loss reasons, closure and reopening', async () => {
  const [pipeline, ui, service, route] = await Promise.all([
    source('lib/apps/sales/pipeline.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
  ]);

  assert.ok(pipeline.includes('export async function updateSalesOpportunity'));
  assert.ok(pipeline.includes('Reopen a won or lost opportunity before editing its commercial details.'));
  assert.ok(pipeline.includes('A reason is required to mark an opportunity as lost.'));
  assert.ok(pipeline.includes('current_stage.stage_type AS current_stage_type'));
  assert.ok(pipeline.includes("currentStageType !== 'open' && targetStageType !== 'open'"));
  assert.ok(pipeline.includes('Reopen a won or lost opportunity before recording a different terminal outcome.'));
  assert.ok(pipeline.includes('sales_pipelines'));
  assert.ok(pipeline.includes("LOWER(BTRIM(name))='won'"));
  assert.ok(pipeline.includes("LOWER(BTRIM(name))='lost'"));
  assert.ok(pipeline.includes('is_active=TRUE'));
  assert.ok(pipeline.includes('WHERE id=$1 AND company_id=$2 AND is_active=TRUE'));
  assert.ok(pipeline.includes('INSERT INTO sales_opportunity_stage_history'));
  assert.ok(pipeline.includes("won_at=CASE WHEN $5='won'"));
  assert.ok(pipeline.includes("lost_reason=CASE WHEN $5='lost' THEN $6 ELSE NULL END"));
  assert.ok(pipeline.includes("'Won',90,100,'won'"));
  assert.ok(pipeline.includes("'Lost',100,0,'lost'"));
  assert.ok(pipeline.includes('o.won_at,o.lost_at,o.lost_reason'));
  assert.ok(pipeline.includes('FROM sales_opportunity_stage_history h'));
  assert.ok(pipeline.includes('opportunityHistory: opportunityHistory.rows'));

  assert.ok(service.includes('updateSalesOpportunity'));
  assert.ok(route.includes('update_opportunity:'));
  assert.ok(route.includes('updateSalesOpportunity'));
  assert.ok(route.includes('move_opportunity:'));

  for (const label of ['Search opportunities', 'Opportunity status', 'Edit opportunity', 'Reason for loss *', 'Mark won', 'Mark lost', 'Reopen opportunity']) {
    assert.ok(ui.includes(label), 'Opportunity lifecycle UI includes ' + label);
  }
  assert.ok(ui.includes('filteredOpportunities'));
  assert.ok(ui.includes('Stage history'));
  assert.ok(ui.includes("reason: opportunityLossReason.trim()"));
  assert.ok(ui.includes("stage.stage_type === 'won'"));
  assert.ok(ui.includes("stage.stage_type === 'lost'"));
});


test('Sales Priority 14 exposes tenant-scoped opportunity stage history with actor, probability and reason', async () => {
  const [ui, pipeline] = await Promise.all([
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('lib/apps/sales/pipeline.ts'),
  ]);

  assert.ok(ui.includes('type OpportunityStageHistoryEntry'));
  assert.ok(ui.includes('Stage history'));
  assert.ok(ui.includes('Opportunity stage history'));
  assert.ok(ui.includes('expandedOpportunityHistoryId'));
  assert.ok(ui.includes('entry.from_stage_name || \'Opportunity created\''));
  assert.ok(ui.includes('Number(entry.probability).toFixed(0)'));
  assert.ok(ui.includes('data.salespeople.find(person => person.id === entry.changed_by)'));
  assert.ok(ui.includes('Reason: {entry.reason}'));
  assert.ok(ui.includes('Showing the latest 10 transitions.'));

  assert.ok(pipeline.includes('FROM sales_opportunity_stage_history h'));
  assert.ok(pipeline.includes('WHERE h.company_id=$1'));
  assert.ok(pipeline.includes('old_stage.name AS from_stage_name'));
  assert.ok(pipeline.includes('new_stage.name AS to_stage_name'));
  assert.ok(pipeline.includes('opportunityHistory: opportunityHistory.rows'));
  assert.ok(pipeline.includes('LIMIT 2000'));
});


test('Sales quotation workspace provides status-based work queues alongside quotation search', async () => {
  const workspace = await source('app/apps/sales/SalesWorkspaceClient.tsx');

  assert.ok(workspace.includes('type QuoteStatusView'));
  assert.ok(workspace.includes('function matchesQuoteStatusView'));
  assert.ok(workspace.includes('quoteStatusView'));
  assert.ok(workspace.includes('setQuoteStatusView'));
  assert.ok(workspace.includes('aria-label="Quotation work queues"'));
  assert.ok(workspace.includes('aria-pressed={quoteStatusView === option.key}'));
  assert.ok(workspace.includes('quoteRegisterQueueCounts?.[option.key]'));
  for (const label of ['All quotations', 'Drafts', 'Awaiting approval', 'Awaiting customer', 'Accepted', 'Converted to order', 'Closed without sale']) {
    assert.ok(workspace.includes(label), 'Quotation work queues include ' + label);
  }
  assert.ok(workspace.includes('quote.status === \'sent\''));
  assert.ok(workspace.includes('quote.status === \'viewed\''));
  assert.ok(workspace.includes('quote.approvalStatus === \'pending\''));
  assert.ok(workspace.includes('quoteStatusView,'));
});

test('Sales quotation workspace supports selecting visible rows and exporting only selected quotations', async () => {
  const workspace = await source('app/apps/sales/SalesWorkspaceClient.tsx');

  assert.ok(workspace.includes('selectedQuoteIds'));
  assert.ok(workspace.includes('aria-label="Select all visible quotations"'));
  assert.ok(workspace.includes('aria-label={`Select quotation ${quote.quoteNumber}`}'));
  assert.ok(workspace.includes('allVisibleQuotesSelected'));
  assert.ok(workspace.includes('Export selected CSV'));
  assert.ok(workspace.includes('Clear selection'));
  assert.ok(workspace.includes('exportSales(initialData, selectedQuotes)'));
  assert.ok(workspace.includes("selectedQuotes?:"));
  assert.ok(workspace.includes('const quotesToExport ='));
  assert.ok(workspace.includes('if (!selectedQuotes)'));
  assert.ok(workspace.includes('sales-quotations-selected-'));
  assert.ok(workspace.includes('Sales orders are not included in this file.'));
});

test('Sales order workspace offers fulfillment and invoicing work queues alongside search', async () => {
  const [workspace, types] = await Promise.all([
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('lib/apps/sales/types.ts'),
  ]);

  assert.ok(types.includes('export type SalesOrderStatusView'));
  assert.ok(workspace.includes('function matchesSalesOrderView'));
  assert.ok(workspace.includes('orderStatusView'));
  assert.ok(workspace.includes('setOrderStatusView'));
  assert.ok(workspace.includes('aria-label="Sales order work queues"'));
  assert.ok(workspace.includes('aria-pressed={orderStatusView === option.key}'));
  assert.ok(workspace.includes('orderRegisterQueueCounts?.[option.key]'));
  for (const label of ['All orders', 'Awaiting fulfillment', 'Partially fulfilled', 'Fulfilled', 'Not invoiced', 'Partially invoiced', 'Fully invoiced']) {
    assert.ok(workspace.includes(label), 'Order work queues include ' + label);
  }
  assert.ok(workspace.includes("order.fulfillmentStatus === 'not_started'"));
  assert.ok(workspace.includes("order.fulfillmentStatus === 'partial'"));
  assert.ok(workspace.includes("order.fulfillmentStatus === 'fulfilled'"));
  assert.ok(workspace.includes("order.invoiceStatus === 'not_invoiced'"));
  assert.ok(workspace.includes("order.invoiceStatus === 'partial'"));
  assert.ok(workspace.includes("order.invoiceStatus === 'invoiced'"));
  assert.match(workspace, /matchesSalesOrderView\([\s\S]*orderStatusView/);
});

test('Sales order workspace supports a dense register table and preserves the card layout', async () => {
  const workspace = await source('app/apps/sales/SalesWorkspaceClient.tsx');

  assert.ok(workspace.includes("useState<'register' | 'cards'>"));
  assert.ok(workspace.includes("useState<'register' | 'cards'>(\n      'register'"));
  assert.ok(workspace.includes('aria-label="Sales order display mode"'));
  assert.ok(workspace.includes('aria-pressed={orderDisplayMode === \'register\'}'));
  assert.ok(workspace.includes('aria-pressed={orderDisplayMode === \'cards\'}'));
  assert.ok(workspace.includes('aria-label="Sales order register"'));
  for (const column of ['Order date', 'Customer', 'Fulfillment', 'Invoicing', 'Delivered', 'Invoiced', 'Order value']) {
    assert.ok(workspace.includes(column), 'Sales order register includes ' + column);
  }
  assert.ok(workspace.includes("salesOrderFulfillmentLabel(order.fulfillmentStatus)"));
  assert.ok(workspace.includes("salesOrderInvoiceLabel(order.invoiceStatus)"));
  assert.ok(workspace.includes("orderDisplayMode === 'register'"));
  assert.ok(workspace.includes("orderDisplayMode === 'cards'"));
  assert.ok(workspace.includes("className=\"grid gap-3\""));
  assert.ok(workspace.includes("href={'/apps/sales/orders/' + order.id}"));
  assert.ok(workspace.includes('Math.round(order.deliveredPercent)'));
  assert.ok(workspace.includes('Math.round(order.invoicedPercent)'));
});

test('Sales bulk quotation sending is permission-gated, capped, sequential and reports per-quotation outcomes', async () => {
  const [bulk, commands, delivery, service, route, ui] = await Promise.all([
    source('lib/apps/sales/bulk-send.ts'),
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/delivery.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
  ]);

  assert.match(bulk, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_SEND\)/);
  assert.match(bulk, /MAX_BULK_QUOTE_SEND = 50/);
  assert.match(bulk, /requireUuid\(value, 'Quotation'\)/);
  assert.match(bulk, /new Set/);
  assert.match(bulk, /for \(const quoteId of quoteIds\)/);
  assert.match(bulk, /await sendSalesQuote/);
  assert.match(bulk, /requireDraft: true/);
  assert.match(commands, /requireDraft: input\.requireDraft === true/);
  assert.match(delivery, /input\.requireDraft &&[\s\S]*quote\.status\) !== 'draft'/);
  assert.match(delivery, /Bulk sending is limited to draft quotations/);
  assert.match(bulk, /success: false/);
  assert.match(bulk, /sentCount/);
  assert.match(bulk, /failedCount/);

  assert.ok(service.includes('bulkSendSalesQuotes'));
  assert.ok(route.includes('bulk_send_quotes:'));
  assert.ok(ui.includes("action: 'bulk_send_quotes'"));
  assert.ok(ui.includes('initialData.capabilities.canSend'));
  assert.ok(ui.includes('sendableSelectedQuoteIds'));
  assert.ok(ui.includes("quote.status === 'draft'"));
  assert.ok(ui.includes("quote.approvalStatus === 'approved'"));
  assert.ok(ui.includes("quote.approvalStatus === 'not_required'"));
  assert.ok(ui.includes('Send selected drafts'));
  assert.ok(ui.includes('window.confirm'));
  assert.ok(ui.includes('Some quotations were not sent'));
});

test('Sales order register sorts by date, value, customer, and progress and persists sort selection', async () => {
  const [migration, schema, registry, manifest, types, savedViews, ui] = await Promise.all([
    source('lib/apps/sales/migrations/3.4.9-to-3.4.10.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/saved-views.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
  ]);

  assert.ok(migration.includes("sales-3.4.9-to-3.4.10"));
  assert.ok(migration.includes("ADD COLUMN IF NOT EXISTS sort_by"));
  assert.ok(migration.includes("'delivery_first'"));
  assert.match(registry, /SALES_3_4_9_TO_3_4_10/);
  assert.ok(registry.indexOf('SALES_3_4_8_TO_3_4_9,') < registry.indexOf('SALES_3_4_9_TO_3_4_10,'));
  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.19'/s);
  assert.ok(schema.includes("sort_by VARCHAR(40) NOT NULL DEFAULT 'newest'"));
  assert.ok(types.includes("export type SalesOrderSortBy"));
  assert.ok(types.includes("sortBy: SalesOrderSortBy"));
  assert.ok(savedViews.includes("const ALLOWED_ORDER_SORTS = new Set<SalesOrderSortBy>"));
  assert.ok(savedViews.includes("sortBy: row.sort_by || 'newest'"));
  assert.ok(savedViews.includes("sort_by, created_at"));
  assert.ok(savedViews.includes("rawSortBy"));
  assert.ok(ui.includes("aria-label=\"Sort sales orders\""));
  assert.ok(ui.includes("ORDER_SORT_OPTIONS.map"));
  assert.ok(ui.includes("case 'newest':"));
  assert.ok(ui.includes("case 'oldest':"));
  assert.ok(ui.includes("case 'value_high':"));
  assert.ok(ui.includes("case 'value_low':"));
  assert.ok(ui.includes('right.baseTotalAmount - left.baseTotalAmount'));
  assert.ok(ui.includes('left.baseTotalAmount - right.baseTotalAmount'));
  assert.ok(ui.includes("case 'delivery_first':"));
  assert.ok(ui.includes("case 'invoice_first':"));
  assert.ok(ui.includes("case 'customer_az':"));
  assert.ok(ui.includes("sortBy: orderSortBy"));
  assert.ok(ui.includes("setOrderSortBy(view.sortBy)"));
});

test('Sales order saved views persist per-company and per-user queue filters through an additive migration', async () => {
  const [migration, schema, registry, manifest, types, savedViews, service, route, ui] = await Promise.all([
    source('lib/apps/sales/migrations/3.4.8-to-3.4.9.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/saved-views.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
  ]);

  assert.ok(migration.includes("sales-3.4.8-to-3.4.9"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS public.sales_order_saved_views"));
  assert.ok(migration.includes("uq_sales_order_saved_views_owner_name"));
  assert.ok(migration.includes("idx_sales_order_saved_views_owner"));
  assert.match(registry, /SALES_3_4_8_TO_3_4_9/);
  assert.ok(registry.indexOf('SALES_3_4_7_TO_3_4_8,') < registry.indexOf('SALES_3_4_8_TO_3_4_9,'));
  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.19'/s);
  assert.match(types, /export type SalesOrderStatusView[\s\S]*'awaiting_fulfillment'[\s\S]*'invoiced'/);
  assert.match(types, /export type SalesSavedOrderView/);
  assert.match(schema, /sales_order_saved_views[\s\S]*'awaiting_fulfillment'[\s\S]*'invoiced'/);
  assert.match(savedViews, /requireSalesContext\(SALES_PERMISSIONS\.ORDER_VIEW\)/);
  assert.match(savedViews, /WHERE company_id = \$1[\s\S]*AND user_id = \$2/);
  assert.match(savedViews, /UPDATE sales_order_saved_views[\s\S]*deleted_at = NOW\(\)/);
  assert.ok(savedViews.includes('getSalesSavedOrderViews'));
  assert.ok(savedViews.includes('saveSalesSavedOrderView'));
  assert.ok(savedViews.includes('deleteSalesSavedOrderView'));
  assert.ok(service.includes('getSalesSavedOrderViews'));
  assert.ok(route.includes("get('savedOrderViews')"));
  assert.ok(route.includes('save_order_view:'));
  assert.ok(route.includes('delete_order_view:'));
  assert.ok(ui.includes('/api/apps/sales?savedOrderViews=1'));
  assert.ok(ui.includes('save_order_view'));
  assert.ok(ui.includes('delete_order_view'));
  assert.ok(ui.includes('Saved sales order views'));
  assert.ok(ui.includes('applySavedOrderView'));
  assert.ok(ui.includes('ORDER_STATUS_VIEWS.map'));
});

test('Sales expiry-aware quotation queues are saved-view compatible and migrate tenant schemas safely', async () => {
  const [migration, schema, registry, manifest, types, savedViews, ui] = await Promise.all([
    source('lib/apps/sales/migrations/3.4.7-to-3.4.8.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/saved-views.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
  ]);

  assert.ok(migration.includes("sales-3.4.7-to-3.4.8"));
  assert.ok(migration.includes("DROP CONSTRAINT IF EXISTS sales_quote_saved_views_status_view_check"));
  assert.ok(migration.includes("ADD CONSTRAINT sales_quote_saved_views_status_view_check"));
  assert.ok(migration.includes("'expired'"));
  assert.ok(migration.includes("'expiring_soon'"));
  assert.match(registry, /SALES_3_4_7_TO_3_4_8/);
  assert.ok(registry.indexOf('SALES_3_4_6_TO_3_4_7,') < registry.indexOf('SALES_3_4_7_TO_3_4_8,'));
  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.19'/s);
  assert.match(types, /SalesQuoteStatusView[\s\S]*'expired'[\s\S]*'expiring_soon'/);
  assert.match(schema, /sales_quote_saved_views[\s\S]*'expired'[\s\S]*'expiring_soon'/);
  assert.match(savedViews, /'expired'[\s\S]*'expiring_soon'/);
  assert.ok(ui.includes("label: 'Expired'"));
  assert.ok(ui.includes("label: 'Expiring in 7 days'"));
  assert.match(ui, /case 'expired':[\s\S]*quote\.status === 'expired'/);
  assert.match(ui, /case 'expiring_soon':[\s\S]*isQuoteExpiringWithinSevenDays\(quote\)/);
  assert.match(ui, /function isQuoteExpiringWithinSevenDays/);
  assert.match(ui, /daysUntilExpiry >= 0 && daysUntilExpiry <= 7/);
});

test('Sales saved quotation views persist company- and user-scoped filters through an additive migration', async () => {
  const [migration, schema, registry, manifest, savedViews, service, route, ui] = await Promise.all([
    source('lib/apps/sales/migrations/3.4.6-to-3.4.7.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/saved-views.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
  ]);

  assert.ok(migration.includes("sales-3.4.6-to-3.4.7"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS public.sales_quote_saved_views"));
  assert.ok(migration.includes("uq_sales_quote_saved_views_owner_name"));
  assert.ok(migration.includes("idx_sales_quote_saved_views_owner"));
  assert.match(registry, /SALES_3_4_6_TO_3_4_7/);
  assert.ok(registry.indexOf('SALES_3_4_5_TO_3_4_6,') < registry.indexOf('SALES_3_4_6_TO_3_4_7,'));
  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.19'/s);
  assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS public.sales_quote_saved_views"));
  assert.ok(schema.includes("uq_sales_quote_saved_views_owner_name"));

  assert.match(savedViews, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(savedViews, /WHERE company_id = \$1[\s\S]*AND user_id = \$2/);
  assert.match(savedViews, /AND deleted_at IS NULL/);
  assert.match(savedViews, /MAX_SAVED_VIEWS = 25/);
  assert.match(savedViews, /A saved quotation view with that name already exists/);
  assert.match(savedViews, /export async function getSalesSavedQuoteViews/);
  assert.match(savedViews, /export async function saveSalesSavedQuoteView/);
  assert.match(savedViews, /export async function deleteSalesSavedQuoteView/);
  assert.match(savedViews, /status_view/);

  assert.ok(service.includes("getSalesSavedQuoteViews"));
  assert.ok(service.includes("saveSalesSavedQuoteView"));
  assert.ok(service.includes("deleteSalesSavedQuoteView"));
  assert.ok(route.includes("savedViews === '1'"));
  assert.ok(route.includes("save_quote_view:"));
  assert.ok(route.includes("delete_quote_view:"));
  assert.ok(ui.includes("Saved quotation views"));
  assert.ok(ui.includes("Save view"));
  assert.ok(ui.includes("Apply saved view"));
  assert.ok(ui.includes("Delete saved view"));
  assert.ok(ui.includes("/api/apps/sales?savedViews=1"));
  assert.ok(ui.includes("setSelectedQuoteIds([])"));
});

test('Sales quotation templates can be edited without creating duplicates', async () => {
  const manager =
    await source(
      'app/apps/sales/SalesTemplatesManager.tsx',
    );

  assert.match(
    manager,
    /editingTemplate\?\.id/,
    'Editing sends the existing template id to the server.',
  );

  assert.match(
    manager,
    /setEditingTemplate\(template\)/,
    'The template library exposes an edit action.',
  );

  assert.match(
    manager,
    /editingTemplate\?\.terms/,
    'Existing commercial terms are loaded into the editor.',
  );

  assert.match(
    manager,
    /editingTemplate\?\.footerText/,
    'Existing footer copy is loaded into the editor.',
  );

  assert.match(
    manager,
    /Update template/,
    'The editor makes the update action explicit.',
  );

  const commands =
    await source(
      'lib/apps/sales/commands.ts',
    );

  assert.match(
    commands,
    /export async function saveSalesQuoteTemplate/,
  );

  assert.match(
    commands,
    /UPDATE sales_quote_templates/,
    'The save command updates a company-scoped existing template.',
  );
});


test('Sales quotation template deletion is company-scoped and preserves historical references', async () => {
  const commands =
    await source(
      'lib/apps/sales/commands.ts',
    );

  const deletion =
    commands.slice(
      commands.indexOf('export async function deleteSalesQuoteTemplate'),
    );

  assert.ok(
    deletion.includes('SALES_PERMISSIONS'),
    'Template deletion uses the Sales settings permission gate.',
  );
  assert.match(
    deletion,
    /UPDATE sales_quote_templates/,
  );
  assert.match(
    deletion,
    /company_id = \$2/,
    'Deletion is scoped to the current company.',
  );
  assert.match(
    deletion,
    /deleted_at = NOW\(\)/,
    'Templates are soft-deleted so historical quotations remain intact.',
  );
  assert.match(
    deletion,
    /deleted_at IS NULL/,
    'Already deleted templates cannot be deleted again.',
  );

  const route =
    await source(
      'app/api/apps/sales/route.ts',
    );

  assert.match(
    route,
    /delete_template:\s*deleteSalesQuoteTemplate/,
    'The Sales API exposes the deletion action.',
  );

  const manager =
    await source(
      'app/apps/sales/SalesTemplatesManager.tsx',
    );

  assert.match(
    manager,
    /action:\s*'delete_template'/,
  );
  assert.match(
    manager,
    /window\.confirm/,
    'Users must confirm template deletion.',
  );
  assert.match(
    manager,
    /Existing quotations remain unchanged/,
    'The UI explains historical quotation preservation.',
  );
});

test('Sales lead scoring explains profile and engagement signals and persists score filters', async () => {
  const [scoring, pipeline, schema, migration, registry, manifest, savedViews, ui, types] = await Promise.all([
    source('lib/apps/sales/lead-scoring.ts'),
    source('lib/apps/sales/pipeline.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/3.4.12-to-3.4.13.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/saved-views.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('lib/apps/sales/types.ts'),
  ]);

  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.19'/s);
  assert.match(scoring, /export function scoreSalesLead/);
  assert.match(scoring, /Company identified/);
  assert.match(scoring, /High-intent source identified/);
  assert.match(scoring, /Completed call, email or meeting/);
  assert.match(scoring, /Customer interaction in the last 30 days/);
  assert.match(scoring, /score >= 75/);
  assert.match(scoring, /score >= 45/);
  assert.match(pipeline, /LEFT JOIN LATERAL/);
  assert.match(pipeline, /completed_engagement_count/);
  assert.match(pipeline, /scoreSalesLead\(lead\)/);
  assert.match(pipeline, /lead_score_factors: score\.factors/);

  assert.match(migration, /sales-3\.4\.12-to-3\.4\.13/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS score_view/);
  assert.match(migration, /CHECK \(score_view IN \('all','high','medium','low'\)\)/);
  assert.match(registry, /SALES_3_4_12_TO_3_4_13/);
  assert.ok(registry.indexOf('SALES_3_4_11_TO_3_4_12,') < registry.indexOf('SALES_3_4_12_TO_3_4_13,'));
  assert.match(schema, /score_view VARCHAR\(20\) NOT NULL DEFAULT 'all'/);
  assert.match(schema, /CHECK \(score_view IN \('all','high','medium','low'\)\)/);
  assert.match(types, /export type SalesLeadScoreView = 'all' \| 'high' \| 'medium' \| 'low'/);
  assert.match(types, /scoreView: SalesLeadScoreView/);

  assert.match(savedViews, /const ALLOWED_LEAD_SCORE_VIEWS/);
  assert.match(savedViews, /scoreView: row\.score_view \|\| 'all'/);
  assert.match(savedViews, /SELECT id, name, view_type, status_view, score_view, search_query, created_at/);
  assert.match(savedViews, /rawScoreView/);
  assert.match(savedViews, /Lead score filters can only be saved for lead views/);
  assert.match(ui, /leadScoreFilter/);
  assert.match(ui, /High priority \(75\+\)/);
  assert.match(ui, /Score \{lead\.lead_score\}\/100/);
  assert.match(ui, /lead\.lead_score_factors\.slice\(0, 3\)/);
  assert.match(ui, /scoreView: isLeads \? leadScoreFilter : 'all'/);
  assert.match(ui, /setLeadScoreFilter\(view\.scoreView \|\| 'all'\)/);
});

test('Sales team lead creation supports tenant-safe balanced automatic assignment', async () => {
  const [pipeline, manager, assignment, packageJson] = await Promise.all([
    source('lib/apps/sales/pipeline.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('lib/apps/sales/lead-assignment.ts'),
    source('package.json'),
  ]);

  assert.ok(pipeline.includes('chooseBalancedSalesLeadAssignee'));
  assert.ok(pipeline.includes("from '@/lib/apps/sales/lead-assignment'"));
  assert.ok(pipeline.includes('salesTeams: salesTeams.rows'));
  assert.ok(pipeline.includes('FOR UPDATE'));
  assert.ok(pipeline.includes('member.is_active=TRUE AND member.left_at IS NULL'));
  assert.ok(pipeline.includes("lead.status NOT IN ('converted','disqualified')"));
  assert.ok(pipeline.includes('tu.tenant_id=$1 AND tu.user_id=ANY($2::uuid[])'));
  assert.ok(pipeline.includes('The selected salesperson must be an active member of the chosen team.'));
  assert.ok(pipeline.includes('This team has no active internal members available for automatic lead assignment.'));
  assert.ok(assignment.includes('a.activeLeadCount - b.activeLeadCount'));
  assert.ok(assignment.includes('timestamp(a.lastAssignedAt) - timestamp(b.lastAssignedAt)'));
  assert.ok(manager.includes('name="salesTeamId"'));
  assert.ok(manager.includes('Auto-assign using team workload'));
  assert.ok(manager.includes('Active source rules can choose a team automatically; if none match, the lead remains unassigned.'));
  assert.ok(manager.includes('member_user_ids.includes(person.id)'));
  assert.ok(packageJson.includes('tests/sales-lead-assignment.test.ts'));
});

test('Sales lead-routing rules are tenant-scoped, priority ordered and migration-backed', async () => {
  const [rules, pipeline, manager, route, service, schema, migration, registry, manifest] = await Promise.all([
    source('lib/apps/sales/lead-assignment-rules.ts'),
    source('lib/apps/sales/pipeline.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/service.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/3.4.13-to-3.4.14.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.ok(manifest.includes('version: \'3.4.19\''));
  assert.ok(rules.includes('requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE)'));
  assert.ok(rules.includes('WHERE company_id=$1 AND deleted_at IS NULL'));
  assert.ok(rules.includes('A routing rule with that name or source match already exists.'));
  assert.ok(rules.includes('Choose an active Sales team for this rule.'));
  assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS public.sales_lead_assignment_rules'));
  assert.ok(schema.includes('uq_sales_lead_assignment_rules_name'));
  assert.ok(schema.includes('uq_sales_lead_assignment_rules_source'));
  assert.ok(schema.includes('assignment_rule_id UUID'));
  assert.ok(migration.includes('sales-3.4.13-to-3.4.14'));
  assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS assignment_rule_id'));
  assert.ok(registry.includes('SALES_3_4_13_TO_3_4_14'));
  assert.ok(registry.indexOf('SALES_3_4_12_TO_3_4_13,') < registry.indexOf('SALES_3_4_13_TO_3_4_14,'));
  assert.ok(service.includes('getSalesLeadAssignmentRules'));
  assert.ok(service.includes('saveSalesLeadAssignmentRule'));
  assert.ok(route.includes('leadAssignmentRules === \'1\''));
  assert.ok(route.includes('save_lead_assignment_rule'));
  assert.ok(route.includes('delete_lead_assignment_rule'));
  assert.ok(pipeline.includes('selectSalesLeadAssignmentRule'));
  assert.ok(pipeline.includes('ORDER BY rule.priority ASC'));
  assert.ok(pipeline.includes('assignment_rule.name AS assignment_rule_name'));
  assert.ok(manager.includes('Automatic lead-routing rules'));
  assert.ok(manager.includes('Rule enabled'));
  assert.ok(manager.includes('Routed by rule:'));
});


test('Sales lead reassignment validates team membership and records reasoned history atomically', async () => {
  const [pipeline, manager, route, service, schema, migration, registry, manifest] = await Promise.all([
    source('lib/apps/sales/pipeline.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/service.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/3.4.14-to-3.4.15.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.ok(manifest.includes("version: '3.4.19'"));
  assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS public.sales_lead_assignment_history'));
  assert.ok(schema.includes('idx_sales_lead_assignment_history_timeline'));
  assert.ok(migration.includes('sales-3.4.14-to-3.4.15'));
  assert.ok(migration.includes('reason VARCHAR(1000) NOT NULL'));
  assert.ok(migration.includes('previous_salesperson_user_id UUID'));
  assert.ok(migration.includes('new_sales_team_id UUID'));
  assert.ok(registry.includes('SALES_3_4_14_TO_3_4_15'));
  assert.ok(registry.indexOf('SALES_3_4_13_TO_3_4_14,') < registry.indexOf('SALES_3_4_14_TO_3_4_15,'));

  assert.ok(pipeline.includes('getSalesLeadAssignmentHistory'));
  assert.ok(pipeline.includes('requireSalesContext(SALES_PERMISSIONS.PIPELINE_VIEW)'));
  assert.ok(pipeline.includes('WHERE company_id=$1 AND lead_id=$2'));
  assert.ok(pipeline.includes('Enter a reason when changing a lead owner or team.'));
  assert.ok(pipeline.includes('The selected salesperson must be an active member of the chosen team.'));
  assert.ok(pipeline.includes('INSERT INTO sales_lead_assignment_history'));
  assert.ok(pipeline.includes('await client.query(\'BEGIN\')'));
  assert.ok(pipeline.includes('await client.query(\'COMMIT\')'));

  assert.ok(service.includes('getSalesLeadAssignmentHistory'));
  assert.ok(route.includes('leadAssignmentHistory === \'1\''));
  assert.ok(route.includes('getSalesLeadAssignmentHistory({ leadId })'));
  assert.ok(manager.includes('Reason for reassignment (required when changing owner or team)'));
  assert.ok(manager.includes('Assignment history'));
  assert.ok(manager.includes('Changed by'));
  assert.ok(manager.includes('name="salesTeamId"'));
  assert.ok(manager.includes('leadAssignmentHistory=1&leadId='));
});

test('Sales bulk lead reassignment is bounded, transactional and audited per changed lead', async () => {
  const [pipeline, manager, route, service, assignmentHistory] = await Promise.all([
    source('lib/apps/sales/pipeline.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/service.ts'),
    source('lib/apps/sales/schema.sql'),
  ]);

  assert.ok(pipeline.includes('export async function bulkReassignSalesLeads'));
  assert.ok(pipeline.includes('requireSalesContext(SALES_PERMISSIONS.PIPELINE_MANAGE)'));
  assert.ok(pipeline.includes('leadIds.length > 100'));
  assert.ok(pipeline.includes('Converted leads cannot be reassigned.'));
  assert.ok(pipeline.includes('A reason is required for bulk lead reassignment.'));
  assert.ok(pipeline.includes('The selected salesperson must be an active member of the chosen team.'));
  assert.ok(pipeline.includes('INSERT INTO sales_lead_assignment_history'));
  assert.ok(pipeline.includes("await client.query('BEGIN')"));
  assert.ok(pipeline.includes("await client.query('COMMIT')"));
  assert.ok(pipeline.includes('return { updatedCount: changed.length, leadIds: changedIds }'));

  assert.ok(service.includes('bulkReassignSalesLeads'));
  assert.ok(route.includes('bulk_reassign_leads'));
  assert.ok(manager.includes("action: 'bulk_reassign_leads'"));
  assert.ok(manager.includes('Select up to 100 filtered'));
  assert.ok(manager.includes('Reassign selected leads'));
  assert.ok(manager.includes('Each changed lead gets its own audit entry.'));
  assert.ok(manager.includes("lead.status !== 'converted'"));
  assert.ok(assignmentHistory.includes('CREATE TABLE IF NOT EXISTS public.sales_lead_assignment_history'));
});

test('Sales bulk lead status actions are bounded, transactional and create activity history', async () => {
  const [pipeline, manager, route, service] = await Promise.all([
    source('lib/apps/sales/pipeline.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/service.ts'),
  ]);

  assert.ok(pipeline.includes('export async function bulkUpdateSalesLeadStatus'));
  assert.ok(pipeline.includes('leadIds.length > 100'));
  assert.ok(pipeline.includes("mode !== 'disqualify' && mode !== 'reopen'"));
  assert.ok(pipeline.includes('A reason is required for this bulk lead action.'));
  assert.ok(pipeline.includes('Converted leads cannot be disqualified.'));
  assert.ok(pipeline.includes('No selected leads are disqualified and ready to reopen.'));
  assert.ok(pipeline.includes('Lead disqualified in bulk action'));
  assert.ok(pipeline.includes('Lead reopened in bulk action'));
  assert.ok(pipeline.includes('INSERT INTO sales_lead_activities'));
  assert.ok(pipeline.includes("await client.query('BEGIN')"));
  assert.ok(pipeline.includes("await client.query('COMMIT')"));
  assert.ok(pipeline.includes("await client.query('ROLLBACK')"));
  assert.ok(pipeline.includes('skippedCount: leadIds.length - eligible.length'));

  assert.ok(service.includes('bulkUpdateSalesLeadStatus'));
  assert.ok(route.includes('bulk_update_lead_status'));
  assert.ok(manager.includes("action: 'bulk_update_lead_status'"));
  assert.ok(manager.includes('Bulk lead actions'));
  assert.ok(manager.includes('Disqualify selected'));
  assert.ok(manager.includes('Reopen selected'));
  assert.ok(manager.includes('recorded the reason in the activity history'));
});

test('Sales bulk follow-up scheduling is bounded, tenant-scoped and transactional', async () => {
  const [pipeline, manager, route, service] = await Promise.all([
    source('lib/apps/sales/pipeline.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/service.ts'),
  ]);

  assert.ok(pipeline.includes('export async function bulkCreateSalesLeadActivities'));
  assert.ok(pipeline.includes('leadIds.length > 100'));
  assert.ok(pipeline.includes('Choose a valid follow-up activity type.'));
  assert.ok(pipeline.includes('Activity subject is required.'));
  assert.ok(pipeline.includes('One or more selected leads were not found in this workspace.'));
  assert.ok(pipeline.includes('No selected leads are active and eligible for follow-up scheduling.'));
  assert.ok(pipeline.includes('INSERT INTO sales_lead_activities'));
  assert.ok(pipeline.includes("await client.query('BEGIN')"));
  assert.ok(pipeline.includes("await client.query('COMMIT')"));
  assert.ok(pipeline.includes("await client.query('ROLLBACK')"));
  assert.ok(pipeline.includes('createdCount: createdIds.length'));
  assert.ok(pipeline.includes('skippedCount: leadIds.length - eligible.length'));

  assert.ok(service.includes('bulkCreateSalesLeadActivities'));
  assert.ok(route.includes('bulk_create_lead_activities'));
  assert.ok(manager.includes("action: 'bulk_create_lead_activities'"));
  assert.ok(manager.includes('Bulk follow-up scheduling'));
  assert.ok(manager.includes('Schedule for selected leads'));
  assert.ok(manager.includes('Converted and disqualified leads are skipped.'));
});


test('Sales reports provide 30/60/90-day weighted opportunity forecasts without mixing currencies', async () => {
  const [insights, reportUi, forecastUi] = await Promise.all([
    source('lib/apps/sales/management-insights.ts'),
    source('app/apps/sales/SalesManagementInsights.tsx'),
    source('app/apps/sales/SalesWeightedForecast.tsx'),
  ]);

  assert.match(insights, /forecastResult/);
  assert.match(insights, /VALUES \(30\), \(60\), \(90\)/);
  assert.match(insights, /o\.expected_close_date >= CURRENT_DATE/);
  assert.match(insights, /o\.expected_close_date <= CURRENT_DATE \+ h\.horizon_days/);
  assert.match(insights, /s\.company_id = o\.company_id/);
  assert.match(insights, /s\.stage_type = 'open'/);
  assert.match(insights, /o\.company_id = \$1/);
  assert.match(insights, /GROUP BY h\.horizon_days, UPPER\(COALESCE\(NULLIF\(BTRIM\(o\.currency\), ''\), 'KES'\)\)/);
  assert.match(insights, /weightedPipelineValue: Number\(row\.weighted_pipeline_value/);
  assert.match(reportUi, /<SalesWeightedForecast rows=\{data\.forecast\} \/>/);
  assert.match(forecastUi, /Next 30 days/);
  assert.match(forecastUi, /Next 60 days/);
  assert.match(forecastUi, /Next 90 days/);
  assert.match(forecastUi, /Values stay grouped by currency/);
  assert.match(forecastUi, /Probability-weighted/);
});


test('Sales invoice selection rejects duplicate and non-order line IDs', async () => {
  const commands =
    await source(
      'lib/apps/sales/commands.ts',
    );

  const invoiceStart =
    commands.indexOf(
      'export async function createSalesOrderInvoice(',
    );
  const invoiceEnd =
    commands.indexOf(
      'export async function updateSalesSettings(',
      invoiceStart,
    );
  const invoice =
    commands.slice(
      invoiceStart,
      invoiceEnd,
    );

  assert.ok(invoiceStart >= 0);
  assert.ok(invoiceEnd > invoiceStart);
  assert.match(invoice, /requestedMap\.has\(lineId\)/);
  assert.match(invoice, /'Sales order line',[\s\S]*\)\.toLowerCase\(\)/);
  assert.match(invoice, /An invoice line can only be selected once/);
  assert.match(invoice, /new Set\([\s\S]*lineRows\.map\([\s\S]*String\(line\.id\)/);
  assert.match(invoice, /orderLineIds\.has\(requestedLineId\)/);
  assert.match(invoice, /An invoice line does not belong to this sales order/);
  assert.match(invoice, /existingBatch\.rows\[0\]\.requested_lines/);
  assert.match(invoice, /normalizeSelection/);
  assert.match(invoice, /JSON\.stringify\(priorSelection\) !== JSON\.stringify\(currentSelection\)/);
  assert.match(invoice, /This invoice batch was started with a different line selection/);
  assert.match(invoice, /hasExplicitLineSelection/);
  assert.match(invoice, /hasExplicitLineSelection &&\s*requestedMap\.size === 0/);
  assert.match(invoice, /Choose at least one invoiceable line with a quantity greater than zero/);
  assert.match(invoice, /const invoiceableLineCount =\s*lineRows\.filter/);
  assert.match(invoice, /selected\.length !== invoiceableLineCount/);
  assert.match(invoice, /normalizeIdempotentSelection/);
  assert.match(invoice, /idempotency key already belongs to an invoice with a different line selection/);
  assert.match(invoice, /mode: hasExplicitLineSelection\s*\?\s*'explicit'\s*:\s*'all_remaining'/);
  assert.match(invoice, /else if \(storedMode === 'explicit'\)/,
    'an omitted retry selection cannot replay a completed partial invoice');
  assert.match(invoice, /storedMode !== null && storedMode !== currentMode/,
    'pending invoice-batch recovery must preserve the original selection mode');
  const completedBatchGuardStart = invoice.indexOf(
    'if (\n      existingBatch.rows.length > 0 &&\n      existingBatch.rows[0].invoice_id',
  );
  const completedBatchReturn = invoice.indexOf('reused:\n          true', completedBatchGuardStart);
  assert.ok(completedBatchGuardStart >= 0 && completedBatchReturn > completedBatchGuardStart);
  const completedBatchGuard = invoice.slice(completedBatchGuardStart, completedBatchReturn);
  assert.doesNotMatch(completedBatchGuard, /input\.lines\.length > 0/,
    'empty explicit selections must be rejected instead of bypassing idempotency validation');
  assert.match(completedBatchGuard, /if \(Array\.isArray\(input\.lines\)\)/);
  assert.ok(
    invoice.indexOf('normalizeIdempotentSelection(storedLines)') <
      invoice.indexOf('return {\n        orderId,\n        invoiceId:'),
    'A completed batch must validate any explicitly supplied retry selection before returning the existing invoice.',
  );

  const fulfillmentStart =
    commands.indexOf(
      'export async function updateSalesOrderFulfillment(',
    );
  const cancelStart =
    commands.indexOf(
      'export async function cancelSalesOrder(',
    );
  const createInvoiceStart =
    commands.indexOf(
      'export async function createSalesOrderInvoice(',
    );
  const fulfillment =
    commands.slice(
      fulfillmentStart,
      cancelStart,
    );
  const cancellation =
    commands.slice(
      cancelStart,
      createInvoiceStart,
    );

  assert.match(fulfillment, /const requestedLineIds = new Set<string>\(\)/);
  assert.match(fulfillment, /requestedLineIds\.has\(lineId\)/);
  assert.match(fulfillment, /A fulfillment line can only be updated once per request/);
  assert.ok(
    fulfillment.indexOf('const requestedLineIds = new Set<string>()') <
      fulfillment.indexOf('const client ='),
    'Duplicate fulfillment lines must be rejected before acquiring a database connection.',
  );
  assert.match(fulfillment, /pg_advisory_xact_lock/);
  assert.match(cancellation, /pg_advisory_xact_lock/);
  assert.match(fulfillment, /sales-order-invoice:' \+ orderId/);
  assert.match(cancellation, /sales-order-invoice:' \+ orderId/);
  assert.match(cancellation, /SUM\([\s\S]*oi\.shipped_quantity[\s\S]*AS shipped_quantity/);
  assert.match(cancellation, /SUM\([\s\S]*oi\.delivered_quantity[\s\S]*AS delivered_quantity/);
  assert.match(cancellation, /This order has shipped or delivered quantities/);
  assert.match(cancellation, /Process a Sales return to reverse stock/);
  assert.match(cancellation, /pendingShipments/);
  assert.match(cancellation, /Cancel all unshipped shipment plans before cancelling this order/);

  const operations = await source('lib/apps/sales/operations.ts');
  const returnStart = operations.indexOf('export async function createSalesReturn(');
  const approveStart = operations.indexOf('export async function approveSalesReturn(', returnStart);
  const createReturn = operations.slice(returnStart, approveStart);
  assert.ok(returnStart >= 0);
  assert.ok(approveStart > returnStart);
  assert.match(createReturn, /const preparedLineIds =\s*new Set<string>\(\)/);
  assert.match(createReturn, /preparedLineIds\.has\(lineId\)/);
  assert.match(createReturn, /A sales-order line can only be selected once for a return/);
  assert.match(createReturn, /return_row\.status IN \(\s*'requested',\s*'approved'\s*\)/);
  assert.doesNotMatch(createReturn, /return_row\.status <> 'cancelled'/,
    'Received returns already reduce delivered_quantity and must not be subtracted twice.');
  assert.match(createReturn, /pg_advisory_xact_lock/);
  assert.ok(createReturn.includes("'sales-order-invoice:' + orderId"));

  const receiveStart = operations.indexOf('export async function receiveSalesReturn(');
  const issueCreditStart = operations.indexOf('export async function issueSalesReturnCredit(', receiveStart);
  const receiveReturn = operations.slice(receiveStart, issueCreditStart);
  assert.ok(receiveStart >= 0);
  assert.ok(issueCreditStart > receiveStart);
  assert.match(receiveReturn, /pg_advisory_xact_lock/);
  assert.match(receiveReturn, /sales-order-invoice:/);

  const issueReturnCreditStart = operations.indexOf('export async function issueSalesReturnCredit(');
  const refundReturnCreditStart = operations.indexOf('export async function refundSalesReturnCredit(', issueReturnCreditStart);
  const issueReturnCredit = operations.slice(issueReturnCreditStart, refundReturnCreditStart);
  const returnCreditInvoiceQueryStart = issueReturnCredit.indexOf('const invoiceItems =');
  const returnCreditInvoiceQueryEndMatch =
    issueReturnCredit.slice(returnCreditInvoiceQueryStart).search(/\n\s*for \(\s*const invoiceItem/);
  const returnCreditInvoiceQueryEnd =
    returnCreditInvoiceQueryEndMatch < 0
      ? -1
      : returnCreditInvoiceQueryStart + returnCreditInvoiceQueryEndMatch;
  const returnCreditInvoiceQuery = issueReturnCredit.slice(returnCreditInvoiceQueryStart, returnCreditInvoiceQueryEnd);
  assert.ok(issueReturnCreditStart >= 0);
  assert.ok(refundReturnCreditStart > issueReturnCreditStart);
  assert.ok(returnCreditInvoiceQueryStart >= 0);
  assert.ok(returnCreditInvoiceQueryEnd > returnCreditInvoiceQueryStart);
  assert.ok(returnCreditInvoiceQuery.includes("'sales-return:' ||"));
  assert.ok(returnCreditInvoiceQuery.includes("$4::text"));
  assert.ok(returnCreditInvoiceQuery.includes("invoice_item.invoice_id::text"));

  const invoicingCreditNotes = await source('lib/apps/invoicing/credit-notes.ts');
  const issueInvoicingCreditStart = invoicingCreditNotes.indexOf('export async function issueInvoiceCreditNote(');
  const cancelInvoicingCreditStart = invoicingCreditNotes.indexOf('export async function cancelInvoiceCreditNote(', issueInvoicingCreditStart);
  const issueInvoicingCredit = invoicingCreditNotes.slice(issueInvoicingCreditStart, cancelInvoicingCreditStart);
  assert.ok(issueInvoicingCreditStart >= 0);
  assert.ok(cancelInvoicingCreditStart > issueInvoicingCreditStart);
  assert.ok(issueInvoicingCredit.includes('const duplicateCreditState'));
  assert.ok(issueInvoicingCredit.includes('availableCredit:'));
  assert.ok(issueInvoicingCredit.includes('duplicateCreditState.availableAmount'));
  assert.match(issueInvoicingCredit, /INVOICE_STATE_INVALID/);
  assert.ok(issueInvoicingCredit.includes('The existing credit note balance could not be verified'));
  assert.match(returnCreditInvoiceQuery, /returnId,/);
  assert.match(createReturn, /'Sales order line',[\s\S]*\)\.toLowerCase\(\)/);

  const shipmentStart = operations.indexOf('export async function createSalesShipment(');
  const updateShipmentStart = operations.indexOf('export async function updateSalesShipmentStatus(', shipmentStart);
  const shipmentReturnStart = operations.indexOf('export async function createSalesReturn(', updateShipmentStart);
  const createShipment = operations.slice(shipmentStart, updateShipmentStart);
  const updateShipment = operations.slice(updateShipmentStart, shipmentReturnStart);
  assert.ok(shipmentStart >= 0);
  assert.ok(updateShipmentStart > shipmentStart);
  assert.ok(shipmentReturnStart > updateShipmentStart);
  assert.match(createShipment, /pg_advisory_xact_lock/);
  assert.ok(createShipment.includes("'sales-order-invoice:' + orderId"));
  assert.match(createShipment, /requireUuid\([\s\S]*?\)\.toLowerCase\(\);/);
  assert.match(createShipment, /createHash\('sha256'\)/);
  assert.match(createShipment, /metadata->>'idempotencyKey' = \$3/);
  assert.match(createShipment, /storedFingerprint !== requestFingerprint/);
  assert.match(createShipment, /This shipment request key already belongs to a different shipment request/);
  assert.match(createShipment, /reused: true/);
  assert.match(createShipment, /metadata,[\s\S]*created_by,[\s\S]*\$8::jsonb/);
  assert.match(createShipment, /requestFingerprint/);
  const shipmentDetailClient = await source('app/apps/sales/SalesOrderDetailClient.tsx');
  assert.match(shipmentDetailClient, /shipmentIdempotencyKey[\s\S]*useRef/);
  assert.match(shipmentDetailClient, /action:[\s\S]*'create_shipment',[\s\S]*idempotencyKey,/);
  assert.match(shipmentDetailClient, /if \(result\) \{\s*shipmentIdempotencyKey.current = null;/);
  assert.match(createShipment, /\['cancelled', 'closed'\]/);
  assert.match(updateShipment, /SELECT sales_order_id[\s\S]*LIMIT 1/);
  assert.match(updateShipment, /pg_advisory_xact_lock/);
  assert.ok(updateShipment.includes("'sales-order-invoice:' + orderId"));
  assert.match(updateShipment, /parentOrderStatus/);
  assert.match(updateShipment, /A shipment for a cancelled or closed sales order cannot be dispatched or delivered/);
  assert.match(updateShipment, /nextStatus === 'failed'[\s\S]*row\.inventory_posted_at/);
  assert.match(updateShipment, /A shipment with posted stock movement cannot be marked failed/);
});


test('Sales order invoice retries retain their idempotency key until a successful response', async () => {
  const client = await source('app/apps/sales/SalesOrderDetailClient.tsx');

  assert.match(client, /invoiceIdempotencyKey[\s\S]*useRef<string \| null>/);
  assert.match(client, /const idempotencyKey =[\s\S]*invoiceIdempotencyKey\.current \|\|/);
  assert.match(client, /invoiceIdempotencyKey\.current =\s*idempotencyKey/);
  assert.match(client, /if \(result\)\s*\{\s*invoiceIdempotencyKey\.current = null;/);

  const invoiceActionStart = client.indexOf("'create_order_invoice'");
  const invoiceActionEnd = client.indexOf("'Draft invoice created from the sales order.'", invoiceActionStart);
  assert.ok(invoiceActionStart >= 0);
  assert.ok(invoiceActionEnd > invoiceActionStart);
  const invoiceAction = client.slice(invoiceActionStart, invoiceActionEnd);
  assert.match(invoiceAction, /idempotencyKey/);
  assert.doesNotMatch(invoiceAction, /crypto\s*\.randomUUID/);
});


test('Sales online acceptance refreshes base-currency quote total when optional products change', async () => {
  const publicSales = await source('lib/apps/sales/public.ts');
  const acceptStart = publicSales.indexOf('export async function respondToPublicSalesQuote(');
  const finalStatusUpdate = publicSales.indexOf(
    '          status = $3::varchar(30),',
    acceptStart,
  );
  const acceptance = publicSales.slice(acceptStart, finalStatusUpdate);

  assert.ok(acceptStart >= 0);
  assert.ok(finalStatusUpdate > acceptStart);
  assert.match(acceptance, /base_total_amount =\s*ROUND\(/);
  assert.match(acceptance, /totals\.subtotal[\s\S]*q\.shipping_total/);
  assert.match(acceptance, /COALESCE\(NULLIF\(q\.exchange_rate, 0\), 1\)/);
});

test('Sales bulk order invoicing is bounded, permission-gated, retry-safe and reports per-order outcomes', async () => {
  const [bulk, service, route, workspace] = await Promise.all([
    source('lib/apps/sales/bulk-invoice.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
  ]);

  assert.match(bulk, /MAX_BULK_ORDER_INVOICES = 25/);
  assert.match(bulk, /requireSalesContext\(SALES_PERMISSIONS\.ORDER_MANAGE\)/);
  assert.match(bulk, /input\.orders\.length > MAX_BULK_ORDER_INVOICES/);
  assert.match(bulk, /new Set<string>\(\)/);
  assert.match(bulk, /idempotencyKeys\.has\(request\.idempotencyKey\)/);
  assert.match(bulk, /createSalesOrderInvoice\(/);
  assert.match(bulk, /for \(const request of requests\)/);
  assert.match(bulk, /successCount/);
  assert.match(bulk, /failedCount/);
  assert.ok(service.includes('bulkInvoiceSalesOrders'));
  assert.ok(route.includes('bulk_invoice_orders:'));
  assert.ok(workspace.includes("action: 'bulk_invoice_orders'"));
  assert.ok(workspace.includes('bulkInvoiceIdempotencyKeys'));
  assert.ok(workspace.includes('invoiceableSelectedOrderIds'));
  assert.ok(workspace.includes('aria-label="Select all visible sales orders"'));
  assert.ok(workspace.includes("aria-label={'Select sales order ' + order.orderNumber}"));
  assert.ok(workspace.includes('sales-orders-selected-'));
  assert.ok(workspace.includes('exportSales(initialData, undefined, selectedOrders)'));
  assert.ok(workspace.includes('Invoice eligible orders'));
});

test('Sales quote deposits validate, persist, display, and carry to confirmed orders', async () => {
  const [
    types,
    commands,
    queries,
    publicService,
    composer,
    quoteDetail,
    publicPage,
    pdf,
    migration,
    runtimeMigrations,
    firstParty,
  ] = await Promise.all([
    source('lib/apps/sales/types.ts'),
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/public.ts'),
    source('app/apps/sales/SalesQuoteComposer.tsx'),
    source('app/apps/sales/SalesQuoteDetailClient.tsx'),
    source('app/q/[tenantId]/[token]/page.tsx'),
    source('lib/apps/sales/pdf.ts'),
    source('lib/apps/sales/migrations/3.4.16-to-3.4.17.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(types, /depositType\?: unknown/);
  assert.match(types, /depositRequiredAmount: number/);
  assert.match(commands, /function normalizeSalesQuoteDeposit/);
  assert.match(commands, /Deposit type must be none, percent, or fixed/);
  assert.match(commands, /deposit_type,\s*deposit_value/);
  assert.match(commands, /deposit_type = \$29/);
  assert.match(commands, /deposit_value = \$30/);
  assert.match(commands, /orderDeposit\.requiredAmount/);
  assert.match(commands, /deposit_required_amount = \$5/);
  assert.match(commands, /depositType:\s*row\.deposit_type/);
  assert.match(queries, /quote\.deposit_type/);
  assert.match(queries, /depositRequiredAmount:/);
  assert.match(publicService, /q\.deposit_type/);
  assert.match(publicService, /depositRequiredAmount:/);
  assert.match(composer, /aria-label="Deposit type"/);
  assert.match(composer, /aria-label="Deposit value"/);
  assert.match(composer, /depositType,/);
  assert.match(quoteDetail, /label="Deposit \/ advance"/);
  assert.match(publicPage, /label="Deposit \/ advance"/);
  assert.match(publicPage, /quote\.depositRequiredAmount/);
  assert.match(pdf, /Deposit \/ advance due on order/);
  assert.match(migration, /fromVersion: '3\.4\.16'/);
  assert.match(migration, /toVersion: '3\.4\.17'/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS deposit_required_amount/);
  assert.match(runtimeMigrations, /SALES_3_4_16_TO_3_4_17/);
  assert.match(firstParty, /version: '3\.4\.19'/);
});


test('Sales revision and approval engine use consistent currency-safe threshold semantics', async () => {
  const [commercial, approvals] = await Promise.all([
    source('lib/apps/sales/commercial.ts'),
    source('lib/apps/sales/approvals.ts'),
  ]);

  const revisionStart = commercial.indexOf('export async function createSalesQuoteRevision(');
  const revisionEnd = commercial.indexOf('\nexport async function ', revisionStart + 30);
  assert.ok(revisionStart >= 0 && revisionEnd > revisionStart, 'quote revision should have a bounded implementation');
  const revision = commercial.slice(revisionStart, revisionEnd);
  assert.match(revision, /salesQuoteRequiresLegacyApproval\([\s\S]*row\.base_total_amount/);

  assert.equal(
    (approvals.match(/salesQuoteRequiresLegacyApproval\(/g) || []).length,
    2,
    'approval submission and quote-to-cash enforcement must share the base-currency threshold rule',
  );
  assert.match(approvals, /return salesQuoteApprovalPolicyMatches\(policy, quote\)/);
  assert.match(approvals, /base_total_amount.*base_currency.*exchange_rate.*exchange_rate_date/);
  assert.doesNotMatch(approvals, /Number\(snapshot\.quote\.total_amount \|\| 0\) >=/);
  assert.doesNotMatch(approvals, /Number\(quote\.total_amount \|\| 0\) >=/);
});
