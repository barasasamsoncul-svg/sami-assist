
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { databasePool, query } from "@/lib/db";
import {
  createEmailOtpCode,
  isOtpProviderConfigured,
  maskOtpDestination,
  normalizeKenyanPhone,
  phoneAliases,
  sendEmailOtp,
  sendOtp,
} from "@/lib/otp";

export const runtime = "nodejs";

type ContactType = "email" | "phone";

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isNative(request: Request) {
  return (
    request.headers.get("x-sami-client") === "native" &&
    !request.headers.get("origin")
  );
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function validEmail(value: string) {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
  );
}

export async function POST(request: Request) {
  if (!isNative(request)) {
    return error(
      "This endpoint is available through the SaMi app.",
      403,
    );
  }

  const user = await getCurrentUser(request).catch(() => null);

  if (!user) {
    return error("Sign in to continue.", 401);
  }

  if (user.role !== "customer") {
    return error(
      "Only customer accounts can change contact details.",
      403,
    );
  }

  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return error("Invalid contact-change request.");
  }

  const payload = body as Record<string, unknown>;

  const suppliedType =
    typeof payload.contactType === "string"
      ? payload.contactType
      : "";

  if (suppliedType !== "email" && suppliedType !== "phone") {
    return error("Choose a valid contact method.");
  }

  const contactType: ContactType = suppliedType;

  const suppliedValue =
    typeof payload.newValue === "string"
      ? payload.newValue.trim()
      : "";

  if (!suppliedValue) {
    return error(
      contactType === "email"
        ? "Enter your new email address."
        : "Enter your new phone number.",
    );
  }

  let destination = "";

  if (contactType === "email") {
    destination = normalizeEmail(suppliedValue);

    if (!validEmail(destination)) {
      return error("Enter a valid email address.");
    }

    if (!isOtpProviderConfigured("email")) {
      return error(
        "Email verification is not configured. Contact SaMi support.",
        503,
      );
    }
  } else {
    const normalizedPhone = normalizeKenyanPhone(suppliedValue);

    if (!normalizedPhone) {
      return error(
        "Enter a valid Kenyan mobile number, such as +254712345678.",
      );
    }

    destination = normalizedPhone;

    if (!isOtpProviderConfigured("sms")) {
      return error(
        "SMS verification is not configured. Contact SaMi support.",
        503,
      );
    }
  }

  const channel = contactType === "email" ? "email" : "sms";

  const client = await databasePool().connect();

  let challengeId = "";
  let customerName = "";

  try {
    await client.query("BEGIN");

    // Serialize simultaneous requests for the same account/contact type.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`sami-contact-change:${user.id}:${contactType}`],
    );

    // Also serialize claims for the same destination across accounts.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`sami-contact-destination:${contactType}:${destination}`],
    );

    const customerResult = await client.query<{
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
    }>(
      `SELECT id, full_name, email, phone
       FROM public.users
       WHERE id = $1
         AND role = 'customer'
         AND is_active = true
       LIMIT 1
       FOR UPDATE`,
      [user.id],
    );

    const customer = customerResult.rows[0];

    if (!customer) {
      await client.query("ROLLBACK");

      return error(
        "Your customer account could not be found.",
        404,
      );
    }

    customerName = customer.full_name;

    // Do not create a challenge for a contact already on the account.
    if (contactType === "email") {
      if (normalizeEmail(customer.email) === destination) {
        await client.query("ROLLBACK");

        return error(
          "This is already your registered email address.",
          409,
        );
      }
    } else {
      const currentPhone = customer.phone
        ? normalizeKenyanPhone(customer.phone)
        : null;

      if (currentPhone === destination) {
        await client.query("ROLLBACK");

        return error(
          "This is already your registered phone number.",
          409,
        );
      }
    }

    // A contact already owned by another account cannot be claimed.
    const duplicate = contactType === "email"
      ? await client.query<{ id: string }>(
          `SELECT id
           FROM public.users
           WHERE id <> $1
             AND lower(email) = $2
           LIMIT 1`,
          [user.id, destination],
        )
      : await client.query<{ id: string }>(
          `SELECT id
           FROM public.users
           WHERE id <> $1
             AND regexp_replace(
               COALESCE(phone, ''),
               '[^0-9]',
               '',
               'g'
             ) = ANY($2::text[])
           LIMIT 1`,
          [user.id, phoneAliases(destination)],
        );

    if (duplicate.rowCount) {
      await client.query("ROLLBACK");

      return error(
        contactType === "email"
          ? "That email address is already associated with another SaMi account."
          : "That phone number is already associated with another SaMi account.",
        409,
      );
    }

    // Limit all attempts, including failed delivery attempts.
    const recentRequests = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM public.customer_contact_verifications
       WHERE user_id = $1
         AND contact_type = $2
         AND created_at > now() - interval '15 minutes'`,
      [user.id, contactType],
    );

    if (Number(recentRequests.rows[0]?.count || 0) >= 3) {
      await client.query("ROLLBACK");

      return error(
        "Too many verification requests. Try again in 15 minutes.",
        429,
      );
    }

    // Close expired challenges before replacing an active one.
    await client.query(
      `UPDATE public.customer_contact_verifications
       SET status = 'expired'
       WHERE user_id = $1
         AND contact_type = $2
         AND status = 'pending'
         AND expires_at <= now()`,
      [user.id, contactType],
    );

    await client.query(
      `UPDATE public.customer_contact_verifications
       SET status = 'superseded'
       WHERE user_id = $1
         AND contact_type = $2
         AND status = 'pending'`,
      [user.id, contactType],
    );

    const challengeResult = await client.query<{
      id: string;
    }>(
      `INSERT INTO public.customer_contact_verifications
        (
          user_id,
          contact_type,
          channel,
          destination
        )
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        user.id,
        contactType,
        channel,
        destination,
      ],
    );

    challengeId = challengeResult.rows[0]?.id || "";

    if (!challengeId) {
      throw new Error("CONTACT_CHALLENGE_CREATION_FAILED");
    }

    await client.query("COMMIT");
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);

    console.error(
      "[SaMi contact change] Challenge creation failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return error(
      "Your contact-change request could not be started. Please try again.",
      503,
    );
  } finally {
    client.release();
  }

  // Deliver the OTP only after the challenge has been committed.
  try {
    if (contactType === "email") {
      const code = createEmailOtpCode(challengeId);

      await sendEmailOtp(destination, code, {
        purpose: "change_contact",
        recipientName: customerName,
      });
    } else {
      await sendOtp(destination, "sms");
    }
  } catch (cause) {
    await query(
      `UPDATE public.customer_contact_verifications
       SET status = 'failed'
       WHERE id = $1
         AND user_id = $2
         AND status = 'pending'`,
      [challengeId, user.id],
    ).catch(() => undefined);

    console.error(
      "[SaMi contact change] OTP delivery failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return error(
      contactType === "email"
        ? "SaMi could not send the email verification code. Check your email details and try again."
        : "SaMi could not send the SMS verification code. Check the phone number and try again.",
      503,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      challengeId,
      destinationMasked: maskOtpDestination(destination, channel),
      expiresInSeconds: 600,
      message:
        contactType === "email"
          ? "A verification code has been sent to your new email address."
          : "A verification code has been sent to your new phone number.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
