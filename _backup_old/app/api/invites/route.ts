import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { postgresAdmin } from "@/lib/postgres-admin";
import crypto from "crypto";

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

    // Get all invites for this business
    const result = await postgresAdmin.query(
      `SELECT 
         id,
         email,
         role,
         permissions,
         status,
         created_at,
         expires_at,
         accepted_at
       FROM invites 
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [business.id]
    );

    return NextResponse.json({ success: true, invites: result.rows });
  } catch (error) {
    console.error("Invites GET error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to load invites." }, { status: 500 });
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

    // Check if user already exists
    const existingUser = await postgresAdmin.query(
      `SELECT id FROM users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    // Check if already invited
    const existingInvite = await postgresAdmin.query(
      `SELECT id FROM invites WHERE business_id = $1 AND email = $2 AND status = 'pending'`,
      [business.id, email.trim().toLowerCase()]
    );

    if (existingInvite.rowCount && existingInvite.rowCount > 0) {
      return NextResponse.json({ success: false, error: "An invitation has already been sent to this email." }, { status: 409 });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // Create invite
    const result = await postgresAdmin.query(
      `INSERT INTO invites (business_id, email, role, permissions, token, invited_by, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id, email, role, permissions, created_at, expires_at`,
      [business.id, email.trim().toLowerCase(), role || 'member', permissions || [], token, user.id, expiresAt]
    );

    return NextResponse.json({ 
      success: true, 
      invite: result.rows[0],
      message: `Invitation sent to ${email}. They have 7 days to accept.`
    });
  } catch (error) {
    console.error("Invites POST error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to create invite." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const business = await getBusinessForUser(user.id);
    if (!business) return NextResponse.json({ success: false, error: "No active business found." }, { status: 404 });

    const { inviteId } = await req.json();

    if (!inviteId) {
      return NextResponse.json({ success: false, error: "Invite ID is required." }, { status: 400 });
    }

    // Delete invite
    const result = await postgresAdmin.query(
      `DELETE FROM invites WHERE id = $1 AND business_id = $2 AND status = 'pending' RETURNING id`,
      [inviteId, business.id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, error: "Invite not found or already accepted." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Invitation cancelled." });
  } catch (error) {
    console.error("Invites DELETE error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to cancel invite." }, { status: 500 });
  }
}