import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { databasePool } from "@/lib/db";
import { errorResponse, isRecord } from "@/lib/http";
import { checkRunnerOtp, normalizeKenyanPhone } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hashToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function POST(request: Request) {
  const isNative =
    request.headers.get("x-sami-client") === "runner" &&
    !request.headers.get("origin");

  if (!isNative) {
    return errorResponse("Runner sign-in is available through the SaMi Runner app.", 403);
  }

  const body: unknown = await request.json().catch(() => null);
  if (
    !isRecord(body) ||
    typeof body.phone !== "string" ||
    typeof body.code !== "string"
  ) {
    return errorResponse("Enter your mobile number and verification code.");
  }

  const phone = normalizeKenyanPhone(body.phone);
  const code = body.code.trim();
  if (!phone || !/^[0-9]{6}$/.test(code)) {
    return errorResponse("The mobile number or verification code is invalid.");
  }

  try {
    const valid = await checkRunnerOtp(phone, code);
    if (!valid) {
      return errorResponse("The verification code is incorrect or expired.", 401);
    }

    const sessionToken = randomBytes(32).toString("base64url");
    const digest = hashToken(sessionToken);
    const configuredDays = Number(process.env.RUNNER_SESSION_DAYS || 30);
    const sessionDays = Math.min(
      90,
      Math.max(1, Number.isFinite(configuredDays) ? configuredDays : 30),
    );

    const client = await databasePool().connect();
    try {
      await client.query("BEGIN");

      const accountResult = await client.query<{
        id: string;
        phone_e164: string;
        full_name: string | null;
        account_status: string;
        verification_status: string;
      }>(
        `INSERT INTO public.runner_accounts (phone_e164)
         VALUES ($1)
         ON CONFLICT (phone_e164)
         DO UPDATE SET updated_at = now()
         RETURNING id, phone_e164, full_name, account_status, verification_status`,
        [phone],
      );

      const account = accountResult.rows[0];
      if (!account || ["suspended", "closed"].includes(account.account_status)) {
        throw new Error("RUNNER_ACCOUNT_UNAVAILABLE");
      }

      await client.query(
        `INSERT INTO public.runner_profiles (runner_id)
         VALUES ($1)
         ON CONFLICT (runner_id) DO NOTHING`,
        [account.id],
      );

      await client.query(
        `INSERT INTO public.runner_availability (runner_id, is_online, updated_at)
         VALUES ($1, false, now())
         ON CONFLICT (runner_id) DO NOTHING`,
        [account.id],
      );

      await client.query(
        `INSERT INTO public.runner_sessions (runner_id, token_hash, expires_at)
         VALUES ($1, $2, now() + ($3::text || ' days')::interval)`,
        [account.id, digest, String(sessionDays)],
      );

      await client.query("COMMIT");

      return NextResponse.json(
        {
          ok: true,
          sessionToken,
          expiresInDays: sessionDays,
          profileComplete: Boolean(account.full_name && account.full_name.trim().length >= 2),
          runner: {
            id: account.id,
            phone: account.phone_e164,
            fullName: account.full_name,
            accountStatus: account.account_status,
            verificationStatus: account.verification_status,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (cause) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw cause;
    } finally {
      client.release();
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message === "RUNNER_SMS_NOT_CONFIGURED") {
      return errorResponse("Runner SMS verification is not configured.", 503);
    }
    console.error("[SaMi Runner OTP verification] Failed.");
    return errorResponse("Your number could not be verified. Try again later.", 503);
  }
}