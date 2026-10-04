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
    /key: "sales",[\s\S]*version: '3\.0\.0'/s,
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
