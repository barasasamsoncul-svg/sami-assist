import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getEnabledAppsForUser } from "@/lib/enabled-apps";
import { getApp } from "@/lib/sami-apps";

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

    const { businessId, appKeys } =
      await getEnabledAppsForUser(user.id);

    const apps = appKeys
      .map((appKey) => getApp(appKey))
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      businessId,
      appKeys,
      apps,
    });
  } catch (error) {
    console.error("Apps API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load SaMi apps.",
      },
      { status: 500 }
    );
  }
}