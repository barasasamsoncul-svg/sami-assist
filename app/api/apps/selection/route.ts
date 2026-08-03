import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import {
  getBusinessForUser,
  getEnabledAppIds,
  saveEnabledAppIds,
} from "@/lib/app-selection";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const business = await getBusinessForUser(user.id);
    const appIds = await getEnabledAppIds(business.id);

    return NextResponse.json({ success: true, business, appIds });
  } catch (error) {
    console.error("App selection GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : "Failed to load app selection.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const rawIds = body?.appIds ?? body?.selectedAppIds;

    if (!Array.isArray(rawIds)) {
      return NextResponse.json(
        { success: false, error: "appIds must be an array." },
        { status: 400 }
      );
    }

    const business = await getBusinessForUser(user.id);
    const appIds = await saveEnabledAppIds(business.id, rawIds);

    return NextResponse.json({ success: true, business, appIds });
  } catch (error) {
    console.error("App selection POST error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : "Failed to save app selection.",
      },
      { status: 500 }
    );
  }
}
