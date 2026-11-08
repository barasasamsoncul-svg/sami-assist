
import { NextResponse } from "next/server";

import { verifyAdminPasswordReset } from "@/apps/admin/server/password-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return await verifyAdminPasswordReset(request);
  } catch (cause) {
    console.error(
      "[SaMi Admin API] Password recovery endpoint failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return NextResponse.json(
      {
        ok: false,
        error: "Password recovery is temporarily unavailable. Please try again.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  }
}
