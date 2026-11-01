import "server-only";

export type OtpChannel = "sms" | "whatsapp" | "email";

export function isOtpProviderConfigured(): boolean {
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
  channel: OtpChannel,
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
