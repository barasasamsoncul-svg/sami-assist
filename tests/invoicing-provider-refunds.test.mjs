import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8'))
    .replace(/\r\n/g, '\n');
}

test('provider-backed payments retain the original refundable transaction identity', async () => {
  const [
    core,
    settlement,
    adapters,
    checkout,
    stk,
  ] = await Promise.all([
    source('lib/apps/invoicing/payment-core.ts'),
    source('lib/apps/invoicing/external-settlement.ts'),
    source('lib/apps/invoicing/payment-provider-adapters.ts'),
    source('lib/apps/invoicing/payment-checkout-providers.ts'),
    source('lib/apps/invoicing/mpesa-stk.ts'),
  ]);

  assert.match(core, /providerTransactionId\?:string\|null/);
  assert.match(core, /providerTransactionId:[\s\S]*input\.providerTransactionId/s);
  assert.match(settlement, /providerTransactionId:[\s\S]*payload\.providerTransactionId/s);

  for (const marker of [
    'confirmation_code',
    'payment_intent',
    'data.reference',
    'data.id',
    'capture.id',
  ]) {
    assert.ok(
      adapters.includes(marker) || checkout.includes(marker),
      'missing provider transaction marker ' + marker,
    );
  }

  assert.match(stk, /providerTransactionId:[\s\S]*receipt/s);
  assert.doesNotMatch(
    stk,
    /providerTransactionId:[\s\S]{0,120}checkoutRequestId/,
    'CheckoutRequestID is not an M-PESA reversal receipt and must never be stored as the refundable transaction identity.',
  );
});

