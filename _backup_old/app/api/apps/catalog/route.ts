import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { SAMI_APPS } from "@/lib/sami-apps";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      apps: SAMI_APPS,
    });
  } catch (error) {
    console.error("SaMi app catalog error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load SaMi app catalog.",
      },
      { status: 500 }
    );
  }
}
