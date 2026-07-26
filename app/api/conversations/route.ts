import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function GET() {
  try {
    // Get the currently signed-in user
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Find the business and connect to its tenant database
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // Get conversations from THIS business's tenant database
    const result = await pool.query(
      `
      SELECT *
      FROM conversations
      ORDER BY created_at DESC
      `
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(
      "Conversations API Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load conversations.",
      },
      { status: 500 }
    );
  }
}