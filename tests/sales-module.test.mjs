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


test('Sales v2 models quote approval, order fulfillment and invoice state independently', async () => {
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

  assert.doesNotMatch(
    context,
    /input\.tenantId|input\.companyId/,
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


test('Sales v2 is registered into manifests, migrations, Search and SaMi AI', async () => {
  const [
    manifest,
    migrations,
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
        'lib/search/registry.ts',
      ),
      source(
        'lib/ai/tool-registry.ts',
      ),
    ]);

  assert.match(
    manifest,
    /key: "sales",[\s\S]*version: '2\.0\.0'/s,
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
    migrations,
    /SALES_1_0_0_TO_2_0_0/,
  );

  assert.match(
    search,
    /SALES_SEARCH_PROVIDER/,
  );

  assert.match(
    ai,
    /SALES_AI_TOOLS/,
  );
});
