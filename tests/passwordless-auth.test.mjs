import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../database/schema.sql");
const migration = read("../database/migrations/2026-11-01-sami-passwordless-auth.sql");
const dispatch = read("../app/api/dispatch/route.ts");
const otp = read("../lib/otp.ts");
const register = read("../apps/mobile/app/(auth)/register.tsx");
const login = read("../apps/mobile/app/(auth)/login.tsx");
const verify = read("../apps/mobile/app/(auth)/verify.tsx");

test("customer schema supports passwordless accounts and phone verification", () => {
  assert.match(schema, /password_hash text[,;]/);
  assert.match(schema, /phone_verified_at timestamptz/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS auth_otp_challenges/);
});

test("OTP migration is additive and grants access only to the app role", () => {
  assert.match(migration, /ALTER COLUMN password_hash DROP NOT NULL/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS phone_verified_at/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.auth_otp_challenges/);
  assert.match(migration, /CHECK \(channel IN \('sms', 'whatsapp', 'email'\)\)/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON public\.auth_otp_challenges TO sami_errands_app/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test("dispatch exposes separate OTP request and one-time verification actions", () => {
  assert.match(dispatch, /action === "requestOtp"/);
  assert.match(dispatch, /action === "verifyOtp"/);
  assert.match(dispatch, /createSession\(created\.id\)/);
  assert.match(dispatch, /createSession\(user\.id\)/);
  assert.match(dispatch, /sami-otp-register-phone:/);
});

test("OTP service uses Twilio Verify and restricts channels", () => {
  for (const channel of ['"sms"', '"whatsapp"', '"email"']) {
    assert.ok(otp.includes(channel), "missing OTP channel " + channel);
  }
  assert.match(otp, /verify\.twilio\.com\/v2\/Services/);
  assert.match(otp, /VerificationCheck/);
});

test("registration collects mandatory identity fields without a password", () => {
  assert.match(register, /Full name/);
  assert.match(register, /Phone number/);
  assert.match(register, /Email address/);
  assert.match(register, /Send verification code/);
  assert.doesNotMatch(register, /secureTextEntry|textContentType="password"|name="password"/);
});

test("login and verification use OTP and continue to the customer app", () => {
  assert.match(login, /Email address or phone number/);
  assert.match(login, /Send verification code/);
  assert.match(verify, /oneTimeCode/);
  assert.match(verify, /Verify and continue/);
  assert.match(verify, /router\.replace\("\/\(app\)"\)/);
});