test('provider refund adapters cover Stripe PayPal Paystack Flutterwave and Pesapal with truthful async state', async () => {
  const refund =
    await source('lib/apps/invoicing/payment-provider-refunds.ts');

  assert.match(refund, /stripe\.refunds\.create/);
  assert.match(refund, /stripe\.refunds\.retrieve/);
  assert.match(refund, /\/v2\/payments\/captures\/.*\/refund/s);
  assert.match(refund, /\/v2\/payments\/refunds\//);
  assert.match(refund, /https:\/\/api\.paystack\.co\/refund/);
  assert.match(refund, /https:\/\/api\.flutterwave\.com\/v3\/transactions\/.*\/refund/s);
  assert.match(refund, /\/api\/Transactions\/RefundRequest/);

  assert.match(
    refund,
    /'completed'[\s\S]*return 'pending'/s,
    'Flutterwave generic completed means refund initiated/pending disbursement, not final financial success.',
  );
  assert.match(refund, /'completed-momo'/);
  assert.match(refund, /'completed-bank-transfer'/);
  assert.match(refund, /manualConfirmationRequired:[\s\S]*true/s);
  assert.doesNotMatch(
    refund,
    /provider.*mpesa[\s\S]{0,200}supported:\s*true/i,
    'M-PESA reversal must not be advertised without Daraja initiator/security credentials.',
  );
});

test('provider refund authority reserves balances and posts Accounting only after provider success', async () => {
  const [
    service,
    commands,
    credits,
    schema,
  ] = await Promise.all([
    source('lib/apps/invoicing/provider-refund-service.ts'),
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/credit-notes.ts'),
    source('lib/apps/invoicing/schema.sql'),
  ]);

  assert.match(service, /createPendingPaymentRefund/);
  assert.match(service, /createPendingCreditRefund/);
  assert.match(service, /status IN \([\s\S]*'pending'[\s\S]*'requires_action'/s);
  assert.match(service, /reserved_refund_amount/);
  assert.match(service, /reserved_credit_refund/);
  assert.match(service, /createInvoiceProviderRefundRemote/);
  assert.match(service, /getInvoiceProviderRefundRemote/);

  assert.match(commands, /finalizeInvoicePaymentProviderRefund/);
  assert.match(commands, /Only a pending provider refund can be finalized/);
  assert.match(commands, /postInvoicePaymentRefundToAccounting/);
  assert.match(credits, /finalizeInvoiceCreditNoteProviderRefund/);
  assert.match(credits, /Only a pending provider credit refund can be finalized/);
  assert.match(credits, /postCreditNoteRefundToAccounting/);

  assert.match(
    schema,
    /status IN \([\s\S]*'pending'[\s\S]*'requires_action'[\s\S]*'posted'[\s\S]*'failed'[\s\S]*'reversed'/s,
  );
});

test('payment and credit-note refund actions route through the provider-aware authority', async () => {
  const [
    route,
    service,
    paymentsUi,
    creditUi,
  ] = await Promise.all([
    source('app/api/apps/invoicing/route.ts'),
    source('lib/apps/invoicing/service.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/[invoiceId]/CreditNoteLifecyclePanel.tsx'),
  ]);

  assert.match(route, /case 'refund_payment':[\s\S]*requestInvoicePaymentRefund/s);
  assert.match(route, /case 'refund_credit_note':[\s\S]*requestInvoiceCreditNoteRefund/s);
  assert.match(route, /case 'check_provider_refund':[\s\S]*checkInvoiceProviderRefund/s);
  assert.match(route, /case 'confirm_provider_refund':[\s\S]*confirmInvoiceProviderRefund/s);

  for (const marker of [
    'requestInvoicePaymentRefund',
    'requestInvoiceCreditNoteRefund',
    'checkInvoiceProviderRefund',
    'confirmInvoiceProviderRefund',
  ]) {
    assert.match(service, new RegExp(marker));
  }

  assert.match(paymentsUi, /Check status/);
  assert.match(paymentsUi, /Confirm completed/);
  assert.match(paymentsUi, /idempotencyKey:[\s\S]*requestKey\([\s\S]*'payment-refund'/s);
  assert.match(creditUi, /Manual \/ offline refund/);
  assert.match(creditUi, /name="paymentId"/);
  assert.match(creditUi, /check_provider_refund/);
  assert.match(creditUi, /confirm_provider_refund/);
});

test('completed external refunds cannot be falsely reversed inside SaMi', async () => {
  const [
    commands,
    credits,
    paymentUi,
    creditUi,
  ] = await Promise.all([
    source('lib/apps/invoicing/commands.ts'),
    source('lib/apps/invoicing/credit-notes.ts'),
    source('app/apps/invoicing/InvoicingWorkspaceClient.tsx'),
    source('app/apps/invoicing/[invoiceId]/CreditNoteLifecyclePanel.tsx'),
  ]);

  assert.match(
    commands,
    /A completed provider refund cannot be reversed inside SaMi/,
  );
  assert.match(
    credits,
    /A completed provider refund cannot be reversed inside SaMi/,
  );
  assert.match(paymentUi, /refund\.status ===[\s\S]*'posted'[\s\S]*!refund\.provider/s);
  assert.match(creditUi, /refund\.status ===[\s\S]*'posted'[\s\S]*!refund\.provider/s);
});

test('Invoicing 2.23 migrates provider refund states without advertising control versions early', async () => {
  const [
    manifest,
    runtime,
    migration,
    script,
    pkg,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/invoicing/migrations/2.22.0-to-2.23.0.ts'),
    source('scripts/migrate-invoicing-2-23-before-release.ts'),
    source('package.json'),
  ]);

  assert.match(manifest, /key:\s*"invoicing"[\s\S]*version:\s*'2\.23\.0'/);
  assert.match(runtime, /INVOICING_2_22_0_TO_2_23_0/);
  assert.match(migration, /fromVersion:\s*'2\.22\.0'[\s\S]*toVersion:\s*'2\.23\.0'/);
  assert.match(migration, /pending[\s\S]*requires_action[\s\S]*posted[\s\S]*failed[\s\S]*reversed/s);
  assert.match(script, /runSamiModuleMigrations/);
  assert.match(script, /expand-before-promote/);
  assert.match(script, /controlVersionUpdated:[\s\S]*false/);
  assert.doesNotMatch(script, /UPDATE\s+tenant_modules/i);
  assert.match(pkg, /migrate:invoicing:2\.23:release/);
  assert.match(pkg, /test:invoicing:2\.23:release/);
});
