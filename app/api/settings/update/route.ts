import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { section, data } = await request.json();
    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    switch (section) {
      case 'profile': {
        const { fullName, phone } = data;
        const firstName = fullName?.split(' ')[0] || '';
        const lastName = fullName?.split(' ').slice(1).join(' ') || '';
        await queryControl(
          `UPDATE users SET full_name = $1, first_name = $2, last_name = $3, phone = $4, updated_at = NOW() WHERE id = $5`,
          [fullName, firstName, lastName, phone, session.user.id]
        );
        break;
      }

      case 'password': {
        const { currentPassword, newPassword } = data;
        const userResult = await queryControl(`SELECT password_hash FROM users WHERE id = $1`, [session.user.id]);
        const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
        if (!valid) return NextResponse.json({ error: 'Incorrect current password' }, { status: 400 });
        const newHash = await bcrypt.hash(newPassword, 12);
        await queryControl(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, session.user.id]);
        break;
      }

      case 'business': {
        const { name } = data;
        await queryControl(`UPDATE tenants SET name = $1, updated_at = NOW() WHERE id = $2`, [name, activeTenantId]);
        break;
      }

      case 'preferences': {
        await queryControl(
          `INSERT INTO tenant_settings (tenant_id, settings, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (tenant_id) DO UPDATE SET settings = $2, updated_at = NOW()`,
          [activeTenantId, JSON.stringify(data)]
        );
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    await queryControl(
      `INSERT INTO audit_logs (tenant_id, user_id, actor_type, action, resource_type, module, result)
       VALUES ($1, $2, 'human', 'settings_updated', $3, 'settings', 'success')`,
      [activeTenantId, session.user.id, section]
    );

    return NextResponse.json({ success: true, message: 'Settings saved' });

  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}