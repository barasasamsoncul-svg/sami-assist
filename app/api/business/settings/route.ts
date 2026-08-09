import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { postgresAdmin } from "@/lib/postgres-admin";
import { getEnabledAppsForUser } from "@/lib/enabled-apps";
import { SAMI_APPS } from "@/lib/sami-apps";

async function ensureSettingsTable() {
  await postgresAdmin.query(`
    CREATE TABLE IF NOT EXISTS business_settings (
      business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getBusinessForUser(userId: string) {
  const result = await postgresAdmin.query(
    `SELECT b.id, b.name, b.slug, b.email, b.phone, b.logo, b.status
     FROM business_users bu
     INNER JOIN businesses b ON b.id = bu.business_id
     WHERE bu.user_id = $1 AND b.status = 'active'
     ORDER BY b.created_at ASC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const business = await getBusinessForUser(user.id);
    if (!business) return NextResponse.json({ success: false, error: "No active business found." }, { status: 404 });

    await ensureSettingsTable();
    const settingsResult = await postgresAdmin.query(
      `SELECT settings FROM business_settings WHERE business_id = $1`,
      [business.id]
    );

    const apps = await getEnabledAppsForUser(user.id);

    return NextResponse.json({
      success: true,
      user: { id: user.id, fullName: user.fullName, email: user.email, createdAt: user.createdAt },
      business,
      settings: settingsResult.rows[0]?.settings ?? {},
      appKeys: apps.appKeys,
      apps: SAMI_APPS,
    });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to load settings." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const business = await getBusinessForUser(user.id);
    if (!business) return NextResponse.json({ success: false, error: "No active business found." }, { status: 404 });

    const body = await req.json();

    // Business profile remains a real business record.
    if (!body.section) {
      const name = typeof body.name === "string" ? body.name.trim() : business.name;
      const slug = typeof body.slug === "string" ? body.slug.trim() : business.slug;
      const email = typeof body.email === "string" ? body.email.trim() : business.email;
      const phone = typeof body.phone === "string" ? body.phone.trim() : business.phone;
      const logo = typeof body.logo === "string" ? body.logo : body.logo === null ? null : business.logo;

      if (!name) return NextResponse.json({ success: false, error: "Business name is required." }, { status: 400 });
      if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return NextResponse.json({ success: false, error: "Business slug may contain lowercase letters, numbers and hyphens only." }, { status: 400 });
      }
      if (logo && logo.length > 1_500_000) {
        return NextResponse.json({ success: false, error: "Logo is too large." }, { status: 400 });
      }

      const duplicate = await postgresAdmin.query(
        `SELECT id FROM businesses WHERE slug = $1 AND id <> $2 LIMIT 1`,
        [slug, business.id]
      );
      if (duplicate.rowCount) return NextResponse.json({ success: false, error: "That business slug is already in use." }, { status: 409 });

      const result = await postgresAdmin.query(
        `UPDATE businesses
         SET name = $1, slug = $2, email = $3, phone = $4, logo = $5
         WHERE id = $6
         RETURNING id, name, slug, email, phone, logo, status`,
        [name, slug, email || null, phone || null, logo, business.id]
      );

      return NextResponse.json({ success: true, business: result.rows[0] });
    }

    const section = typeof body.section === "string" ? body.section.trim() : "";
    const settings = body.settings && typeof body.settings === "object" && !Array.isArray(body.settings) ? body.settings : null;
    if (!section || !settings) return NextResponse.json({ success: false, error: "A settings section and object are required." }, { status: 400 });
    if (section.length > 80) return NextResponse.json({ success: false, error: "Invalid settings section." }, { status: 400 });

    await ensureSettingsTable();
    const result = await postgresAdmin.query(
      `INSERT INTO business_settings (business_id, settings, updated_at)
       VALUES ($1, jsonb_build_object($2, $3::jsonb), NOW())
       ON CONFLICT (business_id)
       DO UPDATE SET
         settings = jsonb_set(
           COALESCE(business_settings.settings, '{}'::jsonb),
           ARRAY[$2],
           $3::jsonb,
           true
         ),
         updated_at = NOW()
       RETURNING settings`,
      [business.id, section, JSON.stringify(settings)]
    );

    return NextResponse.json({ success: true, section, settings: result.rows[0]?.settings ?? {} });
  } catch (error) {
    console.error("Settings PATCH error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to save settings." }, { status: 500 });
  }
}
