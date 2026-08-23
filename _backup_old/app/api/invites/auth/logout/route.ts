import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { postgresAdmin } from "@/lib/postgres-admin";

export async function POST() {
  try {
    const cookieStore = await cookies();

    const sessionToken =
      cookieStore.get("sami_session")?.value;

    if (sessionToken) {
      const sessionTokenHash =
        crypto
          .createHash("sha256")
          .update(sessionToken)
          .digest("hex");

      // Delete the session from the database
      await postgresAdmin.query(
        `
        DELETE FROM sessions
        WHERE session_token_hash = $1
        `,
        [sessionTokenHash]
      );
    }

    // Remove the browser cookie
    const response = NextResponse.json({
      success: true,
      message: "Logged out successfully.",
    });

    response.cookies.set(
      "sami_session",
      "",
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        expires: new Date(0),
      }
    );

    return response;
  } catch (error) {
    console.error(
      "Logout error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Logout failed.",
      },
      { status: 500 }
    );
  }
}