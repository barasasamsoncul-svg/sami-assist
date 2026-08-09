import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// ==========================================
// GET SINGLE CUSTOMER
// ==========================================

export async function GET(
  req: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Customer ID is required",
        },
        {
          status: 400,
        }
      );
    }

    // ==========================================
    // GET CURRENT LOGGED-IN USER
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
    // GET CUSTOMER
    // ==========================================

    const result = await pool.query(
      `
      SELECT *
      FROM customers
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        {
          error: "Customer not found",
        },
        {
          status: 404,
        }
      );
    }

    // ==========================================
    // RETURN CUSTOMER
    // ==========================================

    return NextResponse.json(
      result.rows[0]
    );
  } catch (error) {
    console.error(
      "Customer details API error:",
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

// ==========================================
// UPDATE CUSTOMER
// ==========================================

export async function PATCH(
  req: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });

    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const body = await req.json();
    const companyName = String(body.company_name ?? "").trim();
    if (!companyName) return NextResponse.json({ error: "Company name is required" }, { status: 400 });

    const result = await pool.query(
      `UPDATE customers
       SET company_name = $2,
           contact_name = $3,
           email = $4,
           phone = $5,
           address = $6,
           status = COALESCE(NULLIF($7, ''), status),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        companyName,
        String(body.contact_name ?? "").trim() || null,
        String(body.email ?? "").trim() || null,
        String(body.phone ?? "").trim() || null,
        String(body.address ?? "").trim() || null,
        String(body.status ?? "").trim(),
      ],
    );

    if (result.rowCount !== 1) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Customer update API error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update customer" }, { status: 500 });
  }
}

// ==========================================
// DELETE CUSTOMER
// ==========================================

export async function DELETE(
  req: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Customer ID is required",
        },
        {
          status: 400,
        }
      );
    }

    // ==========================================
    // GET CURRENT LOGGED-IN USER
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
    // DELETE CUSTOMER
    // ==========================================

    const result = await pool.query(
      `
      DELETE FROM customers
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        {
          error: "Customer not found",
        },
        {
          status: 404,
        }
      );
    }

    // ==========================================
    // SUCCESS
    // ==========================================

    return NextResponse.json({
      success: true,
      message:
        "Customer deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete customer API error:",
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