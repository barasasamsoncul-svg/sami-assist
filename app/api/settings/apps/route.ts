import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { getTenantPool } from '@/lib/db/tenant';
import { provisionTenantDatabase } from '@/lib/services/provisioning';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { appKey } = await request.json();
    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

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
      [activeTenantId]
    );
    if (subResult.rows.length === 0) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 403 });
    }

    const countResult = await queryControl(
      `SELECT COUNT(*) as count FROM tenant_modules WHERE tenant_id = $1 AND status = 'installed'`,
      [activeTenantId]
    );
    const installedCount = parseInt(countResult.rows[0].count);

    if (subResult.rows[0].included_apps !== -1 && installedCount >= subResult.rows[0].included_apps) {
      return NextResponse.json({
        error: 'upgrade_required',
        message: 'Free plan includes only 1 app. Upgrade to install more.',
      }, { status: 403 });
    }

    // Provision or install schema
    let databaseName = await getTenantDatabaseName(activeTenantId);

    if (!databaseName) {
      const result = await provisionTenantDatabase(activeTenantId, [appKey]);
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
      [activeTenantId, module.id, module.version]
    );

    await queryControl(
      `INSERT INTO audit_logs (tenant_id, user_id, actor_type, action, resource_type, module, result)
       VALUES ($1, $2, 'human', 'module_installed', 'module', $3, 'success')`,
      [activeTenantId, session.user.id, appKey]
    );

    return NextResponse.json({ success: true, message: `${module.name} installed` });

  } catch (error) {
    console.error('Install app error:', error);
    return NextResponse.json({ error: 'Failed to install' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { appKey, enabled } = await request.json();
    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    await queryControl(
      `UPDATE tenant_modules SET status = $1, updated_at = NOW()
       WHERE tenant_id = $2 AND module_id = (SELECT id FROM modules WHERE key = $3)`,
      [enabled ? 'installed' : 'disabled', activeTenantId, appKey]
    );

    return NextResponse.json({ success: true, message: enabled ? 'App enabled' : 'App disabled' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { appKey } = await request.json();
    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    const databaseName = await getTenantDatabaseName(activeTenantId);
    if (databaseName) {
      const tenantPool = getTenantPool(databaseName);
      const tables = await tenantPool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE $1`,
        [`${appKey}%`]
      );
      for (const table of tables.rows) {
        await tenantPool.query(`DROP TABLE IF EXISTS ${table.table_name} CASCADE`);
      }
    }

    await queryControl(
      `UPDATE tenant_modules SET status = 'uninstalled', uninstalled_at = NOW() WHERE tenant_id = $1 AND module_id = (SELECT id FROM modules WHERE key = $2)`,
      [activeTenantId, appKey]
    );

    return NextResponse.json({ success: true, message: 'App uninstalled' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}