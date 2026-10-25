import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/dispatch/route.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/ErrandsApp.tsx", import.meta.url), "utf8");
const setup = readFileSync(new URL("../components/AdminSetupForm.tsx", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../app/api/payments/mpesa/checkout/route.ts", import.meta.url), "utf8");
const callback = readFileSync(new URL("../app/api/payments/mpesa/callback/route.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8");

test("the customer workflow has no quotation or quote-approval step", () => {
  for (const removed of ["quote_amount", "quote_approved", "quote_decided_at", "approveQuote", "declineQuote", 'act === "quote"', "'quoted'"]) {
    assert.ok(!route.includes(removed), "legacy quote workflow remains in API: " + removed);
    assert.ok(!ui.toLowerCase().includes(removed.toLowerCase()), "legacy quote workflow remains in UI: " + removed);
  }
  assert.ok(route.includes('if (act === "assign")'));
  assert.ok(route.includes('["requested","declined"].includes(previous)'));
});

test("service fee, commission and provider share are calculated from database pricing", () => {
  assert.ok(route.includes('SELECT * FROM service_pricing WHERE category=$1 AND enabled=true'));
  assert.ok(route.includes("function calculateServicePrice"));
  assert.ok(route.includes("distance_rate_per_km"));
  assert.ok(route.includes('input.itemSize + "_item_fee"'));
  assert.ok(route.includes("value_surcharge_threshold"));
  assert.ok(route.includes("serviceFee = Math.round((baseFee + distanceFeeRaw + sizeFeeRaw + valueFeeRaw) * multiplier)"));
  assert.ok(route.includes("Math.round(serviceFee * commissionRate) / 100"));
  assert.ok(route.includes("Math.round((serviceFee - commission) * 100) / 100"));
  assert.ok(ui.includes("service-fee-preview"));
  assert.ok(ui.includes("name=\"distanceKm\""));
  assert.ok(ui.includes("name=\"itemSize\""));
  assert.ok(ui.includes("value_surcharge_rate"));
});

test("admin bootstrap reports readiness and actionable errors without exposing the token", () => {
  assert.ok(route.includes('action === "bootstrapStatus"'));
  assert.ok(route.includes("tokenConfigured, setupAvailable"));
  assert.ok(route.includes("ADMIN_BOOTSTRAP_TOKEN"));
  assert.ok(route.includes("does not match this deployment"));
  assert.ok(setup.includes("bootstrapStatus"));
  assert.ok(setup.includes("ADMIN_BOOTSTRAP_TOKEN for Preview"));
  assert.ok(setup.includes("minLength={14}"));
});

test("seller goods are tracked separately from service-fee payments", () => {
  assert.ok(route.includes("seller_payment_status"));
  assert.ok(route.includes('act==="recordSellerPayment"'));
  assert.ok(route.includes('"seller_payment"'));
  assert.ok(route.includes('"service_payment"'));
  assert.ok(ui.includes("Record seller payment separately"));
  assert.ok(ui.includes("Goods are paid to the seller separately"));
});

test("M-PESA checkout only starts when server credentials exist and records pending status", () => {
  assert.ok(checkout.includes("MPESA_CONSUMER_KEY"));
  assert.ok(checkout.includes("/mpesa/stkpush/v1/processrequest"));
  assert.ok(checkout.includes("status='pending'"));
  assert.ok(checkout.includes("service_fee_amount"));
  assert.ok(checkout.includes("CallBackURL"));
});

test("M-PESA callback checks the secret, checkout, amount, phone and receipt before marking paid", () => {
  assert.ok(callback.includes("MPESA_CALLBACK_TOKEN"));
  assert.ok(callback.includes("checkout_request_id"));
  assert.ok(callback.includes("actualAmount === Number(attempt.amount)"));
  assert.ok(callback.includes("actualPhone === expectedPhone"));
  assert.ok(callback.includes("receipt.length >= 6"));
  assert.ok(callback.includes("payment_status='paid'"));
  assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS payment_attempts"));
});

test("cash and in-app choices cannot silently claim a payment succeeded", () => {
  assert.ok(route.includes('body.servicePaymentMethod === "in_app" ? "in_app" : "cash"'));
  assert.ok(route.includes("Enter the verified in-app transaction reference before recording the service payment."));
  assert.ok(ui.includes('option value="cash">Cash to the errand provider'));
  assert.ok(ui.includes('value="in_app" disabled={!mpesaConfigured}>M-PESA in-app payment'));
});

test("operations can audit changes to category fees and commission", () => {
  assert.ok(route.includes('action === "updatePricing"'));
  assert.ok(route.includes("INSERT INTO pricing_audit_events"));
  assert.ok(ui.includes('tab==="pricing"'));
  assert.ok(ui.includes("Save pricing rule"));
});
