import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } =
      await getTenantDatabaseForUser(user.id);

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
      "Conversations GET API Error:",
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

export async function POST(
  request: NextRequest
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const {
      title,
    } = body;

    const conversationTitle =
      title?.trim() || "New Conversation";

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    const result = await pool.query(
      `
      INSERT INTO conversations (
        title
      )
      VALUES ($1)
      RETURNING *
      `,
      [
        conversationTitle,
      ]
    );

    return NextResponse.json(
      result.rows[0],
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Conversations POST API Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create conversation.",
      },
      { status: 500 }
    );
  }
}