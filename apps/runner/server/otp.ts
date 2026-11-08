import "server-only";

import { Buffer } from "node:buffer";

export function normalizeKenyanPhone(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, "");
  if (/^0[17][0-9]{8}$/.test(digits)) return "+254" + digits.slice(1);
  if (/^254[17][0-9]{8}$/.test(digits)) return "+" + digits;
  if (/^[17][0-9]{8}$/.test(digits)) return "+254" + digits;
  return null;
}

function twilioConfiguration() {
  const apiKey = process.env.RUNNER_TWILIO_API_KEY?.trim();
  const apiSecret = process.env.RUNNER_TWILIO_API_SECRET?.trim();
  const serviceSid = process.env.RUNNER_TWILIO_VERIFY_SERVICE_SID?.trim();

  if (!apiKey || !apiSecret || !serviceSid) {
    throw new Error("RUNNER_SMS_NOT_CONFIGURED");
  }
  return { apiKey, apiSecret, serviceSid };
}

async function twilioVerify(
  action: "Verifications" | "VerificationCheck",
  fields: Record<string, string>,
) {
  const config = twilioConfiguration();
  const authorization = Buffer.from(
    config.apiKey + ":" + config.apiSecret,
    "utf8",
  ).toString("base64");

  const response = await fetch(
    "https://verify.twilio.com/v2/Services/" + config.serviceSid + "/" + action,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + authorization,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(fields),
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("RUNNER_OTP_PROVIDER_FAILED");

  return payload as { status?: string; valid?: boolean };
}

export async function sendRunnerOtp(phone: string) {
  const result = await twilioVerify("Verifications", {
    To: phone,
    Channel: "sms",
  });
  if (result.status !== "pending") {
    throw new Error("RUNNER_OTP_SEND_FAILED");
  }
}

export async function checkRunnerOtp(
  phone: string,
  code: string,
): Promise<boolean> {
  if (!/^[0-9]{6}$/.test(code)) return false;
  const result = await twilioVerify("VerificationCheck", {
    To: phone,
    Code: code,
  });
  return result.status === "approved" && result.valid === true;
}