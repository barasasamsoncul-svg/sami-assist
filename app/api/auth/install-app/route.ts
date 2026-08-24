import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { getTenantPool } from '@/lib/db/tenant';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { businessId, appKey } = await request.json();

    if (!businessId || !appKey) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Check subscription plan
    const subResult = await queryControl(
      `SELECT plan FROM subscriptions WHERE business_id = $1 AND status = 'active'`,
      [businessId]
    );
    const plan = subResult.rows[0]?.plan || 'free';

    // Count current enabled apps
    const appCount = await queryControl(
      `SELECT COUNT(*) as count FROM business_apps WHERE business_id = $1 AND enabled = true`,
      [businessId]
    );
    const enabledApps = parseInt(appCount.rows[0].count);

    // Free plan: only 1 app allowed
    if (plan === 'free' && enabledApps >= 1) {
      return NextResponse.json({ 
        error: 'Free plan allows only 1 app. Please upgrade to install more apps.' 
      }, { status: 403 });
    }

    // Check schema exists
    const schemaPath = path.join(process.cwd(), `lib/apps/${appKey}/schema.sql`);
    if (!fs.existsSync(schemaPath)) {
      return NextResponse.json({ error: `Schema not found for ${appKey}` }, { status: 404 });
    }

    // Get tenant database
    const databaseName = await getTenantDatabaseName(businessId);
    if (!databaseName) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
    }

    // Install schema
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const tenantPool = getTenantPool(databaseName);
    await tenantPool.query(schema);

    // Record app
    await queryControl(
      `INSERT INTO business_apps (business_id, app_key, enabled, installed_at)
       VALUES ($1, $2, true, NOW())
       ON CONFLICT (business_id, app_key) 
       DO UPDATE SET enabled = true, installed_at = NOW(), uninstalled_at = NULL, updated_at = NOW()`,
      [businessId, appKey]
    );

    // Log audit
    await queryControl(
      `INSERT INTO audit_logs (business_id, action, resource_type, resource_id, details)
       VALUES ($1, 'app_installed', 'app', $2, $3)`,
      [businessId, appKey, JSON.stringify({ appKey })]
    );

    return NextResponse.json({ success: true, message: `${appKey} installed` });

  } catch (error) {
    console.error('Install app error:', error);
    return NextResponse.json({ error: 'Failed to install app' }, { status: 500 });
  }
}