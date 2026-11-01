import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const otp = readFileSync(new URL("../lib/otp.ts", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("../app/api/dispatch/route.ts", import.meta.url), "utf8");

test("production OTP email uses the branded personalised SaMi template", () => {
  assert.match(otp, /EmailOtpPurpose = "register" \| "login"/);
  assert.match(otp, /EmailOtpOptions/);
  assert.match(otp, /ACCOUNT SECURITY/);
  assert.match(otp, /Keep this code private/);
  assert.match(otp, /letter-spacing:8px/);
  assert.match(otp, /expires in <strong[^>]*>10 minutes<\/strong>/);
});

test("dispatch passes the OTP purpose and recipient name to the email sender", () => {
  assert.match(
    dispatch,
    /sendEmailOtp\(destination, emailCode, \{\s*purpose,\s*recipientName: fullName,\s*\}\)/,
  );
});
