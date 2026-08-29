import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl, withControlTransaction } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { section, data } = await request.json();
    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    if (!activeTenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 });
    }

    switch (section) {
      case 'profile': {
        const { firstName, lastName, phone } = data;

        // Validate
        if (!firstName || !lastName) {
          return NextResponse.json(
            { error: 'First name and last name are required' },
            { status: 400 }
          );
        }

        if (firstName.length > 100 || lastName.length > 100) {
          return NextResponse.json(
            { error: 'Name is too long' },
            { status: 400 }
          );
        }

        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

        await withControlTransaction(async (client) => {
          // Lock user row
          const userResult = await client.query(
            `SELECT full_name FROM users WHERE id = $1 FOR UPDATE`,
            [session.user.id]
          );

          if (userResult.rows.length === 0) {
            throw new Error('USER_NOT_FOUND');
          }

          const previousFullName = userResult.rows[0].full_name;

          // Update user
          await client.query(
            `UPDATE users SET 
               first_name = $1, 
               last_name = $2, 
               full_name = $3, 
               phone = $4, 
               updated_at = NOW() 
             WHERE id = $5`,
            [firstName.trim(), lastName.trim(), fullName, phone || null, session.user.id]
          );

          // Audit
          await client.query(
            `INSERT INTO audit_logs (
               user_id, actor_type, action, resource_type, resource_id, module, result, metadata
             ) VALUES (
               $1, 'human', 'profile_updated', 'user', $1, 'identity', 'success', $2
             )`,
            [
              session.user.id,
              JSON.stringify({
                previous_full_name: previousFullName,
                new_full_name: fullName,
                phone_changed: true,
              }),
            ]
          );
        });

        break;
      }

      case 'password': {
        const { currentPassword, newPassword } = data;

        if (!currentPassword || !newPassword) {
          return NextResponse.json(
            { error: 'Current and new password are required' },
            { status: 400 }
          );
        }

        if (newPassword.length < 8) {
          return NextResponse.json(
            { error: 'New password must be at least 8 characters' },
            { status: 400 }
          );
        }

        await withControlTransaction(async (client) => {
          const userResult = await client.query(
            `SELECT password_hash FROM users WHERE id = $1 FOR UPDATE`,
            [session.user.id]
          );

          if (userResult.rows.length === 0) {
            throw new Error('USER_NOT_FOUND');
          }

          const valid = await bcrypt.compare(
            currentPassword,
            userResult.rows[0].password_hash
          );

          if (!valid) {
            throw new Error('INCORRECT_PASSWORD');
          }

          const newHash = await bcrypt.hash(newPassword, 12);

          await client.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            [newHash, session.user.id]
          );

          // Revoke all sessions except current
          await client.query(
            `UPDATE sessions SET is_current = false, revoked_at = NOW()
             WHERE user_id = $1 AND is_current = true AND revoked_at IS NULL`,
            [session.user.id]
          );

          // Audit
          await client.query(
            `INSERT INTO audit_logs (
               user_id, actor_type, action, resource_type, resource_id, module, result
             ) VALUES (
               $1, 'human', 'password_changed', 'user', $1, 'identity', 'success'
             )`,
            [session.user.id]
          );
        });

        break;
      }

      case 'business': {
        const { name } = data;

        if (!name || !name.trim()) {
          return NextResponse.json(
            { error: 'Business name is required' },
            { status: 400 }
          );
        }

        await withControlTransaction(async (client) => {
          const tenantResult = await client.query(
            `SELECT name FROM tenants WHERE id = $1 FOR UPDATE`,
            [activeTenantId]
          );

          if (tenantResult.rows.length === 0) {
            throw new Error('TENANT_NOT_FOUND');
          }

          const previousName = tenantResult.rows[0].name;

          await client.query(
            `UPDATE tenants SET name = $1, updated_at = NOW() WHERE id = $2`,
            [name.trim(), activeTenantId]
          );

          await client.query(
            `INSERT INTO audit_logs (
               tenant_id, user_id, actor_type, action, resource_type, resource_id, module, result, metadata
             ) VALUES (
               $1, $2, 'human', 'business_updated', 'tenant', $1, 'workspace', 'success', $3
             )`,
            [
              activeTenantId,
              session.user.id,
              JSON.stringify({
                previous_name: previousName,
                new_name: name.trim(),
              }),
            ]
          );
        });

        break;
      }

      case 'preferences': {
        await queryControl(
          `INSERT INTO tenant_settings (tenant_id, settings, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (tenant_id) DO UPDATE SET settings = $2, updated_at = NOW()`,
          [activeTenantId, JSON.stringify(data)]
        );
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Settings saved' });

  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case 'USER_NOT_FOUND':
          return NextResponse.json(
            { error: 'User account not found' },
            { status: 404 }
          );
        case 'INCORRECT_PASSWORD':
          return NextResponse.json(
            { error: 'Current password is incorrect' },
            { status: 400 }
          );
        case 'TENANT_NOT_FOUND':
          return NextResponse.json(
            { error: 'Business not found' },
            { status: 404 }
          );
      }
    }

    console.error('Update settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}