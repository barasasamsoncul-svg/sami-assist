import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { getTenantPool } from '@/lib/db/tenant';
import { provisionBusinessDatabase } from '@/lib/services/provisioning';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    const result = await queryControl(
      `SELECT * FROM business_apps WHERE business_id = $1 ORDER BY created_at ASC`,
      [activeBusinessId]
    );

    return NextResponse.json({ success: true, apps: result.rows });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load apps' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { appKey } = await request.json();
    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    // Check subscription plan
    const subResult = await queryControl(
      `SELECT * FROM subscriptions WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [activeBusinessId]
    );
    const subscription = subResult.rows[0];
    const plan = subscription?.plan || 'free';
    const status = subscription?.status || 'active';

    // Count enabled apps
    const countResult = await queryControl(
      `SELECT COUNT(*) as count FROM business_apps WHERE business_id = $1 AND enabled = true`,
      [activeBusinessId]
    );
    const enabledApps = parseInt(countResult.rows[0].count);

    // Free plan: only 1 app
    if (plan === 'free' && enabledApps >= 1) {
      return NextResponse.json({ 
        error: 'upgrade_required',
        message: 'Free plan includes only 1 app. Upgrade to Standard to enable more apps.',
      }, { status: 403 });
    }

    // Check database
    let databaseName = await getTenantDatabaseName(activeBusinessId);

    if (!databaseName) {
      const businessResult = await queryControl(`SELECT name FROM businesses WHERE id = $1`, [activeBusinessId]);
      const businessName = businessResult.rows[0]?.name || 'Business';
      const result = await provisionBusinessDatabase(activeBusinessId, businessName, [appKey]);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
    } else {
      const schemaPath = path.join(process.cwd(), `lib/apps/${appKey}/schema.sql`);
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        const tenantPool = getTenantPool(databaseName);
        await tenantPool.query(schema);
      }
    }

    await queryControl(
      `INSERT INTO business_apps (business_id, app_key, enabled, installed_at)
       VALUES ($1, $2, true, NOW())
       ON CONFLICT (business_id, app_key) 
       DO UPDATE SET enabled = true, installed_at = NOW(), uninstalled_at = NULL, updated_at = NOW()`,
      [activeBusinessId, appKey]
    );

    return NextResponse.json({ success: true, message: `${appKey} enabled` });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to install app' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { appKey, enabled } = await request.json();
    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    // If enabling, check plan limits
    if (enabled) {
      const subResult = await queryControl(
        `SELECT plan FROM subscriptions WHERE business_id = $1`,
        [activeBusinessId]
      );
      const plan = subResult.rows[0]?.plan || 'free';

      const countResult = await queryControl(
        `SELECT COUNT(*) as count FROM business_apps WHERE business_id = $1 AND enabled = true`,
        [activeBusinessId]
      );
      const enabledApps = parseInt(countResult.rows[0].count);

      if (plan === 'free' && enabledApps >= 1) {
        return NextResponse.json({ 
          error: 'upgrade_required',
          message: 'Upgrade to Standard plan to enable more apps.',
        }, { status: 403 });
      }
    }

    await queryControl(
      `UPDATE business_apps SET enabled = $1, updated_at = NOW()
       WHERE business_id = $2 AND app_key = $3`,
      [enabled, activeBusinessId, appKey]
    );

    return NextResponse.json({ success: true, message: enabled ? 'App enabled' : 'App disabled' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to toggle app' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { appKey } = await request.json();
    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    const databaseName = await getTenantDatabaseName(activeBusinessId);
    if (databaseName) {
      const tenantPool = getTenantPool(databaseName);
      const tablesResult = await tenantPool.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_name LIKE $1`,
        [`${appKey}%`]
      );
      for (const table of tablesResult.rows) {
        await tenantPool.query(`DROP TABLE IF EXISTS ${table.table_name} CASCADE`);
      }
    }

    await queryControl(
      `UPDATE business_apps SET enabled = false, uninstalled_at = NOW(), updated_at = NOW()
       WHERE business_id = $1 AND app_key = $2`,
      [activeBusinessId, appKey]
    );

    return NextResponse.json({ success: true, message: 'App uninstalled' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to uninstall app' }, { status: 500 });
  }
}