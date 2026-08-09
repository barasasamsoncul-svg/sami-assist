import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { postgresAdmin } from "@/lib/postgres-admin";
import { Pool } from "pg";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's business
    const businessResult = await postgresAdmin.query(
      `SELECT b.id
       FROM business_users bu
       INNER JOIN businesses b ON b.id = bu.business_id
       WHERE bu.user_id = $1 AND b.status = 'active'
       LIMIT 1`,
      [user.id]
    );

    if (businessResult.rowCount === 0) {
      return NextResponse.json({ conversations: [] });
    }

    const businessId = businessResult.rows[0].id;
    
    // Get tenant database name
    const dbResult = await postgresAdmin.query(
      `SELECT database_name FROM database_registry WHERE business_id = $1 AND status = 'active'`,
      [businessId]
    );

    if (dbResult.rowCount === 0) {
      return NextResponse.json({ conversations: [] });
    }

    const dbName = dbResult.rows[0].database_name;
    
    // Query tenant database for conversations
    const tenantPool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_ADMIN_USER,
      password: process.env.POSTGRES_ADMIN_PASSWORD,
      database: dbName,
      ssl: { rejectUnauthorized: false },
    });

    try {
      const result = await tenantPool.query(
        `SELECT id, title, created_at, updated_at
         FROM conversations
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [user.id]
      );

      await tenantPool.end();

      return NextResponse.json({
        conversations: result.rows
      });
    } catch (err) {
      await tenantPool.end();
      // If conversations table doesn't exist yet, return empty array
      const error = err as { code?: string };
      if (error.code === '42P01') {
        return NextResponse.json({ conversations: [] });
      }
      throw err;
    }
  } catch (error) {
    console.error("Conversations API error:", error);
    return NextResponse.json(
      { error: "Failed to load conversations" },
      { status: 500 }
    );
  }
}