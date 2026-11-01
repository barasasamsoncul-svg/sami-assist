import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createTransport } from "nodemailer";

export type OtpChannel = "sms" | "whatsapp" | "email";

export type EmailOtpPurpose = "register" | "login";

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
  const secure = process.env.SMTP_SECURE?.trim().toLowerCase() === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const fromAddress = process.env.EMAIL_FROM?.trim() || user;

  const from = fromAddress
    ? fromAddress.includes("<")
      ? fromAddress
      : { name: "SaMi", address: fromAddress }
    : undefined;

  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  if (
    process.env.EMAIL_PROVIDER?.trim().toLowerCase() !== "smtp" ||
    !host || !Number.isInteger(port) || port <= 0 || !user || !pass ||
    !fromAddress || !from
  ) {
    throw new Error("SMTP_EMAIL_NOT_CONFIGURED");
  }

  if (!/^[0-9]{6}$/.test(code)) {
    throw new Error("INVALID_EMAIL_OTP");
  }

  const recipientName = options.recipientName?.trim().slice(0, 80) || "";
  const greeting = recipientName
    ? "Hello " + escapeEmailHtml(recipientName) + ","
    : "Hello,";

  const isRegistration = options.purpose === "register";
  const subject = isRegistration
    ? "Verify your email to join SaMi"
    : "Your SaMi sign-in code";
  const action = isRegistration
    ? "finish creating your SaMi account"
    : "sign in to your SaMi account";
  const heading = isRegistration ? "Welcome to SaMi" : "Your sign-in code";
  const purposeText = isRegistration
    ? "complete your SaMi account registration"
    : "securely sign in to your SaMi account";

  const digitsHtml = code
    .split("")
    .map((digit) =>
      '<td align="center" valign="middle" style="width:42px;height:52px;border:1px solid #DCE3F0;border-radius:10px;background:#F7F9FD;color:#000535;font-family:Arial,sans-serif;font-size:25px;font-weight:700;">' +
      escapeEmailHtml(digit) +
      "</td>",
    )
    .join('<td style="width:7px;font-size:0;line-height:0;">&nbsp;</td>');

  const textBody =
    greeting + "\n\n" +
    "Use the verification code below to " + action + ":\n\n" +
    code + "\n\n" +
    "This code expires in 10 minutes.\n" +
    "Never share this code with anyone, including someone claiming to work for SaMi.\n\n" +
    "If you did not request this code, you can safely ignore this email. Your account will not be changed.\n\n" +
    "SaMi Technologies\nCONSIDER IT DONE";

  const htmlBody =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light">' +
    '<meta name="supported-color-schemes" content="light">' +
    "<title>" + escapeEmailHtml(subject) + "</title></head>" +
    '<body style="margin:0;padding:0;background:#F3F5FA;color:#172033;font-family:Arial,Helvetica,sans-serif;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' +
    "Your SaMi verification code is inside. It expires in 10 minutes.</div>" +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F3F5FA;padding:32px 12px;">' +
    "<tr><td align=\"center\">" +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#FFFFFF;border:1px solid #E7EAF1;border-radius:18px;overflow:hidden;">' +
    '<tr><td align="center" style="background:#000535;padding:30px 24px 27px;">' +
    '<div style="font-size:34px;line-height:40px;font-weight:700;font-style:italic;letter-spacing:-1.5px;color:#FFFFFF;">SaMi</div>' +
    '<div style="margin-top:7px;font-size:10px;line-height:15px;font-weight:700;letter-spacing:3px;color:#C9D5F5;">CONSIDER IT DONE</div>' +
    '<div style="width:54px;height:3px;margin:18px auto 0;background:#4D8BFF;border-radius:3px;"></div>' +
    "</td></tr>" +
    '<tr><td style="padding:34px 34px 18px;">' +
    '<p style="margin:0 0 18px;color:#172033;font-size:16px;line-height:25px;">' + greeting + "</p>" +
    '<h1 style="margin:0 0 12px;color:#000535;font-size:24px;line-height:31px;font-weight:700;">' + heading + "</h1>" +
    '<p style="margin:0;color:#5E687C;font-size:15px;line-height:25px;">Use the verification code below to ' + purposeText + ".</p>" +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 22px;"><tr>' +
    digitsHtml +
    "</tr></table>" +
    '<p style="margin:0;text-align:center;color:#5E687C;font-size:13px;line-height:21px;">This code expires in <strong style="color:#000535;">10 minutes</strong>.</p>' +
    '<div style="height:1px;margin:28px 0 21px;background:#E9EDF4;"></div>' +
    '<p style="margin:0 0 9px;color:#263247;font-size:13px;line-height:21px;font-weight:700;">A quick security reminder</p>' +
    '<p style="margin:0;color:#687388;font-size:13px;line-height:22px;">Never share this code with anyone. SaMi will never ask you to disclose your verification code.</p>' +
    '<p style="margin:17px 0 0;color:#687388;font-size:13px;line-height:22px;">Did not request this code? You can safely ignore this email. Your account will not be changed.</p>' +
    "</td></tr>" +
    '<tr><td style="padding:20px 34px 26px;background:#FAFBFE;border-top:1px solid #EEF1F6;text-align:center;">' +
    '<p style="margin:0;color:#000535;font-size:13px;line-height:20px;font-weight:700;">SaMi Technologies</p>' +
    '<p style="margin:4px 0 0;color:#8992A3;font-size:10px;line-height:16px;font-weight:700;letter-spacing:2px;">CONSIDER IT DONE</p>' +
    '<p style="margin:12px 0 0;color:#A0A8B6;font-size:11px;line-height:17px;">This is an automated security email. Please do not reply directly to this message.</p>' +
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
