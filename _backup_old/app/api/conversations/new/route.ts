import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

export async function POST() {
  try {
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
    // CREATE NEW CONVERSATION
    // ==========================================

    const result = await pool.query(
      `
      INSERT INTO conversations (
        title
      )
      VALUES ($1)
      RETURNING *
      `,
      ["New Chat"]
    );

    // ==========================================
    // RETURN CREATED CONVERSATION
    // ==========================================

    return NextResponse.json(
      result.rows[0],
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Create conversation API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create conversation.",
      },
      {
        status: 500,
      }
    );
  }
}