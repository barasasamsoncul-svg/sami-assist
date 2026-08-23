import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ token: string }>;
};

/*
|--------------------------------------------------------------------------
| GET /api/invoices/share/[token]
|--------------------------------------------------------------------------
|
| Public endpoint to view a shared invoice.
| Returns the invoice as an image or JSON data.
|
| Query parameters:
| ?format=json|image
| ?password=xxx
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Share token is required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "json";
    const password = searchParams.get("password");

    // Find invoice with matching share token
    // This would need a separate table or index for share tokens
    // For now, we search through metadata

    // Note: In production, you would have a share_links table
    // For now, this is a placeholder

    // Get settings for public access
    // This would check if public sharing is enabled

    // For demo purposes, return a response
    return NextResponse.json({
      success: true,
      message: "Share link works. In production, this would return the invoice.",
      token,
      format,
      invoice: {
        id: "placeholder",
        invoice_number: "INV-001",
        total_amount: 1000.00,
        status: "paid",
        customer_name: "Demo Customer",
        issue_date: "2026-01-01",
        due_date: "2026-01-31",
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/share/[token]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to access shared invoice",
      },
      { status: 500 }
    );
  }
}