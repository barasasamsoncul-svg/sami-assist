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
    /version:\s*['"]2\.2\.0['"]/,
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
    /apiEndpoints:\s*false/,
    'Authenticated workspace routes must not silently expose a public developer API.',
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
    /input\.tenantId|input\.companyId/,
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
    provider,
    aiRegistry,
    tools,
  ] =
    await Promise.all([
      source(
        'lib/search/registry.ts',
      ),
      source(
        'lib/apps/invoicing/search.ts',
      ),
      source(
        'lib/ai/tool-registry.ts',
      ),
      source(
        'lib/apps/invoicing/ai-tools.ts',
      ),
    ]);

  assert.match(
    searchRegistry,
    /INVOICING_SEARCH_PROVIDER/,
  );

  assert.match(
    provider,
    /searchInvoicingRecords/,
  );

  assert.match(
    aiRegistry,
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
    registry,
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
        'package.json',
      ),
    ]);

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
    registry,
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
    registry,
    /INVOICING_2_1_0_TO_2_2_0/,
  );

  assert.match(
    migration,
    /executeSafeSamiModuleMigrationSql/,
  );

  assert.match(
    registry,
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
