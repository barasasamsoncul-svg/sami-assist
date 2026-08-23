import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { postgresAdmin } from "@/lib/postgres-admin";
import { SAMI_APPS } from "@/lib/sami-apps";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's business
    const businessResult = await postgresAdmin.query(
      `SELECT b.id, b.name, b.slug
       FROM business_users bu
       INNER JOIN businesses b ON b.id = bu.business_id
       WHERE bu.user_id = $1 AND b.status = 'active'
       LIMIT 1`,
      [user.id]
    );

    if (businessResult.rowCount === 0) {
      return NextResponse.json({
        success: true,
        apps: [],
        message: "No active business found"
      });
    }

    const businessId = businessResult.rows[0].id;

    // Get enabled apps
    const appsResult = await postgresAdmin.query(
      `SELECT app_key
       FROM business_apps
       WHERE business_id = $1 AND enabled = TRUE
       ORDER BY created_at ASC`,
      [businessId]
    );

    const appKeys = appsResult.rows.map((row) => row.app_key);
    
    // Filter SAMI_APPS to only enabled ones
    const enabledApps = SAMI_APPS.filter((app) => appKeys.includes(app.key));

    return NextResponse.json({
      success: true,
      apps: enabledApps,
      businessId
    });
  } catch (error) {
    console.error("Apps API error:", error);
    return NextResponse.json(
      { error: "Failed to load apps" },
      { status: 500 }
    );
  }
}