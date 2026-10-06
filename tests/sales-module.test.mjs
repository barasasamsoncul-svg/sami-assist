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
      'Teams & performance',
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
    /key: "sales",[\s\S]*version: '3\.4\.0'/s,
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
    source('app/apps/sales/page.tsx'),
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

  assert.match(page, /view=organization/);
  assert.match(page, /Teams & performance/);
  assert.match(workspace, /SalesOrganizationManager/);
  assert.match(workspace, /Teams & performance/);
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
    source('app/apps/sales/page.tsx'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesOperationsManager.tsx'),
    source('app/apps/sales/SalesOrderDetailClient.tsx'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/commands.ts'),
  ]);

  assert.match(runtimeMigrations, /SALES_3_1_0_TO_3_2_0/);
  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.0'/s);

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

  assert.match(page, /view=operations/);
  assert.match(page, /Operations/);
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
    /nextDeliveredQuantity:[\s\S]*next/,
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
    workspace,
    customerUi,
    queries,
    commands,
    route,
    types,
  ] = await Promise.all([
    source('app/apps/sales/page.tsx'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesCustomersManager.tsx'),
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/commands.ts'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/types.ts'),
  ]);

  assert.match(page, /customers/);
  assert.match(page, /Customers & Contacts/);
  assert.match(page, /Roadmap Part 2/);
  assert.match(workspace, /SalesCustomersManager/);
  assert.match(workspace, /Customers & contacts/);
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
    workspace,
    templates,
    commands,
  ] = await Promise.all([
    source('app/apps/sales/page.tsx'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesTemplatesManager.tsx'),
    source('lib/apps/sales/commands.ts'),
  ]);

  assert.match(page, /Quotation Templates/);
  assert.match(page, /view=templates/);
  assert.match(page, /Roadmap Part 5/);
  assert.match(workspace, /SalesTemplatesManager/);
  assert.match(workspace, /Quotation templates/);
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
    page,
    workspace,
    pdfBuilder,
    catalogue,
    commands,
    queries,
    route,
    types,
  ] = await Promise.all([
    source('app/apps/sales/page.tsx'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesQuotePdfBuilder.tsx'),
    source('app/apps/sales/SalesProductCatalogueManager.tsx'),
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/queries.ts'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/types.ts'),
  ]);

  assert.match(page, /Quote \/ PDF Builder/);
  assert.match(page, /Roadmap Part 6/);
  assert.match(page, /Product Catalogue/);
  assert.match(page, /Roadmap Part 7/);
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
    page,
    workspace,
    pricelists,
    advanced,
    commercial,
  ] = await Promise.all([
    source('app/apps/sales/page.tsx'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesPricelistsManager.tsx'),
    source('app/apps/sales/SalesAdvancedPricingManager.tsx'),
    source('lib/apps/sales/commercial.ts'),
  ]);

  assert.match(page, /Roadmap Part 8/);
  assert.match(page, /Roadmap Part 9/);
  assert.match(page, /view=pricelists/);
  assert.match(page, /view=advanced-pricing/);
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
    source('app/apps/sales/page.tsx'),
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
  assert.match(modules, /key: "sales"[\s\S]*version: '3\.4\.0'/);

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

  assert.match(page, /'currencies'/);
  assert.match(page, /Currency & FX/);
  assert.match(page, /Roadmap Part 10/);
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
  const [migration,runtime,manifest,context,pipeline,route,page,workspace,ui,schema] = await Promise.all([
    source('lib/apps/sales/migrations/3.3.0-to-3.4.0.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/context.ts'),
    source('lib/apps/sales/pipeline.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/page.tsx'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('lib/apps/sales/schema.sql'),
  ]);
  assert.match(runtime,/SALES_3_3_0_TO_3_4_0/);
  assert.match(manifest,/key: "sales"[\s\S]*version: '3\.4\.0'/);
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
  assert.match(route,/pipeline === '1'/);
  assert.match(route,/create_lead/);
  assert.match(route,/convert_lead/);
  assert.match(route,/move_opportunity/);
  assert.match(page,/view=pipeline/);
  assert.match(page,/Roadmap Part 11/);
  assert.match(workspace,/SalesPipelineManager/);
  assert.match(ui,/Leads & Opportunities/);
  assert.match(ui,/Opportunity pipeline/);
});
