import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";
import { executeWrite } from "@/lib/ai-query/executor";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const actionId =
      typeof body.actionId === "string"
        ? body.actionId.trim()
        : "";

    if (!actionId) {
      return NextResponse.json(
        { error: "actionId is required." },
        { status: 400 },
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const action = await pool.query(
      `
      SELECT
        id,
        user_id,
        conversation_id,
        action_name,
        input,
        status,
        created_at
      FROM ai_actions
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [actionId, user.id],
    );

    if (action.rowCount === 0) {
      return NextResponse.json(
        { error: "Pending action not found." },
        { status: 404 },
      );
    }

    const row = action.rows[0];

    if (row.status !== "pending_confirmation") {
      return NextResponse.json(
        { error: "This action is no longer awaiting confirmation." },
        { status: 409 },
      );
    }

    // Pending confirmations expire after 15 minutes.
    const createdAt = new Date(row.created_at).getTime();
    if (Date.now() - createdAt > 15 * 60 * 1000) {
      await pool.query(
        `
        UPDATE ai_actions
        SET status = 'expired'
        WHERE id = $1
          AND user_id = $2
          AND status = 'pending_confirmation'
        `,
        [actionId, user.id],
      );

      return NextResponse.json(
        { error: "This confirmation has expired. Please create the request again." },
        { status: 410 },
      );
    }

    const input = row.input as {
      sql?: string;
      params?: unknown[];
      table?: string;
      operation?: string;
    };

    if (!input?.sql) {
      return NextResponse.json(
        { error: "Pending action has no executable query." },
        { status: 500 },
      );
    }

    const result = await executeWrite(
      pool,
      input.sql,
      input.params ?? [],
    );

    await pool.query(
      `
      UPDATE ai_actions
      SET
        status = 'completed',
        output = $1::jsonb,
        completed_at = NOW()
      WHERE id = $2
        AND user_id = $3
        AND status = 'pending_confirmation'
      `,
      [JSON.stringify(result), actionId, user.id],
    );

    const confirmationMessage =
      result.rowCount > 0
        ? `Done. I saved the ${input.operation || "requested"} change to ${input.table || "the business record"}.`
        : "The change was confirmed, but no record was changed.";

    if (row.conversation_id) {
      await pool.query(
        `
        INSERT INTO messages
          (conversation_id, role, content)
        VALUES
          ($1, $2, $3)
        `,
        [row.conversation_id, "ai", confirmationMessage],
      );
    }

    return NextResponse.json({
      success: true,
      actionId,
      reply: confirmationMessage,
      result,
    });
  } catch (error) {
    console.error("AI action confirmation error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
