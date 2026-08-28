import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    const result = await queryControl(
      `SELECT id, name, key_preview, scopes, last_used_at, created_at
       FROM api_keys WHERE tenant_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
      [activeTenantId]
    );

    return NextResponse.json({ success: true, keys: result.rows });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { name, scopes } = await request.json();
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    const apiKey = `sami_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const keyPreview = apiKey.substring(0, 12) + '...' + apiKey.substring(apiKey.length - 4);

    await queryControl(
      `INSERT INTO api_keys (tenant_id, created_by, name, key_hash, key_preview, scopes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [activeTenantId, session.user.id, name, keyHash, keyPreview, scopes || ['read']]
    );

    return NextResponse.json({
      success: true,
      message: 'API key created. Copy it now!',
      key: apiKey,
    });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { keyId } = await request.json();
    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    await queryControl(
      `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [keyId, activeTenantId]
    );

    return NextResponse.json({ success: true, message: 'API key revoked' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}