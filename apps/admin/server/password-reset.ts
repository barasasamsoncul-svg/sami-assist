
import "server-only";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { databasePool } from "@/lib/db";
import { verifyEmailOtp } from "@/lib/otp";

const MAX_OTP_ATTEMPTS = 5;

type PasswordResetChallengeRow = {
  id: string;
  admin_user_id: string;
  email: string;
  status: "pending" | "consumed" | "failed" | "expired" | "superseded";
  attempt_count: number;
  expires_at: Date | string;
  password_hash: string | null;
};

function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}

function successResponse(message: string) {
  return NextResponse.json(
    {
      ok: true,
      message,
    },
    {
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");

  return !origin || origin === new URL(request.url).origin;
}

function isValidChallengeId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Verifies an Admin password-recovery OTP and changes the password.
 *
 * Expected request body:
 * {
 *   challengeId: string,
 *   code: string,
 *   newPassword: string
 * }
 *
 * A successful recovery revokes every existing Admin session.
 * Customer, Runner and website sessions are not modified.
 */
export async function verifyAdminPasswordReset(request: Request) {
  if (!isSameOrigin(request)) {
    return errorResponse(
      "Cross-origin password recovery requests are not allowed.",
      403,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid password recovery request.");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return errorResponse("Invalid password recovery request.");
  }

  const input = body as Record<string, unknown>;

  const challengeId =
    typeof input.challengeId === "string"
      ? input.challengeId.trim()
      : "";

  const code =
    typeof input.code === "string"
      ? input.code.trim()
      : "";

  const newPassword =
    typeof input.newPassword === "string"
      ? input.newPassword
      : "";

  if (!isValidChallengeId(challengeId)) {
    return errorResponse(
      "Your verification session is invalid. Request a new code.",
      400,
    );
  }

  if (!/^[0-9]{6}$/.test(code)) {
    return errorResponse(
      "Enter the six-digit verification code sent to your email.",
    );
  }

  if (newPassword.length < 14 || newPassword.length > 128) {
    return errorResponse(
      "Your new password must contain between 14 and 128 characters.",
    );
  }

  const client = await databasePool().connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    /*
     * Lock both the OTP challenge and its Admin account.
     * This prevents concurrent attempts from bypassing the
     * five-attempt limit or changing the same account twice.
     */
    const challengeResult =
      await client.query<PasswordResetChallengeRow>(
        `SELECT
           c.id,
           c.admin_user_id,
           c.email,
           c.status,
           c.attempt_count,
           c.expires_at,
           u.password_hash
         FROM public.admin_password_reset_otp_challenges AS c
         INNER JOIN public.users AS u
           ON u.id = c.admin_user_id
         WHERE c.id = $1
           AND u.role = 'admin'
           AND u.is_active = true
           AND lower(u.email) = lower(c.email)
         LIMIT 1
         FOR UPDATE OF c, u`,
        [challengeId],
      );

    const challenge = challengeResult.rows[0];

    if (!challenge) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return errorResponse(
        "This verification code is invalid or no longer available. Request a new code.",
        400,
      );
    }

    if (challenge.status !== "pending") {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return errorResponse(
        "This verification code has already been used or is no longer valid. Request a new code.",
        410,
      );
    }

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE public.admin_password_reset_otp_challenges
         SET status = 'expired'
         WHERE id = $1
           AND status = 'pending'`,
        [challenge.id],
      );

      await client.query("COMMIT");
      transactionOpen = false;

      return errorResponse(
        "Your verification code has expired. Request a new code.",
        410,
      );
    }

    if (challenge.attempt_count >= MAX_OTP_ATTEMPTS) {
      await client.query(
        `UPDATE public.admin_password_reset_otp_challenges
         SET status = 'failed'
         WHERE id = $1
           AND status = 'pending'`,
        [challenge.id],
      );

      await client.query("COMMIT");
      transactionOpen = false;

      return errorResponse(
        "Too many incorrect attempts. Request a new verification code.",
        429,
      );
    }

    /*
     * The OTP is derived from the challenge ID using the
     * shared email OTP secret. It is not stored in the database.
     */
    const codeIsValid = verifyEmailOtp(
      challenge.id,
      code,
    );

    if (!codeIsValid) {
      const nextAttemptCount = Math.min(
        challenge.attempt_count + 1,
        MAX_OTP_ATTEMPTS,
      );

      const nextStatus =
        nextAttemptCount >= MAX_OTP_ATTEMPTS
          ? "failed"
          : "pending";

      await client.query(
        `UPDATE public.admin_password_reset_otp_challenges
         SET attempt_count = $2,
             status = $3
         WHERE id = $1
           AND status = 'pending'`,
        [
          challenge.id,
          nextAttemptCount,
          nextStatus,
        ],
      );

      await client.query("COMMIT");
      transactionOpen = false;

      if (nextStatus === "failed") {
        return errorResponse(
          "You have used all five verification attempts. Request a new code.",
          429,
        );
      }

      return errorResponse(
        "The verification code is incorrect. Check the code and try again.",
        401,
      );
    }

    /*
     * Prevent the Admin from using the same password again.
     * The verification challenge remains usable if this check fails.
     */
    if (challenge.password_hash) {
      const passwordIsUnchanged = await bcrypt.compare(
        newPassword,
        challenge.password_hash,
      );

      if (passwordIsUnchanged) {
        await client.query("ROLLBACK");
        transactionOpen = false;

        return errorResponse(
          "Your new password must be different from your current password.",
        );
      }
    }

    const newPasswordHash = await bcrypt.hash(
      newPassword,
      12,
    );

    /*
     * Change the password only while the account is still
     * an active Admin.
     */
    const accountUpdate = await client.query(
      `UPDATE public.users
       SET password_hash = $2,
           updated_at = now()
       WHERE id = $1
         AND role = 'admin'
         AND is_active = true`,
      [
        challenge.admin_user_id,
        newPasswordHash,
      ],
    );

    if (accountUpdate.rowCount !== 1) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return errorResponse(
        "Your administrator account is unavailable. Request a new code.",
        403,
      );
    }

    /*
     * Consume this OTP challenge.
     */
    const consumedChallenge = await client.query(
      `UPDATE public.admin_password_reset_otp_challenges
       SET status = 'consumed',
           verified_at = now(),
           consumed_at = now()
       WHERE id = $1
         AND status = 'pending'`,
      [challenge.id],
    );

    if (consumedChallenge.rowCount !== 1) {
      throw new Error(
        "ADMIN_PASSWORD_RESET_CHALLENGE_CONSUME_FAILED",
      );
    }

    /*
     * Invalidate any other outstanding recovery codes
     * for this Admin account.
     */
    await client.query(
      `UPDATE public.admin_password_reset_otp_challenges
       SET status = 'superseded'
       WHERE admin_user_id = $1
         AND id <> $2
         AND status = 'pending'`,
      [
        challenge.admin_user_id,
        challenge.id,
      ],
    );

    /*
     * Revoke every Admin session.
     *
     * This affects public.admin_sessions only.
     * Customer and Runner sessions remain untouched.
     */
    await client.query(
      `UPDATE public.admin_sessions
       SET revoked_at = now()
       WHERE admin_user_id = $1
         AND revoked_at IS NULL`,
      [challenge.admin_user_id],
    );

    await client.query("COMMIT");
    transactionOpen = false;

    return successResponse(
      "Your administrator password has been changed successfully. Sign in again using your new password.",
    );
  } catch (cause) {
    if (transactionOpen) {
      await client.query("ROLLBACK").catch(
        () => undefined,
      );

      transactionOpen = false;
    }

    console.error(
      "[SaMi Admin password recovery] OTP password reset failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your password could not be changed. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
