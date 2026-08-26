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

    const result = await queryControl(
      `SELECT settings FROM business_settings WHERE business_id = $1`,
      [activeBusinessId]
    );

    return NextResponse.json({
      success: true,
      preferences: result.rows[0]?.settings || {
        theme: 'system',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h',
        language: 'en',
        timezone: 'Africa/Nairobi',
      },
    });

  } catch (error) {
    console.error('Preferences API error:', error);
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { preferences } = await request.json();

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    await queryControl(
      `INSERT INTO business_settings (business_id, settings, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (business_id) DO UPDATE SET settings = $2, updated_at = NOW()`,
      [activeBusinessId, JSON.stringify(preferences)]
    );

    return NextResponse.json({ success: true, message: 'Preferences saved' });

  } catch (error) {
    console.error('Update preferences error:', error);
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
}