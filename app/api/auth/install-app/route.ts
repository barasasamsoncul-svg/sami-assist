import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { getTenantPool } from '@/lib/db/tenant';
import { provisionBusinessDatabase } from '@/lib/services/provisioning';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { businessId, appKey } = await request.json();

    if (!businessId || !appKey) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Check if database exists
    let databaseName = await getTenantDatabaseName(businessId);

    if (!databaseName) {
      // Provision database with this first app
      const businessResult = await queryControl(
        `SELECT name FROM businesses WHERE id = $1`,
        [businessId]
      );
      const businessName = businessResult.rows[0]?.name || 'Business';

      const result = await provisionBusinessDatabase(businessId, businessName, [appKey]);

      if (!result.success) {
        return NextResponse.json({ error: result.error || 'Failed to provision database' }, { status: 500 });
      }

      databaseName = result.databaseName || await getTenantDatabaseName(businessId);
    } else {
      // Database exists - install app schema
      const schemaPath = path.join(process.cwd(), `lib/apps/${appKey}/schema.sql`);
      if (!fs.existsSync(schemaPath)) {
        return NextResponse.json({ error: `Schema not found for ${appKey}` }, { status: 404 });
      }

      const schema = fs.readFileSync(schemaPath, 'utf-8');
      const tenantPool = getTenantPool(databaseName);
      await tenantPool.query(schema);
    }

    // Record app
    await queryControl(
      `INSERT INTO business_apps (business_id, app_key, enabled, installed_at)
       VALUES ($1, $2, true, NOW())
       ON CONFLICT (business_id, app_key) 
       DO UPDATE SET enabled = true, installed_at = NOW(), updated_at = NOW()`,
      [businessId, appKey]
    );

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