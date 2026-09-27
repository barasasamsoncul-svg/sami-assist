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
