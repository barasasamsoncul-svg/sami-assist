import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| POST /api/invoices/templates/[id]/default
|--------------------------------------------------------------------------
|
| Sets a template as the default.
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest, { params }: Context) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Template ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verify template exists and is active
      const templateCheck = await client.query(
        `
          SELECT id, name, is_active
          FROM public.invoice_templates
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (templateCheck.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Template not found" },
          { status: 404 }
        );
      }

      const template = templateCheck.rows[0];

      if (!template.is_active) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot set an inactive template as default" },
          { status: 400 }
        );
      }

      // Remove default from all other templates
      await client.query(
        `
          UPDATE public.invoice_templates
          SET
            is_default = false,
            updated_at = NOW()
          WHERE is_default = true
            AND id <> $1
        `,
        [id]
      );

      // Set this template as default
      const result = await client.query(
        `
          UPDATE public.invoice_templates
          SET
            is_default = true,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: `Template "${template.name}" set as default`,
        template: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/templates/[id]/default:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to set default template",
      },
      { status: 500 }
    );
  }
}