import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

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

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { name, permissions } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const apiKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const keyPreview = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);

    await queryControl(
      `INSERT INTO api_keys (user_id, name, key_hash, key_preview, permissions)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.user.id, name, keyHash, keyPreview, permissions || ['read']]
    );

    return NextResponse.json({
      success: true,
      message: 'API key created. Copy it now!',
      key: apiKey,
    });

  } catch (error) {
    console.error('Create API key error:', error);
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { keyId } = await request.json();

    await queryControl(
      `UPDATE api_keys SET deleted_at = NOW() WHERE id = $1 AND user_id = $2`,
      [keyId, session.user.id]
    );

    return NextResponse.json({ success: true, message: 'API key deleted' });

  } catch (error) {
    console.error('Delete API key error:', error);
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
  }
}