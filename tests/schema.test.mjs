import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const schema=readFileSync(new URL("../database/schema.sql",import.meta.url),"utf8");
test("core marketplace data tables exist",()=>{for(const table of ["users","provider_profiles","errands","errand_events","errand_messages","payment_records","user_sessions","schema_migrations"])assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS "+table+" ("),"missing table "+table);});
test("user roles and errand workflow states are constrained",()=>{assert.ok(schema.includes("'customer','provider','admin'"));assert.ok(schema.includes("'requested','quoted','assigned','accepted','in_progress','completion_submitted','completed','disputed','cancelled','declined'"));});
test("session tokens are stored as hashes and passwords as hashes",()=>{assert.ok(schema.includes("token_hash text NOT NULL UNIQUE"));assert.ok(schema.includes("password_hash text NOT NULL"));});
test("payment amounts cannot be negative",()=>{assert.ok(schema.includes("amount numeric(12,2) NOT NULL CHECK(amount>=0)"));});