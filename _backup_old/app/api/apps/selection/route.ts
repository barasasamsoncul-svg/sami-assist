import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getBusinessForUser, saveEnabledAppIds } from "@/lib/app-selection";
import { SAMI_APPS, normalizeAppKeys } from "@/lib/sami-apps";
import { postgresAdmin } from "@/lib/postgres-admin";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const business = await getBusinessForUser(user.id);
    if (!business) return NextResponse.json({ success: false, error: "No active business found." }, { status: 404 });

    // Get enabled apps from database
    const result = await postgresAdmin.query(
      `SELECT app_key FROM business_apps WHERE business_id = $1 AND enabled = TRUE ORDER BY created_at ASC`,
      [business.id]
    );

    const appKeys = result.rows.map((row) => row.app_key);

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

export async function PATCH(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const business = await getBusinessForUser(user.id);
    if (!business) return NextResponse.json({ success: false, error: "No active business found." }, { status: 404 });

    const body = await req.json();
    const raw = body?.appKeys ?? body?.appIds;

    if (!Array.isArray(raw)) {
      return NextResponse.json({ success: false, error: "appKeys must be an array." }, { status: 400 });
    }

    const appKeys = normalizeAppKeys(raw);
    if (appKeys.length === 0) {
      return NextResponse.json({ success: false, error: "Enable at least one business app." }, { status: 400 });
    }

    // Save enabled apps
    const saved = await saveEnabledAppIds(business.id, appKeys);

    // Log the action
    await postgresAdmin.query(
      `INSERT INTO audit_logs (user_id, business_id, action, resource_type, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, business.id, 'UPDATE_APPS', 'business_apps', JSON.stringify({ appKeys: saved })]
    );

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