import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../database/schema.sql");
const migration = read("../database/migrations/2026-11-01-sami-passwordless-auth.sql");
const dispatch = read("../app/api/dispatch/route.ts");
const otp = read("../lib/otp.ts");
const register = read("../apps/mobile/app/(auth)/register-customer.tsx");
const providerRegister = read("../apps/mobile/app/(auth)/register.tsx");
const login = read("../apps/mobile/app/(auth)/login.tsx");
const verify = read("../apps/mobile/app/(auth)/verify.tsx");
const chooseRole = read("../apps/mobile/app/(auth)/choose-role.tsx");

test("baseline schema supports passwordless accounts and OTP challenges", () => {
  assert.match(schema, /password_hash text,/);
  assert.match(schema, /phone_verified_at timestamptz/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS auth_otp_challenges/);
  assert.match(schema, /2026-11-01-sami-passwordless-otp-auth/);
});
test("OTP migration is additive and grants challenge access to the app role", () => {
  assert.match(migration, /ALTER COLUMN password_hash DROP NOT NULL/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS phone_verified_at/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.auth_otp_challenges/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON public\.auth_otp_challenges TO sami_errands_app/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});
test("email OTP uses SMTP and timing-safe verification", () => {
  assert.match(otp, /createTransport/);
  assert.match(otp, /sendEmailOtp/);
  assert.match(otp, /createEmailOtpCode/);
  assert.match(otp, /timingSafeEqual/);
  assert.match(dispatch, /sendEmailOtp\(destination, emailCode\)/);
  assert.match(dispatch, /verifyEmailOtp\(challenge\.id, code\)/);
});
test("API exposes email-only OTP request and verification with rate limits", () => {
  assert.match(dispatch, /action === "requestOtp"/);
  assert.match(dispatch, /action === "verifyOtp"/);
  assert.match(dispatch, /body\.channel !== "email"/);
  assert.match(dispatch, /challenge\.channel !== "email"/);
  assert.match(dispatch, /attemptCount/);
  assert.match(dispatch, /createSession\(created\.id\)/);
  assert.match(dispatch, /createSession\(user\.id\)/);
  assert.match(dispatch, /Customer registration now requires email verification/);
});
test("customer registration is separate, passwordless and email-only", () => {
  assert.match(register, /Full name/);
  assert.match(register, /Phone number/);
  assert.match(register, /Email address/);
  assert.match(register, /purpose: "register"/);
  assert.match(register, /channel: "email"/);
  assert.doesNotMatch(register, /secureTextEntry|textContentType="newPassword"|HOW WILL YOU USE SAMI/);
  assert.match(chooseRole, /register-customer/);
});
test("provider application stays on its own registration screen", () => {
  assert.match(providerRegister, /role: "provider"/);
  assert.match(providerRegister, /Apply as an errand provider/);
  assert.doesNotMatch(providerRegister, /HOW WILL YOU USE SAMI/);
});
test("login and verification use email OTP and continue into the app", () => {
  assert.match(login, /EMAIL ADDRESS/);
  assert.match(login, /purpose: "login"/);
  assert.match(login, /channel: "email"/);
  assert.doesNotMatch(login, /PASSWORD|secureTextEntry/);
  assert.match(verify, /oneTimeCode/);
  assert.match(verify, /Verify and continue/);
  assert.match(verify, /router\.replace\("\/\(app\)"\)/);
});
