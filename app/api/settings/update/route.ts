import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { section, data } = await request.json();

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    switch (section) {
      case 'business': {
        const { name, email, phone, website, address, country, currency, timezone, industry } = data;
        await queryControl(
          `UPDATE businesses 
           SET name = $1, email = $2, phone = $3, website = $4, address = $5, 
               country = $6, currency = $7, timezone = $8, industry = $9,
               updated_at = NOW()
           WHERE id = $10`,
          [name, email, phone, website, address, country, currency, timezone, industry, activeBusinessId]
        );
        break;
      }

      case 'settings': {
        // Upsert business settings
        await queryControl(
          `INSERT INTO business_settings (business_id, settings, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (business_id) 
           DO UPDATE SET settings = $2, updated_at = NOW()`,
          [activeBusinessId, JSON.stringify(data)]
        );
        break;
      }

      case 'app_toggle': {
        const { appKey, enabled } = data;
        await queryControl(
          `UPDATE business_apps SET enabled = $1, updated_at = NOW()
           WHERE business_id = $2 AND app_key = $3`,
          [enabled, activeBusinessId, appKey]
        );
        break;
      }

      case 'app_add': {
        const { appKeys } = data;
        for (const appKey of appKeys) {
          await queryControl(
            `INSERT INTO business_apps (business_id, app_key, enabled)
             VALUES ($1, $2, true)
             ON CONFLICT (business_id, app_key) 
             DO UPDATE SET enabled = true`,
            [activeBusinessId, appKey]
          );
        }
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}