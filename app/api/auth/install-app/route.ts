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

    // Check if schema exists
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

    // Record in business_apps
    await queryControl(
      `INSERT INTO business_apps (business_id, app_key, enabled)
       VALUES ($1, $2, true)
       ON CONFLICT (business_id, app_key) 
       DO UPDATE SET enabled = true, updated_at = NOW()`,
      [businessId, appKey]
    );

    return NextResponse.json({ success: true, message: `${appKey} installed` });

  } catch (error) {
    console.error('Install app error:', error);
    return NextResponse.json({ error: 'Failed to install app' }, { status: 500 });
  }
}