
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { databasePool, query } from "@/lib/db";
import {
  checkOtp,
  isOtpProviderConfigured,
  normalizeKenyanPhone,
  phoneAliases,
  verifyEmailOtp,
} from "@/lib/otp";

export const runtime = "nodejs";

type ContactType = "email" | "phone";

type Challenge = {
  id: string;
  contact_type: ContactType;
  channel: "email" | "sms";
  destination: string;
  status: string;
  expires_at: Date | string;
  attempt_count: number;
};

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isNative(request: Request) {
  return (
    request.headers.get("x-sami-client") === "native" &&
    !request.headers.get("origin")
  );
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isExpired(value: Date | string) {
  return new Date(value).getTime() <= Date.now();
}

async function recordFailedAttempt(
  challengeId: string,
  userId: string,
) {
  const result = await query<{ attempt_count: number }>(
    `UPDATE public.customer_contact_verifications
     SET attempt_count = attempt_count + 1,
         status = CASE
           WHEN attempt_count + 1 >= 5 THEN 'failed'
           ELSE 'pending'
         END
     WHERE id = $1
       AND user_id = $2
       AND status = 'pending'
       AND expires_at > now()
       AND attempt_count < 5
     RETURNING attempt_count`,
    [challengeId, userId],
  );

  return result.rows[0]?.attempt_count ?? null;
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
    return error("Invalid verification request.");
  }

  const payload = body as Record<string, unknown>;

  const challengeId =
    typeof payload.challengeId === "string"
      ? payload.challengeId.trim()
      : "";

  const code =
    typeof payload.code === "string"
      ? payload.code.trim()
      : "";

  if (!validUuid(challengeId)) {
    return error("Your verification request is invalid.");
  }

  if (!/^[0-9]{6}$/.test(code)) {
    return error("Enter the six-digit verification code.");
  }

  // Load only a challenge belonging to the signed-in customer.
  const found = await query<Challenge>(
    `SELECT
       id,
       contact_type,
       channel,
       destination,
       status,
       expires_at,
       attempt_count
     FROM public.customer_contact_verifications
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [challengeId, user.id],
  ).catch((cause) => {
    console.error(
      "[SaMi contact verification] Challenge lookup failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return null;
  });

  if (!found) {
    return error(
      "Your verification request could not be checked. Please retry.",
      503,
    );
  }

  const challenge = found.rows[0];

  if (!challenge) {
    return error(
      "Verification request not found. Request a new code.",
      404,
    );
  }

  if (challenge.status !== "pending") {
    return error(
      "This verification code has already been used or is no longer valid. Request a new code.",
      409,
    );
  }

  if (isExpired(challenge.expires_at)) {
    await query(
      `UPDATE public.customer_contact_verifications
       SET status = 'expired'
       WHERE id = $1
         AND user_id = $2
         AND status = 'pending'`,
      [challengeId, user.id],
    ).catch(() => undefined);

    return error(
      "Your verification code has expired. Request a new code.",
      410,
    );
  }

  if (Number(challenge.attempt_count) >= 5) {
    return error(
      "Too many incorrect codes. Request a new verification code.",
      429,
    );
  }

  if (
    (challenge.contact_type === "email" &&
      challenge.channel !== "email") ||
    (challenge.contact_type === "phone" &&
      challenge.channel !== "sms")
  ) {
    return error("This verification request is invalid.", 400);
  }

  if (!isOtpProviderConfigured(challenge.channel)) {
    return error(
      challenge.channel === "email"
        ? "Email verification is not configured. Contact SaMi support."
        : "SMS verification is not configured. Contact SaMi support.",
      503,
    );
  }

  // Verify the supplied code with the correct delivery provider.
  let approved = false;

  try {
    approved =
      challenge.channel === "email"
        ? verifyEmailOtp(challenge.id, code)
        : await checkOtp(challenge.destination, code);
  } catch (cause) {
    console.error(
      "[SaMi contact verification] Provider check failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return error(
      "SaMi could not verify your code right now. Please retry.",
      503,
    );
  }

  if (!approved) {
    try {
      const attempts = await recordFailedAttempt(
        challenge.id,
        user.id,
      );

      if (attempts === null) {
        return error(
          "This verification request is no longer valid. Request a new code.",
          409,
        );
      }

      return error(
        attempts >= 5
          ? "Too many incorrect codes. Request a new verification code."
          : "The verification code is incorrect or has expired.",
        attempts >= 5 ? 429 : 401,
      );
    } catch (cause) {
      console.error(
        "[SaMi contact verification] Failed-attempt update failed.",
        cause instanceof Error ? cause.message : "unknown error",
      );

      return error(
        "Your verification attempt could not be recorded. Please retry.",
        503,
      );
    }
  }

  // The code is correct. Now re-check and commit the contact update
  // atomically so expired, replaced or already-used challenges cannot win.
  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    // Keep the same lock order as the request endpoint.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`sami-contact-change:${user.id}:${challenge.contact_type}`],
    );

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [
        `sami-contact-destination:${challenge.contact_type}:${challenge.destination}`,
      ],
    );

    const lockedResult = await client.query<Challenge>(
      `SELECT
         id,
         contact_type,
         channel,
         destination,
         status,
         expires_at,
         attempt_count
       FROM public.customer_contact_verifications
       WHERE id = $1
         AND user_id = $2
       FOR UPDATE`,
      [challengeId, user.id],
    );

    const lockedChallenge = lockedResult.rows[0];

    if (!lockedChallenge) {
      await client.query("ROLLBACK");

      return error(
        "Verification request not found. Request a new code.",
        404,
      );
    }

    if (lockedChallenge.status !== "pending") {
      await client.query("ROLLBACK");

      return error(
        "This verification request is no longer active. Request a new code.",
        409,
      );
    }

    if (isExpired(lockedChallenge.expires_at)) {
      await client.query(
        `UPDATE public.customer_contact_verifications
         SET status = 'expired'
         WHERE id = $1`,
        [challengeId],
      );

      await client.query("COMMIT");

      return error(
        "Your verification code has expired. Request a new code.",
        410,
      );
    }

    if (Number(lockedChallenge.attempt_count) >= 5) {
      await client.query("ROLLBACK");

      return error(
        "Too many verification attempts. Request a new code.",
        429,
      );
    }

    const destination = lockedChallenge.destination;
    const contactType = lockedChallenge.contact_type;

    // Make sure the new contact has not been claimed by another account.
    const duplicate = contactType === "email"
      ? await client.query<{ id: string }>(
          `SELECT id
           FROM public.users
           WHERE id <> $1
             AND lower(email) = $2
           LIMIT 1`,
          [user.id, normalizeEmail(destination)],
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
      await client.query(
        `UPDATE public.customer_contact_verifications
         SET status = 'failed'
         WHERE id = $1`,
        [challengeId],
      );

      await client.query("COMMIT");

      return error(
        contactType === "email"
          ? "That email address is already associated with another SaMi account."
          : "That phone number is already associated with another SaMi account.",
        409,
      );
    }

    // Update only the contact that was verified.
    // The corresponding verification timestamp is set in the same transaction.
    const updated = contactType === "email"
      ? await client.query<{
          email: string;
          phone: string | null;
        }>(
          `UPDATE public.users
           SET email = $2,
               email_verified_at = now(),
               updated_at = now()
           WHERE id = $1
             AND role = 'customer'
             AND is_active = true
           RETURNING email, phone`,
          [user.id, normalizeEmail(destination)],
        )
      : await client.query<{
          email: string;
          phone: string | null;
        }>(
          `UPDATE public.users
           SET phone = $2,
               phone_verified_at = now(),
               updated_at = now()
           WHERE id = $1
             AND role = 'customer'
             AND is_active = true
           RETURNING email, phone`,
          [user.id, normalizeKenyanPhone(destination)],
        );

    const updatedUser = updated.rows[0];

    if (!updatedUser) {
      await client.query("ROLLBACK");

      return error(
        "Your customer account could not be found.",
        404,
      );
    }

    // Consume this challenge and invalidate any other outstanding
    // challenges for the same contact type.
    await client.query(
      `UPDATE public.customer_contact_verifications
       SET status = 'consumed',
           verified_at = now()
       WHERE id = $1
         AND user_id = $2
         AND status = 'pending'`,
      [challengeId, user.id],
    );

    await client.query(
      `UPDATE public.customer_contact_verifications
       SET status = 'superseded'
       WHERE user_id = $1
         AND contact_type = $2
         AND status = 'pending'
         AND id <> $3`,
      [user.id, contactType, challengeId],
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        ok: true,
        message:
          contactType === "email"
            ? "Your email address has been verified and updated."
            : "Your phone number has been verified and updated.",
        contact: {
          email: updatedUser.email,
          phone: updatedUser.phone,
          email_verified: contactType === "email",
          phone_verified: contactType === "phone",
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);

    const databaseCode =
      typeof cause === "object" &&
      cause !== null &&
      "code" in cause
        ? (cause as { code?: string }).code
        : undefined;

    if (databaseCode === "23505") {
      return error(
        "That contact detail is already registered to another SaMi account.",
        409,
      );
    }

    console.error(
      "[SaMi contact verification] Update failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return error(
      "Your contact details could not be updated. No change was completed. Please retry.",
      503,
    );
  } finally {
    client.release();
  }
}
