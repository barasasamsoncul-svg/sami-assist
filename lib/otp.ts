
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createTransport } from "nodemailer";

export type OtpChannel = "sms" | "whatsapp" | "email";

export type EmailOtpPurpose =
  | "register"
  | "login"
  | "delete_account"
  | "change_contact"
  | "admin_password_reset";

export interface EmailOtpOptions {
  purpose: EmailOtpPurpose;
  recipientName?: string | null;
}

export function isOtpProviderConfigured(channel: OtpChannel): boolean {
  if (channel === "email") {
    const port = Number(process.env.SMTP_PORT);

    return Boolean(
      process.env.EMAIL_PROVIDER?.trim().toLowerCase() === "smtp" &&
      process.env.SMTP_HOST?.trim() &&
      Number.isInteger(port) &&
      port > 0 &&
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

  if (/^0[17][0-9]{8}$/.test(digits)) {
    return "+254" + digits.slice(1);
  }

  if (/^254[17][0-9]{8}$/.test(digits)) {
    return "+" + digits;
  }

  if (/^[17][0-9]{8}$/.test(digits)) {
    return "+254" + digits;
  }

  return null;
}

export function phoneAliases(normalizedPhone: string): string[] {
  const digits = normalizedPhone.replace(/[^0-9]/g, "");

  if (!/^254[17][0-9]{8}$/.test(digits)) {
    return [];
  }

  return [digits, "0" + digits.slice(3)];
}

export function maskOtpDestination(
  destination: string,
  channel: OtpChannel,
): string {
  if (channel === "email") {
    const [local, domain] = destination.split("@");

    if (!local || !domain) {
      return "your email address";
    }

    return `${local.slice(0, 1)}•••@${domain}`;
  }

  return `•••• ••• ${destination.slice(-3)}`;
}

function emailOtpPepper(): string {
  const pepper = process.env.AUTH_EMAIL_OTP_PEPPER?.trim();

  if (!pepper) {
    throw new Error("EMAIL_OTP_NOT_CONFIGURED");
  }

  return pepper;
}

/**
 * Derives a unique code per challenge.
 * Verification codes and hashes are not stored in PostgreSQL.
 */
export function createEmailOtpCode(challengeId: string): string {
  const digest = createHmac("sha256", emailOtpPepper())
    .update("sami-email-otp:" + challengeId)
    .digest();

  return String(
    digest.readUInt32BE(0) % 1_000_000,
  ).padStart(6, "0");
}

export function verifyEmailOtp(
  challengeId: string,
  suppliedCode: string,
): boolean {
  if (!/^[0-9]{6}$/.test(suppliedCode)) {
    return false;
  }

  const expected = Buffer.from(
    createEmailOtpCode(challengeId),
    "utf8",
  );

  const supplied = Buffer.from(suppliedCode, "utf8");

  return (
    expected.length === supplied.length &&
    timingSafeEqual(expected, supplied)
  );
}

function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendEmailOtp(
  destination: string,
  code: string,
  options: EmailOtpOptions,
): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);

  const secure =
    process.env.SMTP_SECURE?.trim().toLowerCase() === "true" ||
    port === 465;

  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;

  const fromAddress =
    process.env.EMAIL_FROM?.trim() || user;

  const from = fromAddress
    ? fromAddress.includes("<")
      ? fromAddress
      : { name: "SaMi", address: fromAddress }
    : undefined;

  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  if (
    process.env.EMAIL_PROVIDER?.trim().toLowerCase() !== "smtp" ||
    !host ||
    !Number.isInteger(port) ||
    port <= 0 ||
    !user ||
    !pass ||
    !fromAddress ||
    !from
  ) {
    throw new Error("SMTP_EMAIL_NOT_CONFIGURED");
  }

  if (!/^[0-9]{6}$/.test(code)) {
    throw new Error("INVALID_EMAIL_OTP");
  }

  const recipientName =
    options.recipientName?.trim().slice(0, 80) || "";

  const greeting = recipientName
    ? "Hello " + recipientName + ","
    : "Hello,";

  const htmlGreeting = escapeEmailHtml(greeting);

  const isRegistration = options.purpose === "register";
  const isDeletion = options.purpose === "delete_account";
  const isContactChange = options.purpose === "change_contact";
  const isAdminPasswordReset =
    options.purpose === "admin_password_reset";

  const subject = isRegistration
    ? "Verify your email to join SaMi"
    : isDeletion
      ? "Confirm your SaMi account deletion request"
      : isContactChange
        ? "Verify your new SaMi email address"
        : isAdminPasswordReset
          ? "Your SaMi Admin password recovery code"
          : "Your SaMi sign-in code";

  const action = isRegistration
    ? "finish creating your SaMi account"
    : isDeletion
      ? "confirm your request to delete your SaMi account"
      : isContactChange
        ? "confirm your new email address"
        : isAdminPasswordReset
          ? "verify your identity and reset your SaMi administrator password"
          : "sign in to your SaMi account";

  const heading = isRegistration
    ? "Welcome to SaMi"
    : isDeletion
      ? "Confirm account deletion"
      : isContactChange
        ? "Verify your new email"
        : isAdminPasswordReset
          ? "Admin password recovery"
          : "Your sign-in code";

  const purposeText = isRegistration
    ? "complete your SaMi account registration"
    : isDeletion
      ? "verify your identity before permanently deleting your account"
      : isContactChange
        ? "verify the new email address you want associated with your SaMi account"
        : isAdminPasswordReset
          ? "verify your identity before changing your administrator password"
          : "securely sign in to your SaMi account";

  const eyebrow = isRegistration
    ? "WELCOME TO SAMI"
    : isDeletion
      ? "ACCOUNT DELETION"
      : isContactChange
        ? "CONTACT VERIFICATION"
        : isAdminPasswordReset
          ? "ADMIN ACCOUNT RECOVERY"
          : "SECURE SIGN IN";

  const codeEntryInstruction = isAdminPasswordReset
    ? "Only enter this code on the official SaMi Admin password recovery screen."
    : "Only enter it in the SaMi app to continue.";

  const safeCode = escapeEmailHtml(code);
  const safeCodeEntryInstruction = escapeEmailHtml(
    codeEntryInstruction,
  );

  const textBody =
    greeting +
    "\n\n" +
    "Your SaMi one-time verification code is:\n\n" +
    code +
    "\n\n" +
    "Use this code to " +
    action +
    ".\n" +
    "It expires in 10 minutes.\n\n" +
    "Keep this code private. SaMi will never ask you to share it.\n\n" +
    "If you did not request this code, you can ignore this email. No changes will be made to your account.\n\n" +
    "SaMi Technologies\nCONSIDER IT DONE";

  const htmlBody =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    "<title>" +
    escapeEmailHtml(subject) +
    "</title></head>" +
    '<body style="margin:0;padding:0;background:#EEF2F8;color:#172033;font-family:Arial,Helvetica,sans-serif;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' +
    "Your SaMi verification code is " +
    safeCode +
    ". It expires in 10 minutes.</div>" +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#EEF2F8;padding:36px 12px;">' +
    "<tr><td align=\"center\">" +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#FFFFFF;border:1px solid #E2E7F0;border-radius:20px;overflow:hidden;">' +
    '<tr><td align="center" style="background:#000535;padding:32px 24px 28px;">' +
    '<div style="font-size:38px;line-height:42px;font-weight:700;font-style:italic;letter-spacing:-1.8px;color:#FFFFFF;">Sa<span style="color:#82ACFF;">Mi</span></div>' +
    '<div style="margin-top:7px;font-size:10px;line-height:15px;font-weight:700;letter-spacing:3px;color:#D5E0FA;">CONSIDER IT DONE</div>' +
    '<div style="display:inline-block;margin-top:19px;padding:6px 11px;border:1px solid #38466F;border-radius:20px;color:#D6E2FF;font-size:9px;line-height:13px;font-weight:700;letter-spacing:1.5px;">ACCOUNT SECURITY</div>' +
    "</td></tr>" +
    '<tr><td style="padding:36px 34px 30px;">' +
    '<p style="margin:0 0 11px;color:#3478E5;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.8px;">' +
    eyebrow +
    "</p>" +
    '<p style="margin:0 0 15px;color:#172033;font-size:16px;line-height:25px;">' +
    htmlGreeting +
    "</p>" +
    '<h1 style="margin:0 0 12px;color:#000535;font-size:27px;line-height:34px;font-weight:700;letter-spacing:-0.5px;">' +
    heading +
    "</h1>" +
    '<p style="margin:0;color:#657087;font-size:15px;line-height:25px;">Use this secure, one-time code to ' +
    purposeText +
    ".</p>" +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:27px 0 17px;"><tr>' +
    '<td align="center" style="padding:20px 12px;background:#F1F5FF;border:1px solid #DCE6FF;border-radius:14px;">' +
    '<div style="color:#000535;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:42px;font-weight:700;letter-spacing:8px;padding-left:8px;">' +
    safeCode +
    "</div>" +
    "</td></tr></table>" +
    '<p style="margin:0;text-align:center;color:#657087;font-size:13px;line-height:21px;">This code expires in <strong style="color:#000535;">10 minutes</strong>.</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0 0;"><tr>' +
    '<td style="padding:16px 17px;background:#F5F8FE;border-left:3px solid #3478E5;border-radius:8px;">' +
    '<p style="margin:0 0 5px;color:#000535;font-size:13px;line-height:19px;font-weight:700;">Keep this code private</p>' +
    '<p style="margin:0;color:#657087;font-size:13px;line-height:21px;">SaMi will never ask you to share this code. ' +
    safeCodeEntryInstruction +
    "</p>" +
    "</td></tr></table>" +
    '<p style="margin:21px 0 0;color:#7B8495;font-size:12px;line-height:21px;">Did not request this code? You can ignore this email. No changes will be made to your account.</p>' +
    "</td></tr>" +
    '<tr><td align="center" style="padding:21px 28px 25px;background:#FAFBFE;border-top:1px solid #EDF0F5;">' +
    '<p style="margin:0;color:#000535;font-size:13px;line-height:20px;font-weight:700;">SaMi Technologies</p>' +
    '<p style="margin:4px 0 0;color:#8B94A5;font-size:10px;line-height:16px;font-weight:700;letter-spacing:2px;">CONSIDER IT DONE</p>' +
    '<p style="margin:12px 0 0;color:#A0A8B6;font-size:11px;line-height:17px;">Automated security message. Please do not reply directly to this email.</p>' +
    "</td></tr></table></td></tr></table></body></html>";

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
      subject,
      text: textBody,
      html: htmlBody,
    });
  } finally {
    transporter.close();
  }
}

async function verifyRequest(
  path: string,
  fields: Record<string, string>,
): Promise<any> {
  const apiKey = process.env.TWILIO_API_KEY?.trim();
  const apiSecret = process.env.TWILIO_API_SECRET?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();

  if (!apiKey || !apiSecret || !serviceSid) {
    throw new Error("TWILIO_VERIFY_NOT_CONFIGURED");
  }

  const authorization = Buffer.from(
    `${apiKey}:${apiSecret}`,
    "utf8",
  ).toString("base64");

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
      code:
        typeof payload?.code === "number"
          ? payload.code
          : undefined,
    });

    if (response.status === 404 || response.status === 400) {
      return { invalid: true };
    }

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

  return typeof result.sid === "string"
    ? result.sid
    : null;
}

export async function checkOtp(
  destination: string,
  code: string,
): Promise<boolean> {
  const result = await verifyRequest("VerificationCheck", {
    To: destination,
    Code: code,
  });

  return result?.status === "approved" && result?.valid === true;
}
