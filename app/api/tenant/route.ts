import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    const {
      pool,
      business,
      databaseName,
    } =
      await getTenantDatabaseForUser(
        user.id
      );

    const result = await pool.query(
      `
      SELECT current_database() AS database_name
      `
    );

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      business,
      databaseName,
      connectedDatabase:
        result.rows[0].database_name,
    });
  } catch (error) {
    console.error(
      "Tenant connection error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Tenant connection failed.",
      },
      { status: 500 }
    );
  }
}