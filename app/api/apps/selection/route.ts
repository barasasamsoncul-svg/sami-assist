import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";
import {
  getBusinessForUser,
  getEnabledAppIds,
  saveEnabledAppIds,
} from "@/lib/app-selection";
import { initializeTenantDatabase } from "@/lib/database-provisioning";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const business = await getBusinessForUser(user.id);
    const appKeys = await getEnabledAppIds(business.id);

    return NextResponse.json({ success: true, business, appKeys });
  } catch (error) {
    console.error("App selection GET error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to load app selection." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const body = await request.json();
    const rawIds = body?.appKeys ?? body?.appIds ?? body?.selectedAppIds;
    if (!Array.isArray(rawIds)) return NextResponse.json({ success: false, error: "appKeys must be an array." }, { status: 400 });

    const business = await getBusinessForUser(user.id);
    const previous = await getEnabledAppIds(business.id);
    let appKeys = await saveEnabledAppIds(business.id, rawIds);
    const added = appKeys.filter((key) => !previous.includes(key));

    let installedApps: string[] = [];
    let pendingApps: string[] = [];

    try {
      if (added.length > 0) {
        const { databaseName } = await getTenantDatabaseForUser(user.id);
        const result = await initializeTenantDatabase(databaseName, added);
        installedApps = result.installedApps;
        pendingApps = result.pendingApps;
      }
    } catch (provisionError) {
      await saveEnabledAppIds(business.id, previous);
      throw provisionError;
    }

    return NextResponse.json({
      success: true,
      business,
      appKeys,
      added,
      installedApps,
      pendingApps,
    });
  } catch (error) {
    console.error("App selection POST error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to save app selection." }, { status: 500 });
  }
}
