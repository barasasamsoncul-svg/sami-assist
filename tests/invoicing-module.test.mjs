import test from 'node:test';
import assert from 'node:assert/strict';

// Invoicing 2.6 payment baseline validation marker.
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
    /version:\s*['"]2\.17\.0['"]/,
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
    /ensurePrimaryInvoiceDocumentSnapshot/,
    'Delivery must resolve the immutable issued document directly without invoking a customer-view path.',
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

test('Invoicing workspace exposes operational Odoo/Zoho-class surfaces as standalone routes rather than one stacked page', async () => {
  const [
    page,
    sectionPage,
    newInvoicePage,
    invoiceRegisterPage,
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
        'app/apps/invoicing/InvoicingSectionPage.tsx',
      ),
      source(
        'app/apps/invoicing/new/page.tsx',
      ),
      source(
        'app/apps/invoicing/invoices/page.tsx',
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
    sectionPage,
    /InvoicingModuleShell/,
  );

  assert.doesNotMatch(
    sectionPage,
    /AppSurfaceShell/,
    'Invoicing must keep its own full module shell rather than the generic app-surface grid.',
  );

  assert.match(
    page,
    /view="dashboard"/,
  );

  assert.match(
    newInvoicePage,
    /view="newInvoice"/,
  );

  assert.match(
    invoiceRegisterPage,
    /view="invoices"/,
  );

  for (
    const route
    of [
      '/apps/invoicing/new',
      '/apps/invoicing/invoices',
      '/apps/invoicing/customers/new',
      '/apps/invoicing/customers',
      '/apps/invoicing/items/new',
      '/apps/invoicing/items',
      '/apps/invoicing/payments/new',
      '/apps/invoicing/payments',
      '/apps/invoicing/currencies',
      '/apps/invoicing/tax-engine',
      '/apps/invoicing/retainers',
      '/apps/invoicing/payment-plans',
      '/apps/invoicing/recurring',
      '/apps/invoicing/reminders',
      '/apps/invoicing/portal',
      '/apps/invoicing/reports',
      '/apps/invoicing/settings',
    ]
  ) {
    assert.ok(
      sectionPage.includes(
        route,
      ),
      route +
        ' must be a first-class Invoicing route.',
    );
  }

  assert.match(
    client,
    /view ===\s*'newInvoice'[\s\S]*<InvoiceComposer/s,
    'Create Invoice must render on its dedicated new-invoice route.',
  );

  const invoiceRegisterStart =
    client.indexOf(
      'function Invoices(',
    );

  assert.ok(
    invoiceRegisterStart >
      -1,
  );

  const invoiceRegister =
    client.slice(
      invoiceRegisterStart,
    );

  assert.doesNotMatch(
    invoiceRegister,
    /<details[\s\S]{0,1500}<InvoiceComposer/s,
    'Invoice Register must not stack the Create Invoice composer above the register.',
  );

  for (
    const surface
    of [
      'Invoice register',
      'Customers',
      'Items',
      'Payments',
      'Currency Center',
      'Tax engine',
      'Retainers',
      'Payment plans',
      'Recurring',
      'Reminders',
      'Customer portal',
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

  const recurringMigration =
    await source(
      'lib/apps/invoicing/migrations/2.6.0-to-2.7.0.ts',
    );

  assert.match(
    recurringMigration,
    /fromVersion:\s*['"]2\.6\.0['"]/,
  );

  assert.match(
    recurringMigration,
    /toVersion:\s*['"]2\.7\.0['"]/,
  );

  assert.match(
    recurringMigration,
    /CREATE TABLE IF NOT EXISTS public\.invoicing_recurring_runs/,
  );

  assert.match(
    recurringMigration,
    /max_occurrences/,
  );

  assert.match(
    recurringMigration,
    /consecutive_failures/,
  );

  assert.match(
    recurringMigration,
    /retry_after/,
  );

  assert.match(
    recurringMigration,
    /uq_invoicing_recurring_generated_invoice/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_6_0_TO_2_7_0/,
  );

  const dunningMigration =
    await source(
      'lib/apps/invoicing/migrations/2.7.0-to-2.8.0.ts',
    );

  assert.match(
    dunningMigration,
    /fromVersion:\s*['"]2\.7\.0['"]/,
  );

  assert.match(
    dunningMigration,
    /toVersion:\s*['"]2\.8\.0['"]/,
  );

  assert.match(
    dunningMigration,
    /CREATE TABLE IF NOT EXISTS public\.invoicing_dunning_policies/,
  );

  assert.match(
    dunningMigration,
    /CREATE TABLE IF NOT EXISTS public\.invoicing_dunning_stages/,
  );

  assert.match(
    dunningMigration,
    /retry_delay_minutes/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_7_0_TO_2_8_0/,
  );

  const portalMigration =
    await source(
      'lib/apps/invoicing/migrations/2.8.0-to-2.9.0.ts',
    );

  assert.match(
    portalMigration,
    /fromVersion:\s*['"]2\.8\.0['"]/,
  );

  assert.match(
    portalMigration,
    /toVersion:\s*['"]2\.9\.0['"]/,
  );

  assert.match(
    portalMigration,
    /CREATE TABLE IF NOT EXISTS public\.invoicing_portal_access/,
  );

  assert.match(
    portalMigration,
    /CREATE TABLE IF NOT EXISTS public\.invoicing_portal_messages/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_8_0_TO_2_9_0/,
  );

  const documentSnapshotMigration =
    await source(
      'lib/apps/invoicing/migrations/2.9.0-to-2.10.0.ts',
    );

  assert.match(
    documentSnapshotMigration,
    /fromVersion:\s*['"]2\.9\.0['"]/,
  );

  assert.match(
    documentSnapshotMigration,
    /toVersion:\s*['"]2\.10\.0['"]/,
  );

  assert.match(
    documentSnapshotMigration,
    /CREATE TABLE IF NOT EXISTS public\.invoicing_document_snapshots/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_9_0_TO_2_10_0/,
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

  assert.doesNotMatch(
    delivery,
    /getPublicInvoice/,
    'Provider-side delivery must not reopen the public invoice view just to render a PDF.',
  );

  assert.match(
    delivery,
    /ensurePrimaryInvoiceDocumentSnapshot/,
    'Provider-side delivery must use the immutable issued document without customer-view side effects.',
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
    creditLifecycle,
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
    source('app/apps/invoicing/[invoiceId]/CreditNoteLifecyclePanel.tsx'),
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
  assert.match(workspace, /Reverse entire receipt/);
  assert.match(workspace, /reverse_payment_allocation/);
  assert.match(workspace, /payment\.status/);
  assert.match(detail, /action:\s*'reverse_payment_allocation'/);
  assert.match(detail, /CreditNoteLifecyclePanel/);
  assert.match(creditLifecycle, /action:\s*'cancel_credit_note'/);
  assert.match(detail, /allowCreditNotes/);
  assert.match(detail, /allowPartialPayments/);
  assert.match(composer, /!data\.settings\.requireApproval/);
});


test('Workspace tutorials are reusable across modules and Invoicing ships complete guided flows', async () => {
  const [
    tutorial,
    shell,
    page,
    sectionPage,
    workspace,
    detailPage,
    detail,
  ] = await Promise.all([
    source('app/components/workspace/WorkspaceTutorial.tsx'),
    source('app/components/workspace/WorkspaceShell.tsx'),
    source('app/apps/invoicing/page.tsx'),
    source('app/apps/invoicing/InvoicingSectionPage.tsx'),
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

  assert.match(page, /InvoicingSectionPage/);
  assert.match(sectionPage, /userId=\{/);
  assert.match(workspace, /INVOICING_TUTORIAL_STEPS/);
  assert.match(workspace, /moduleKey="invoicing"/);
  assert.match(workspace, /Create invoice/);
  assert.match(workspace, /Invoice register/);
  assert.match(workspace, /Items & pricing/);
  assert.match(workspace, /Recurring billing/);
  assert.match(workspace, /startWorkspaceTutorial/);

  for (const section of [
    'dashboard',
    'invoices',
    'customers',
    'items',
    'payments',
    'retainers',
    'paymentPlans',
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
    /status =\s*CASE[\s\S]*WHEN \$4::boolean[\s\S]*THEN 'sent'[\s\S]*ELSE 'failed'/,
    'Reminder delivery status must use one explicit boolean outcome across sent/failed branches.',
  );
});


test('Invoicing rejects stale master-data references and preserves a draft invoice template while editing', async () => {
  const [
    commands,
    taxEngine,
    queries,
    types,
    composer,
  ] = await Promise.all([
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/tax-engine.ts'),
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
    taxEngine,
    /The selected tax rate is inactive or outside its validity period\./,
    'A stale, cross-company or expired tax rate must be rejected by the authoritative Part 15 tax resolver before invoice insert.',
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
    sectionPage,
  ] = await Promise.all([
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/InvoicingSectionPage.tsx'),
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
    sectionPage,
    /buildInvoicingSidebarItems/,
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
      sectionPage,
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

  assert.doesNotMatch(
    migration,
    /ALTER COLUMN accounting_model SET DEFAULT 'customer_credit'/,
    'The upgrade must leave the database default on legacy_direct_ar until the 2.6 application code is live.',
  );

  assert.match(
    commands,
    /accounting_model[\s\S]*'customer_credit'[\s\S]*'posted'/s,
    'The 2.6 payment authority must explicitly tag new receipts as customer_credit so migration-before-deploy is safe.',
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
    queries,
    /dateOnlyValue\([\s\S]*row\.month/s,
    'Monthly dashboard dates must be serialized as stable date-only values before crossing the server/client boundary.',
  );

  assert.match(
    workspace,
    /function monthLabel\([\s\S]*Number\.isNaN\([\s\S]*parsed\.getTime\(\)/s,
    'The Invoicing dashboard must defensively handle malformed monthly date values instead of crashing the Apps route.',
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
    'unreconcileInvoicePayment',
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
    /recordInvoicePayment[\s\S]*idempotencyKey[\s\S]*invoicing-payment-idempotency/s,
    'Invoice-specific payment posting must support idempotent API retries.',
  );

  assert.match(
    commands,
    /idempotency_key[\s\S]*'customer_credit'[\s\S]*'posted'/s,
    'New invoice-level receipts must persist the idempotency key with the customer-credit accounting model.',
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
    /allow_cross_currency_payments/,
    'Part 14 may extend the Part 6 allocation authority across currencies only behind an explicit company control.',
  );

  assert.match(
    commands,
    /paymentAmount[\s\S]*paymentExchangeRate[\s\S]*invoiceAmount[\s\S]*invoiceExchangeRate/s,
    'Cross-currency allocation must preserve both the payment-side and invoice-side values instead of treating unlike currencies as equal.',
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

  for (const reconciliationFreeze of [
    'Unreconcile this payment before changing its invoice allocations.',
    'Unreconcile this payment before reversing an allocation.',
    'Unreconcile this payment before refunding any unapplied amount.',
    'Unreconcile this payment before reversing the receipt.',
    'Unreconcile the original payment before reversing its refund.',
  ]) {
    assert.ok(
      commands.includes(
        reconciliationFreeze,
      ),
      reconciliationFreeze,
    );
  }

  assert.match(
    commands,
    /An unreconciliation reason is required\./,
    'Reconciliation must be explicitly undone with an auditable reason before financial corrections.',
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

  const automation =
    await source(
      'lib/apps/invoicing/automation.ts',
    );

  for (const paymentEvent of [
    'invoicing.payment.allocated',
    'invoicing.payment.allocation_reversed',
    'invoicing.payment.reconciled',
    'invoicing.payment.unreconciled',
    'invoicing.payment.refunded',
    'invoicing.payment.refund_reversed',
  ]) {
    assert.ok(
      automation.includes(
        paymentEvent,
      ),
      paymentEvent +
      ' must be registered as an Invoicing automation trigger.',
    );

    assert.ok(
      commands.includes(
        paymentEvent,
      ),
      paymentEvent +
      ' must be emitted by the authoritative payment command.',
    );
  }

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
    'unreconcile_payment',
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
    /financial edits locked/,
    'The payment operator must explain that reconciliation freezes allocation, refund and reversal changes.',
  );

  assert.match(
    workspace,
    /Unreconcile/,
    'The payment operator must expose a reasoned unreconciliation workflow.',
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
    /Reconciled receipt: financial corrections are locked\./,
    'Invoice detail must surface the same reconciliation lock as the Payments workspace.',
  );

  assert.match(
    queries,
    /p\.reconciled_at[\s\S]*allocation_id/s,
    'Invoice detail payment history must carry reconciliation state from the authoritative receipt.',
  );

  assert.match(
    types,
    /reconciledAt: string \| null;/,
  );

  assert.match(
    detail,
    /excess as unapplied customer credit/,
    'Invoice-level overpayments must be explained to the operator.',
  );
});



test('Invoicing v2.7 turns recurring invoices into an observable retry-safe billing engine', async () => {
  const [
    schema,
    migration,
    commands,
    worker,
    queries,
    types,
    service,
    route,
    workspace,
    runtimeMigrations,
    manifest,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.6.0-to-2.7.0.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/worker.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*["']invoicing["'][\s\S]*version:\s*['"]2\.17\.0['"]/s,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_6_0_TO_2_7_0/,
  );

  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.invoicing_recurring_runs/,
  );

  for (const field of [
    'max_occurrences',
    'run_count',
    'consecutive_failures',
    'max_retry_attempts',
    'last_success_at',
    'last_failure_at',
    'retry_after',
    'last_error_code',
    'completion_reason',
  ]) {
    assert.match(
      schema,
      new RegExp(field),
      'Recurring schema must include ' + field + '.',
    );
  }

  assert.match(
    schema,
    /UNIQUE\(recurring_template_id, scheduled_for\)/,
    'Each schedule occurrence must have one canonical run ledger record.',
  );

  assert.match(
    schema,
    /uq_invoicing_recurring_generated_invoice/,
    'Generated recurring invoices must be idempotent per run key.',
  );

  for (const command of [
    'createRecurringInvoiceTemplate',
    'updateRecurringInvoiceTemplate',
    'setRecurringInvoiceTemplateStatus',
    'retryRecurringInvoiceTemplate',
  ]) {
    assert.match(
      commands,
      new RegExp('export async function ' + command),
      command + ' must be owned by the Invoicing recurring authority.',
    );
  }

  assert.match(
    commands,
    /Maximum occurrences cannot be lower than invoices already generated\./,
  );

  assert.match(
    commands,
    /Completed or cancelled recurring schedules are final\./,
  );

  assert.match(
    commands,
    /recurring\.retry_requested/,
  );

  assert.match(
    worker,
    /invoicing_recurring_runs/,
  );

  assert.match(
    worker,
    /recurringRunKey/,
  );

  assert.match(
    worker,
    /retry_after[\s\S]*NOW\(\)/s,
  );

  assert.match(
    worker,
    /MAX_RETRY_ATTEMPTS/,
  );

  assert.match(
    worker,
    /max_occurrences_reached/,
    'Recovered successful recurring runs must still complete schedules that reached their occurrence limit.',
  );

  assert.match(
    worker,
    /end_date_reached/,
    'Recovered successful recurring runs must still honor schedule end dates.',
  );

  assert.match(
    worker,
    /continue;/,
    'One failed recurring schedule must not block the remaining tenant schedules.',
  );

  assert.match(
    worker,
    /delivery_status[\s\S]*'sent'/s,
  );

  assert.match(
    queries,
    /recent_runs/,
  );

  assert.match(
    queries,
    /last_invoice_number/,
  );

  assert.match(
    types,
    /InvoicingRecurringRunSummary/,
  );

  assert.match(
    types,
    /consecutiveFailures/,
  );

  assert.match(
    service,
    /retryRecurringInvoiceTemplate/,
  );

  assert.match(
    route,
    /case 'retry_recurring'/,
  );

  for (const visibleControl of [
    'Maximum invoices',
    'Retry attempts before auto-pause',
    'Schedules needing attention',
    'Recent runs',
    'Retry failed run',
    'Latest recurring error',
  ]) {
    assert.ok(
      workspace.includes(
        visibleControl,
      ),
      visibleControl + ' must be visible in the recurring workspace.',
    );
  }

  assert.match(
    workspace,
    /\/apps\/invoicing\/['"]?\s*\+/,
    'Recurring run history must link generated invoices back to their documents.',
  );
});



test('Invoicing v2.8 turns reminders into a staged auditable dunning engine', async () => {
  const [
    schema,
    migration,
    context,
    commands,
    worker,
    queries,
    types,
    service,
    route,
    workspace,
    runtimeMigrations,
    manifest,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.7.0-to-2.8.0.ts'),
    source('lib/apps/invoicing/context.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/worker.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*["']invoicing["'][\s\S]*version:\s*['"]2\.17\.0['"]/s,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_7_0_TO_2_8_0/,
  );

  for (const table of [
    'invoicing_dunning_policies',
    'invoicing_dunning_stages',
    'invoicing_reminders',
  ]) {
    assert.match(
      schema,
      new RegExp(table),
      table + ' must be owned by Invoicing 2.8.',
    );
  }

  for (const field of [
    'reminder_mode',
    'reminder_pause_until',
    'dunning_policy_id',
    'dunning_stage_id',
    'attempt_count',
    'max_attempts',
    'next_attempt_at',
    'failure_message',
  ]) {
    assert.match(
      migration,
      new RegExp(field),
      'Dunning migration must include ' + field + '.',
    );
  }

  assert.match(
    migration,
    /migratedFromLegacyReminderSettings/,
    'Existing reminder settings must seed the default 2.8 policy.',
  );

  assert.match(
    context,
    /Standard payment follow-up/,
    'Fresh workspaces must receive a default dunning policy.',
  );

  assert.match(
    context,
    /overdue_14/,
    'Fresh workspaces must receive the standard staged collection sequence.',
  );

  for (const command of [
    'sendInvoiceReminder',
    'setInvoiceReminderControl',
    'setCustomerReminderControl',
    'retryInvoiceReminder',
    'saveDunningPolicy',
  ]) {
    assert.match(
      commands,
      new RegExp('export async function ' + command),
      command + ' must be a real Invoicing command.',
    );
  }

  assert.match(
    commands,
    /source[\s\S]*'manual'/s,
    'Manual reminders must enter the same audit ledger.',
  );

  assert.match(
    worker,
    /invoicing_dunning_policies/,
  );

  assert.match(
    worker,
    /invoicing_dunning_stages/,
  );

  assert.match(
    worker,
    /retry_delay_minutes/,
  );

  assert.match(
    worker,
    /effectiveMode/,
    'Worker must honor invoice/customer reminder controls.',
  );

  assert.match(
    worker,
    /status[\s\S]*'sending'/s,
    'Reminder attempts must claim work before delivery.',
  );

  assert.match(
    worker,
    /next_attempt_at/,
    'Failed reminders must have a retry schedule.',
  );

  assert.match(
    queries,
    /dunningPolicies/,
  );

  assert.match(
    queries,
    /reminders:/,
  );

  assert.match(
    types,
    /InvoicingDunningPolicySummary/,
  );

  assert.match(
    types,
    /InvoicingReminderSummary/,
  );

  for (const exported of [
    'saveDunningPolicy',
    'retryInvoiceReminder',
    'setCustomerReminderControl',
    'setInvoiceReminderControl',
  ]) {
    assert.match(
      service,
      new RegExp(exported),
    );
  }

  for (const action of [
    'retry_reminder',
    'set_invoice_reminder_control',
    'set_customer_reminder_control',
    'save_dunning_policy',
  ]) {
    assert.match(
      route,
      new RegExp("case '" + action + "'"),
    );
  }

  for (const visibleControl of [
    'Reminders & dunning',
    'Dunning policy',
    'Invoice collection controls',
    'Customer reminder controls',
    'Reminder delivery history',
    'Retry delay min',
  ]) {
    assert.ok(
      workspace.includes(
        visibleControl,
      ),
      visibleControl + ' must be visible in the dunning workspace.',
    );
  }

  assert.match(
    manifest,
    /key:\s*"dunning_policy"[\s\S]*table:\s*"invoicing_dunning_policies"/s,
  );

  assert.match(
    manifest,
    /key:\s*"reminder"[\s\S]*table:\s*"invoicing_reminders"/s,
  );
});



test('Invoicing Part 8 builds a customer-scoped secure portal', async () => {
  const [
    schema,
    migration,
    commands,
    portal,
    queries,
    types,
    service,
    route,
    publicRoute,
    portalPage,
    portalInvoice,
    portalPdf,
    portalForm,
    workspace,
    runtimeMigrations,
    manifest,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.8.0-to-2.9.0.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/portal.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('app/api/public/invoicing/portal/[tenantId]/[token]/route.ts'),
    source('app/p/[tenantId]/[token]/page.tsx'),
    source('app/p/[tenantId]/[token]/invoices/[invoiceId]/page.tsx'),
    source('app/p/[tenantId]/[token]/invoices/[invoiceId]/pdf/route.ts'),
    source('app/p/[tenantId]/[token]/CustomerPortalMessageForm.tsx'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*["']invoicing["'][\s\S]*version:\s*['"]2\.17\.0['"]/s,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_8_0_TO_2_9_0/,
  );

  for (const table of [
    'invoicing_portal_access',
    'invoicing_portal_messages',
    'invoicing_portal_events',
  ]) {
    assert.match(
      schema,
      new RegExp(table),
      table + ' must belong to the Invoicing customer portal boundary.',
    );
  }

  for (const setting of [
    'portal_enabled',
    'portal_access_days',
    'portal_allow_messages',
    'portal_show_payment_history',
    'portal_show_credit_notes',
  ]) {
    assert.match(
      migration,
      new RegExp(setting),
      'Part 8 migration must include ' + setting + '.',
    );
  }

  assert.match(
    migration,
    /UNIQUE\(token_hash\)/,
    'Portal raw tokens must never be stored and hashed tokens must be unique.',
  );

  assert.match(
    migration,
    /uq_invoicing_portal_access_customer_active/,
    'Each customer must have at most one active portal credential.',
  );

  assert.match(
    migration,
    /uq_invoicing_portal_message_idempotency/,
    'Portal message retries must be idempotent.',
  );

  assert.match(
    migration,
    /promised_amount/,
  );

  assert.match(
    migration,
    /promised_date/,
  );

  for (const command of [
    'issueCustomerPortalAccess',
    'revokeCustomerPortalAccess',
    'resolveCustomerPortalMessage',
    'replyCustomerPortalMessage',
  ]) {
    assert.match(
      commands,
      new RegExp('export async function ' + command),
      command + ' must be an authenticated operator command.',
    );
  }

  assert.match(
    commands,
    /randomBytes[\s\S]*32[\s\S]*base64url/s,
    'Portal access must use a high-entropy random credential.',
  );

  assert.match(
    commands,
    /createHash[\s\S]*sha256/s,
    'Only a one-way portal token hash may be persisted.',
  );

  assert.match(
    commands,
    /UPDATE invoicing_portal_access[\s\S]*status =[\s\S]*'revoked'[\s\S]*INSERT INTO invoicing_portal_access/s,
    'Reissuing access must revoke the previous active credential first.',
  );

  assert.match(
    commands,
    /sendWorkspaceNotificationEmail/,
    'Portal access and staff replies must use the shared SaMi email transport.',
  );

  assert.match(
    commands,
    /portal_access_days/,
    'Portal settings must control credential lifetime.',
  );

  for (const publicAuthority of [
    'requirePortalAccess',
    'getCustomerPortal',
    'getCustomerPortalInvoice',
    'submitCustomerPortalMessage',
  ]) {
    assert.match(
      portal,
      new RegExp(publicAuthority),
    );
  }

  assert.match(
    portal,
    /token_hash[\s\S]*status =[\s\S]*'active'/s,
    'Every portal request must authenticate against an active hashed credential.',
  );

  assert.match(
    portal,
    /expires_at/,
    'Portal access must expire.',
  );

  assert.match(
    portal,
    /customer_id =[\s\S]*\$3[\s\S]*status =[\s\S]*ANY/s,
    'Portal invoice reads must remain customer-scoped and state-scoped.',
  );

  for (const hiddenStatus of [
    'draft',
    'pending_approval',
    'rejected',
    'confirmed',
  ]) {
    assert.ok(
      !portal
        .match(
          /CUSTOMER_VISIBLE_INVOICE_STATUSES = \[([\s\S]*?)\] as const/,
        )?.[1]
        .includes(
          "'" + hiddenStatus + "'",
        ),
      hiddenStatus + ' must not be exposed by the customer portal invoice list.',
    );
  }

  assert.match(
    portal,
    /INTERVAL '10 minutes'/,
    'Public portal messaging must be rate limited.',
  );

  assert.match(
    portal,
    /idempotency_key/,
    'Public portal messaging must deduplicate client retries.',
  );

  assert.match(
    portal,
    /payment_promise/,
  );

  assert.match(
    portal,
    /portal\.pdf_downloaded/,
  );

  assert.match(
    queries,
    /portalAccess:/,
  );

  assert.match(
    queries,
    /portalMessages:/,
  );

  assert.match(
    types,
    /InvoicingPortalAccessSummary/,
  );

  assert.match(
    types,
    /InvoicingPortalMessageSummary/,
  );

  for (const exported of [
    'getCustomerPortal',
    'getCustomerPortalInvoice',
    'submitCustomerPortalMessage',
    'issueCustomerPortalAccess',
  ]) {
    assert.match(
      service,
      new RegExp(exported),
    );
  }

  for (const action of [
    'issue_customer_portal',
    'revoke_customer_portal',
    'resolve_customer_portal_message',
    'reply_customer_portal_message',
  ]) {
    assert.match(
      route,
      new RegExp("case '" + action + "'"),
    );
  }

  assert.match(
    publicRoute,
    /submitCustomerPortalMessage/,
  );

  assert.match(
    publicRoute,
    /Cache-Control[\s\S]*no-store/s,
  );

  for (const visiblePortalSurface of [
    'Customer portal',
    'Outstanding',
    'Payment history',
    'Credits',
    'Billing messages',
  ]) {
    assert.ok(
      portalPage.includes(
        visiblePortalSurface,
      ),
      visiblePortalSurface + ' must be visible in the public customer portal.',
    );
  }

  assert.match(
    portalInvoice,
    /Back to customer portal/,
  );

  assert.match(
    portalPdf,
    /getCustomerPortalInvoice/,
  );

  assert.match(
    portalPdf,
    /portal\.pdf_downloaded/,
  );

  assert.match(
    portalForm,
    /payment_promise/,
  );

  assert.match(
    portalForm,
    /randomUUID/,
  );

  for (const operatorControl of [
    'Customer access',
    'Customer message inbox',
    'Reissue access',
    'Reply & resolve',
    'Portal message history',
  ]) {
    assert.ok(
      workspace.includes(
        operatorControl,
      ),
      operatorControl + ' must be available to Invoicing operators.',
    );
  }

  assert.match(
    workspace,
    /portalAccessDays/,
  );

  assert.match(
    workspace,
    /portalShowPaymentHistory/,
  );

  assert.match(
    manifest,
    /key:\s*"portal_access"[\s\S]*table:\s*"invoicing_portal_access"/s,
  );

  assert.match(
    manifest,
    /key:\s*"portal_message"[\s\S]*table:\s*"invoicing_portal_messages"/s,
  );
});



test('Invoicing Part 9 freezes issued invoice PDFs as immutable document snapshots', async () => {
  const [
    schema,
    migration,
    commands,
    delivery,
    snapshots,
    pdf,
    queries,
    types,
    workspacePdf,
    publicPdf,
    portalPdf,
    exactSnapshotPdf,
    detail,
    runtimeMigrations,
    manifest,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.9.0-to-2.10.0.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/delivery.ts'),
    source('lib/apps/invoicing/document-snapshots.ts'),
    source('lib/apps/invoicing/pdf.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('app/api/apps/invoicing/[invoiceId]/pdf/route.ts'),
    source('app/i/[tenantId]/[token]/pdf/route.ts'),
    source('app/p/[tenantId]/[token]/invoices/[invoiceId]/pdf/route.ts'),
    source('app/api/apps/invoicing/[invoiceId]/snapshots/[snapshotId]/pdf/route.ts'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*["']invoicing["'][\s\S]*version:\s*['"]2\.17\.0['"]/s,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_9_0_TO_2_10_0/,
  );

  assert.match(
    migration,
    /fromVersion:\s*['"]2\.9\.0['"]/,
  );

  assert.match(
    migration,
    /toVersion:\s*['"]2\.10\.0['"]/,
  );

  assert.match(
    schema,
    /CREATE TABLE IF NOT EXISTS public\.invoicing_document_snapshots/,
  );

  for (const field of [
    'version_no',
    'is_primary',
    'snapshot_reason',
    'renderer_version',
    'payload_sha256',
    'pdf_bytes',
    'pdf_sha256',
    'pdf_size_bytes',
  ]) {
    assert.match(
      migration,
      new RegExp(field),
      'Document snapshot migration must include ' + field + '.',
    );
  }

  assert.match(
    migration,
    /invoice_id UUID NOT NULL REFERENCES public\.invoicing_invoices\(id\) ON DELETE RESTRICT/,
    'Issued document retention must prevent invoice deletion from silently removing archived PDFs.',
  );

  assert.match(
    migration,
    /UNIQUE\(invoice_id, version_no\)/,
  );

  assert.match(
    migration,
    /UNIQUE\(invoice_id, pdf_sha256\)/,
  );

  assert.match(
    migration,
    /uq_invoicing_document_snapshot_primary/,
    'Each invoice must have one canonical primary issued document.',
  );

  assert.match(
    migration,
    /document_snapshot_id UUID[\s\S]*REFERENCES public\.invoicing_document_snapshots\(id\)/s,
    'Delivery history must identify the exact immutable document that was sent.',
  );

  assert.match(
    pdf,
    /INVOICE_PDF_RENDERER_VERSION/,
  );

  assert.match(
    pdf,
    /invoice-pdf-v2/,
  );

  assert.match(
    snapshots,
    /createHash[\s\S]*sha256/s,
    'Snapshot payload and PDF bytes must be independently hashed.',
  );

  assert.match(
    snapshots,
    /payload_sha256/,
  );

  assert.match(
    snapshots,
    /pdf_sha256/,
  );

  assert.match(
    snapshots,
    /pdf_bytes/,
  );

  assert.match(
    snapshots,
    /pg_advisory_xact_lock/,
    'Snapshot creation must be serialized per invoice.',
  );

  assert.match(
    snapshots,
    /MAX\(version_no\)[\s\S]*\+ 1/s,
    'Snapshot versions must be monotonic per invoice.',
  );

  assert.match(
    snapshots,
    /is_primary[\s\S]*TRUE/s,
  );

  assert.doesNotMatch(
    snapshots,
    /UPDATE\s+invoicing_document_snapshots/i,
    'Application snapshot authority must never mutate an archived snapshot.',
  );

  assert.doesNotMatch(
    snapshots,
    /DELETE\s+FROM\s+invoicing_document_snapshots/i,
    'Application snapshot authority must never delete an archived snapshot.',
  );

  assert.match(
    snapshots,
    /invoice\.document_snapshot_created/,
    'Snapshot creation must enter the invoice audit trail.',
  );

  assert.match(
    commands,
    /postInvoiceConfirmationToAccounting[\s\S]*createPrimaryInvoiceDocumentSnapshot[\s\S]*COMMIT/s,
    'A confirmed invoice must be snapshotted before its posting transaction commits.',
  );

  assert.match(
    delivery,
    /ensurePrimaryInvoiceDocumentSnapshot/,
  );

  assert.doesNotMatch(
    delivery,
    /renderInvoicePdf/,
    'Outbound delivery must use the frozen document instead of regenerating a live PDF.',
  );

  assert.match(
    delivery,
    /document_snapshot_id/,
  );

  for (const routeSource of [
    publicPdf,
    portalPdf,
  ]) {
    assert.match(
      routeSource,
      /ensureTenantInvoiceDocumentSnapshot/,
    );
    assert.match(
      routeSource,
      /X-SaMi-Document-Snapshot/,
    );
    assert.match(
      routeSource,
      /ETag/,
    );
  }

  assert.match(
    workspacePdf,
    /\[\s*'draft',[\s\S]*'pending_approval',[\s\S]*'rejected'/s,
    'Draft-like PDFs must remain live previews.',
  );

  assert.match(
    workspacePdf,
    /ensurePrimaryInvoiceDocumentSnapshot/,
    'Issued workspace PDFs must use an immutable snapshot.',
  );

  assert.match(
    workspacePdf,
    /legacy_backfill/,
    'Legacy issued invoices must be archived lazily without changing their business state.',
  );

  assert.match(
    exactSnapshotPdf,
    /getInvoiceDocumentSnapshot/,
  );

  assert.match(
    exactSnapshotPdf,
    /X-SaMi-Document-Version/,
  );

  assert.match(
    queries,
    /documentSnapshots:/,
  );

  assert.match(
    queries,
    /document_snapshot_id/,
  );

  assert.match(
    types,
    /InvoicingDocumentSnapshotSummary/,
  );

  for (const visibleEvidence of [
    'Document snapshots',
    'Issued document locked',
    'PDF SHA-256',
    'View',
    'Download',
  ]) {
    assert.ok(
      detail.includes(
        visibleEvidence,
      ),
      visibleEvidence + ' must be visible in the invoice document evidence surface.',
    );
  }

  assert.match(
    manifest,
    /key:\s*"document_snapshot"[\s\S]*table:\s*"invoicing_document_snapshots"[\s\S]*permissions:\s*\{[\s\S]*read:\s*\["invoicing\.invoice\.view"\][\s\S]*\}/s,
    'Document snapshots must be a first-class read-only Invoicing resource.',
  );

  assert.match(
    manifest,
    /key:\s*"invoicing\.document_snapshot\.company"[\s\S]*operations:\s*\["read"\]/s,
    'The record policy must keep archived snapshots read-only.',
  );
});



test('Invoicing Part 10 provides a live renderer-backed invoice template designer', async () => {
  const [
    schema,
    migration,
    commands,
    queries,
    types,
    pdf,
    snapshots,
    draftPdf,
    designer,
    runtimeMigrations,
    manifest,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.10.0-to-2.11.0.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/pdf.ts'),
    source('lib/apps/invoicing/document-snapshots.ts'),
    source('app/api/apps/invoicing/[invoiceId]/pdf/route.ts'),
    source('app/apps/invoicing/InvoiceAppearanceSettings.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*["']invoicing["'][\s\S]*version:\s*['"]2\.17\.0['"]/s,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_10_0_TO_2_11_0/,
  );

  assert.match(
    migration,
    /fromVersion:\s*['"]2\.10\.0['"]/,
  );

  assert.match(
    migration,
    /toVersion:\s*['"]2\.11\.0['"]/,
  );

  for (const field of [
    'design_version',
    'density',
    'header_style',
    'document_title',
    'from_label',
    'bill_to_label',
    'notes_label',
    'terms_label',
    'payment_label',
    'footer_alignment',
    'show_status',
    'show_page_numbers',
    'show_sku',
    'show_unit',
    'show_quantity',
    'show_unit_price',
    'show_line_tax',
    'show_line_discount',
  ]) {
    assert.match(
      migration,
      new RegExp(field),
      'Template designer migration must include ' + field + '.',
    );
  }

  assert.match(
    commands,
    /design_version\s*=\s*design_version\s*\+\s*1/,
    'Saving an existing template must increment its design version.',
  );

  for (const control of [
    'density',
    'headerStyle',
    'documentTitle',
    'fromLabel',
    'billToLabel',
    'notesLabel',
    'termsLabel',
    'paymentLabel',
    'footerAlignment',
    'showPageNumbers',
    'showSku',
    'showUnit',
    'showQuantity',
    'showUnitPrice',
    'showLineTax',
    'showLineDiscount',
  ]) {
    assert.match(
      commands,
      new RegExp(control),
      control + ' must be persisted by the template command.',
    );
    assert.match(
      types,
      new RegExp(control),
      control + ' must be exposed by the workspace type.',
    );
  }

  assert.match(
    queries,
    /designVersion:/,
  );

  assert.match(
    queries,
    /headerStyle:/,
  );

  assert.match(
    pdf,
    /invoice-pdf-v2/,
  );

  assert.match(
    pdf,
    /headerStyle/,
  );

  assert.match(
    pdf,
    /showPageNumbers/,
  );

  assert.match(
    pdf,
    /showLineDiscount/,
  );

  assert.match(
    pdf,
    /showLineTax/,
  );

  assert.match(
    pdf,
    /density ===/,
  );

  assert.match(
    snapshots,
    /designVersion:/,
    'Immutable document payloads must retain the template design version.',
  );

  assert.match(
    draftPdf,
    /designVersion:/,
    'Draft PDF previews must use the same template design version contract.',
  );

  for (const visibleSurface of [
    'Invoice template designer',
    'Live preview',
    'Row density',
    'Header style',
    'Document title',
    'Line-item columns',
    'Design v',
    'Save design',
  ]) {
    assert.ok(
      designer.includes(
        visibleSurface,
      ),
      visibleSurface + ' must be visible in the live designer.',
    );
  }
});



test('Invoicing Part 11 deepens credit notes into reusable customer credits and refunds', async () => {
  const [
    schema,
    migration,
    commands,
    creditNotes,
    queries,
    types,
    service,
    route,
    detail,
    lifecyclePanel,
    runtimeMigrations,
    manifest,
    accounting,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.11.0-to-2.12.0.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/credit-notes.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('app/apps/invoicing/[invoiceId]/InvoiceDetailClient.tsx'),
    source('app/apps/invoicing/[invoiceId]/CreditNoteLifecyclePanel.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/invoicing/accounting.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*["']invoicing["'][\s\S]*version:\s*['"]2\.17\.0['"]/s,
  );

  assert.match(
    migration,
    /fromVersion:\s*['"]2\.11\.0['"]/,
  );

  assert.match(
    migration,
    /toVersion:\s*['"]2\.12\.0['"]/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_11_0_TO_2_12_0/,
  );

  for (const table of [
    'invoicing_credit_note_applications',
    'invoicing_credit_note_refunds',
  ]) {
    assert.match(
      schema,
      new RegExp(table),
      table + ' must be owned by Invoicing Part 11.',
    );
    assert.match(
      migration,
      new RegExp(table),
      table + ' must be created by the Part 11 migration.',
    );
  }

  assert.match(
    migration,
    /invoicing_credit_note_balances/,
  );

  assert.match(
    migration,
    /invoicing_customer_credit_balances/,
  );

  assert.match(
    migration,
    /legacy-source-offset/,
    'Existing issued credits must be backfilled into the new application ledger.',
  );

  assert.match(
    migration,
    /credit_refund/,
    'Part 11 must reserve a dedicated credit-refund numbering sequence.',
  );

  assert.match(
    commands,
    /export async function issueInvoiceCreditNote/,
    'The compatibility credit-note authority must remain available.',
  );

  for (const command of [
    'issueInvoiceCreditNote',
    'applyInvoiceCreditNote',
    'reverseInvoiceCreditApplication',
    'refundInvoiceCreditNote',
    'reverseInvoiceCreditNoteRefund',
    'cancelInvoiceCreditNote',
  ]) {
    assert.match(
      creditNotes,
      new RegExp('export async function ' + command),
      command + ' must be a real Part 11 server authority.',
    );
  }

  assert.match(
    creditNotes,
    /idempotencyKey/,
    'Credit lifecycle mutations must support idempotent client retries.',
  );

  assert.match(
    creditNotes,
    /FOR UPDATE/,
    'Credit lifecycle mutations must lock authoritative rows during balance changes.',
  );

  assert.match(
    accounting,
    /postInvoiceCreditToAccounting/,
  );

  assert.match(
    accounting,
    /postCreditNoteRefundToAccounting/,
  );

  assert.match(
    accounting,
    /credit_note_application/,
  );

  for (const exported of [
    'applyInvoiceCreditNote',
    'reverseInvoiceCreditApplication',
    'refundInvoiceCreditNote',
    'reverseInvoiceCreditNoteRefund',
  ]) {
    assert.match(
      service,
      new RegExp(exported),
    );
  }

  for (const action of [
    'apply_credit_note',
    'reverse_credit_application',
    'refund_credit_note',
    'reverse_credit_refund',
    'cancel_credit_note',
  ]) {
    assert.match(
      route,
      new RegExp("case '" + action + "'"),
    );
  }

  assert.match(
    queries,
    /availableAmount:/,
  );

  assert.match(
    queries,
    /applications:/,
  );

  assert.match(
    queries,
    /refunds:/,
  );

  assert.match(
    types,
    /availableAmount: number/,
  );

  assert.match(
    types,
    /applicationType: string/,
  );

  assert.match(
    types,
    /refundNumber: string/,
  );

  for (const visibleControl of [
    'Available credit',
    'Applications',
    'Refunds',
    'Reverse application',
    'Reverse refund',
    'Apply credit',
    'Refund available credit',
  ]) {
    assert.ok(
      lifecyclePanel.includes(
        visibleControl,
      ),
      visibleControl + ' must be visible in the Part 11 lifecycle UI.',
    );
  }

  assert.match(
    detail,
    /CreditNoteLifecyclePanel/,
  );

  assert.match(
    manifest,
    /key:\s*"credit_application"[\s\S]*table:\s*"invoicing_credit_note_applications"/s,
  );

  assert.match(
    manifest,
    /key:\s*"credit_refund"[\s\S]*table:\s*"invoicing_credit_note_refunds"/s,
  );
});



test('Invoicing Part 12 manages retainers and deposits as auditable customer credit', async () => {
  const [
    schema,
    migration,
    retainers,
    queries,
    types,
    service,
    route,
    workspace,
    runtimeMigrations,
    manifest,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.12.0-to-2.13.0.ts'),
    source('lib/apps/invoicing/retainers.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*["']invoicing["'][\s\S]*version:\s*['"]2\.17\.0['"]/s,
  );

  assert.match(
    migration,
    /fromVersion:\s*['"]2\.12\.0['"]/,
  );

  assert.match(
    migration,
    /toVersion:\s*['"]2\.13\.0['"]/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_12_0_TO_2_13_0/,
  );

  assert.match(
    schema,
    /CREATE TABLE IF NOT EXISTS public\.invoicing_retainers/,
  );

  assert.match(
    schema,
    /invoicing_retainer_balances/,
  );

  assert.match(
    migration,
    /retainer_type IN \('retainer','deposit'\)/,
  );

  assert.match(
    migration,
    /UNIQUE\(payment_id\)/,
  );

  assert.match(
    migration,
    /uq_invoicing_retainers_idempotency/,
  );

  assert.match(
    migration,
    /'retainer'[\s\S]*'RET-'/s,
    'Part 12 must reserve dedicated retainer numbering.',
  );

  assert.match(
    retainers,
    /export async function recordCustomerRetainer/,
  );

  assert.match(
    retainers,
    /pg_advisory_xact_lock/,
    'Retainer creation must be concurrency-safe.',
  );

  assert.match(
    retainers,
    /idempotencyKey/,
    'Retainer creation must be idempotent.',
  );

  assert.match(
    retainers,
    /accounting_model[\s\S]*'customer_credit'/s,
    'Retainers must enter the shared customer-credit payment ledger.',
  );

  assert.match(
    retainers,
    /postInvoicePaymentToAccounting/,
    'Retainer receipts must post through the existing accounting authority.',
  );

  assert.match(
    service,
    /recordCustomerRetainer/,
  );

  assert.match(
    route,
    /case 'record_retainer'/,
  );

  assert.match(
    queries,
    /retainers:/,
  );

  assert.match(
    types,
    /InvoicingRetainerSummary/,
  );

  for (const visibleControl of [
    'Retainers & deposits',
    'Receive retainer or deposit',
    'Retainer & deposit register',
    'Apply to invoice',
    'Refund unused advance',
    'Reconcile advance',
    'Allocation history',
    'Refund history',
  ]) {
    assert.ok(
      workspace.includes(
        visibleControl,
      ),
      visibleControl + ' must be available in the Part 12 workspace.',
    );
  }

  assert.match(
    workspace,
    /action:[\s\S]*'allocate_payment'/s,
  );

  assert.match(
    workspace,
    /action:[\s\S]*'refund_payment'/s,
  );

  assert.match(
    workspace,
    /action:[\s\S]*'reconcile_payment'/s,
  );

  assert.match(
    manifest,
    /key:\s*"retainer"[\s\S]*table:\s*"invoicing_retainers"/s,
  );
});



test('Invoicing Part 13 schedules installment plans over the authoritative invoice settlement ledger', async () => {
  const [
    schema,
    migration,
    plans,
    context,
    queries,
    types,
    service,
    route,
    workspace,
    portal,
    portalPage,
    runtimeMigrations,
    manifest,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.13.0-to-2.14.0.ts'),
    source('lib/apps/invoicing/payment-plans.ts'),
    source('lib/apps/invoicing/context.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('app/apps/invoicing/PaymentPlansWorkspace.tsx'),
    source('lib/apps/invoicing/portal.ts'),
    source('app/p/[tenantId]/[token]/page.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*["']invoicing["'][\s\S]*version:\s*['"]2\.17\.0['"]/s,
  );

  assert.match(
    migration,
    /fromVersion:\s*['"]2\.13\.0['"]/,
  );

  assert.match(
    migration,
    /toVersion:\s*['"]2\.14\.0['"]/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_13_0_TO_2_14_0/,
  );

  for (const table of [
    'invoicing_payment_plans',
    'invoicing_payment_plan_installments',
  ]) {
    assert.match(
      schema,
      new RegExp(table),
      table + ' must be owned by Invoicing Part 13.',
    );

    assert.match(
      migration,
      new RegExp(table),
      table + ' must be created by the Part 13 migration.',
    );
  }

  assert.match(
    migration,
    /invoicing_payment_plan_installment_balances/,
  );

  assert.match(
    migration,
    /invoicing_payment_plan_balances/,
  );

  assert.match(
    migration,
    /settled_baseline_amount/,
    'Plans created after partial settlement must not count earlier settlement against new installments.',
  );

  assert.match(
    migration,
    /original_due_date/,
  );

  assert.match(
    migration,
    /final_due_date/,
  );

  assert.match(
    migration,
    /uq_invoicing_payment_plan_active_invoice/,
    'Only one active payment plan may exist for an invoice.',
  );

  assert.match(
    migration,
    /uq_invoicing_payment_plan_idempotency/,
    'Plan creation must support idempotent retries.',
  );

  assert.match(
    migration,
    /'payment_plan'[\s\S]*'PLN-'/s,
    'Part 13 must reserve dedicated payment-plan numbering.',
  );

  assert.match(
    context,
    /'payment_plan'[\s\S]*'PLN-'/s,
    'Fresh workspaces must seed payment-plan numbering.',
  );

  assert.match(
    context,
    /'retainer'\s*\|[\s\S]*'payment_plan'/s,
    'The document-number authority must accept payment plans.',
  );

  for (const command of [
    'createInvoicePaymentPlan',
    'cancelInvoicePaymentPlan',
  ]) {
    assert.match(
      plans,
      new RegExp('export async function ' + command),
      command + ' must be a real Part 13 server authority.',
    );
  }

  assert.match(
    plans,
    /pg_advisory_xact_lock/,
    'Payment-plan creation must be concurrency-safe.',
  );

  assert.match(
    plans,
    /idempotencyKey/,
    'Payment-plan creation must be idempotent.',
  );

  assert.match(
    plans,
    /Installments must total the current invoice balance/,
    'Installment schedules must reconcile exactly to the live invoice balance.',
  );

  assert.match(
    plans,
    /settledBaselineAmount/,
    'Plan activation must snapshot existing invoice settlement.',
  );

  assert.match(
    plans,
    /due_date =[\s\S]*finalDueDate/s,
    'The invoice due date must move to the final installment date.',
  );

  assert.match(
    plans,
    /original_due_date/,
    'Cancellation must retain the original invoice due date for restoration.',
  );

  for (const exported of [
    'createInvoicePaymentPlan',
    'cancelInvoicePaymentPlan',
  ]) {
    assert.match(
      service,
      new RegExp(exported),
    );
  }

  for (const action of [
    'create_payment_plan',
    'cancel_payment_plan',
  ]) {
    assert.match(
      route,
      new RegExp("case '" + action + "'"),
    );
  }

  assert.match(
    queries,
    /paymentPlans:/,
  );

  assert.match(
    types,
    /InvoicingPaymentPlanSummary/,
  );

  assert.match(
    types,
    /InvoicingPaymentPlanInstallmentSummary/,
  );

  for (const visibleControl of [
    'Create installment plan',
    'Generate schedule',
    'Activate plan',
    'Installment plans',
    'Cancel payment plan',
    'Scheduled balance',
    'Overdue installments',
  ]) {
    assert.ok(
      workspace.includes(
        visibleControl,
      ),
      visibleControl + ' must be available in the Part 13 operator workspace.',
    );
  }

  assert.match(
    workspace,
    /monthly/,
  );

  assert.match(
    workspace,
    /biweekly/,
  );

  assert.match(
    workspace,
    /weekly/,
  );

  assert.match(
    portal,
    /paymentPlans:/,
    'Secure customer portal data must expose customer-scoped installment plans.',
  );

  assert.ok(
    portalPage.includes(
      'Payment plans',
    ),
    'Customers must see their installment schedule in the secure portal.',
  );

  assert.match(
    manifest,
    /key:\s*"payment_plan"[\s\S]*table:\s*"invoicing_payment_plans"/s,
  );

  assert.match(
    manifest,
    /key:\s*"payment_plan_installment"[\s\S]*table:\s*"invoicing_payment_plan_installments"/s,
  );
});


test('Invoicing Part 14 provides auditable multi-currency billing, base reporting and cross-currency settlement', async () => {
  const [
    schema,
    migration,
    currencies,
    accounting,
    commands,
    queries,
    types,
    service,
    route,
    workspace,
    currencyCenter,
    runtimeMigrations,
    manifest,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.14.0-to-2.15.0.ts'),
    source('lib/apps/invoicing/currencies.ts'),
    source('lib/apps/invoicing/accounting.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/CurrencyCenterWorkspace.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*["']invoicing["'][\s\S]*version:\s*['"]2\.17\.0['"]/s,
  );

  assert.match(
    migration,
    /fromVersion:\s*['"]2\.14\.0['"]/,
  );

  assert.match(
    migration,
    /toVersion:\s*['"]2\.15\.0['"]/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_14_0_TO_2_15_0/,
  );

  for (const table of [
    'invoicing_currencies',
    'invoicing_exchange_rates',
  ]) {
    assert.match(schema, new RegExp(table));
    assert.match(migration, new RegExp(table));
  }

  assert.match(
    schema,
    /invoicing_aging_base/,
    'Mixed-currency KPI totals must be consolidated in base currency.',
  );

  assert.match(
    schema,
    /invoicing_currency_exposure/,
    'Part 14 must expose per-currency receivable exposure.',
  );

  assert.match(
    currencies,
    /resolveInvoicingExchangeRate/,
    'Invoices and payments need a dated exchange-rate authority.',
  );

  assert.match(
    currencies,
    /effective_date <= \$4::date/,
    'Rate resolution must use the latest historical rate on or before the transaction date.',
  );

  assert.match(
    commands,
    /payment_amount/,
    'Allocations must retain payment-currency amounts.',
  );

  assert.match(
    commands,
    /invoice_amount/,
    'Allocations must retain invoice-currency amounts.',
  );

  assert.match(
    commands,
    /allow_cross_currency_payments/,
    'Cross-currency settlement must remain an explicit company control.',
  );

  assert.match(
    accounting,
    /fx_gain_loss/,
    'Cross-currency settlement must post realized FX gain or loss.',
  );

  assert.match(
    accounting,
    /Realized foreign exchange gain/,
  );

  assert.match(
    accounting,
    /Realized foreign exchange loss/,
  );

  assert.match(
    queries,
    /SUM\(base_total_amount\)/,
    'Dashboard totals must not sum raw foreign currencies together.',
  );

  assert.match(
    types,
    /InvoicingCurrencyExposureSummary/,
  );

  for (const exported of [
    'saveInvoicingCurrency',
    'saveInvoicingExchangeRate',
  ]) {
    assert.match(
      service,
      new RegExp(exported),
    );
  }

  for (const action of [
    'save_currency',
    'save_exchange_rate',
  ]) {
    assert.match(
      route,
      new RegExp("case '" + action + "'"),
    );
  }

  assert.ok(
    workspace.includes(
      "'currencies'",
    ),
    'Currency Center must be a first-class Invoicing workspace view.',
  );

  for (const visibleControl of [
    'Currency Center',
    'Add or update currency',
    'Add dated exchange rate',
    'Currency exposure',
    'Exchange-rate history',
  ]) {
    assert.ok(
      (
        workspace +
        currencyCenter
      ).includes(
        visibleControl,
      ),
      visibleControl + ' must be visible in the operator workspace.',
    );
  }

  assert.match(
    manifest,
    /key:\s*"currency"[\s\S]*table:\s*"invoicing_currencies"/s,
  );

  assert.match(
    manifest,
    /key:\s*"exchange_rate"[\s\S]*table:\s*"invoicing_exchange_rates"/s,
  );
});


test('Invoicing uses real standalone App Router pages and keeps invoice creation separate from the register', async () => {
  const [
    rootPage,
    sectionPage,
    newPage,
    invoicesPage,
    customersPage,
    itemsPage,
    paymentsPage,
    currenciesPage,
    taxEnginePage,
    retainersPage,
    paymentPlansPage,
    recurringPage,
    remindersPage,
    portalPage,
    reportsPage,
    settingsPage,
    workspace,
  ] = await Promise.all([
    source('app/apps/invoicing/page.tsx'),
    source('app/apps/invoicing/InvoicingSectionPage.tsx'),
    source('app/apps/invoicing/new/page.tsx'),
    source('app/apps/invoicing/invoices/page.tsx'),
    source('app/apps/invoicing/customers/page.tsx'),
    source('app/apps/invoicing/items/page.tsx'),
    source('app/apps/invoicing/payments/page.tsx'),
    source('app/apps/invoicing/currencies/page.tsx'),
    source('app/apps/invoicing/tax-engine/page.tsx'),
    source('app/apps/invoicing/retainers/page.tsx'),
    source('app/apps/invoicing/payment-plans/page.tsx'),
    source('app/apps/invoicing/recurring/page.tsx'),
    source('app/apps/invoicing/reminders/page.tsx'),
    source('app/apps/invoicing/portal/page.tsx'),
    source('app/apps/invoicing/reports/page.tsx'),
    source('app/apps/invoicing/settings/page.tsx'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
  ]);

  assert.match(newPage, /view="newInvoice"/);
  assert.match(invoicesPage, /view="invoices"/);
  assert.match(customersPage, /view="customers"/);
  assert.match(itemsPage, /view="items"/);
  assert.match(paymentsPage, /view="payments"/);
  assert.match(currenciesPage, /view="currencies"/);
  assert.match(taxEnginePage, /view="taxEngine"/);
  assert.match(retainersPage, /view="retainers"/);
  assert.match(paymentPlansPage, /view="paymentPlans"/);
  assert.match(recurringPage, /view="recurring"/);
  assert.match(remindersPage, /view="reminders"/);
  assert.match(portalPage, /view="portal"/);
  assert.match(reportsPage, /view="reports"/);
  assert.match(settingsPage, /view="settings"/);

  assert.match(sectionPage, /\/apps\/invoicing\/new/);
  assert.match(sectionPage, /\/apps\/invoicing\/invoices/);
  assert.match(sectionPage, /\/apps\/invoicing\/customers/);
  assert.match(sectionPage, /\/apps\/invoicing\/payments/);
  assert.match(sectionPage, /\/apps\/invoicing\/tax-engine/);
  assert.match(sectionPage, /\/apps\/invoicing\/settings/);
  assert.doesNotMatch(
    sectionPage,
    /\?view=/,
    'The Invoicing sidebar must navigate real App Router pages rather than one stacked query-string workspace.',
  );

  assert.match(rootPage, /LEGACY_VIEW_PATHS/);
  assert.match(rootPage, /redirect\(/);
  assert.match(rootPage, /view="dashboard"/);

  assert.match(workspace, /view ===[\s\S]*'newInvoice'[\s\S]*<InvoiceComposer/s);
  assert.match(workspace, /href="\/apps\/invoicing\/new"/);

  const registerStart =
    workspace.indexOf(
      'function Invoices(',
    );
  const registerEnd =
    workspace.indexOf(
      'function Customers(',
      registerStart,
    );

  assert.ok(
    registerStart >= 0 &&
    registerEnd > registerStart,
    'Invoice register component boundaries must be present.',
  );

  const registerSource =
    workspace.slice(
      registerStart,
      registerEnd,
    );

  assert.doesNotMatch(
    registerSource,
    /<InvoiceComposer/,
    'Invoice creation must not be stacked inside the invoice register page.',
  );

  assert.match(registerSource, /Invoice register/);
  assert.match(registerSource, /href="\/apps\/invoicing\/new"/);
});


test('Invoicing Part 15 provides a rule-driven tax engine with fiscal mappings, exemptions and standalone operator controls', async () => {
  const [
    schema,
    migration,
    taxEngine,
    commands,
    queries,
    service,
    route,
    workspace,
    taxWorkspace,
    composer,
    runtimeMigrations,
    manifest,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.15.0-to-2.16.0.ts'),
    source('lib/apps/invoicing/tax-engine.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/TaxEngineWorkspace.tsx'),
    source('app/apps/invoicing/InvoiceComposer.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*["']invoicing["'][\s\S]*version:\s*['"]2\.17\.0['"]/s,
  );

  assert.match(
    migration,
    /fromVersion:\s*['"]2\.15\.0['"]/,
  );

  assert.match(
    migration,
    /toVersion:\s*['"]2\.16\.0['"]/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_15_0_TO_2_16_0/,
  );

  for (const table of [
    'invoicing_tax_groups',
    'invoicing_tax_group_members',
    'invoicing_fiscal_positions',
    'invoicing_fiscal_position_mappings',
    'invoicing_tax_rules',
    'invoicing_tax_exemptions',
    'invoicing_tax_localizations',
  ]) {
    assert.match(schema, new RegExp(table));
    assert.match(migration, new RegExp(table));
  }

  assert.match(
    taxEngine,
    /resolveInvoicingTaxTreatment/,
    'Invoice lines must use the authoritative Part 15 tax resolver.',
  );

  assert.match(
    taxEngine,
    /customer_exemption/,
  );

  assert.match(
    taxEngine,
    /fiscal_position_exemption/,
  );

  assert.match(
    taxEngine,
    /tax_rule_exemption/,
  );

  assert.match(
    taxEngine,
    /calculationMode|calculation_mode|compound/,
    'Tax groups must support compound calculations.',
  );

  assert.match(
    commands,
    /tax_components/,
    'Resolved component taxes must be frozen on invoice lines.',
  );

  assert.match(
    commands,
    /tax_context/,
    'Invoices must snapshot the tax context used to resolve their lines.',
  );

  assert.match(
    queries,
    /taxGroups/,
  );

  assert.match(
    queries,
    /fiscalPositions/,
  );

  assert.match(
    queries,
    /taxExemptions/,
  );

  assert.match(
    queries,
    /taxLocalizations/,
  );

  for (const action of [
    'save_tax_group',
    'save_tax_group_member',
    'save_fiscal_position',
    'save_fiscal_position_mapping',
    'save_tax_rule',
    'save_tax_exemption',
    'save_tax_localization',
  ]) {
    assert.match(
      route,
      new RegExp("case '" + action + "'"),
    );
  }

  for (const exported of [
    'saveInvoicingTaxGroup',
    'saveInvoicingTaxGroupMember',
    'saveInvoicingFiscalPosition',
    'saveInvoicingFiscalPositionMapping',
    'saveInvoicingTaxRule',
    'saveInvoicingTaxExemption',
    'saveInvoicingTaxLocalization',
  ]) {
    assert.match(
      service,
      new RegExp(exported),
    );
  }

  assert.match(
    workspace,
    /'taxEngine'/,
  );

  for (const text of [
    'Tax engine',
    'Tax rate',
    'Tax group',
    'Fiscal position',
    'Tax rule',
    'Customer tax exemption',
    'Tax localization',
  ]) {
    assert.ok(
      taxWorkspace.includes(text),
      text + ' must be visible in the standalone Tax Engine page.',
    );
  }

  assert.match(
    composer,
    /taxGroupId/,
    'The invoice composer must preserve grouped taxes.',
  );

  assert.match(
    composer,
    /group:/,
    'The composer tax selector must distinguish tax groups from single rates.',
  );
});


test('Invoicing owns a full-height responsive module shell and focused create/register routes', async () => {
  const [
    shell,
    sectionPage,
    workspace,
    newCustomer,
    newItem,
    newPayment,
  ] = await Promise.all([
    source('app/apps/invoicing/InvoicingModuleShell.tsx'),
    source('app/apps/invoicing/InvoicingSectionPage.tsx'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/customers/new/page.tsx'),
    source('app/apps/invoicing/items/new/page.tsx'),
    source('app/apps/invoicing/payments/new/page.tsx'),
  ]);

  assert.match(
    shell,
    /fixed inset-y-0 left-0 z-50 w-\[286px\]/,
    'Desktop Invoicing navigation must use a full-height fixed module sidebar.',
  );

  assert.match(
    shell,
    /lg:pl-\[286px\]/,
    'Desktop Invoicing content must use the remaining viewport width rather than a squeezed sidebar card grid.',
  );

  assert.match(
    shell,
    /fixed inset-0 z-\[90\] lg:hidden/,
    'Mobile Invoicing must use an overlay drawer instead of compressing the desktop sidebar.',
  );

  assert.match(
    sectionPage,
    /InvoicingModuleShell/,
  );

  assert.doesNotMatch(
    sectionPage,
    /AppSurfaceShell/,
    'Invoicing must not fall back to the generic card-grid app shell.',
  );

  assert.match(
    newCustomer,
    /view="newCustomer"/,
  );

  assert.match(
    newItem,
    /view="newItem"/,
  );

  assert.match(
    newPayment,
    /view="receivePayment"/,
  );

  assert.match(
    workspace,
    /mode="create"/,
    'Focused customer/item create routes must render create-only mode.',
  );

  assert.match(
    workspace,
    /mode="receive"/,
    'The receive-payment route must render receipt-entry mode without the payment register stacked below it.',
  );

  assert.match(
    workspace,
    /mode="register"/,
    'Payment register must remain its own focused surface.',
  );
});



test('Invoicing Part 16 provides Kenya eTIMS OSCU/VSCU fiscalization with auditable receipt evidence', async () => {
  const [
    schema,
    migration,
    etims,
    delivery,
    snapshots,
    pdf,
    queries,
    types,
    service,
    route,
    sectionPage,
    workspace,
    etimsWorkspace,
    runtimeMigrations,
    manifest,
  ] = await Promise.all([
    source('lib/apps/invoicing/schema.sql'),
    source('lib/apps/invoicing/migrations/2.16.0-to-2.17.0.ts'),
    source('lib/apps/invoicing/etims.ts'),
    source('lib/apps/invoicing/delivery.ts'),
    source('lib/apps/invoicing/document-snapshots.ts'),
    source('lib/apps/invoicing/pdf.ts'),
    source('lib/apps/invoicing/queries.ts'),
    source('lib/apps/invoicing/types.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/api/apps/invoicing/route.ts'),
    source('app/apps/invoicing/InvoicingSectionPage.tsx'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/EtimsWorkspace.tsx'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*["']invoicing["'][\s\S]*version:\s*['"]2\.17\.0['"]/s,
  );

  assert.match(
    migration,
    /fromVersion:\s*['"]2\.16\.0['"]/,
  );

  assert.match(
    migration,
    /toVersion:\s*['"]2\.17\.0['"]/,
  );

  assert.match(
    runtimeMigrations,
    /INVOICING_2_16_0_TO_2_17_0/,
  );

  for (const table of [
    'invoicing_etims_settings',
    'invoicing_etims_documents',
    'invoicing_etims_attempts',
  ]) {
    assert.match(schema, new RegExp(table));
    assert.match(migration, new RegExp(table));
  }

  for (const evidenceField of [
    'scu_id',
    'scu_receipt_number',
    'cu_invoice_number',
    'receipt_counter',
    'total_receipt_counter',
    'internal_data',
    'receipt_signature',
    'qr_payload',
  ]) {
    assert.match(
      schema,
      new RegExp(evidenceField),
      evidenceField + ' must be preserved as eTIMS receipt evidence.',
    );
  }

  assert.match(etims, /SAMI_ETIMS_PROVIDER/);
  assert.match(etims, /SAMI_ETIMS_API_URL/);
  assert.match(etims, /SAMI_ETIMS_API_TOKEN/);
  assert.match(etims, /SAMI_ETIMS_API_KEY/);
  assert.match(etims, /control_unit_type/);
  assert.match(etims, /'oscu'/);
  assert.match(etims, /'vscu'/);

  assert.match(
    etims,
    /scuId[\s\S]*receiptSignature[\s\S]*cuInvoiceNumber/,
    'A provider success flag alone must not be enough for fiscal acceptance.',
  );

  assert.match(
    etims,
    /request_sha256/,
    'Submission payloads must be hash-addressed for auditability.',
  );

  assert.match(
    etims,
    /invoicing_etims_attempts/,
    'Every provider attempt must be retained in an audit ledger.',
  );

  assert.match(
    delivery,
    /assertEtimsDeliveryReady/,
    'Official invoice delivery must honor the company fiscalization gate.',
  );

  assert.match(
    snapshots,
    /createFiscalizedInvoiceDocumentSnapshot/,
    'Successful fiscalization must create a new immutable PDF version rather than mutate the confirmation snapshot.',
  );

  assert.match(
    snapshots,
    /etims\.cu_invoice_number|etims_cu_invoice_number/,
  );

  assert.match(
    pdf,
    /eTIMS CU invoice/,
  );

  assert.match(
    pdf,
    /eTIMS SCU ID/,
  );

  assert.match(
    types,
    /InvoicingEtimsDocumentSummary/,
  );

  assert.match(
    types,
    /InvoicingEtimsSettingsSummary/,
  );

  assert.match(
    queries,
    /etimsDocuments/,
  );

  assert.match(
    queries,
    /getEtimsProviderRuntimeStatus/,
  );

  for (const exported of [
    'fiscalizeInvoiceWithEtims',
    'saveEtimsSettings',
  ]) {
    assert.match(
      service,
      new RegExp(exported),
    );
  }

  for (const action of [
    'save_etims_settings',
    'fiscalize_etims',
  ]) {
    assert.match(
      route,
      new RegExp("case '" + action + "'"),
    );
  }

  assert.match(sectionPage, /'etims'/);
  assert.match(sectionPage, /\/apps\/invoicing\/etims/);
  assert.match(workspace, /EtimsWorkspace/);

  for (const control of [
    'Kenya eTIMS configuration',
    'Fiscalization queue',
    'Ready to fiscalize',
    'OSCU',
    'VSCU',
    'Fiscalize',
  ]) {
    assert.ok(
      etimsWorkspace.includes(control),
      control + ' must be visible in the eTIMS operator workspace.',
    );
  }

  for (const resource of [
    'etims_settings',
    'etims_document',
    'etims_attempt',
  ]) {
    assert.match(
      manifest,
      new RegExp('key:\\s*"' + resource + '"'),
    );
  }
});
