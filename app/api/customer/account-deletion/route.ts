
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { databasePool } from "@/lib/db";
import { verifyEmailOtp } from "@/lib/otp";
import {
  deleteR2Object,
  isCustomerAvatarKey,
} from "@/lib/storage/r2";

export const runtime = "nodejs";

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isNative(request: Request) {
  return (
    request.headers.get("x-sami-client") === "native" &&
    !request.headers.get("origin")
  );
}

export async function POST(request: Request) {
  if (!isNative(request)) {
    return error("This endpoint is available through the SaMi app.", 403);
  }

  const user = await getCurrentUser(request).catch(() => null);

  if (!user) {
    return error("Sign in to continue.", 401);
  }

  if (user.role !== "customer") {
    return error("Only customer accounts can be deleted here.", 403);
  }

  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return error("Invalid deletion request.");
  }

  const payload = body as Record<string, unknown>;

  const confirmation =
    typeof payload.confirmation === "string"
      ? payload.confirmation
      : "";

  const challengeId =
    typeof payload.challengeId === "string"
      ? payload.challengeId
      : "";

  const code =
    typeof payload.code === "string"
      ? payload.code.trim()
      : "";

  if (confirmation !== "DELETE") {
    return error("Type DELETE to confirm account deletion.");
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      challengeId,
    )
  ) {
    return error("Your verification request is invalid.");
  }

  if (!/^[0-9]{6}$/.test(code)) {
    return error("Enter the six-digit verification code.");
  }

  const client = await databasePool().connect();

  let avatarKey: string | null = null;

  try {
    await client.query("BEGIN");

    const customerResult = await client.query<{
      id: string;
      avatar_key: string | null;
    }>(
      `SELECT id, avatar_key
       FROM public.users
       WHERE id = $1
         AND role = 'customer'
         AND is_active = true
       FOR UPDATE`,
      [user.id],
    );

    const customer = customerResult.rows[0];

    if (!customer) {
      await client.query("ROLLBACK");
      return error("Your customer account could not be found.", 404);
    }

    const activeErrands = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM public.errands
       WHERE customer_id = $1
         AND status NOT IN ('completed', 'cancelled')`,
      [user.id],
    );

    if (Number(activeErrands.rows[0]?.count || 0) > 0) {
      await client.query("ROLLBACK");

      return error(
        "Finish or cancel your open errands and resolve any disputes before deleting your account.",
        409,
      );
    }

    const challengeResult = await client.query<{
      id: string;
      status: string;
      expires_at: Date | string;
      attempt_count: number;
    }>(
      `SELECT id, status, expires_at, attempt_count
       FROM public.auth_otp_challenges
       WHERE id = $1
         AND user_id = $2
         AND purpose = 'delete_account'
         AND channel = 'email'
       FOR UPDATE`,
      [challengeId, user.id],
    );

    const challenge = challengeResult.rows[0];

    if (!challenge) {
      await client.query("ROLLBACK");
      return error(
        "Verification request not found. Request a new code.",
        404,
      );
    }

    if (challenge.status !== "pending") {
      await client.query("ROLLBACK");
      return error(
        "This verification code has already been used or is no longer valid. Request a new code.",
        409,
      );
    }

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE public.auth_otp_challenges
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

    if (!verifyEmailOtp(challengeId, code)) {
      const nextAttempts = Number(challenge.attempt_count || 0) + 1;

      await client.query(
        `UPDATE public.auth_otp_challenges
         SET attempt_count = $2,
             status = CASE
               WHEN $2 >= 5 THEN 'failed'
               ELSE 'pending'
             END
         WHERE id = $1`,
        [challengeId, nextAttempts],
      );

      await client.query("COMMIT");

      return error(
        nextAttempts >= 5
          ? "Too many incorrect codes. Request a new verification code."
          : "The verification code is incorrect.",
        400,
      );
    }

    await client.query(
      `UPDATE public.auth_otp_challenges
       SET status = 'consumed',
           verified_at = now(),
           consumed_at = now()
       WHERE id = $1`,
      [challengeId],
    );

    avatarKey = customer.avatar_key;

    // Redact personal details from closed errand records.
    // Financial amounts, transaction references and timestamps are retained.

    await client.query(
      `UPDATE public.errands
       SET title = 'Errand details removed',
           description = 'Personal details removed at the customer’s request.',
           pickup_location = NULL,
           destination_location = NULL,
           service_area = 'Removed',
           pickup_latitude = NULL,
           pickup_longitude = NULL,
           destination_latitude = NULL,
           destination_longitude = NULL,
           updated_at = now()
       WHERE customer_id = $1
         AND status IN ('completed', 'cancelled')`,
      [user.id],
    );

    await client.query(
      `UPDATE public.errand_messages
       SET message = 'Message removed at the customer’s request.'
       WHERE sender_id = $1
         AND errand_id IN (
           SELECT id
           FROM public.errands
           WHERE customer_id = $1
         )`,
      [user.id],
    );

    await client.query(
      `UPDATE public.errand_messages
       SET message = 'Conversation content removed at the customer’s request.'
       WHERE errand_id IN (
         SELECT id
         FROM public.errands
         WHERE customer_id = $1
       )`,
      [user.id],
    );

    await client.query(
      `UPDATE public.errand_events
       SET actor_id = NULL,
           note = 'Event actor details removed at customer request.'
       WHERE actor_id = $1
         AND errand_id IN (
           SELECT id
           FROM public.errands
           WHERE customer_id = $1
         )`,
      [user.id],
    );

    const callTables = await client.query<{
      has_calls: boolean;
      has_signals: boolean;
    }>(
      `SELECT
         to_regclass('public.errand_calls') IS NOT NULL AS has_calls,
         to_regclass('public.errand_call_signals') IS NOT NULL AS has_signals`,
    );

    if (
      callTables.rows[0]?.has_calls &&
      callTables.rows[0]?.has_signals
    ) {
      await client.query(
        `DELETE FROM public.errand_call_signals
         WHERE call_id IN (
           SELECT id
           FROM public.errand_calls
           WHERE errand_id IN (
             SELECT id
             FROM public.errands
             WHERE customer_id = $1
           )
         )`,
        [user.id],
      );

      await client.query(
        `DELETE FROM public.errand_calls
         WHERE errand_id IN (
           SELECT id
           FROM public.errands
           WHERE customer_id = $1
         )`,
        [user.id],
      );
    }

    await client.query(
      `UPDATE public.errand_ratings
       SET comment = NULL
       WHERE reviewer_id = $1`,
      [user.id],
    );

    await client.query(
      `DELETE FROM public.notifications
       WHERE user_id = $1`,
      [user.id],
    );

    await client.query(
      `DELETE FROM public.user_sessions
       WHERE user_id = $1`,
      [user.id],
    );

    await client.query(
      `DELETE FROM public.auth_otp_challenges
       WHERE user_id = $1`,
      [user.id],
    );

    // Deactivate and anonymise the account.
    // No password is required because SaMi uses passwordless OTP authentication.

    await client.query(
      `UPDATE public.users
       SET full_name = 'Deleted customer',
           email = 'deleted+' || id::text || '@deleted.sami.invalid',
           phone = NULL,
           email_verified_at = NULL,
           phone_verified_at = NULL,
           password_hash = NULL,
           avatar_key = NULL,
           is_active = false,
           updated_at = now()
       WHERE id = $1`,
      [user.id],
    );

    await client.query("COMMIT");
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);

    console.error(
      "[SaMi account deletion] Transaction failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return error(
      "Your account could not be deleted. No deletion was completed. Please retry or contact SaMi support.",
      503,
    );
  } finally {
    client.release();
  }

  // The account is already deactivated and its database reference removed.
  // R2 cleanup is performed after the successful database transaction.

  if (avatarKey && isCustomerAvatarKey(user.id, avatarKey)) {
    await deleteR2Object(avatarKey).catch((cause) => {
      console.error(
        "[SaMi account deletion] Avatar cleanup failed.",
        cause instanceof Error ? cause.message : "unknown error",
      );
    });
  }

  return NextResponse.json(
    {
      ok: true,
      message:
        "Your account has been deactivated and eligible personal information removed. Errand descriptions, locations, messages and rating comments were redacted. Financial amounts, transaction references and audit timestamps are retained where required for reconciliation and legal obligations.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
