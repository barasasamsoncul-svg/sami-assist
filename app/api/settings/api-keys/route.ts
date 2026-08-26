import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';

// GET: List all API keys
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const result = await queryControl(
      `SELECT id, name, key_preview, permissions, last_used, expires_at, created_at
       FROM api_keys 
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [session.user.id]
    );

    return NextResponse.json({ success: true, keys: result.rows });

  } catch (error) {
    console.error('API keys error:', error);
    return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 });
  }
}

// POST: Create new API key
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { name, permissions, expiresAt } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Key name is required' }, { status: 400 });
    }

    // Generate API key
    const apiKey = `sami_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const keyPreview = apiKey.substring(0, 12) + '...' + apiKey.substring(apiKey.length - 4);

    const result = await queryControl(
      `INSERT INTO api_keys (user_id, name, key_hash, key_preview, permissions, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, key_preview, permissions, created_at`,
      [
        session.user.id,
        name,
        keyHash,
        keyPreview,
        permissions || ['read'],
        expiresAt || null,
      ]
    );

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, action, resource_type, details)
       VALUES ($1, 'api_key_created', 'api_key', $2)`,
      [session.user.id, JSON.stringify({ name, permissions: permissions || ['read'] })]
    );

    return NextResponse.json({
      success: true,
      message: 'API key created. Copy it now - you won\'t see it again!',
      key: apiKey,
      saved: result.rows[0],
    });

  } catch (error) {
    console.error('Create API key error:', error);
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}

// DELETE: Revoke API key
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { keyId } = await request.json();

    await queryControl(
      `UPDATE api_keys SET deleted_at = NOW() WHERE id = $1 AND user_id = $2`,
      [keyId, session.user.id]
    );

    await queryControl(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
       VALUES ($1, 'api_key_revoked', 'api_key', $2, $3)`,
      [session.user.id, keyId, JSON.stringify({ revoked: true })]
    );

    return NextResponse.json({ success: true, message: 'API key revoked' });

  } catch (error) {
    console.error('Delete API key error:', error);
    return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
  }
}