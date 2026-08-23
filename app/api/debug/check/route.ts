import { NextResponse } from "next/server";
import { postgresAdmin } from "@/lib/postgres-admin";

export async function GET() {
  try {
    const result = await postgresAdmin.query(`
      SELECT 
        b.id,
        b.name,
        b.slug,
        b.created_at,
        dr.database_name,
        dr.status as db_status
      FROM businesses b
      LEFT JOIN database_registry dr ON b.id = dr.business_id
      ORDER BY b.created_at DESC
      LIMIT 5
    `);

    return NextResponse.json({
      success: true,
      count: result.rowCount || 0,
      businesses: result.rows || [],
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}