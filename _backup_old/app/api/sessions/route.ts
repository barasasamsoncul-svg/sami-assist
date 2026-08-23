import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { postgresAdmin } from "@/lib/postgres-admin";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    // Get all sessions for this user
    const result = await postgresAdmin.query(
      `SELECT 
         id,
         device,
         browser,
         os,
         ip,
         location,
         last_active,
         created_at,
         expires_at,
         is_current
       FROM sessions 
       WHERE user_id = $1 
       ORDER BY is_current DESC, last_active DESC`,
      [user.id]
    );

    return NextResponse.json({ success: true, sessions: result.rows });
  } catch (error) {
    console.error("Sessions GET error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to load sessions." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const { sessionId } = await req.json();

    if (sessionId === 'all') {
      // Revoke all sessions except current
      await postgresAdmin.query(
        `DELETE FROM sessions WHERE user_id = $1 AND is_current = FALSE`,
        [user.id]
      );
      return NextResponse.json({ success: true, message: "All other sessions revoked." });
    }

    // Revoke specific session
    const result = await postgresAdmin.query(
      `DELETE FROM sessions WHERE id = $1 AND user_id = $2 AND is_current = FALSE RETURNING id`,
      [sessionId, user.id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, error: "Session not found or cannot revoke current session." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Session revoked successfully." });
  } catch (error) {
    console.error("Sessions DELETE error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to revoke session." }, { status: 500 });
  }
}