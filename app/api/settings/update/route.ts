import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import bcrypt from 'bcryptjs';

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
      case 'profile': {
        const { fullName, email } = data;
        await queryControl(
          `UPDATE users SET full_name = $1, email = $2, updated_at = NOW() WHERE id = $3`,
          [fullName, email.toLowerCase(), session.user.id]
        );
        break;
      }

      case 'password': {
        const { currentPassword, newPassword } = data;
        const userResult = await queryControl(
          `SELECT password_hash FROM users WHERE id = $1`,
          [session.user.id]
        );
        const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
        if (!valid) {
          return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
        }
        const newHash = await bcrypt.hash(newPassword, 12);
        await queryControl(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [newHash, session.user.id]
        );
        break;
      }

      case 'business': {
        const { name, email, phone, website, address, country, currency, timezone, industry, tax_id, registration_number, business_type } = data;
        await queryControl(
          `UPDATE businesses 
           SET name = $1, email = $2, phone = $3, website = $4, address = $5,
               country = $6, currency = $7, timezone = $8, industry = $9,
               tax_id = $10, registration_number = $11, business_type = $12,
               updated_at = NOW()
           WHERE id = $13`,
          [name, email, phone, website, address, country, currency, timezone, industry, tax_id, registration_number, business_type, activeBusinessId]
        );
        break;
      }

      case 'preferences': {
        const { theme, dateFormat, timeFormat } = data;
        await queryControl(
          `INSERT INTO business_settings (business_id, settings, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (business_id) DO UPDATE SET settings = $2, updated_at = NOW()`,
          [activeBusinessId, JSON.stringify({ theme, dateFormat, timeFormat })]
        );
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    // Log
    await queryControl(
      `INSERT INTO audit_logs (user_id, business_id, action, resource_type, details)
       VALUES ($1, $2, 'settings_updated', $3, $4)`,
      [session.user.id, activeBusinessId, section, JSON.stringify(data)]
    );

    return NextResponse.json({ success: true, message: 'Settings saved' });

  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}