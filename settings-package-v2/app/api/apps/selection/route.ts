import fs from "fs/promises";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getEnabledAppsForUser, saveEnabledApps } from "@/lib/enabled-apps";
import { normalizeAppKeys } from "@/lib/sami-apps";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";
import { getAppSchemaPath } from "@/lib/app-registry";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const rawIds = body?.appKeys ?? body?.appIds;
    if (!Array.isArray(rawIds)) {
      return NextResponse.json({ success: false, error: "appKeys must be an array." }, { status: 400 });
    }

    const requested = normalizeAppKeys(rawIds);
    if (requested.length === 0) {
      return NextResponse.json({ success: false, error: "At least one app must remain enabled." }, { status: 400 });
    }

    const current = await getEnabledAppsForUser(user.id);
    const currentKeys = current.appKeys || [];
    const additions = requested.filter((key) => !currentKeys.includes(key));

    // Only newly-added apps need their tenant schema installed.
    if (additions.length > 0) {
      const { pool } = await getTenantDatabaseForUser(user.id);

      for (const appKey of additions) {
        const schemaPath = getAppSchemaPath(appKey);
        if (!schemaPath) {
          return NextResponse.json(
            { success: false, error: `The ${appKey} app does not have an installable tenant schema yet.` },
            { status: 409 }
          );
        }

        const schemaSql = await fs.readFile(schemaPath, "utf8");
        await pool.query("BEGIN");
        try {
          await pool.query(schemaSql);
          await pool.query("COMMIT");
        } catch (error) {
          await pool.query("ROLLBACK");
          throw error;
        }
      }
    }

    const appKeys = await saveEnabledApps(current.businessId, requested);

    return NextResponse.json({
      success: true,
      appKeys,
      addedApps: additions,
    });
  } catch (error) {
    console.error("App selection update error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update apps." },
      { status: 500 }
    );
  }
}
