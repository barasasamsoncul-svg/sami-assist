import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('invoice payment providers use a guided merchant connection surface instead of a developer webhook form', async () => {
  const [catalog, ui, api] = await Promise.all([
    source('lib/apps/invoicing/payment-provider-catalog.ts'),
    source('app/apps/invoicing/PaymentIntegrationsWorkspace.tsx'),
    source('app/api/apps/invoicing/payment-providers/route.ts'),
  ]);

  for (const provider of ['pesapal', 'mpesa', 'stripe', 'paystack', 'flutterwave', 'paypal']) {
    assert.match(catalog, new RegExp("key: '" + provider + "'"));
  }

  assert.match(ui, /Connect &amp; Test/);
  assert.match(ui, /Payment notification URL/);
  assert.match(ui, /Automatic invoice payments/);
  assert.doesNotMatch(ui, /\/integrations\?provider=invoicing_payment_gateway/);
  assert.doesNotMatch(ui, /Bearer Key|Authorization header|Webhook Secret/i);

  assert.match(api, /rejectIntegrationCrossOrigin/);
  assert.match(api, /connectInvoicePaymentProvider/);
  assert.match(api, /confirmInvoicePaymentProviderSetup/);
  assert.match(api, /confirm_setup/);
  assert.match(api, /testInvoicePaymentProviderConnection/);
  assert.match(api, /disconnectInvoicePaymentProvider/);
});

test('payment provider credentials stay server-side, encrypted and workspace-scoped', async () => {
  const [service, adapters, cryptoSource] = await Promise.all([
    source('lib/apps/invoicing/payment-provider-connections.ts'),
    source('lib/apps/invoicing/payment-provider-adapters.ts'),
    source('lib/integrations/crypto.ts'),
  ]);

  assert.match(service, /resolveWorkspaceIntegrationContext\('manage'\)/);
  assert.match(service, /invoicing\.payment\.record/);
  assert.match(service, /sealIntegrationSecret/);
  assert.match(service, /integration_credentials/);
  assert.match(service, /confirmInvoicePaymentProviderSetup/);
  assert.match(service, /callbackConfigured',TRUE/);
  assert.match(cryptoSource, /aes-256-gcm/);

  assert.match(adapters, /Auth\/RequestToken/);
  assert.match(adapters, /oauth\/v1\/generate\?grant_type=client_credentials/);
  assert.match(adapters, /Lipa na M-PESA Online passkey/);
  assert.match(adapters, /shortCodeType/);
  assert.match(adapters, /webhookEndpoints\.create/);
  assert.match(adapters, /x-paystack-signature/);
  assert.match(adapters, /flutterwave-signature/);
  assert.match(adapters, /verify-webhook-signature/);
});

test('provider notifications are verified and converge on the existing idempotent invoice settlement core', async () => {
  const [service, adapters, settlement, core, route] = await Promise.all([
    source('lib/apps/invoicing/payment-provider-connections.ts'),
    source('lib/apps/invoicing/payment-provider-adapters.ts'),
    source('lib/apps/invoicing/external-settlement.ts'),
    source('lib/apps/invoicing/payment-core.ts'),
    source('app/api/apps/invoicing/payment-providers/webhooks/[tenantId]/[endpointKey]/route.ts'),
  ]);

  assert.match(service, /verifyAndNormalizeInvoicePaymentWebhook/);
  assert.match(service, /recordVerifiedExternalInvoiceSettlement/);
  assert.match(service, /integration_webhook_deliveries/);
  assert.match(service, /external_event_id/);
  assert.match(service, /PAYMENT_WEBHOOK_RATE_LIMITED/);

  assert.match(adapters, /GetTransactionStatus/);
  assert.match(adapters, /constructEvent/);
  assert.match(adapters, /createHmac\('sha512'/);
  assert.match(adapters, /createHmac\('sha256'/);

  assert.match(settlement, /recordInvoicePaymentCore/);
  assert.match(core, /idempotencyKey/);
  assert.match(core, /postInvoicePaymentToAccounting/);

  assert.match(route, /request\.text\(\)/);
  assert.doesNotMatch(route, /authorization.*Bearer/i);
});


test('manual webhook setup is not reported as verified until SaMi validates a real provider event', async () => {
  const [
    service,
    ui,
  ] = await Promise.all([
    source('lib/apps/invoicing/payment-provider-connections.ts'),
    source('app/apps/invoicing/PaymentIntegrationsWorkspace.tsx'),
  ]);

  assert.match(
    service,
    /'callbackConfigured',TRUE,[\s\S]*'callbackVerified',FALSE/s,
    'Owner confirmation may enable the configured callback path but must not fake provider verification.',
  );
  assert.match(
    service,
    /'callbackVerified',TRUE,[\s\S]*'callbackVerifiedAt',NOW\(\)/s,
    'A successfully verified provider event must advance webhook verification state.',
  );
  assert.match(
    service,
    /settings\.callbackVerified === true[\s\S]*Boolean\(row\.last_received_at\)/s,
    'Existing connections with processed provider events remain recognized as verified.',
  );

  assert.match(ui, /Configured · awaiting event/);
  assert.match(ui, /\? 'Verified'/);
  assert.match(ui, /Last verified event/);
  assert.match(ui, /Verified webhooks/);
  assert.match(
    ui,
    /This checks the merchant API connection; webhook verification is tracked separately/,
  );
});


test('verified gateway settlement casts numeric allocation arithmetic and does not degrade provider health on internal posting failures', async () => {
  const [
    paymentCore,
    connections,
    checkout,
    catalog,
  ] = await Promise.all([
    source('lib/apps/invoicing/payment-core.ts'),
    source('lib/apps/invoicing/payment-provider-connections.ts'),
    source('lib/apps/invoicing/payment-checkout.ts'),
    source('lib/apps/invoicing/payment-provider-catalog.ts'),
  ]);

  assert.match(
    paymentCore,
    /ROUND\(\(\$4::numeric \* \$5::numeric\),4\)/,
  );
  assert.match(
    connections,
    /UPDATE integration_connections[\s\S]{0,260}SET settings=COALESCE\(settings,'\{\}'::jsonb\)[\s\S]{0,260}lastSettlementError/s,
  );
  assert.doesNotMatch(
    connections,
    /lastSettlementError[\s\S]{0,320}health_status='degraded'/s,
  );
  assert.match(
    checkout,
    /allowDegraded:[\s\S]*true/,
  );
  assert.match(
    checkout,
    /health_status='healthy'/,
  );
  assert.match(
    catalog,
    /registers the Pesapal IPN automatically/,
  );
});


test('provider Check retries verified payment events that previously failed during invoice posting', async () => {
  const [
    connections,
    workspace,
  ] = await Promise.all([
    source('lib/apps/invoicing/payment-provider-connections.ts'),
    source('app/apps/invoicing/PaymentIntegrationsWorkspace.tsx'),
  ]);

  assert.match(
    connections,
    /retryFailedVerifiedPayments/,
  );
  assert.match(
    connections,
    /event_key='invoicing\.payment\.succeeded'/,
  );
  assert.match(
    connections,
    /status='failed'/,
  );
  assert.match(
    connections,
    /recordVerifiedExternalInvoiceSettlement/,
  );
  assert.match(
    connections,
    /lastRecoveryRecovered/,
  );
  assert.match(
    workspace,
    /previously verified payment/,
  );
});
