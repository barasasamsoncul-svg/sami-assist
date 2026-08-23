import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    // ==========================================
    // GET CONVERSATION ID
    // ==========================================

    const { conversationId } = await params;

    if (!conversationId) {
      return NextResponse.json(
        {
          error: "Conversation ID is required",
        },
        {
          status: 400,
        }
      );
    }

    // ==========================================
    // GET CURRENT SIGNED-IN USER
    // ==========================================

    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // ==========================================
    // CONNECT TO USER'S BUSINESS TENANT DATABASE
    // ==========================================

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // ==========================================
    // VERIFY CONVERSATION EXISTS
    // ==========================================

    const conversationResult =
      await pool.query(
        `
        SELECT id
        FROM conversations
        WHERE id = $1
        LIMIT 1
        `,
        [conversationId]
      );

    if (conversationResult.rowCount === 0) {
      return NextResponse.json(
        {
          error: "Conversation not found",
        },
        {
          status: 404,
        }
      );
    }

    // ==========================================
    // GET MESSAGES
    // ==========================================

    const result = await pool.query(
      `
      SELECT *
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      `,
      [conversationId]
    );

    return NextResponse.json(
      result.rows
    );
  } catch (error) {
    console.error(
      "Messages API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load messages.",
      },
      {
        status: 500,
      }
    );
  }
}