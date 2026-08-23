import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

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

    // Get business details
    const businessResult = await queryControl(
      `SELECT * FROM businesses WHERE id = $1`,
      [activeBusinessId]
    );
    const business = businessResult.rows[0];

    // Get business settings
    const settingsResult = await queryControl(
      `SELECT settings FROM business_settings WHERE business_id = $1`,
      [activeBusinessId]
    );
    const settings = settingsResult.rows[0]?.settings || {};

    // Get installed apps
    const appsResult = await queryControl(
      `SELECT app_key, enabled FROM business_apps WHERE business_id = $1 ORDER BY created_at ASC`,
      [activeBusinessId]
    );

    // Get team members
    const teamResult = await queryControl(
      `SELECT 
        bu.id,
        bu.user_id,
        bu.role,
        bu.status,
        bu.permissions,
        bu.invited_at,
        bu.last_active_at,
        u.email,
        u.full_name
       FROM business_users bu
       INNER JOIN users u ON u.id = bu.user_id
       WHERE bu.business_id = $1
       ORDER BY bu.created_at ASC`,
      [activeBusinessId]
    );

    // Get pending invites
    const invitesResult = await queryControl(
      `SELECT * FROM invites WHERE business_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
      [activeBusinessId]
    );

    return NextResponse.json({
      success: true,
      business,
      settings,
      apps: appsResult.rows,
      team: teamResult.rows,
      invites: invitesResult.rows,
    });

  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}