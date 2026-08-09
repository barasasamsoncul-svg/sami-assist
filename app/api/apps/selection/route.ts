import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getBusinessForUser, saveEnabledAppIds } from "@/lib/app-selection";
import { SAMI_APPS, normalizeAppKeys } from "@/lib/sami-apps";

export async function PATCH(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const business = await getBusinessForUser(user.id);
    const body = await req.json();
    const raw = body?.appKeys ?? body?.appIds;

    if (!Array.isArray(raw)) {
      return NextResponse.json({ success: false, error: "appKeys must be an array." }, { status: 400 });
    }

    const appKeys = normalizeAppKeys(raw);
    if (appKeys.length === 0) {
      return NextResponse.json({ success: false, error: "Enable at least one business app." }, { status: 400 });
    }

    const saved = await saveEnabledAppIds(business.id, appKeys);
    return NextResponse.json({
      success: true,
      businessId: business.id,
      appKeys: saved,
      apps: SAMI_APPS.filter((app) => saved.includes(app.key)),
    });
  } catch (error) {
    console.error("App selection PATCH error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to update apps." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const business = await getBusinessForUser(user.id);
    const result = await import("@/lib/app-selection");
    const appKeys = await result.getEnabledAppIds(business.id);

    return NextResponse.json({
      success: true,
      businessId: business.id,
      appKeys,
      apps: SAMI_APPS.filter((app) => appKeys.includes(app.key)),
    });
  } catch (error) {
    console.error("App selection GET error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to load apps." }, { status: 500 });
  }
}
