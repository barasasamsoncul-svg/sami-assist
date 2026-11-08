
import { NextResponse } from "next/server";

import { requestAdminPasswordReset } from "@/apps/admin/server/password-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return await requestAdminPasswordReset(request);
  } catch (cause) {
    console.error(
      "[SaMi Admin API] Forgot-password request failed.",
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
