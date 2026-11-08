
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { query } from "@/apps/runner/server/db";
import { errorResponse } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hashToken(token: string): string {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

export async function POST(request: Request) {
  const isNative =
    request.headers.get("x-sami-client") === "runner" &&
    !request.headers.get("origin");

  if (!isNative) {
    return errorResponse(
      "Runner sign out is available through the SaMi Runner app.",
      403,
    );
  }

  const authorization =
    request.headers.get("authorization") || "";

  const match =
    /^Bearer\s+([A-Za-z0-9_-]{40,128})$/i.exec(
      authorization,
    );

  if (!match) {
    return errorResponse(
      "No valid Runner session was supplied.",
      401,
    );
  }

  try {
    const tokenDigest = hashToken(match[1]);

    // Revoke only the session represented by this token.
    // Do not revoke other devices belonging to the Runner.
    await query(
      `UPDATE public.runner_sessions
       SET revoked_at = now()
       WHERE token_hash = $1
         AND revoked_at IS NULL`,
      [tokenDigest],
    );

    return NextResponse.json(
      {
        ok: true,
        message: "You have been signed out.",
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Runner logout] Session revocation failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your Runner session could not be revoked. Please try again.",
      503,
    );
  }
}
