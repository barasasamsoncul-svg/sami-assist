import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { postgresAdmin } from "@/lib/postgres-admin";
import { randomUUID } from "crypto";

async function getBusinessForUser(userId: string) {
  const result = await postgresAdmin.query(
    `SELECT b.id, b.name, b.slug
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

    // Get all team members with user details
    const result = await postgresAdmin.query(
      `SELECT 
         bu.user_id,
         bu.role,
         bu.permissions,
         bu.status,
         bu.invited_at,
         bu.last_active_at,
         bu.created_at,
         u.full_name,
         u.email,
         u.last_login_at
       FROM business_users bu
       INNER JOIN users u ON u.id = bu.user_id
       WHERE bu.business_id = $1
       ORDER BY bu.role = 'owner' DESC, bu.created_at ASC`,
      [business.id]
    );

    return NextResponse.json({ success: true, team: result.rows });
  } catch (error) {
    console.error("Team GET error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to load team." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const business = await getBusinessForUser(user.id);
    if (!business) return NextResponse.json({ success: false, error: "No active business found." }, { status: 404 });

    const { email, role, permissions } = await req.json();

    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required." }, { status: 400 });
    }

    // Check if user exists
    const userResult = await postgresAdmin.query(
      `SELECT id, full_name, email FROM users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    if (userResult.rowCount === 0) {
      return NextResponse.json({ success: false, error: "User not found. They need to create an account first." }, { status: 404 });
    }

    const invitedUserId = userResult.rows[0].id;

    // Check if already in business
    const existing = await postgresAdmin.query(
      `SELECT * FROM business_users WHERE business_id = $1 AND user_id = $2`,
      [business.id, invitedUserId]
    );

    if (existing.rowCount && existing.rowCount > 0) { 
      return NextResponse.json({ success: false, error: "User is already a member of this business." }, { status: 409 });
    }

    // Add user to business
    await postgresAdmin.query(
      `INSERT INTO business_users (business_id, user_id, role, permissions, status, invited_at)
       VALUES ($1, $2, $3, $4, 'active', NOW())`,
      [business.id, invitedUserId, role || 'member', permissions || []]
    );

    return NextResponse.json({ 
      success: true, 
      message: "Team member added successfully.",
      member: {
        user_id: invitedUserId,
        full_name: userResult.rows[0].full_name,
        email: userResult.rows[0].email,
        role: role || 'member',
        permissions: permissions || [],
        status: 'active'
      }
    });
  } catch (error) {
    console.error("Team POST error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to add team member." }, { status: 500 });
  }
}