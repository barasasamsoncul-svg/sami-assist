import { NextResponse } from "next/server";

import { query } from "@/lib/runner/db";
import { errorResponse, isRecord } from "@/lib/runner/http";
import { normalizeKenyanPhone, sendRunnerOtp } from "@/lib/runner/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const isNative =
    request.headers.get("x-sami-client") === "runner" &&
    !request.headers.get("origin");

  if (!isNative) {
    return errorResponse(
      "Runner sign-in is available through the SaMi Runner app.",
      403,
    );
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.phone !== "string") {
    return errorResponse("Enter your mobile number.");
  }

  const phone = normalizeKenyanPhone(body.phone);
  if (!phone) return errorResponse("Enter a valid Kenyan mobile number.");

  try {
    const rateLimit = await query<{ phone_e164: string }>(
      `INSERT INTO public.runner_otp_rate_limits (
         phone_e164, window_started_at, request_count, last_requested_at
       )
       VALUES ($1, now(), 1, now())
       ON CONFLICT (phone_e164)
       DO UPDATE SET
         window_started_at = CASE
           WHEN runner_otp_rate_limits.window_started_at <= now() - interval '1 hour'
             THEN now()
           ELSE runner_otp_rate_limits.window_started_at
         END,
         request_count = CASE
           WHEN runner_otp_rate_limits.window_started_at <= now() - interval '1 hour'
             THEN 1
           ELSE runner_otp_rate_limits.request_count + 1
         END,
         last_requested_at = now()
       WHERE runner_otp_rate_limits.last_requested_at <= now() - interval '60 seconds'
         AND (
           runner_otp_rate_limits.window_started_at <= now() - interval '1 hour'
           OR runner_otp_rate_limits.request_count < 5
         )
       RETURNING phone_e164`,
      [phone],
    );

    if (!rateLimit.rows[0]) {
      return errorResponse(
        "Please wait before requesting another code. A maximum of five codes is allowed per hour.",
        429,
      );
    }

    await sendRunnerOtp(phone);

    return NextResponse.json(
      {
        ok: true,
        message: "A verification code has been sent.",
        destination: "•••• ••• " + phone.slice(-3),
        expiresInSeconds: 600,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    if (cause instanceof Error && cause.message === "RUNNER_SMS_NOT_CONFIGURED") {
      return errorResponse("Runner SMS verification is not configured yet.", 503);
    }
    console.error("[SaMi Runner OTP request] Failed.");
    return errorResponse("A verification code could not be sent. Try again later.", 503);
  }
}