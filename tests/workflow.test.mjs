import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/dispatch/route.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/ErrandsApp.tsx", import.meta.url), "utf8");

test("the customer workflow has no quotation or quote-approval step", () => {
  for (const removed of ["quote_amount", "quote_approved", "quote_decided_at", "approveQuote", "declineQuote", 'act === "quote"', "'quoted'"]) {
    assert.ok(!route.includes(removed), "legacy quote workflow remains in API: " + removed);
    assert.ok(!ui.toLowerCase().includes(removed.toLowerCase()), "legacy quote workflow remains in UI: " + removed);
  }
  assert.ok(route.includes('if (act === "assign")'));
  assert.ok(route.includes('["requested","declined"].includes(previous)'));
});

test("service fee, commission and provider share are computed from database pricing", () => {
  assert.ok(route.includes('SELECT * FROM service_pricing WHERE category=$1 AND enabled=true'));
  assert.ok(route.includes("Math.round(Number(rule.base_fee) * multiplier * 100) / 100"));
  assert.ok(route.includes("Math.round(serviceFee * commissionRate) / 100"));
  assert.ok(route.includes("Math.round((serviceFee - commission) * 100) / 100"));
  assert.ok(ui.includes("service-fee-preview"));
});

test("seller goods are tracked separately from service-fee payments", () => {
  assert.ok(route.includes("seller_payment_status"));
  assert.ok(route.includes('act==="recordSellerPayment"'));
  assert.ok(route.includes('"seller_payment"'));
  assert.ok(route.includes('"service_payment"'));
  assert.ok(ui.includes("Record seller payment separately"));
  assert.ok(ui.includes("Goods are paid to the seller separately"));
});

test("cash and in-app choices cannot silently claim a payment succeeded", () => {
  assert.ok(route.includes('body.servicePaymentMethod === "in_app" ? "in_app" : "cash"'));
  assert.ok(route.includes("Enter the verified in-app transaction reference before recording the service payment."));
  assert.ok(ui.includes('option value="cash">Cash to the errand provider'));
  assert.ok(ui.includes('option value="in_app">In-app payment'));
});

test("operations can audit changes to category fees and commission", () => {
  assert.ok(route.includes('action === "updatePricing"'));
  assert.ok(route.includes("INSERT INTO pricing_audit_events"));
  assert.ok(ui.includes('tab==="pricing"'));
  assert.ok(ui.includes("Save pricing rule"));
});
