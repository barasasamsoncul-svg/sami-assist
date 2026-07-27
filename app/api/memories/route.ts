import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/**
 * GET
 * Fetch all memories belonging to the
 * currently logged-in user.
 */
export async function GET() {
  try {
    // Get logged-in user from SaMi session
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

    // Connect to the user's business tenant database
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // Fetch user's memories
    const result = await pool.query(
      `
      SELECT *
      FROM ai_memory
      WHERE user_id = $1
      ORDER BY importance DESC, created_at DESC
      `,
      [user.id]
    );

    return NextResponse.json(
      result.rows
    );
  } catch (error) {
    console.error(
      "Memory API GET Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * POST
 * Create a new permanent memory
 * for the currently logged-in user.
 */
export async function POST(
  req: Request
) {
  try {
    const body =
      await req.json();

    const {
      memory,
      category = "general",
      importance = 5,
    } = body;

    // Validate memory
    if (
      !memory ||
      typeof memory !== "string" ||
      !memory.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Memory is required",
        },
        {
          status: 400,
        }
      );
    }

    // Get logged-in user from SaMi session
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

    // Connect to the user's business tenant database
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // Check if similar memory already exists
    const existingResult =
      await pool.query(
        `
        SELECT id, memory
        FROM ai_memory
        WHERE user_id = $1
          AND memory = $2
        LIMIT 1
        `,
        [
          user.id,
          memory.trim(),
        ]
      );

    // Avoid duplicates
    if ((existingResult.rowCount ?? 0) > 0)  {
      return NextResponse.json({
        success: true,
        memory:
          existingResult.rows[0],
        message:
          "Memory already exists",
      });
    }

    // Save memory
    const newMemoryResult =
      await pool.query(
        `
        INSERT INTO ai_memory
          (
            user_id,
            memory,
            category,
            importance
          )
        VALUES
          ($1, $2, $3, $4)
        RETURNING *
        `,
        [
          user.id,
          memory.trim(),
          category,
          importance,
        ]
      );

    return NextResponse.json(
      {
        success: true,
        memory:
          newMemoryResult.rows[0],
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Memory API POST Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}