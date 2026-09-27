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

test('ERP parity: Sales reserves and posts inventory through authoritative fulfillment', async () => {
  const [
    commands,
    integration,
  ] =
    await Promise.all([
      source(
        'lib/apps/sales/commands.ts',
      ),
      source(
        'lib/apps/erp/sales-inventory-integration.ts',
      ),
    ]);

  assert.match(
    commands,
    /reserveSalesOrderInventory/,
  );
  assert.match(
    commands,
    /postSalesOrderDelivery/,
  );
  assert.match(
    integration,
    /INSERT INTO stock_reservations/,
  );
  assert.match(
    integration,
    /INSERT INTO stock_movements/,
  );
  assert.match(
    integration,
    /'sales_delivery'/,
  );
  assert.match(
    integration,
    /'return_in'/,
  );
  assert.match(
    integration,
    /Delivered quantity cannot be reduced below the already invoiced quantity/,
  );
  assert.match(
    integration,
    /available stock is insufficient/,
  );
});

test('ERP parity: Invoicing posts financial lifecycle into Accounting when installed', async () => {
  const [
    commands,
    accounting,
  ] =
    await Promise.all([
      source(
        'lib/apps/invoicing/commands.ts',
      ),
      source(
        'lib/apps/erp/accounting-integration.ts',
      ),
    ]);

  for (
    const marker
    of [
      'postInvoiceToAccounting',
      'reverseInvoiceAccounting',
      'postPaymentToAccounting',
      'reversePaymentAccounting',
      'postCreditNoteToAccounting',
      'reverseCreditNoteAccounting',
    ]
  ) {
    assert.match(
      commands,
      new RegExp(
        marker,
      ),
      marker,
    );
  }

  for (
    const marker
    of [
      'Accounts Receivable',
      'Sales Revenue',
      'Output Tax Payable',
      'Cash and Bank',
      'INSERT INTO journals',
      'INSERT INTO journal_lines',
      'Accounting posting is not balanced',
      "'posted'",
    ]
  ) {
    assert.ok(
      accounting.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    accounting,
    /await accountingBridgeReady/,
    'Cross-app accounting remains optional-module aware.',
  );
});

test('ERP parity: shared-app lifecycle authority is separate from ordinary record editing', async () => {
  const [
    contract,
    service,
    automation,
    workspace,
  ] =
    await Promise.all([
      source(
        'lib/modules/enterprise-contract.ts',
      ),
      source(
        'lib/apps/enterprise/service.ts',
      ),
      source(
        'lib/apps/enterprise/automation.ts',
      ),
      source(
        'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
      ),
    ]);

  assert.match(
    contract,
    /'transition'/,
  );
  assert.match(
    contract,
    /workflow actions/,
  );
  assert.match(
    service,
    /\| 'transition'/,
  );
  assert.match(
    service,
    /'record\.transition'|operation ===[\s\S]*'transition'/,
  );
  assert.match(
    service,
    /canTransition/,
  );
  assert.match(
    service,
    /input\.table,[\s\S]*'transition'/,
  );
  assert.match(
    automation,
    /\.record\.transition/,
  );
  assert.match(
    workspace,
    /canTransition/,
  );
});

test('ERP parity: Automation can execute specialist workflow transitions with approval and live rules', async () => {
  const [
    automation,
    service,
    effects,
  ] =
    await Promise.all([
      source(
        'lib/apps/enterprise/automation.ts',
      ),
      source(
        'lib/apps/enterprise/service.ts',
      ),
      source(
        'lib/apps/enterprise/transition-effects.ts',
      ),
    ]);

  assert.match(
    automation,
    /\.workflow\.transition/,
  );
  assert.match(
    automation,
    /approvalPolicy:[\s\S]*'always'/,
  );
  assert.match(
    automation,
    /getEnterpriseWorkflowTransitions/,
  );
  assert.match(
    automation,
    /applyEnterpriseTransitionEffects/,
  );
  assert.doesNotMatch(
    automation,
    /from '@\/lib\/apps\/enterprise\/service'/,
    'Automation must not create a circular dependency back into the enterprise service.',
  );
  assert.match(
    service,
    /applyEnterpriseTransitionEffects/,
  );
  assert.match(
    effects,
    /applyFinanceSpecialistTransition/,
  );
  assert.match(
    effects,
    /applySpecialistExecutionTransition/,
  );
});

test('ERP parity: Sales and Invoicing publish trusted post-commit domain automation events', async () => {
  const [
    salesAutomation,
    invoicingAutomation,
    registry,
    manifests,
    salesCommands,
    invoicingCommands,
  ] =
    await Promise.all([
      source(
        'lib/apps/sales/automation.ts',
      ),
      source(
        'lib/apps/invoicing/automation.ts',
      ),
      source(
        'lib/automation/registry.ts',
      ),
      source(
        'lib/modules/first-party.ts',
      ),
      source(
        'lib/apps/sales/commands.ts',
      ),
      source(
        'lib/apps/invoicing/commands.ts',
      ),
    ]);

  for (
    const marker
    of [
      'sales.quote.sent',
      'sales.order.created',
      'sales.order.fulfilled',
      'sales.invoice.created',
    ]
  ) {
    assert.ok(
      salesAutomation.includes(
        marker,
      ),
      marker,
    );
    assert.ok(
      salesCommands.includes(
        marker,
      ),
      marker + ' emitter',
    );
  }

  for (
    const marker
    of [
      'invoicing.invoice.created',
      'invoicing.invoice.confirmed',
      'invoicing.payment.posted',
      'invoicing.payment.reversed',
      'invoicing.credit_note.issued',
      'invoicing.credit_note.cancelled',
    ]
  ) {
    assert.ok(
      invoicingAutomation.includes(
        marker,
      ),
      marker,
    );
    assert.ok(
      invoicingCommands.includes(
        marker,
      ),
      marker + ' emitter',
    );
  }

  assert.match(
    registry,
    /SALES_AUTOMATION_TRIGGERS/,
  );
  assert.match(
    registry,
    /INVOICING_AUTOMATION_TRIGGERS/,
  );

  const invoicingStart =
    manifests.indexOf(
      'key: "invoicing"',
    );
  const invoicingEnd =
    manifests.indexOf(
      'key: "expenses"',
      invoicingStart,
    );
  const salesStart =
    manifests.indexOf(
      'key: "sales"',
    );
  const salesEnd =
    manifests.indexOf(
      'key: "subscriptions"',
      salesStart,
    );

  assert.match(
    manifests.slice(
      invoicingStart,
      invoicingEnd,
    ),
    /automationTriggers:\s*true/,
  );
  assert.match(
    manifests.slice(
      salesStart,
      salesEnd,
    ),
    /automationTriggers:\s*true/,
  );

  assert.match(
    salesCommands,
    /await client\.query\([\s\S]*'COMMIT'[\s\S]*await emitSalesAutomationEvent/s,
    'Sales domain events must be emitted only after committed writes.',
  );
  assert.match(
    invoicingCommands,
    /await client\.query\([\s\S]*'COMMIT'[\s\S]*await emitInvoicingAutomationEvent/s,
    'Invoicing domain events must be emitted only after committed writes.',
  );
});

test('ERP parity: SaMi AI can execute confirmed business actions instead of read-only app summaries', async () => {
  const [
    enterprise,
    sales,
    invoicing,
    registry,
  ] =
    await Promise.all([
      source(
        'lib/apps/enterprise/ai-tools.ts',
      ),
      source(
        'lib/apps/sales/ai-tools.ts',
      ),
      source(
        'lib/apps/invoicing/ai-tools.ts',
      ),
      source(
        'lib/ai/tool-registry.ts',
      ),
    ]);

  for (
    const marker
    of [
      'workspace_app_create_record',
      'workspace_app_update_record',
      'workspace_app_transition_record',
      'confirmationRequired:',
      'createEnterpriseModuleRecord',
      'transitionEnterpriseModuleRecord',
    ]
  ) {
    assert.ok(
      enterprise.includes(
        marker,
      ),
      marker,
    );
  }

  for (
    const marker
    of [
      'sales_send_quote',
      'sales_quote_to_order',
      'sales_quote_to_invoice',
      'createSalesOrderFromQuote',
      'convertSalesQuoteToInvoice',
    ]
  ) {
    assert.ok(
      sales.includes(
        marker,
      ),
      marker,
    );
  }

  for (
    const marker
    of [
      'invoicing_confirm_invoice',
      'invoicing_record_payment',
      'changeInvoiceStatus',
      'recordInvoicePayment',
    ]
  ) {
    assert.ok(
      invoicing.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    registry,
    /tool\.operation === 'write'[\s\S]*!tool\.confirmationRequired/s,
    'AI write tools must remain confirmation-gated.',
  );
});
