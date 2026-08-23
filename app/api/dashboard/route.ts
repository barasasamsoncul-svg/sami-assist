import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses, getUserApps } from '@/lib/auth/session';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { SAMI_APPS } from '@/lib/sami-apps';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get user's businesses
    const businesses = await getUserBusinesses(session.user.id);

    if (businesses.length === 0) {
      return NextResponse.json(
        { error: 'No business found' },
        { status: 403 }
      );
    }

    // Get active business (from cookie or default to first)
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0].id;
    const activeBusiness = businesses.find(b => b.id === activeBusinessId) || businesses[0];

    // Get selected apps for active business
    const installedAppKeys = await getUserApps(activeBusiness.id);

    // Get full app details for installed apps
    const installedApps = SAMI_APPS.filter(app => installedAppKeys.includes(app.key));

    // Get tenant database info
    const databaseName = await getTenantDatabaseName(activeBusiness.id);

    return NextResponse.json({
      success: true,
      user: session.user,
      businesses,
      activeBusiness,
      installedApps,
      databaseReady: !!databaseName,
    });

  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard' },
      { status: 500 }
    );
  }
}