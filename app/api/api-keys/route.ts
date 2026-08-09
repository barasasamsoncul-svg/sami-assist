import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { postgresAdmin } from "@/lib/postgres-admin";
import crypto from "crypto";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    // Get all API keys for this user (excluding deleted)
    const result = await postgresAdmin.query(
      `SELECT 
         id,
         name,
         key_preview,
         permissions,
         last_used,
         created_at,
         expires_at
       FROM api_keys 
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [user.id]
    );

    return NextResponse.json({ success: true, apiKeys: result.rows });
  } catch (error) {
    console.error("API Keys GET error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to load API keys." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const { name, permissions } = await req.json();

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: "Key name is required." }, { status: 400 });
    }

    // Generate a secure API key
    const apiKey = `sami_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const keyPreview = `sami_${apiKey.slice(5, 15)}...`;

    // Save to database
    const result = await postgresAdmin.query(
      `INSERT INTO api_keys (user_id, name, key_hash, key_preview, permissions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, key_preview, permissions, created_at`,
      [user.id, name.trim(), keyHash, keyPreview, permissions || ['read']]
    );

    return NextResponse.json({ 
      success: true, 
      apiKey: { ...result.rows[0], key: apiKey },
      message: "Make sure to save this key. It won't be shown again."
    });
  } catch (error) {
    console.error("API Keys POST error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to create API key." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const { keyId } = await req.json();

    if (!keyId) {
      return NextResponse.json({ success: false, error: "Key ID is required." }, { status: 400 });
    }

    // Soft delete - mark as deleted
    const result = await postgresAdmin.query(
      `UPDATE api_keys SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id`,
      [keyId, user.id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, error: "API key not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "API key deleted successfully." });
  } catch (error) {
    console.error("API Keys DELETE error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to delete API key." }, { status: 500 });
  }
}