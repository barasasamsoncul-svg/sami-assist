import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { getTenantPool } from '@/lib/db/tenant';
import { provisionTenantDatabase } from '@/lib/services/provisioning';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { tenantId, appKey } = await request.json();

    if (!tenantId || !appKey) {
      return NextResponse.json({ error: 'Tenant ID and app key required' }, { status: 400 });
    }

    // Check module exists
    const moduleResult = await queryControl(
      `SELECT id, key, name, version FROM modules WHERE key = $1 AND status = 'active'`,
      [appKey]
    );
    if (moduleResult.rows.length === 0) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }
    const module = moduleResult.rows[0];

    // Check plan limits
    const subResult = await queryControl(
      `SELECT p.included_apps FROM subscriptions s
       INNER JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = $1 AND s.status IN ('pending', 'trialing', 'active')
       ORDER BY s.created_at DESC LIMIT 1`,
      [tenantId]
    );
    if (subResult.rows.length === 0) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 403 });
    }

    const countResult = await queryControl(
      `SELECT COUNT(*) as count FROM tenant_modules WHERE tenant_id = $1 AND status = 'installed'`,
      [tenantId]
    );
    const installedCount = parseInt(countResult.rows[0].count);

    if (subResult.rows[0].included_apps !== -1 && installedCount >= subResult.rows[0].included_apps) {
      return NextResponse.json({
        error: 'upgrade_required',
        message: 'Free plan includes only 1 app. Upgrade to install more.',
      }, { status: 403 });
    }

    // Provision or install
    let databaseName = await getTenantDatabaseName(tenantId);

    if (!databaseName) {
      const result = await provisionTenantDatabase(tenantId, [appKey]);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
    } else {
      const appSchemaPath = path.join(process.cwd(), `lib/apps/${appKey}/schema.sql`);
      if (fs.existsSync(appSchemaPath)) {
        const schema = fs.readFileSync(appSchemaPath, 'utf-8');
        const tenantPool = getTenantPool(databaseName);
        await tenantPool.query(schema);
      }
    }

    // Record installation
    await queryControl(
      `INSERT INTO tenant_modules (tenant_id, module_id, version, status, installed_at)
       VALUES ($1, $2, $3, 'installed', NOW())
       ON CONFLICT (tenant_id, module_id) DO UPDATE SET status = 'installed', installed_at = NOW()`,
      [tenantId, module.id, module.version]
    );

    return NextResponse.json({ success: true, message: `${module.name} installed` });

  } catch (error) {
    console.error('Install app error:', error);
    return NextResponse.json({ error: 'Failed to install app' }, { status: 500 });
  }
}