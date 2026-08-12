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
    `SELECT 
       b.id, b.name, b.slug, b.email, b.phone, b.logo_url, b.status,
       b.type, b.country, b.currency, b.timezone,
       b.tax_id, b.registration_number, b.website, b.address,
       b.industry, b.founded_year, b.employee_count, b.updated_at
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

    // Get team members
    const teamResult = await postgresAdmin.query(
      `SELECT bu.*, u.full_name, u.email 
       FROM business_users bu
       INNER JOIN users u ON u.id = bu.user_id
       WHERE bu.business_id = $1
       ORDER BY bu.role = 'owner' DESC, bu.created_at ASC`,
      [business.id]
    );

    // Get sessions
    const sessionsResult = await postgresAdmin.query(
      `SELECT * FROM sessions WHERE user_id = $1 ORDER BY last_active DESC`,
      [user.id]
    );

    // Get API keys
    const apiKeysResult = await postgresAdmin.query(
      `SELECT id, name, key_preview, permissions, last_used, created_at, expires_at 
       FROM api_keys 
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [user.id]
    );

    // Get billing info
    const billingResult = await postgresAdmin.query(
      `SELECT * FROM subscriptions WHERE business_id = $1`,
      [business.id]
    );

  return NextResponse.json({
  success: true,
  user: { 
    id: user.id, 
    fullName: user.fullName, 
    email: user.email, 
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    twoFactorEnabled: user.twoFactorEnabled,
    emailVerified: user.emailVerified
  },
      business,
      settings: settingsResult.rows[0]?.settings ?? {},
      appKeys: apps.appKeys,
      apps: SAMI_APPS,
      team: teamResult.rows,
      sessions: sessionsResult.rows,
      apiKeys: apiKeysResult.rows,
      billing: billingResult.rows[0] || null,
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

    // ============================================================
    // BUSINESS PROFILE UPDATE - ALL FIELDS
    // ============================================================
    if (!body.section) {
      const updates = {
        name: typeof body.name === "string" ? body.name.trim() : business.name,
        slug: typeof body.slug === "string" ? body.slug.trim() : business.slug,
        email: typeof body.email === "string" ? body.email.trim() : business.email,
        phone: typeof body.phone === "string" ? body.phone.trim() : business.phone,
        logo_url: typeof body.logo_url === "string" ? body.logo_url : body.logo_url === null ? null : business.logo_url,
        type: typeof body.type === "string" ? body.type.trim() : business.type,
        country: typeof body.country === "string" ? body.country.trim() : business.country,
        currency: typeof body.currency === "string" ? body.currency.trim() : business.currency,
        timezone: typeof body.timezone === "string" ? body.timezone.trim() : business.timezone,
        tax_id: typeof body.taxId === "string" ? body.taxId.trim() : business.tax_id,
        registration_number: typeof body.registrationNumber === "string" ? body.registrationNumber.trim() : business.registration_number,
        website: typeof body.website === "string" ? body.website.trim() : business.website,
        address: typeof body.address === "string" ? body.address.trim() : business.address,
        industry: typeof body.industry === "string" ? body.industry.trim() : business.industry,
        founded_year: typeof body.foundedYear === "number" ? body.foundedYear : business.founded_year,
        employee_count: typeof body.employeeCount === "number" ? body.employeeCount : business.employee_count,
      };

      // Validation
      if (!updates.name) return NextResponse.json({ success: false, error: "Business name is required." }, { status: 400 });
      if (!updates.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(updates.slug)) {
        return NextResponse.json({ success: false, error: "Business slug may contain lowercase letters, numbers and hyphens only." }, { status: 400 });
      }
      if (updates.logo_url && updates.logo_url.length > 1_500_000) {
        return NextResponse.json({ success: false, error: "Logo is too large." }, { status: 400 });
      }

      // Check duplicate slug
      const duplicate = await postgresAdmin.query(
        `SELECT id FROM businesses WHERE slug = $1 AND id <> $2 LIMIT 1`,
        [updates.slug, business.id]
      );
      if (duplicate.rowCount) return NextResponse.json({ success: false, error: "That business slug is already in use." }, { status: 409 });

      // Update all fields
      const result = await postgresAdmin.query(
        `UPDATE businesses
         SET 
           name = $1, slug = $2, email = $3, phone = $4, logo_url = $5,
           type = $6, country = $7, currency = $8, timezone = $9,
           tax_id = $10, registration_number = $11, website = $12,
           address = $13, industry = $14, founded_year = $15,
           employee_count = $16, updated_at = NOW()
         WHERE id = $17
         RETURNING *`,
        [
          updates.name, updates.slug, updates.email || null, updates.phone || null, updates.logo_url,
          updates.type, updates.country, updates.currency, updates.timezone,
          updates.tax_id, updates.registration_number, updates.website,
          updates.address, updates.industry, updates.founded_year,
          updates.employee_count, business.id
        ]
      );

      return NextResponse.json({ success: true, business: result.rows[0] });
    }

    // ============================================================
    // SETTINGS SECTION UPDATE
    // ============================================================
    const section = typeof body.section === "string" ? body.section.trim() : "";
    const settings = body.settings && typeof body.settings === "object" && !Array.isArray(body.settings) ? body.settings : null;
    if (!section || !settings) return NextResponse.json({ success: false, error: "A settings section and object are required." }, {status: 400 });
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