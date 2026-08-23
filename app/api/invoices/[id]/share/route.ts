import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function generateShareToken(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/[id]/share
|--------------------------------------------------------------------------
|
| Creates a shareable link for an invoice.
|
| Request body:
| {
|   password?: string,
|   expires_in_days?: number,
|   allow_download?: boolean,
|   allow_print?: boolean
| }
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest, { params }: Context) {
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
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  const body = await req.json();

  const {
    password,
    expires_in_days,
    allow_download,
    allow_print,
  } = body;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verify invoice exists
    const invoiceResult = await client.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.status,
          i.deleted_at
        FROM public.invoices i
        WHERE i.id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceResult.rows[0];

    if (invoice.deleted_at) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Cannot share a deleted invoice" },
        { status: 409 }
      );
    }

    if (invoice.status === "cancelled" || invoice.status === "void") {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: `Cannot share a ${invoice.status} invoice` },
        { status: 409 }
      );
    }

    // Get settings
    const settingsResult = await client.query(
      `
        SELECT *
        FROM public.invoice_settings
        ORDER BY created_at ASC
        LIMIT 1
      `
    );

    const settings = settingsResult.rows[0] || {};

    // Check if sharing is enabled
    if (!settings.sharing_enabled) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Sharing is disabled in settings" },
        { status: 403 }
      );
    }

    // Generate share token
    const token = generateShareToken();

    // Determine expiry
    let expiresAt: Date | null = null;
    const days = expires_in_days || settings.public_link_expiry_days || 30;
    if (days > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
    }

    // Store share link in metadata
    const shareLink = {
      token,
      password: password || null,
      expires_at: expiresAt,
      allow_download: allow_download !== undefined ? allow_download : true,
      allow_print: allow_print !== undefined ? allow_print : true,
      created_at: new Date().toISOString(),
      created_by: user.id,
    };

    // Update invoice metadata with share link
    const result = await client.query(
      `
        UPDATE public.invoices
        SET
          metadata = metadata || $1,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [
        jsonValue({
          share_link: shareLink,
        }, {}),
        id,
      ]
    );

    // Activity log
    await client.query(
      `
        INSERT INTO public.invoice_activity_log (
          invoice_id,
          user_id,
          user_name,
          action,
          details
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        id,
        user.id,
        user.fullName || user.email,
        "share_link_created",
        jsonValue({
          token,
          expires_at: expiresAt,
        }, {}),
      ]
    );

    await client.query("COMMIT");

    // Generate the full shareable URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.example.com";
    const shareUrl = `${baseUrl}/share/invoice/${token}`;

    return NextResponse.json({
      success: true,
      share_url: shareUrl,
      share_token: token,
      expires_at: expiresAt,
      allow_download: shareLink.allow_download,
      allow_print: shareLink.allow_print,
      has_password: !!password,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/invoices/[id]/share:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create share link",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/[id]/share
|--------------------------------------------------------------------------
|
| Gets the share link for an invoice.
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest, { params }: Context) {
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
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        SELECT
          id,
          metadata->'share_link' AS share_link
        FROM public.invoices
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const shareLink = result.rows[0]?.share_link;

    if (!shareLink) {
      return NextResponse.json(
        { error: "No share link found for this invoice" },
        { status: 404 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.example.com";
    const shareUrl = `${baseUrl}/share/invoice/${shareLink.token}`;

    return NextResponse.json({
      success: true,
      share_url: shareUrl,
      share_token: shareLink.token,
      expires_at: shareLink.expires_at,
      allow_download: shareLink.allow_download,
      allow_print: shareLink.allow_print,
      has_password: !!shareLink.password,
      created_at: shareLink.created_at,
    });
  } catch (error) {
    console.error("GET /api/invoices/[id]/share:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get share link",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/[id]/share
|--------------------------------------------------------------------------
|
| Deletes the share link for an invoice.
|--------------------------------------------------------------------------
*/

export async function DELETE(req: NextRequest, { params }: Context) {
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
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verify invoice exists
    const invoiceResult = await client.query(
      `
        SELECT id
        FROM public.invoices
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE
      `,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Remove share link from metadata
    await client.query(
      `
        UPDATE public.invoices
        SET
          metadata = metadata - 'share_link',
          updated_at = NOW()
        WHERE id = $1
      `,
      [id]
    );

    // Activity log
    await client.query(
      `
        INSERT INTO public.invoice_activity_log (
          invoice_id,
          user_id,
          user_name,
          action,
          details
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        id,
        user.id,
        user.fullName || user.email,
        "share_link_deleted",
        jsonValue({
          deleted_at: new Date().toISOString(),
        }, {}),
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Share link deleted successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("DELETE /api/invoices/[id]/share:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete share link",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}