import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const schema=readFileSync(new URL("../database/schema.sql",import.meta.url),"utf8");
test("marketplace schema contains the operational data model",()=>{for(const table of ["users","provider_profiles","service_pricing","errands","errand_events","errand_messages","payment_records","payment_attempts","user_sessions","notifications","errand_ratings","auth_attempts","pricing_audit_events","schema_migrations"])assert.ok(new RegExp("CREATE TABLE IF NOT EXISTS\\s+"+table+"\\s*\\(").test(schema),"missing table "+table);});
test("the platform supports broad legitimate errand categories",()=>{for(const category of ["shopping","clothing_retail","pickup_delivery","documents_admin","personal_errand","queue_appointments","business_support","local_assistance","other"])assert.ok(schema.includes("'"+category+"'"),"missing category "+category);});
test("payment choices separate service payments from seller purchases",()=>{assert.ok(schema.includes("service_payment_method text NOT NULL DEFAULT 'cash' CHECK(service_payment_method IN ('cash','in_app'))"));assert.ok(schema.includes("seller_payment_status text NOT NULL DEFAULT 'not_applicable'"));assert.ok(schema.includes("record_type IN ('service_payment','provider_payout','provider_commission','seller_payment','refund','adjustment')"));});
test("the service fee, commission and provider share are stored separately",()=>{assert.ok(schema.includes("service_fee_amount numeric(12,2) NOT NULL DEFAULT 0"));assert.ok(schema.includes("commission_amount numeric(12,2) NOT NULL DEFAULT 0"));assert.ok(schema.includes("provider_earning_amount numeric(12,2) NOT NULL DEFAULT 0"));});
test("payment amounts are non-negative and duplicate records are guarded",()=>{assert.ok(schema.includes("amount numeric(12,2) NOT NULL CHECK(amount>=0)"));assert.ok(schema.includes("CREATE UNIQUE INDEX IF NOT EXISTS payment_records_idempotency_unique"));});
test("accounts store password hashes and sessions store token hashes",()=>{assert.ok(schema.includes("password_hash text NOT NULL"));assert.ok(schema.includes("token_hash text NOT NULL UNIQUE"));});
test("pricing changes and errand lifecycle can be audited",()=>{assert.ok(schema.includes("pricing_audit_events"));assert.ok(schema.includes("metadata jsonb NOT NULL DEFAULT '{}'::jsonb"));});
test("migrations are idempotent",()=>{assert.ok(schema.includes("ON CONFLICT DO NOTHING"));});
test("distance, item-size and item-value pricing are stored with the errand",()=>{
  for(const column of ["distance_km numeric(8,2)","item_size text NOT NULL DEFAULT 'none'","distance_fee_amount numeric(12,2)","item_size_fee_amount numeric(12,2)","value_surcharge_amount numeric(12,2)"])assert.ok(schema.includes(column),"missing errand pricing column "+column);
  for(const column of ["distance_rate_per_km numeric(12,2)","small_item_fee numeric(12,2)","medium_item_fee numeric(12,2)","large_item_fee numeric(12,2)","bulky_item_fee numeric(12,2)","value_surcharge_threshold numeric(12,2)","value_surcharge_rate numeric(5,2)"])assert.ok(schema.includes(column),"missing pricing control "+column);
  assert.ok(schema.includes("'2026-10-25-sami-errands-route-item-pricing'"));
});
