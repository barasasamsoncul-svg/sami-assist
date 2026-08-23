import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      profile: {
        id: user.id,
        full_name: user.fullName,
        email: user.email,
        created_at: user.createdAt,
        last_login_at: user.lastLoginAt,
      }
    });
  } catch (error) {
    console.error("Profile API error:", error);
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 500 }
    );
  }
}