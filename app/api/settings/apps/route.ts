import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { getTenantPool } from '@/lib/db/tenant';
import fs from 'fs';
import path from 'path';

// Get all apps with their status
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    const result = await queryControl(
      `SELECT app_key, enabled, created_at, updated_at 
       FROM business_apps 
       WHERE business_id = $1
       ORDER BY created_at ASC`,
      [activeBusinessId]
    );

    return NextResponse.json({
      success: true,
      apps: result.rows,
    });

  } catch (error) {
    console.error('Apps API error:', error);
    return NextResponse.json({ error: 'Failed to load apps' }, { status: 500 });
  }
}

// Install app (create schema + enable)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { appKey } = await request.json();

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    // Check if app schema exists
    const schemaPath = path.join(process.cwd(), `lib/apps/${appKey}/schema.sql`);
    if (!fs.existsSync(schemaPath)) {
      return NextResponse.json({ error: `Schema not found for ${appKey}` }, { status: 404 });
    }

    // Get tenant database
    const databaseName = await getTenantDatabaseName(activeBusinessId);
    if (!databaseName) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
    }

    // Install schema
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const tenantPool = getTenantPool(databaseName);
    await tenantPool.query(schema);

    // Enable app in business_apps
    await queryControl(
      `INSERT INTO business_apps (business_id, app_key, enabled)
       VALUES ($1, $2, true)
       ON CONFLICT (business_id, app_key) 
       DO UPDATE SET enabled = true, updated_at = NOW()`,
      [activeBusinessId, appKey]
    );

    return NextResponse.json({ success: true, message: `${appKey} installed successfully` });

  } catch (error) {
    console.error('Install app error:', error);
    return NextResponse.json({ error: 'Failed to install app' }, { status: 500 });
  }
}

// Disable app (keep schema + data)
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { appKey, enabled } = await request.json();

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    await queryControl(
      `UPDATE business_apps SET enabled = $1, updated_at = NOW()
       WHERE business_id = $2 AND app_key = $3`,
      [enabled, activeBusinessId, appKey]
    );

    return NextResponse.json({ 
      success: true, 
      message: enabled ? `${appKey} enabled` : `${appKey} disabled` 
    });

  } catch (error) {
    console.error('Toggle app error:', error);
    return NextResponse.json({ error: 'Failed to toggle app' }, { status: 500 });
  }
}

// Uninstall app (drop schema + delete data)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { appKey } = await request.json();

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    const databaseName = await getTenantDatabaseName(activeBusinessId);
    if (!databaseName) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
    }

    // Drop tables for this app
    const tenantPool = getTenantPool(databaseName);
    
    // Get all tables for this app
    const tablesResult = await tenantPool.query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
         AND table_name LIKE $1`,
      [`${appKey}%`]
    );

    for (const table of tablesResult.rows) {
      await tenantPool.query(`DROP TABLE IF EXISTS ${table.table_name} CASCADE`);
    }

    // Remove from business_apps
    await queryControl(
      `DELETE FROM business_apps WHERE business_id = $1 AND app_key = $2`,
      [activeBusinessId, appKey]
    );

    return NextResponse.json({ success: true, message: `${appKey} uninstalled successfully` });

  } catch (error) {
    console.error('Uninstall app error:', error);
    return NextResponse.json({ error: 'Failed to uninstall app' }, { status: 500 });
  }
}