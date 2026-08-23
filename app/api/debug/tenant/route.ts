import { NextResponse } from "next/server";
import { Client } from "pg";
import { postgresAdmin } from "@/lib/postgres-admin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get('businessId');
    
    if (!businessId) {
      return NextResponse.json({
        error: "Please provide businessId",
        example: "/api/debug/tenant?businessId=your-business-id"
      });
    }

    // 1. Check if business exists in control plane
    const business = await postgresAdmin.query(
      `SELECT id, name, slug FROM businesses WHERE id = $1`,
      [businessId]
    );

    if (business.rowCount === 0) {
      return NextResponse.json({
        error: "Business not found",
        businessId
      });
    }

    // 2. Check if database registry exists
    const registry = await postgresAdmin.query(
      `SELECT * FROM database_registry WHERE business_id = $1`,
      [businessId]
    );

    if (!registry.rowCount || registry.rowCount === 0) {
      return NextResponse.json({
        business: business.rows[0],
        error: "No database registry found for this business"
      });
    }

    const dbInfo = registry.rows[0];
    const databaseName = dbInfo.database_name;

    // 3. Try to connect to tenant database and check tables
    const tenantClient = new Client({
      host: dbInfo.database_host,
      port: dbInfo.database_port,
      database: databaseName,
      user: dbInfo.database_user,
      password: dbInfo.database_password_encrypted,
      ssl: { rejectUnauthorized: false }
    });

    await tenantClient.connect();

    // 4. Get all tables
    const tables = await tenantClient.query(`
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    // 5. Check if specific tables exist - with null safety
    const tableList = tables.rows || [];
    const hasUsers = tableList.some((r: any) => r.table_name === 'users');
    const hasBusinesses = tableList.some((r: any) => r.table_name === 'businesses');

    await tenantClient.end();

    return NextResponse.json({
      business: business.rows[0],
      database: {
        name: databaseName,
        host: dbInfo.database_host,
        port: dbInfo.database_port,
        user: dbInfo.database_user,
        status: dbInfo.status
      },
      tables: {
        count: tables.rowCount || 0,
        list: tableList.map((r: any) => r.table_name),
        hasUsers,
        hasBusinesses
      },
      success: (tables.rowCount || 0) > 0
    });

  } catch (error) {
    console.error("Debug API error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}