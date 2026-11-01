import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createTransport } from "nodemailer";

export type OtpChannel = "sms" | "whatsapp" | "email";

export function isOtpProviderConfigured(channel: OtpChannel): boolean {
  if (channel === "email") {
    const port = Number(process.env.SMTP_PORT);
    return Boolean(
      process.env.EMAIL_PROVIDER?.trim().toLowerCase() === "smtp" &&
      process.env.SMTP_HOST?.trim() &&
      Number.isInteger(port) && port > 0 &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD?.trim() &&
      (process.env.EMAIL_FROM?.trim() || process.env.SMTP_USER?.trim()) &&
      process.env.AUTH_EMAIL_OTP_PEPPER?.trim(),
    );
  }

  return Boolean(
    process.env.TWILIO_API_KEY?.trim() &&
    process.env.TWILIO_API_SECRET?.trim() &&
    process.env.TWILIO_VERIFY_SERVICE_SID?.trim(),
  );
}

export function normalizeKenyanPhone(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, "");
  if (/^0[17][0-9]{8}$/.test(digits)) return "+254" + digits.slice(1);
  if (/^254[17][0-9]{8}$/.test(digits)) return "+" + digits;
  if (/^[17][0-9]{8}$/.test(digits)) return "+254" + digits;
  return null;
}

export function phoneAliases(normalizedPhone: string): string[] {
  const digits = normalizedPhone.replace(/[^0-9]/g, "");
  if (!/^254[17][0-9]{8}$/.test(digits)) return [];
  return [digits, "0" + digits.slice(3)];
}

export function maskOtpDestination(destination: string, channel: OtpChannel): string {
  if (channel === "email") {
    const [local, domain] = destination.split("@");
    if (!local || !domain) return "your email address";
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  return `•••• ••• ${destination.slice(-3)}`;
}

function emailOtpPepper(): string {
  const pepper = process.env.AUTH_EMAIL_OTP_PEPPER?.trim();
  if (!pepper) throw new Error("EMAIL_OTP_NOT_CONFIGURED");
  return pepper;
}

/** Per-challenge code derivation avoids storing an OTP or its hash in PostgreSQL. */
export function createEmailOtpCode(challengeId: string): string {
  const digest = createHmac("sha256", emailOtpPepper())
    .update("sami-email-otp:" + challengeId)
    .digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export function verifyEmailOtp(challengeId: string, suppliedCode: string): boolean {
  if (!/^[0-9]{6}$/.test(suppliedCode)) return false;
  const expected = Buffer.from(createEmailOtpCode(challengeId), "utf8");
  const supplied = Buffer.from(suppliedCode, "utf8");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function sendEmailOtp(destination: string, code: string): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE?.trim().toLowerCase() === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM?.trim() || user;
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  if (
    process.env.EMAIL_PROVIDER?.trim().toLowerCase() !== "smtp" ||
    !host || !Number.isInteger(port) || port <= 0 || !user || !pass || !from
  ) {
    throw new Error("SMTP_EMAIL_NOT_CONFIGURED");
  }

  const transporter = createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    ...(secure ? {} : { requireTLS: true }),
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transporter.sendMail({
      from,
      to: destination,
      ...(replyTo ? { replyTo } : {}),
      subject: "Your SaMi verification code",
      text: `Your SaMi verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#14213d"><h2>SaMi</h2><p>Use this code to continue:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes. Never share it with anyone.</p></div>`,
    });
  } finally {
    transporter.close();
  }
}

async function verifyRequest(path: string, fields: Record<string, string>): Promise<any> {
  const apiKey = process.env.TWILIO_API_KEY?.trim();
  const apiSecret = process.env.TWILIO_API_SECRET?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!apiKey || !apiSecret || !serviceSid) {
    throw new Error("TWILIO_VERIFY_NOT_CONFIGURED");
  }

  const authorization = Buffer.from(`${apiKey}:${apiSecret}`, "utf8").toString("base64");
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(fields),
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[SaMi OTP] Twilio Verify request failed.", {
      status: response.status,
      code: typeof payload?.code === "number" ? payload.code : undefined,
    });
    if (response.status === 404 || response.status === 400) return { invalid: true };
    throw new Error("TWILIO_VERIFY_REQUEST_FAILED");
  }
  return payload;
}

export async function sendOtp(
  destination: string,
  channel: Exclude<OtpChannel, "email">,
): Promise<string | null> {
  const result = await verifyRequest("Verifications", {
    To: destination,
    Channel: channel,
  });
  if (result?.invalid || result?.status !== "pending") {
    throw new Error("TWILIO_VERIFY_SEND_FAILED");
  }
  return typeof result.sid === "string" ? result.sid : null;
}

export async function checkOtp(destination: string, code: string): Promise<boolean> {
  const result = await verifyRequest("VerificationCheck", {
    To: destination,
    Code: code,
  });
  return result?.status === "approved" && result?.valid === true;
}
