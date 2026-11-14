
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { databasePool } from "@/apps/runner/server/db";
import {
  errorResponse,
  isRecord,
} from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type RegistrationConfirmation = {
  id: string;
  expires_at: Date | string;
  consumed_at: Date | string | null;
  cancelled_at: Date | string | null;
};

function hashToken(value: string): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function isExpired(value: Date | string): boolean {
  return new Date(value).getTime() <= Date.now();
}

export async function POST(request: Request) {
  const isNative =
    request.headers.get("x-sami-client") === "runner" &&
    !request.headers.get("origin");

  if (!isNative) {
    return errorResponse(
      "Runner authentication is available through the SaMi Runner app.",
      403,
    );
  }

  const body: unknown = await request.json().catch(() => null);

  if (
    !isRecord(body) ||
    typeof body.confirmationToken !== "string"
  ) {
    return errorResponse(
      "Your registration confirmation is missing.",
      400,
    );
  }

  const token = body.confirmationToken.trim();

  if (!TOKEN_PATTERN.test(token)) {
    return errorResponse(
      "Your registration confirmation is invalid.",
      400,
    );
  }

  const tokenHash = hashToken(token);
  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    // Lock the confirmation so cancellation cannot race
    // with account creation in confirm-registration.
    const result =
      await client.query<RegistrationConfirmation>(
        `SELECT
           id,
           expires_at,
           consumed_at,
           cancelled_at
         FROM public.runner_registration_confirmations
         WHERE token_hash = $1
         LIMIT 1
         FOR UPDATE`,
        [tokenHash],
      );

    const confirmation = result.rows[0];

    if (!confirmation) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Your registration confirmation could not be found.",
        404,
      );
    }

    // An account has already been created using this token.
    // Cancellation must never reverse an existing Runner account.
    if (confirmation.consumed_at) {
      await client.query("ROLLBACK");

      return errorResponse(
        "This registration has already been completed.",
        409,
      );
    }

    // Make cancellation idempotent.
    // Repeating the cancellation of an already-cancelled
    // confirmation is considered successful.
    if (confirmation.cancelled_at) {
      await client.query("COMMIT");

      return NextResponse.json(
        {
          ok: true,
          cancelled: true,
          message: "Your pending Runner registration was cancelled.",
        },
        {
          headers: {
            "Cache-Control": "no-store, private",
          },
        },
      );
    }

    // An expired confirmation can also be safely invalidated.
    const expired = isExpired(confirmation.expires_at);

    const updateResult = await client.query(
      `UPDATE public.runner_registration_confirmations
       SET cancelled_at = NOW()
       WHERE id = $1
         AND consumed_at IS NULL
         AND cancelled_at IS NULL
       RETURNING id`,
      [confirmation.id],
    );

    if (updateResult.rowCount !== 1) {
      throw new Error(
        "RUNNER_REGISTRATION_CANCELLATION_FAILED",
      );
    }

    await client.query("COMMIT");

    return NextResponse.json(
      {
        ok: true,
        cancelled: true,
        message: expired
          ? "Your expired Runner registration confirmation was cleared."
          : "Your pending Runner registration was cancelled.",
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);

    console.error(
      "[SaMi Runner Registration Cancellation] Failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your pending Runner registration could not be cancelled. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
