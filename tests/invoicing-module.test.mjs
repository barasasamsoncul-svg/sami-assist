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

test('Invoicing v2 schema is non-destructive, company-scoped and collision-safe', async () => {
  const schema =
    await source(
      'lib/apps/invoicing/schema.sql',
    );

  assert.doesNotMatch(
    schema,
    /\bDROP\s+(?:TABLE|SCHEMA|DATABASE)|\bTRUNCATE\b|\bDELETE\s+FROM\b/i,
  );

  for (
    const table
    of [
      'invoicing_customers',
      'invoicing_catalog_items',
      'invoicing_invoices',
      'invoicing_invoice_items',
      'invoicing_payments',
      'invoicing_payment_allocations',
      'invoicing_payment_refunds',
      'invoicing_credit_notes',
      'invoicing_recurring_templates',
      'invoicing_settings',
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
    /company_id UUID NOT NULL REFERENCES public\.companies\(id\)/,
  );

  assert.doesNotMatch(
    schema,
    /CREATE TABLE(?: IF NOT EXISTS)? public\.(?:products|customers|payments|payment_allocations)\b/,
    'Invoicing must not claim generic tables owned by other business apps.',
  );

  assert.match(
    schema,
    /CREATE OR REPLACE FUNCTION public\.validate_invoice_status_transition\(\)[\s\S]*IF TG_OP = 'INSERT'/,
  );

  assert.doesNotMatch(
    schema,
    /CREATE TRIGGER[\s\S]*?WHEN\s*\(\s*TG_OP/gi,
  );
});

test('Invoicing manifest is a real first-party module with permissions, resources and optional integration seams', async () => {
  const manifest =
    await source(
      'lib/modules/first-party.ts',
    );

  const start =
    manifest.indexOf(
      'key: "invoicing"',
    );

  const end =
    manifest.indexOf(
      'key: "expenses"',
      start,
    );

  assert.ok(
    start >=
      0 &&
    end >
      start,
  );

  const invoicing =
    manifest.slice(
      start,
      end,
    );

  assert.match(
    invoicing,
    /version:\s*['"]2\.6\.0['"]/,
  );

  assert.match(
    invoicing,
    /depends:\s*\[\]/,
  );

  for (
    const dependency
    of [
      'accounting',
      'payments',
      'crm',
      'sales',
      'inventory',
      'tax',
      'subscriptions',
      'customer_portal',
    ]
  ) {
    assert.ok(
      invoicing.includes(
        "'" +
        dependency +
        "'",
      ),
      dependency,
    );
  }

  for (
    const permission
    of [
      'invoicing.invoice.view',
      'invoicing.invoice.create',
      'invoicing.invoice.confirm',
      'invoicing.invoice.send',
      'invoicing.payment.record',
      'invoicing.credit_note.manage',
      'invoicing.customer.manage',
      'invoicing.catalog.manage',
      'invoicing.recurring.manage',
      'invoicing.report.view',
      'invoicing.settings.manage',
    ]
  ) {
    assert.ok(
      invoicing.includes(
        permission,
      ),
      permission,
    );
  }

  assert.match(
    invoicing,
    /table:\s*"invoicing_invoices"/,
  );

  assert.match(
    invoicing,
    /search:\s*true/,
  );

  assert.match(
    invoicing,
    /aiTools:\s*true/,
  );

  assert.match(
    invoicing,
    /apiEndpoints:\s*true/,
    'Invoicing may expose developer reads only through the code-owned, company-scoped API registry.',
  );

  assert.match(
    invoicing,
    /dataExport:\s*true/,
    'Invoicing account export is enabled only because the suite export handler is code-owned and company-scoped.',
  );

  const [
    developerRoute,
    developerRegistry,
    suiteExport,
    runtimeTables,
  ] =
    await Promise.all([
      source(
        'app/api/v1/apps/[appKey]/records/route.ts',
      ),
      source(
        'lib/developer/registry.ts',
      ),
      source(
        'lib/data-lifecycle/suite-export.ts',
      ),
      source(
        'lib/apps/runtime-data-tables.ts',
      ),
    ]);

  assert.match(
    developerRoute,
    /authenticateDeveloperRequest\([\s\S]*['"]apps\.read['"]/s,
  );

  assert.match(
    developerRoute,
    /context\.allowedAppKeys/,
  );

  assert.match(
    developerRegistry,
    /MODULE_DEVELOPER_ENDPOINTS/,
  );

  assert.match(
    runtimeTables,
    /invoicing_invoices/,
    'Invoicing owns its additional lifecycle tables in the app runtime contribution boundary.',
  );

  assert.match(
    runtimeTables,
    /APP_RUNTIME_ADDITIONAL_DATA_TABLES/,
  );

  assert.match(
    suiteExport,
    /getAdditionalModuleDataTables/,
    'Generic export must discover app-owned tables without hard-coding Invoicing.',
  );

  assert.doesNotMatch(
    suiteExport,
    /invoicing_invoices/,
    'The platform lifecycle kernel must not hard-code Invoicing table names.',
  );

  assert.match(
    suiteExport,
    /company_id = \$1/,
  );
});

test('Invoicing server authority uses trusted workspace/company context and never accepts browser tenant/company authority', async () => {
  const [
    context,
    commands,
    delivery,
    route,
  ] =
    await Promise.all([
      source(
        'lib/apps/invoicing/context.ts',
      ),
      source(
        'lib/apps/invoicing/commands.ts',
      ),
      source(
        'lib/apps/invoicing/delivery.ts',
      ),
      source(
        'app/api/apps/invoicing/route.ts',
      ),
    ]);

  assert.match(
    context,
    /requireCompanyContext/,
  );

  assert.match(
    context,
    /getPermissionContext/,
  );

  assert.match(
    context,
    /getWorkspaceSubscriptionAccessState/,
  );

  assert.match(
    context,
    /tenant_modules/,
  );

  assert.match(
    context,
    /FOR UPDATE/,
  );

  assert.match(
    commands,
    /normalizeInvoicingLines/,
  );

  assert.match(
    commands,
    /recordInvoicePayment/,
  );

  assert.match(
    commands,
    /issueInvoiceCreditNote/,
  );

  assert.match(
    commands,
    /sendInvoiceToCustomer/,
  );

  assert.match(
    delivery,
    /public_token_hash/,
  );

  assert.match(
    delivery,
    /markViewed:\s*false/,
  );

  assert.doesNotMatch(
    commands,
    /requireUuid\(\s*input\.(?:tenantId|companyId)/,
    'Client payloads must never choose the workspace or company scope for an Invoicing action.',
  );

  assert.doesNotMatch(
    commands,
    /getTenantPoolByTenantId\(\s*input\.tenantId/,
    'Client payloads must never select the tenant database.',
  );

  assert.match(
    context,
    /tenantId:\s*permissions\.tenantId/,
    'Tenant scope must come from the authenticated permission context.',
  );

  assert.match(
    context,
    /companyId:\s*company\.currentCompanyId/,
    'Company scope must come from the server-selected company context.',
  );

  assert.match(
    route,
    /sameOrigin/,
  );

  assert.match(
    route,
    /MAX_BODY_BYTES/,
  );
});

test('Invoicing workspace exposes operational Odoo/Zoho-class surfaces rather than a placeholder page', async () => {
  const [
    page,
    client,
    composer,
    detail,
    publicPage,
  ] =
    await Promise.all([
      source(
        'app/apps/invoicing/page.tsx',
      ),
      source(
        'app/apps/invoicing/InvoicingWorkspaceClient.tsx',
      ),
      source(
        'app/apps/invoicing/InvoiceComposer.tsx',
      ),
      source(
        'app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx',
      ),
      source(
        'app/i/[tenantId]/[token]/page.tsx',
      ),
    ]);

  assert.match(
    page,
    /WorkspaceShell/,
  );

  for (
    const surface
    of [
      'Invoices',
      'Customers',
      'Items',
      'Payments',
      'Recurring',
      'Reports',
      'Settings',
    ]
  ) {
    assert.ok(
      client.includes(
        surface,
      ),
      surface,
    );
  }

  assert.match(
    composer,
    /create_invoice/,
  );

  assert.match(
    detail,
    /record_payment/,
  );

  assert.match(
    detail,
    /issue_credit_note/,
  );

  assert.match(
    detail,
    /send_invoice/,
  );

  assert.match(
    publicPage,
    /SaMi secure invoice/,
  );

  assert.match(
    publicPage,
    /Balance due/,
  );
});

test('Invoicing participates in SaMi Search and SaMi AI through code-owned registries', async () => {
  const [
    searchRegistry,
    runtimeSearch,
    provider,
    aiRegistry,
    runtimeAi,
    tools,
  ] =
    await Promise.all([
      source(
        'lib/search/registry.ts',
      ),
      source(
        'lib/apps/runtime-search.ts',
      ),
      source(
        'lib/apps/invoicing/search.ts',
      ),
      source(
        'lib/ai/tool-registry.ts',
      ),
      source(
        'lib/apps/runtime-ai.ts',
      ),
      source(
        'lib/apps/invoicing/ai-tools.ts',
      ),
    ]);

  assert.match(
    searchRegistry,
    /APP_RUNTIME_SEARCH_PROVIDERS/,
  );

  assert.match(
    runtimeSearch,
    /INVOICING_SEARCH_PROVIDER/,
  );

  assert.match(
    provider,
    /searchInvoicingRecords/,
  );

  assert.match(
    aiRegistry,
    /APP_RUNTIME_AI_TOOLS/,
  );

  assert.match(
    runtimeAi,
    /INVOICING_AI_TOOLS/,
  );

  assert.match(
    tools,
    /invoicing_summary/,
  );

  assert.match(
    tools,
    /invoicing_search/,
  );

  assert.match(
    tools,
    /invoicing_create_draft/,
  );

  assert.match(
    tools,
    /confirmationRequired:\s*true/,
  );
});

test('Invoicing has a forward-only v1 to v2 migration and CI includes module regression tests', async () => {
  const [
    migration,
    migrationEngine,
    runtimeMigrations,
    pkg,
  ] =
    await Promise.all([
      source(
        'lib/apps/invoicing/migrations/1.0.0-to-2.0.0.ts',
      ),
      source(
        'lib/modules/migrations.ts',
      ),
      source(
        'lib/apps/runtime-migrations.ts',
      ),
      source(
        'package.json',
      ),
    ]);

  assert.match(
    migrationEngine,
    /APP_RUNTIME_MODULE_MIGRATIONS/,
  );

  assert.match(
    migration,
    /fromVersion:\s*['"]1\.0\.0['"]/,
  );

  assert.match(
    migration,
    /toVersion:\s*['"]2\.0\.0['"]/,
  );

  const snapshotMigration =
    await source(
      'lib/apps/invoicing/migrations/2.0.0-to-2.1.0.ts',
    );

  assert.match(
    snapshotMigration,
    /fromVersion:\s*['"]2\.0\.0['"]/,
  );

  assert.match(
    snapshotMigration,
    /toVersion:\s*['"]2\.1\.0['"]/,
  );

  assert.match(
    snapshotMigration,
    /bill_to_name/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_0_0_TO_2_1_0/,
  );

  const runtimeMigration =
    await source(
      'lib/apps/invoicing/migrations/2.1.0-to-2.2.0.ts',
    );

  assert.match(
    runtimeMigration,
    /fromVersion:\s*['"]2\.1\.0['"]/,
  );

  assert.match(
    runtimeMigration,
    /toVersion:\s*['"]2\.2\.0['"]/,
  );

  assert.match(
    runtimeMigration,
    /source_invoice_id/,
  );

  assert.match(
    runtimeMigration,
    /reminder_channels/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_1_0_TO_2_2_0/,
  );

  const accountingMigration =
    await source(
      'lib/apps/invoicing/migrations/2.2.0-to-2.3.0.ts',
    );

  assert.match(
    accountingMigration,
    /fromVersion:\s*['"]2\.2\.0['"]/,
  );

  assert.match(
    accountingMigration,
    /toVersion:\s*['"]2\.3\.0['"]/,
  );

  assert.match(
    accountingMigration,
    /invoicing_accounting_links/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_2_0_TO_2_3_0/,
  );

  const builderSnapshotMigration =
    await source(
      'lib/apps/invoicing/migrations/2.3.0-to-2.4.0.ts',
    );

  assert.match(
    builderSnapshotMigration,
    /fromVersion:\s*['"]2\.3\.0['"]/,
  );

  assert.match(
    builderSnapshotMigration,
    /toVersion:\s*['"]2\.4\.0['"]/,
  );

  assert.match(
    builderSnapshotMigration,
    /service_date/,
  );

  assert.match(
    builderSnapshotMigration,
    /ship_to_address/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_3_0_TO_2_4_0/,
  );

  const lifecycleMigration =
    await source(
      'lib/apps/invoicing/migrations/2.4.0-to-2.5.0.ts',
    );

  assert.match(
    lifecycleMigration,
    /fromVersion:\s*['"]2\.4\.0['"]/,
  );

  assert.match(
    lifecycleMigration,
    /toVersion:\s*['"]2\.5\.0['"]/,
  );

  for (const lifecycleField of [
    'pending_approval',
    'rejected',
    'submitted_at',
    'submitted_by',
    'approved_at',
    'approved_by',
    'rejected_at',
    'rejected_by',
  ]) {
    assert.match(
      lifecycleMigration,
      new RegExp(lifecycleField),
      'Lifecycle migration must include ' + lifecycleField + '.',
    );
  }

  assert.match(
    lifecycleMigration,
    /CREATE OR REPLACE FUNCTION public\.validate_invoice_status_transition/,
  );

  assert.match(
    lifecycleMigration,
    /AS \$\$[\s\S]*\$\$;/s,
    'Lifecycle migration function body must use a valid PostgreSQL dollar-quote delimiter.',
  );

  assert.match(
    lifecycleMigration,
    /CREATE OR REPLACE VIEW public\.invoicing_customer_balances/,
  );

  assert.match(
    lifecycleMigration,
    /CREATE OR REPLACE VIEW public\.invoicing_aging/,
  );

  assert.match(
    lifecycleMigration,
    /INVOICING_2_4_0_TO_2_5_0|invoicing-2\.4\.0-to-2\.5\.0/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_4_0_TO_2_5_0/,
  );

  const paymentMigration =
    await source(
      'lib/apps/invoicing/migrations/2.5.0-to-2.6.0.ts',
    );

  assert.match(
    paymentMigration,
    /fromVersion:\s*['"]2\.5\.0['"]/,
  );

  assert.match(
    paymentMigration,
    /toVersion:\s*['"]2\.6\.0['"]/,
  );

  assert.match(
    paymentMigration,
    /accounting_model/,
  );

  assert.match(
    paymentMigration,
    /legacy_direct_ar/,
  );

  assert.match(
    paymentMigration,
    /customer_credit/,
  );

  assert.match(
    paymentMigration,
    /invoicing_payment_refunds/,
  );

  assert.match(
    paymentMigration,
    /invoicing_payment_balances/,
  );

  assert.match(
    paymentMigration,
    /AS \$invoice_payment_lifecycle\$[\s\S]*\$invoice_payment_lifecycle\$;/s,
    'The 2.6 lifecycle function must use a valid tagged PostgreSQL dollar quote.',
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_5_0_TO_2_6_0/,
  );

  const accounting =
    await source(
      'lib/apps/invoicing/accounting.ts',
    );

  assert.match(
    accounting,
    /postInvoiceConfirmationToAccounting/,
  );

  assert.match(
    accounting,
    /postInvoicePaymentToAccounting/,
  );

  assert.match(
    accounting,
    /reverseInvoicingAccountingEvent/,
  );

  assert.match(
    accounting,
    /postInvoiceWriteOffToAccounting/,
  );

  assert.match(
    migration,
    /executeSafeSamiModuleMigrationSql/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_1_0_0_TO_2_0_0/,
  );

  assert.match(
    pkg,
    /test:invoicing/,
  );
});


test('professional invoice composer uses real customers and catalog products with mobile-first controls', async () => {
  const [
    composer,
    list,
    detail,
    commands,
    queries,
  ] =
    await Promise.all([
      source(
        'app/apps/invoicing/InvoiceComposer.tsx',
      ),
      source(
        'app/apps/invoicing/InvoicingWorkspaceClient.tsx',
      ),
      source(
        'app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx',
      ),
      source(
        'lib/apps/invoicing/commands.ts',
      ),
      source(
        'lib/apps/invoicing/queries.ts',
      ),
    ]);

  assert.match(
    composer,
    /Choose customer/,
  );

  assert.match(
    composer,
    /Product \/ service/,
  );

  assert.match(
    composer,
    /discountType/,
  );

  assert.match(
    composer,
    /taxRateId/,
  );

  assert.match(
    composer,
    /fixed inset-x-0 bottom-0/,
    'Mobile users keep primary invoice actions reachable.',
  );

  assert.match(
    list,
    /sm:hidden/,
    'Invoice list has a phone card layout.',
  );

  assert.match(
    detail,
    /sm:hidden/,
    'Invoice detail has a dedicated phone line-item layout.',
  );

  assert.match(
    commands,
    /updateInvoiceDraft/,
  );

  assert.match(
    commands,
    /Only draft invoices can be edited/,
  );

  assert.match(
    commands,
    /bill_to_name/,
  );

  assert.match(
    commands,
    /taxCalculation ===/,
  );

  assert.match(
    queries,
    /getInvoicingInvoiceDetail/,
  );

  assert.match(
    queries,
    /payment_terms_name_snapshot/,
  );
});


test('Invoicing v2.2 owns professional document appearance and delivery without leaking provider secrets', async () => {
  const [
    composer,
    appearance,
    publicInvoice,
    publicPage,
    pdf,
    pdfRoute,
    delivery,
    whatsapp,
    email,
    detail,
  ] =
    await Promise.all([
      source(
        'app/apps/invoicing/InvoiceComposer.tsx',
      ),
      source(
        'app/apps/invoicing/InvoiceAppearanceSettings.tsx',
      ),
      source(
        'lib/apps/invoicing/public.ts',
      ),
      source(
        'app/i/[tenantId]/[token]/page.tsx',
      ),
      source(
        'lib/apps/invoicing/pdf.ts',
      ),
      source(
        'app/i/[tenantId]/[token]/pdf/route.ts',
      ),
      source(
        'lib/apps/invoicing/delivery.ts',
      ),
      source(
        'lib/services/whatsapp.ts',
      ),
      source(
        'lib/services/email.ts',
      ),
      source(
        'app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx',
      ),
    ]);

  assert.match(
    composer,
    /Invoice appearance/,
  );

  assert.match(
    appearance,
    /Create appearance template/,
  );

  assert.match(
    appearance,
    /showTaxBreakdown/,
  );

  assert.match(
    publicInvoice,
    /markViewed/,
  );

  assert.match(
    publicInvoice,
    /invoicing_templates/,
  );

  assert.match(
    publicPage,
    /Open PDF/,
  );

  assert.match(
    pdf,
    /renderInvoicePdf/,
  );

  assert.match(
    pdfRoute,
    /application\/pdf/,
  );

  assert.match(
    delivery,
    /attachments/,
  );

  assert.match(
    delivery,
    /whatsapp/,
  );

  assert.match(
    delivery,
    /markViewed:\s*false/,
    'Provider-side PDF rendering must not mark a customer invoice as viewed.',
  );

  assert.match(
    whatsapp,
    /SAMI_WHATSAPP_PROVIDER/,
  );

  assert.match(
    whatsapp,
    /META_WHATSAPP_ACCESS_TOKEN/,
  );

  assert.match(
    email,
    /WorkspaceNotificationEmailAttachment/,
  );

  assert.match(
    detail,
    /Email PDF/,
  );

  assert.match(
    detail,
    /WhatsApp/,
  );
});


test('Invoicing master data behaves like a product: duplicate-safe creates, edit lifecycle, form reset and financial double-submit protection', async () => {
  const [
    context,
    commands,
    service,
    api,
    workspace,
    composer,
    appearance,
    detail,
    queries,
    types,
  ] = await Promise.all([
    source('lib/apps/invoicing/context.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/InvoiceComposer.tsx'),
    source('app/apps/invoicing/InvoiceAppearanceSettings.tsx'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
  ]);

  for (const code of [
    'DUPLICATE_CUSTOMER',
    'DUPLICATE_CATALOG_ITEM',
    'DUPLICATE_PAYMENT_TERM',
    'DUPLICATE_TAX_RATE',
  ]) {
    assert.match(context, new RegExp(code));
    assert.match(api, new RegExp(code));
  }

  assert.match(commands, /pg_advisory_xact_lock/);
  assert.match(commands, /This customer already exists/);
  assert.match(commands, /This invoice item already exists/);
  assert.match(commands, /This payment reference has already been posted/);
  assert.match(commands, /updateInvoicingCustomer/);
  assert.match(commands, /setInvoicingCustomerStatus/);
  assert.match(commands, /updateInvoicingCatalogItem/);
  assert.match(commands, /setInvoicingCatalogItemActive/);
  assert.match(commands, /updateInvoicingPaymentTerm/);
  assert.match(commands, /setInvoicingPaymentTermActive/);
  assert.match(commands, /updateInvoicingTaxRate/);
  assert.match(commands, /setInvoicingTaxRateActive/);
  assert.match(commands, /setRecurringInvoiceTemplateStatus/);
  assert.match(commands, /An invoice appearance template with this name already exists/);
  assert.match(commands, /A recurring invoice schedule with this name already exists/);

  for (const exported of [
    'updateInvoicingCustomer',
    'setInvoicingCustomerStatus',
    'updateInvoicingCatalogItem',
    'setInvoicingCatalogItemActive',
    'updateInvoicingPaymentTerm',
    'setInvoicingPaymentTermActive',
    'updateInvoicingTaxRate',
    'setInvoicingTaxRateActive',
    'setRecurringInvoiceTemplateStatus',
  ]) {
    assert.match(service, new RegExp(exported));
  }

  for (const action of [
    'update_customer',
    'set_customer_status',
    'update_catalog_item',
    'set_catalog_item_active',
    'update_payment_term',
    'set_payment_term_active',
    'update_tax_rate',
    'set_tax_rate_active',
    'set_recurring_status',
  ]) {
    assert.match(api, new RegExp(action));
  }

  assert.match(workspace, /requestInFlight/);
  assert.match(workspace, /element\.reset\(\)/);
  assert.match(workspace, /update_customer/);
  assert.match(workspace, /set_customer_status/);
  assert.match(workspace, /update_catalog_item/);
  assert.match(workspace, /set_catalog_item_active/);
  assert.match(workspace, /update_payment_term/);
  assert.match(workspace, /update_tax_rate/);
  assert.match(workspace, /set_recurring_status/);

  assert.match(composer, /pending\?: boolean/);
  assert.match(composer, /item\.isActive/);
  assert.match(composer, /tax\.isActive/);

  assert.match(appearance, /Promise<boolean>/);
  assert.match(appearance, /element\.reset\(\)/);

  assert.match(detail, /requestInFlight/);
  assert.match(detail, /element\.reset\(\)/);

  assert.match(queries, /c\.customer_type/);
  assert.match(queries, /item\.is_active/);
  assert.match(types, /customerType: string/);
  assert.match(types, /isActive: boolean/);
});

test('Invoicing completes standalone operator workflows for duplication, reminders, recurring edits and register export', async () => {
  const [
    commands,
    service,
    route,
    workspace,
    detail,
    queries,
    types,
  ] = await Promise.all([
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
  ]);

  assert.match(commands, /export async function duplicateInvoice/);
  assert.match(commands, /export async function sendInvoiceReminder/);
  assert.match(commands, /purpose:\s*'reminder'/);
  assert.match(commands, /export async function updateRecurringInvoiceTemplate/);

  assert.match(service, /duplicateInvoice/);
  assert.match(service, /sendInvoiceReminder/);
  assert.match(service, /updateRecurringInvoiceTemplate/);

  assert.match(route, /case 'duplicate_invoice'/);
  assert.match(route, /case 'send_reminder'/);
  assert.match(route, /case 'update_recurring'/);

  assert.match(workspace, /exportInvoiceRegister/);
  assert.match(workspace, /Export CSV/);
  assert.match(workspace, /update_recurring/);
  assert.match(workspace, /deliveryChannels/);

  assert.match(detail, /duplicate_invoice/);
  assert.match(detail, /send_reminder/);
  assert.match(detail, /Duplicate/);
  assert.match(detail, /Send reminder/);

  assert.match(queries, /r\.invoice_payload/);
  assert.match(types, /deliveryChannels:/);
});

test('Invoicing uses the shared SaMi overlay for success, warnings and errors instead of inline status banners', async () => {
  const [
    workspace,
    detail,
    service,
  ] = await Promise.all([
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
    source('lib/apps/invoicing/service.ts'),
  ]);

  for (const client of [workspace, detail]) {
    assert.match(client, /SaMiOverlay/);
    assert.match(client, /useSaMiOverlay/);
    assert.match(client, /showSuccess/);
    assert.match(client, /showWarning/);
    assert.match(client, /showError/);
    assert.doesNotMatch(client, /notice\s*&&/);
    assert.doesNotMatch(client, /error\s*&&/);
  }

  assert.match(
    service,
    /duplicateInvoice/,
    'The service barrel must export duplicateInvoice for the API route.',
  );
});

test('Invoicing v2.2 runs recurring generation and payment reminders through one auditable worker', async () => {
  const [
    schema,
    commands,
    worker,
    route,
    vercel,
    client,
  ] =
    await Promise.all([
      source(
        'lib/apps/invoicing/schema.sql',
      ),
      source(
        'lib/apps/invoicing/commands.ts',
      ),
      source(
        'lib/apps/invoicing/worker.ts',
      ),
      source(
        'app/api/internal/invoicing/tick/route.ts',
      ),
      source(
        'vercel.json',
      ),
      source(
        'app/apps/invoicing/InvoicingWorkspaceClient.tsx',
      ),
    ]);

  assert.match(
    schema,
    /source_invoice_id/,
  );

  assert.match(
    schema,
    /reminder_channels/,
  );

  assert.match(
    schema,
    /uq_invoicing_reminders_once/,
  );

  assert.match(
    commands,
    /sourceInvoiceId/,
  );

  assert.match(
    commands,
    /saveInvoicingTemplate/,
  );

  assert.match(
    commands,
    /createInvoicingPaymentTerm/,
  );

  assert.match(
    commands,
    /createInvoicingTaxRate/,
  );

  assert.match(
    worker,
    /FOR UPDATE OF r[\s\S]*SKIP LOCKED/,
  );

  assert.match(
    worker,
    /nextDocumentNumber/,
  );

  assert.match(
    worker,
    /deliverInvoice/,
  );

  assert.match(
    worker,
    /invoicing_reminders/,
  );

  assert.match(
    route,
    /SAMI_INVOICING_WORKER_SECRET/,
  );

  assert.match(
    vercel,
    /\/api\/internal\/invoicing\/tick/,
  );

  assert.match(
    client,
    /Source invoice/,
  );

  assert.match(
    client,
    /Reminder delivery channels/,
  );

  assert.match(
    client,
    /InvoiceAppearanceSettings/,
  );
});


test('Invoicing financial corrections are auditable and company settings are enforced server-side', async () => {
  const [
    context,
    commands,
    service,
    route,
    queries,
    types,
    workspace,
    detail,
    composer,
  ] = await Promise.all([
    source('lib/apps/invoicing/context.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
    source('app/apps/invoicing/InvoiceComposer.tsx'),
  ]);

  assert.match(context, /PAYMENT_NOT_FOUND/);
  assert.match(context, /CREDIT_NOTE_NOT_FOUND/);
  assert.match(commands, /export async function reverseInvoicePayment/);
  assert.match(commands, /export async function cancelInvoiceCreditNote/);
  assert.match(commands, /reconcileInvoiceSettlementStatus/);
  assert.match(commands, /allow_partial_payments/);
  assert.match(commands, /Partial payments are disabled for this company/);
  assert.match(commands, /allow_credit_notes/);
  assert.match(commands, /Credit notes are disabled for this company/);
  assert.match(commands, /settings\.require_approval ===/);
  assert.match(commands, /reversalReason/);
  assert.match(commands, /cancellationReason/);
  assert.match(service, /reverseInvoicePayment/);
  assert.match(service, /cancelInvoiceCreditNote/);
  assert.match(route, /case 'reverse_payment'/);
  assert.match(route, /case 'cancel_credit_note'/);
  assert.match(queries, /p\.status/);
  assert.match(types, /paymentNumber: string;\n\s+status: string;/);
  assert.match(workspace, /Reverse posted payment/);
  assert.match(workspace, /payment\.status/);
  assert.match(detail, /action:\s*'reverse_payment'/);
  assert.match(detail, /action:\s*'cancel_credit_note'/);
  assert.match(detail, /allowCreditNotes/);
  assert.match(detail, /allowPartialPayments/);
  assert.match(composer, /!data\.settings\.requireApproval/);
});


test('Workspace tutorials are reusable across modules and Invoicing ships complete guided flows', async () => {
  const [
    tutorial,
    shell,
    page,
    workspace,
    detailPage,
    detail,
  ] = await Promise.all([
    source('app/components/workspace/WorkspaceTutorial.tsx'),
    source('app/components/workspace/WorkspaceShell.tsx'),
    source('app/apps/invoicing/page.tsx'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/[invoiceId]/page.tsx'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
  ]);

  assert.match(tutorial, /WorkspaceTutorialToggle/);
  assert.match(tutorial, /startWorkspaceTutorial/);
  assert.match(tutorial, /sami:tutorial-preference/);
  assert.match(tutorial, /sami:tutorial-start/);
  assert.match(tutorial, /userId/);
  assert.match(tutorial, /localStorage/);
  assert.match(tutorial, /Tutorials On/);
  assert.match(tutorial, /Tutorials Off/);

  assert.match(shell, /WorkspaceTutorialToggle/);
  assert.match(shell, /userId=\{/);

  assert.match(page, /userId=\{/);
  assert.match(workspace, /INVOICING_TUTORIAL_STEPS/);
  assert.match(workspace, /moduleKey="invoicing"/);
  assert.match(workspace, /Receivables command center/);
  assert.match(workspace, /Items & pricing/);
  assert.match(workspace, /Recurring billing/);
  assert.match(workspace, /startWorkspaceTutorial/);

  for (const section of [
    'dashboard',
    'invoices',
    'customers',
    'items',
    'payments',
    'recurring',
    'reports',
    'settings',
  ]) {
    assert.match(
      workspace,
      new RegExp("section:\\s*'" + section + "'"),
    );
  }

  assert.match(detailPage, /userId=\{/);
  assert.match(detail, /INVOICE_DETAIL_TUTORIAL_STEPS/);
  assert.match(detail, /moduleKey="invoicing-invoice-detail"/);
  assert.match(detail, /Record and reverse payments safely/);
  assert.match(detail, /Use credit notes for commercial reductions/);
  assert.match(detail, /Use the audit trail/);
});


test('Invoicing SQL explicitly types reused status parameters to prevent Postgres 42P08 failures', async () => {
  const [
    commands,
    worker,
  ] = await Promise.all([
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/worker.ts'),
  ]);

  assert.match(
    commands,
    /\$12::varchar\(30\)[\s\S]*WHEN \$12::varchar\(30\) =[\s\S]*'confirmed'/,
    'Invoice creation must type the reused status parameter explicitly.',
  );

  assert.match(
    commands,
    /status = \$3::varchar\(30\)[\s\S]*WHEN \$3::varchar\(30\) = 'paid'/,
    'Settlement reconciliation must type status before reuse in CASE.',
  );

  assert.match(
    commands,
    /status =\s*\$3::varchar\(30\)[\s\S]*WHEN \$3::varchar\(30\) =[\s\S]*'confirmed'/,
    'Manual status transitions must type the reused status parameter explicitly.',
  );

  assert.match(
    commands,
    /WHEN \$3::varchar\(30\) IN \([\s\S]*'cancelled',[\s\S]*'void'/,
    'Cancellation transitions must keep one concrete PostgreSQL type.',
  );

  assert.match(
    worker,
    /status =\s*\$4::varchar\(30\)[\s\S]*WHEN \$4::varchar\(30\) =[\s\S]*'sent'/,
    'Reminder delivery status must not rely on conflicting inferred parameter types.',
  );
});


test('Invoicing rejects stale master-data references and preserves a draft invoice template while editing', async () => {
  const [
    commands,
    queries,
    types,
    composer,
  ] = await Promise.all([
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('app/apps/invoicing/InvoiceComposer.tsx'),
  ]);

  assert.match(
    commands,
    /Choose a valid active invoice item\./,
    'A stale or cross-company catalog item must be rejected before invoice insert.',
  );

  assert.match(
    commands,
    /Choose a valid active tax rate\./,
    'A stale or cross-company tax rate must be rejected before invoice insert.',
  );

  assert.match(
    queries,
    /i\.template_id/,
    'Invoice detail must retain its selected appearance template.',
  );

  assert.match(
    types,
    /templateId: string \| null;/,
  );

  assert.match(
    composer,
    /invoice\?\.templateId \|\|/,
    'Editing a draft must start with the invoice template that was originally saved.',
  );
});


test('Invoicing exposes audited invoice closure actions and terminal invoices do not show collectible balances', async () => {
  const [
    commands,
    queries,
    publicInvoice,
    types,
    detail,
  ] = await Promise.all([
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/public.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
  ]);

  assert.match(
    types,
    /canCancel: boolean;/,
  );

  assert.match(
    queries,
    /INVOICE_CANCEL/,
  );

  assert.match(
    commands,
    /A reason is required to cancel, void or write off an invoice\./,
  );

  assert.match(
    detail,
    /Close invoice/,
  );

  assert.match(
    detail,
    /Cancel invoice/,
  );

  assert.match(
    detail,
    /Void invoice/,
  );

  assert.match(
    detail,
    /Write off remaining balance/,
  );

  assert.match(
    detail,
    /action:\s*'change_status'/,
  );

  assert.match(
    queries,
    /'cancelled',[\s\S]*'void',[\s\S]*'written_off',[\s\S]*\? 0/,
    'Internal invoice detail must report zero collectible balance for terminal invoice states.',
  );

  assert.match(
    publicInvoice,
    /'cancelled',[\s\S]*'void',[\s\S]*'written_off',[\s\S]*\? 0/,
    'Customer-facing invoice view must report zero collectible balance for terminal invoice states.',
  );
});


test('Invoicing financial correction SQL keeps actor IDs typed as UUID while storing readable audit metadata', async () => {
  const commands =
    await source(
      'lib/apps/invoicing/commands.ts',
    );

  assert.match(
    commands,
    /'reversedBy',[\s\S]*\(\$3::uuid\)::text[\s\S]*updated_by = \$3::uuid/,
    'Payment reversal must not infer the actor parameter as text before assigning it to updated_by UUID.',
  );

  assert.match(
    commands,
    /'cancelledBy',[\s\S]*\(\$3::uuid\)::text[\s\S]*updated_by = \$3::uuid/,
    'Credit-note cancellation must not infer the actor parameter as text before assigning it to updated_by UUID.',
  );
});


test('Invoice attachment PDF carries the complete billing and settlement snapshot with continuation-safe layout', async () => {
  const [
    publicInvoice,
    pdf,
    publicPage,
  ] = await Promise.all([
    source('lib/apps/invoicing/public.ts'),
    source('lib/apps/invoicing/pdf.ts'),
    source('app/i/[tenantId]/[token]/page.tsx'),
  ]);

  for (const field of [
    'payment_terms_name_snapshot',
    'tax_calculation',
    'customer_phone',
    'customer_tax_id',
    'paid_amount',
    'credited_amount',
    'rounding_adjustment',
    'registration_number',
  ]) {
    assert.match(
      publicInvoice,
      new RegExp(field),
      'Public invoice payload must include ' + field + '.',
    );
  }

  for (const label of [
    'INVOICE DETAILS',
    'BILL TO',
    'Payment terms',
    'Tax mode',
    'Disc.',
    'FINANCIAL SUMMARY',
    'Rounding',
    'Paid',
    'Credits',
    'Balance due',
    'PAYMENT INSTRUCTIONS',
    'NOTES',
    'TERMS & CONDITIONS',
    'INVOICE NOTES & TERMS',
  ]) {
    assert.match(
      pdf,
      new RegExp(label.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')),
      'PDF renderer must include ' + label + '.',
    );
  }

  assert.match(
    pdf,
    /customer:[\s\S]*phone: string \| null;[\s\S]*taxId: string \| null;/s,
  );

  assert.match(
    pdf,
    /paidAmount: number;[\s\S]*creditedAmount: number;[\s\S]*balanceDue: number;/s,
  );

  assert.match(
    pdf,
    /detailChunks/,
    'Long payment instructions, notes and terms must continue onto additional pages instead of being silently dropped.',
  );

  assert.match(
    publicPage,
    /Payment terms:/,
  );

  assert.match(
    publicPage,
    /Tax mode:/,
  );

  assert.match(
    publicPage,
    /label="Paid"/,
  );

  assert.match(
    publicPage,
    /label="Credits"/,
  );
});


test('Invoicing keeps customer, catalog, payment, recurring, report and settings data behind their own permissions', async () => {
  const [
    types,
    queries,
    commands,
    workspace,
    page,
  ] = await Promise.all([
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/page.tsx'),
  ]);

  for (const capability of [
    'canViewCustomers',
    'canViewCatalog',
    'canViewPayments',
  ]) {
    assert.match(
      types,
      new RegExp(capability + ': boolean'),
    );

    assert.match(
      queries,
      new RegExp(capability),
    );
  }

  assert.match(
    queries,
    /customers:\s*access\.canViewCustomers[\s\S]*\? customers\.rows\.map/s,
  );

  assert.match(
    queries,
    /payments:\s*access\.canViewPayments[\s\S]*\? payments\.rows\.map/s,
  );

  assert.match(
    queries,
    /catalogItems:\s*access\.canViewCatalog[\s\S]*\? catalogItems\.rows\.map/s,
  );

  assert.match(
    queries,
    /recurring:\s*access\.canManageRecurring[\s\S]*\? recurring\.rows\.map/s,
  );

  assert.match(
    queries,
    /aging:\s*access\.canViewReports[\s\S]*\? aging\.rows\.map/s,
  );

  assert.match(
    queries,
    /bankDetails:\s*access\.canManageSettings/s,
  );

  assert.match(
    commands,
    /assertInvoiceCompositionAccess/,
  );

  assert.match(
    commands,
    /Customer access is required to create or edit an invoice\./,
  );

  assert.match(
    commands,
    /Catalog access is required to use saved products or services on an invoice\./,
  );

  assert.match(
    workspace,
    /const visibleNav =/,
  );

  assert.match(
    page,
    /const appSidebarItems =/,
  );

  for (const capability of [
    'canViewCustomers',
    'canViewCatalog',
    'canViewPayments',
    'canManageRecurring',
    'canViewReports',
    'canManageSettings',
  ]) {
    assert.match(
      page,
      new RegExp(
        capability +
        '[\\s\\S]*?label:',
      ),
      'Invoicing sidebar entries must remain capability-aware for ' +
      capability,
    );
  }

  assert.match(
    workspace,
    /const tutorialSteps =/,
  );
});


test('Invoicing payment history and customer search respect dedicated read permissions across UI, Search and SaMi AI', async () => {
  const [
    queries,
    search,
    aiTools,
  ] = await Promise.all([
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/search.ts'),
    source('lib/apps/invoicing/ai-tools.ts'),
  ]);

  assert.match(
    queries,
    /const canViewPayments =[\s\S]*PAYMENT_VIEW[\s\S]*PAYMENT_RECORD/s,
  );

  assert.match(
    queries,
    /canViewPayments[\s\S]*\? context\.pool\.query[\s\S]*invoicing_payment_allocations[\s\S]*: Promise\.resolve\(\{[\s\S]*rows: \[\]/s,
  );

  assert.match(
    queries,
    /includeCustomers\?: boolean;/,
  );

  assert.match(
    queries,
    /options\.includeCustomers ===[\s\S]*true[\s\S]*row\.kind[\s\S]*'invoice'/s,
  );

  assert.match(
    search,
    /CUSTOMER_VIEW/,
  );

  assert.match(
    search,
    /includeCustomers/,
  );

  assert.match(
    aiTools,
    /name: 'Search invoices and customers'[\s\S]*CUSTOMER_VIEW/s,
  );

  assert.match(
    aiTools,
    /name: 'Create invoice draft'[\s\S]*INVOICE_CREATE[\s\S]*CUSTOMER_VIEW/s,
  );
});


test('Invoicing invoice register provides deep operator controls and authenticated PDF access', async () => {
  const [
    workspace,
    detail,
    pdfRoute,
  ] = await Promise.all([
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
    source('app/api/apps/invoicing/[invoiceId]/pdf/route.ts'),
  ]);

  assert.match(
    workspace,
    /Invoice register/,
  );

  assert.match(
    workspace,
    /statusFilter/,
  );

  assert.match(
    workspace,
    /receivableFilter/,
  );

  assert.match(
    workspace,
    /sortBy/,
  );

  assert.match(
    workspace,
    /Highest balance/,
  );

  assert.match(
    workspace,
    /Duplicate as draft/,
  );

  assert.match(
    workspace,
    /Send overdue reminder/,
  );

  assert.match(
    workspace,
    /\/api\/apps\/invoicing\/.*\/pdf/,
  );

  assert.match(
    workspace,
    /allowPartialPayments/,
  );

  assert.match(
    workspace,
    /allowCreditNotes/,
  );

  assert.match(
    detail,
    /Print \/ PDF/,
  );

  assert.match(
    detail,
    /\/pdf\?download=1/,
  );

  assert.match(
    pdfRoute,
    /requireInvoicingContext/,
  );

  assert.match(
    pdfRoute,
    /INVOICE_VIEW/,
  );

  assert.match(
    pdfRoute,
    /renderInvoicePdf/,
  );

  assert.match(
    pdfRoute,
    /Content-Disposition/,
  );

  assert.match(
    pdfRoute,
    /attachment/,
  );

  assert.match(
    pdfRoute,
    /private, no-store, no-cache, must-revalidate/,
  );
});


test('Invoicing invoice lifecycle blocks draft delivery and exposes authenticated operator PDF controls', async () => {
  const [
    delivery,
    detail,
    workspace,
    pdfRoute,
    commands,
  ] = await Promise.all([
    source('lib/apps/invoicing/delivery.ts'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/api/apps/invoicing/[invoiceId]/pdf/route.ts'),
    source('lib/apps/invoicing/commands.ts'),
  ]);

  assert.match(
    delivery,
    /Confirm the invoice before sending it to the customer\./,
    'Draft invoices must never be promoted to sent through the delivery path.',
  );

  assert.doesNotMatch(
    delivery,
    /WHEN status IN \(\s*'draft',\s*'confirmed'/,
    'Delivery must not convert draft invoices directly to sent.',
  );

  assert.match(
    detail,
    /Print \/ PDF/,
  );

  assert.match(
    detail,
    /Download/,
  );

  assert.match(
    detail,
    /\/api\/apps\/invoicing\/.*\/pdf/,
  );

  assert.match(
    workspace,
    /Invoice register/,
  );

  assert.match(
    workspace,
    /All statuses/,
  );

  assert.match(
    workspace,
    /All balances/,
  );

  assert.match(
    workspace,
    /Highest balance/,
  );

  assert.match(
    workspace,
    /Duplicate as draft/,
  );

  assert.match(
    workspace,
    /Send overdue reminder/,
  );

  assert.match(
    pdfRoute,
    /INVOICE_VIEW/,
  );

  assert.match(
    pdfRoute,
    /renderInvoicePdf/,
  );

  assert.match(
    pdfRoute,
    /download/,
  );

  assert.match(
    commands,
    /FOR UPDATE/,
    'Invoice state transitions must lock the document before changing lifecycle state.',
  );
});


test('Invoicing builder persists service and shipping snapshots across internal, public and PDF views', async () => {
  const [
    composer,
    commands,
    queries,
    types,
    publicInvoice,
    publicPage,
    pdf,
    pdfRoute,
  ] = await Promise.all([
    source('app/apps/invoicing/InvoiceComposer.tsx'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/public.ts'),
    source('app/i/[tenantId]/[token]/page.tsx'),
    source('lib/apps/invoicing/pdf.ts'),
    source('app/api/apps/invoicing/[invoiceId]/pdf/route.ts'),
  ]);

  assert.match(composer, /Service \/ supply date/);
  assert.match(composer, /Ship-to address/);
  assert.match(composer, /shippingAddress/);
  assert.match(composer, /serviceDate/);

  assert.match(commands, /service_date/);
  assert.match(commands, /ship_to_address/);
  assert.match(commands, /shipping_address/);

  assert.match(queries, /i\.service_date/);
  assert.match(queries, /i\.ship_to_address/);
  assert.match(types, /serviceDate: string \| null;/);
  assert.match(types, /shippingAddress: string \| null;/);

  assert.match(publicInvoice, /i\.service_date/);
  assert.match(publicInvoice, /i\.ship_to_address/);
  assert.match(publicPage, /Service \/ supply date/);
  assert.match(publicPage, /Ship to/);

  assert.match(pdf, /Service date/);
  assert.match(pdf, /shippingAddress/);
  assert.match(pdfRoute, /serviceDate:/);
  assert.match(pdfRoute, /shippingAddress:/);
});


test('Invoicing v2.5 enforces a real approval and posting lifecycle', async () => {
  const [
    schema,
    migration,
    commands,
    composer,
    detail,
    workspace,
    automation,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.4.0-to-2.5.0.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('app/apps/invoicing/InvoiceComposer.tsx'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('lib/apps/invoicing/automation.ts'),
  ]);

  for (const sourceText of [
    schema,
    migration,
    commands,
  ]) {
    assert.match(
      sourceText,
      /pending_approval/,
    );

    assert.match(
      sourceText,
      /rejected/,
    );
  }

  assert.match(
    schema,
    /OLD\.status = 'draft'[\s\S]*'pending_approval'[\s\S]*OLD\.status = 'pending_approval'[\s\S]*'confirmed'[\s\S]*'rejected'/s,
    'Database status authority must understand approval submission and decisions.',
  );

  assert.match(
    schema,
    /OLD\.status = 'rejected'[\s\S]*'draft'[\s\S]*'pending_approval'/s,
    'Rejected invoices must be able to return to rework and approval.',
  );

  assert.match(
    commands,
    /'pending_approval',[\s\S]*'draft'[\s\S]*INVOICE_EDIT/s,
    'Submitting and returning an invoice for rework use invoice-edit authority.',
  );

  assert.match(
    commands,
    /'confirmed',[\s\S]*'rejected'[\s\S]*INVOICE_CONFIRM/s,
    'Approval and rejection use invoice-confirm authority.',
  );

  assert.match(
    commands,
    /Submit this invoice for approval before it can be posted\./,
  );

  assert.match(
    commands,
    /A rejection reason is required\./,
  );

  assert.match(
    commands,
    /FOR UPDATE/,
    'Lifecycle changes must remain serialized.',
  );

  assert.match(
    commands,
    /next ===[\s\S]*'confirmed'[\s\S]*postInvoiceConfirmationToAccounting/s,
    'Accounting posting only occurs when the invoice reaches the posted state.',
  );

  assert.match(
    commands,
    /'draft',[\s\S]*'pending_approval',[\s\S]*'rejected',[\s\S]*'paid'/s,
    'Payment posting must reject non-posted approval states.',
  );

  assert.match(
    commands,
    /A credit note cannot be issued for this invoice state\./,
  );

  assert.match(
    composer,
    /Save & submit for approval/,
  );

  assert.match(
    detail,
    /Submit for approval/,
  );

  assert.match(
    detail,
    /Approve & post/,
  );

  assert.match(
    detail,
    /Reject for rework/,
  );

  assert.match(
    detail,
    /Return to draft/,
  );

  assert.match(
    workspace,
    /Pending approval/,
  );

  assert.match(
    workspace,
    /Approve & post/,
  );

  assert.match(
    workspace,
    /Return to draft/,
  );

  assert.match(
    automation,
    /invoicing\.invoice\.approval_submitted/,
  );

  assert.match(
    automation,
    /invoicing\.invoice\.approval_rejected/,
  );

  assert.match(
    schema,
    /WHEN i\.status IN \('draft','pending_approval','rejected','cancelled','void','written_off'\)[\s\S]*THEN 0::numeric\(19,4\)/s,
    'Unposted and terminal documents must not contribute a receivable balance.',
  );

  assert.match(
    schema,
    /status NOT IN \('draft','pending_approval','rejected','cancelled','void'\)/,
    'Monthly billing must exclude documents that have never been posted.',
  );

  assert.match(
    schema,
    /invoicing_customer_balances[\s\S]*'draft','pending_approval','rejected','cancelled','void'/s,
    'Customer balances must exclude documents that have never been posted.',
  );

  const [
    queries,
    worker,
    aiTools,
  ] = await Promise.all([
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/worker.ts'),
    source('lib/apps/invoicing/ai-tools.ts'),
  ]);

  assert.match(
    queries,
    /AS invoiced_total[\s\S]*pending_approval|pending_approval[\s\S]*AS invoiced_total/s,
    'Dashboard invoiced totals must exclude unposted approval documents.',
  );

  assert.match(
    queries,
    /AS paid_total[\s\S]*pending_approval|pending_approval[\s\S]*AS paid_total/s,
    'Dashboard collected totals must exclude unposted approval documents.',
  );

  assert.match(
    worker,
    /s\.require_approval/,
    'Recurring generation must read the company approval policy.',
  );

  assert.match(
    worker,
    /recurringInvoiceStatus[\s\S]*pending_approval[\s\S]*confirmed/s,
    'Recurring invoices must enter approval instead of posting automatically when approval is enabled.',
  );

  assert.match(
    worker,
    /postInvoiceConfirmationToAccounting/,
    'A recurring invoice that is posted must use the normal accounting posting bridge.',
  );

  assert.match(
    worker,
    /recurringInvoiceStatus ===[\s\S]*'confirmed'[\s\S]*autoSend|autoSend:[\s\S]*recurringInvoiceStatus[\s\S]*'confirmed'/s,
    'Recurring auto-delivery must not send documents still awaiting approval.',
  );

  assert.match(
    worker,
    /'draft',[\s\S]*'pending_approval',[\s\S]*'rejected',[\s\S]*'paid'/s,
    'Reminder jobs must explicitly exclude unposted approval states.',
  );

  assert.match(
    aiTools,
    /Post or approve invoice/,
    'SaMi AI invoice wording must respect the approval-aware lifecycle.',
  );
});


test('Invoicing v2.6 separates cash receipts from allocation and reconciliation', async () => {
  const [
    schema,
    migration,
    commands,
    accounting,
    queries,
    types,
    workspace,
    detail,
    route,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.5.0-to-2.6.0.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/accounting.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
    source('app/api/apps/invoicing/route.ts'),
  ]);

  for (const field of [
    'idempotency_key',
    'accounting_model',
    'reconciled_at',
    'reconciliation_reference',
    'operation_key',
    'reversal_reason',
  ]) {
    assert.match(
      schema,
      new RegExp(field),
      'Payment schema must include ' + field + '.',
    );
  }

  assert.match(
    schema,
    /accounting_model[\s\S]*legacy_direct_ar[\s\S]*customer_credit/s,
    'The schema must preserve legacy receipt accounting while defaulting new receipts to customer credit.',
  );

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS accounting_model[\s\S]*DEFAULT 'legacy_direct_ar'/s,
    'Existing receipts must be marked as legacy direct-AR during migration.',
  );

  assert.match(
    migration,
    /ALTER COLUMN accounting_model SET DEFAULT 'customer_credit'/,
    'New receipts must use the customer-credit accounting model.',
  );

  assert.match(
    schema,
    /CREATE TABLE IF NOT EXISTS public\.invoicing_payment_refunds/,
  );

  assert.match(
    schema,
    /CREATE OR REPLACE VIEW public\.invoicing_payment_balances/,
  );

  assert.match(
    schema,
    /a\.status = 'posted'[\s\S]*p\.status = 'posted'/s,
    'Receivable views must ignore reversed payment allocations.',
  );

  for (const command of [
    'recordCustomerPayment',
    'recordInvoicePayment',
    'allocateInvoicePayment',
    'reverseInvoicePaymentAllocation',
    'reconcileInvoicePayment',
    'refundInvoicePayment',
    'reverseInvoicePaymentRefund',
    'reverseInvoicePayment',
  ]) {
    assert.match(
      commands,
      new RegExp('export async function ' + command),
      command + ' must be implemented by the Invoicing payment authority.',
    );
  }

  assert.match(
    commands,
    /Math\.min\([\s\S]*paymentAmount[\s\S]*balance/s,
    'Invoice-level receipt entry must allocate only the invoice balance and preserve any overpayment.',
  );

  assert.match(
    commands,
    /unappliedAmount[\s\S]*paymentAmount[\s\S]*allocationAmount/s,
    'Overpayment must remain visible as unapplied customer credit.',
  );

  assert.match(
    commands,
    /Allocation exceeds the unapplied payment balance\./,
  );

  assert.match(
    commands,
    /This payment belongs to a different customer\./,
    'A customer receipt must never be allocated across customer boundaries.',
  );

  assert.match(
    commands,
    /Payment currency must match the invoice currency\./,
  );

  assert.match(
    commands,
    /This legacy payment allocation must be corrected by reversing the original payment\./,
    'Legacy direct-AR allocations must not be individually unallocated.',
  );

  assert.match(
    commands,
    /Only the unapplied portion of a payment can be refunded\./,
  );

  assert.match(
    commands,
    /Reverse posted refunds before reversing the original payment\.|Reverse or settle posted refunds before reversing the original payment\./,
    'Whole-receipt reversal must not bypass posted refunds.',
  );

  assert.match(
    accounting,
    /customer_credit/,
  );

  assert.match(
    accounting,
    /postInvoicePaymentAllocationToAccounting/,
  );

  assert.match(
    accounting,
    /postInvoicePaymentRefundToAccounting/,
  );

  assert.match(
    accounting,
    /Unapplied customer receipt/,
  );

  assert.match(
    queries,
    /allocated_amount/,
  );

  assert.match(
    queries,
    /refunded_amount/,
  );

  assert.match(
    queries,
    /unapplied_amount/,
  );

  assert.match(
    queries,
    /reconciled_at/,
  );

  assert.match(
    queries,
    /JSONB_AGG[\s\S]*invoicing_payment_allocations/s,
    'Payment register must return allocation detail, not only invoice labels.',
  );

  assert.match(
    queries,
    /JSONB_AGG[\s\S]*invoicing_payment_refunds/s,
    'Payment register must return refund detail.',
  );

  assert.match(
    types,
    /allocatedAmount: number;/,
  );

  assert.match(
    types,
    /unappliedAmount: number;/,
  );

  assert.match(
    types,
    /reconciledAt: string \| null;/,
  );

  for (const action of [
    'record_customer_payment',
    'allocate_payment',
    'reverse_payment_allocation',
    'reconcile_payment',
    'refund_payment',
    'reverse_payment_refund',
    'reverse_payment',
  ]) {
    assert.match(
      route,
      new RegExp("case '" + action + "'"),
      action + ' must be exposed through the authoritative Invoicing API route.',
    );
  }

  assert.match(
    workspace,
    /Receive customer payment/,
  );

  assert.match(
    workspace,
    /Allocate balance/,
  );

  assert.match(
    workspace,
    /Refund unapplied money/,
  );

  assert.match(
    workspace,
    /Reconcile receipt/,
  );

  assert.match(
    workspace,
    /Reverse entire receipt/,
  );

  assert.match(
    detail,
    /reverse_payment_allocation/,
    'Invoice detail may reverse its allocation but must not silently reverse a multi-invoice receipt.',
  );

  assert.match(
    detail,
    /excess as unapplied customer credit/,
    'Invoice-level overpayments must be explained to the operator.',
  );
});
