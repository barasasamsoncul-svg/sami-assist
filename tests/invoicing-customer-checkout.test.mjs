import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8'))
    .replace(/\r\n/g, '\n');
}

test('customer Pay Now uses the business-selected route while supporting hosted providers and verified M-PESA STK', async () => {
  const [
    providers,
    service,
    client,
    publicPage,
    portalPage,
  ] = await Promise.all([
    source('lib/apps/invoicing/payment-checkout-providers.ts'),
    source('lib/apps/invoicing/payment-checkout.ts'),
    source('app/apps/invoicing/InvoicePayNow.tsx'),
    source('app/i/[tenantId]/[token]/page.tsx'),
    source('app/p/[tenantId]/[token]/invoices/[invoiceId]/page.tsx'),
  ]);

  for (const provider of [
    'pesapal',
    'stripe',
    'paystack',
    'flutterwave',
    'paypal',
  ]) {
    assert.match(
      providers,
      new RegExp("'" + provider + "'"),
      provider + ' must be available as a hosted invoice checkout provider.',
    );
  }

  assert.doesNotMatch(
    providers,
    /HOSTED_INVOICE_PAYMENT_PROVIDERS[\s\S]{0,250}'mpesa'/,
    'M-PESA STK is an asynchronous phone prompt, not a fake hosted redirect.',
  );
  assert.match(service, /mpesaStkCheckoutRequirement/);
  assert.match(service, /createMpesaStkPush/);
  assert.match(service, /connection\.checkoutPrimary/);
  assert.match(service, /return \[\s*\{[\s\S]*selected\.provider/s);
  assert.match(client, /Pay now/);
  assert.match(client, /phoneNumber/);

  assert.match(client, /Pay securely online/);
  assert.doesNotMatch(client, /Pay with/);
  assert.match(client, /JSON\.stringify\(\{[\s\S]*provider/s);
  assert.doesNotMatch(
    client,
    /secretKey|consumerSecret|clientSecret|webhookSecret/,
    'Customer UI must never receive merchant secrets.',
  );

  assert.match(publicPage, /<InvoicePayNow/);
  assert.match(publicPage, /access="public"/);
  assert.match(portalPage, /<InvoicePayNow/);
  assert.match(portalPage, /access="portal"/);

  assert.match(service, /openIntegrationSecret/);
  assert.match(service, /settings\.callbackConfigured !== true/);
  assert.match(service, /settings\.autoReconcile === false/);
});

test('checkout amount and invoice authority are always server-derived', async () => {
  const [
    service,
    checkoutRoute,
  ] = await Promise.all([
    source('lib/apps/invoicing/payment-checkout.ts'),
    source('app/api/public/invoicing/payment-checkout/[access]/[tenantId]/[token]/[invoiceId]/route.ts'),
  ]);

  assert.match(service, /getPublicInvoice/);
  assert.match(service, /getCustomerPortalInvoice/);
  assert.match(service, /invoice\.balanceDue/);
  assert.match(service, /invoice\.currency/);
  assert.match(service, /invoice\.invoiceNumber/);
  assert.match(service, /invoice\.id/);

  assert.doesNotMatch(
    checkoutRoute,
    /payload\.amount|payload\.currency|payload\.invoiceNumber/,
    'Public checkout must never trust browser financial values.',
  );

  assert.match(checkoutRoute, /sameOrigin/);
  assert.match(checkoutRoute, /content-length/);
  assert.match(service, /Too many payment attempts/);
  assert.match(service, /INTERVAL '15 minutes'/);
});

test('hosted provider checkouts embed SaMi invoice identity and return through verified server flows', async () => {
  const [
    providers,
    service,
    returnRoute,
  ] = await Promise.all([
    source('lib/apps/invoicing/payment-checkout-providers.ts'),
    source('lib/apps/invoicing/payment-checkout.ts'),
    source('app/api/public/invoicing/payment-return/[access]/[tenantId]/[token]/[invoiceId]/[provider]/route.ts'),
  ]);

  assert.match(providers, /SubmitOrderRequest/);
  assert.match(providers, /checkout\.sessions\.create/);
  assert.match(providers, /transaction\/initialize/);
  assert.match(providers, /api\.flutterwave\.com\/v3\/payments/);
  assert.match(providers, /\/v2\/checkout\/orders/);

  assert.match(providers, /invoiceId/);
  assert.match(providers, /invoiceNumber/);
  assert.match(providers, /client_reference_id/);
  assert.match(providers, /custom_id/);
  assert.match(providers, /invoice_id/);

  assert.match(service, /verifyInvoicePaymentCheckoutReturn/);
  assert.match(service, /recordVerifiedExternalInvoiceSettlement/);
  assert.match(service, /matchesInvoice/);
  assert.match(service, /payment\.currency\.toUpperCase\(\)/);
  assert.match(returnRoute, /NextResponse\.redirect/);
  assert.match(returnRoute, /payment: 'failed'/);
});

test('return verification and webhooks converge on duplicate-safe provider transaction identities', async () => {
  const [
    checkoutProviders,
    webhookAdapters,
    settlement,
    paymentCore,
  ] = await Promise.all([
    source('lib/apps/invoicing/payment-checkout-providers.ts'),
    source('lib/apps/invoicing/payment-provider-adapters.ts'),
    source('lib/apps/invoicing/external-settlement.ts'),
    source('lib/apps/invoicing/payment-core.ts'),
  ]);

  assert.match(checkoutProviders, /externalEventId: session\.id/);
  assert.match(webhookAdapters, /externalEventId: session\.id/);

  assert.match(checkoutProviders, /externalEventId:[\s\S]*found\.capture\.id/s);
  assert.match(webhookAdapters, /externalEventId: captureId/);

  assert.match(checkoutProviders, /trackingId \+ ':COMPLETED'/);
  assert.match(webhookAdapters, /trackingId \+ ':' \+ status/);

  assert.match(checkoutProviders, /cleanString\(data\.id, 100\)/);
  assert.match(webhookAdapters, /cleanString\(data\.id, 100\)/);

  assert.match(settlement, /gateway:'\+input\.providerKey\+':'\+input\.externalEventId/);
  assert.match(paymentCore, /idempotencyKey/);
  assert.match(paymentCore, /postInvoicePaymentToAccounting/);
});

test('Flutterwave and PayPal returns are provider-verified before settlement', async () => {
  const [
    checkoutProviders,
    webhookAdapters,
  ] = await Promise.all([
    source('lib/apps/invoicing/payment-checkout-providers.ts'),
    source('lib/apps/invoicing/payment-provider-adapters.ts'),
  ]);

  assert.match(
    checkoutProviders,
    /transactions\/verify_by_reference|transactions\/.*\/verify/s,
  );
  assert.match(
    webhookAdapters,
    /transactions\/verify_by_reference|transactions\/.*\/verify/s,
  );
  assert.match(
    checkoutProviders,
    /\/v2\/checkout\/orders\/.*\/capture/s,
  );
  assert.match(
    webhookAdapters,
    /verify-webhook-signature/,
  );
  assert.match(
    webhookAdapters,
    /\/v2\/checkout\/orders\//,
    'PayPal webhooks must recover invoice metadata from the order when capture payloads omit it.',
  );
});


test('M-PESA STK uses encrypted merchant passkeys, one-time callbacks and server-side Daraja verification', async () => {
  const [
    catalog,
    adapters,
    stk,
    checkout,
    client,
    route,
    callbackRoute,
  ] = await Promise.all([
    source('lib/apps/invoicing/payment-provider-catalog.ts'),
    source('lib/apps/invoicing/payment-provider-adapters.ts'),
    source('lib/apps/invoicing/mpesa-stk.ts'),
    source('lib/apps/invoicing/payment-checkout.ts'),
    source('app/apps/invoicing/InvoicePayNow.tsx'),
    source('app/api/public/invoicing/payment-checkout/[access]/[tenantId]/[token]/[invoiceId]/route.ts'),
    source('app/api/public/invoicing/mpesa-stk/[tenantId]/[callbackToken]/route.ts'),
  ]);

  assert.match(catalog, /Lipa na M-PESA Online passkey/);
  assert.match(catalog, /shortCodeType/);
  assert.match(catalog, /value: 'paybill'/);
  assert.match(catalog, /value: 'till'/);

  assert.match(adapters, /passkey\?: string/);
  assert.match(adapters, /shortCodeType\?: 'paybill' \| 'till'/);
  assert.match(adapters, /required\(\s*input,\s*'passkey'/s);

  assert.match(stk, /\/mpesa\/stkpush\/v1\/processrequest/);
  assert.match(stk, /\/mpesa\/stkpushquery\/v1\/query/);
  assert.match(stk, /CustomerPayBillOnline/);
  assert.match(stk, /CustomerBuyGoodsOnline/);
  assert.match(stk, /callbackTokenHash/);
  assert.match(stk, /crypto[\s\S]{0,80}\.randomBytes\(\s*32/s);
  assert.match(stk, /MpesaReceiptNumber/);
  assert.match(stk, /recordVerifiedExternalInvoiceSettlement/);
  assert.match(stk, /externalEventId:\s*checkoutRequestId/s);
  assert.match(stk, /amount !==\s*intent\.amount/s);

  assert.match(checkout, /provider ===\s*'mpesa'/s);
  assert.match(checkout, /checkMpesaStkStatus/);
  assert.match(route, /operation ===\s*'status'/s);
  assert.match(callbackRoute, /receiveMpesaStkCallback/);

  assert.match(client, /type="tel"/);
  assert.match(client, /operation:\s*'status'/s);
  assert.match(client, /checkoutRequestId/);
  assert.doesNotMatch(
    client,
    /passkey|consumerSecret|consumerKey/,
    'Daraja merchant credentials must never reach the customer browser.',
  );
});

test('M-PESA STK only offers exact whole-KES settlement and normalizes Kenyan phone numbers server-side', async () => {
  const stk =
    await source('lib/apps/invoicing/mpesa-stk.ts');

  assert.match(stk, /currency[\s\S]*'KES'/s);
  assert.match(stk, /Number\.isInteger/);
  assert.match(stk, /normalizeKenyanMpesaPhone/);
  assert.match(stk, /\^254\(\?:7\\d\{8\}\|1\\d\{8\}\)\$/);
  assert.match(stk, /Amount:\s*input\.amount/s);
  assert.match(stk, /invoiceId:\s*intent\.invoiceId/s);
});


test('first-event webhook verification does not block customer checkout after callback setup is configured', async () => {
  const [
    checkout,
    connections,
  ] = await Promise.all([
    source('lib/apps/invoicing/payment-checkout.ts'),
    source('lib/apps/invoicing/payment-provider-connections.ts'),
  ]);

  assert.match(
    checkout,
    /settings\.callbackConfigured !== true/,
    'Customer checkout should require the callback setup to be configured.',
  );
  assert.doesNotMatch(
    checkout,
    /callbackVerified !== true/,
    'First signed webhook verification is observability, not a reason to disable an otherwise provider-verified checkout flow.',
  );
  assert.match(
    connections,
    /callbackVerified:\s*false/,
    'New provider connections must begin without pretending a provider event has already arrived.',
  );
});
