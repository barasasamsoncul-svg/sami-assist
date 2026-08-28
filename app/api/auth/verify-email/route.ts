import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { sendWelcomeEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    const result = await queryControl(
      `SELECT ua.id, ua.user_id, u.email, u.full_name
       FROM user_authenticators ua
       INNER JOIN users u ON u.id = ua.user_id
       WHERE ua.type = 'email_verification' 
         AND ua.secret_encrypted = $1 
         AND ua.verified_at IS NULL
         AND ua.revoked_at IS NULL`,
      [token]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 400 });
    }

    const { user_id, email, full_name } = result.rows[0];

    await queryControl(`UPDATE users SET email_verified_at = NOW() WHERE id = $1`, [user_id]);
    await queryControl(`UPDATE user_authenticators SET verified_at = NOW(), revoked_at = NOW() WHERE id = $1`, [result.rows[0].id]);

    const tenantResult = await queryControl(
      `SELECT t.name FROM tenant_users tu INNER JOIN tenants t ON t.id = tu.tenant_id
       WHERE tu.user_id = $1 AND tu.is_owner = true LIMIT 1`,
      [user_id]
    );

    if (tenantResult.rows.length > 0) {
      const appUrl = request.nextUrl.origin;
      await sendWelcomeEmail(email, full_name, tenantResult.rows[0].name, appUrl);
    }

    await queryControl(
      `INSERT INTO audit_logs (user_id, actor_type, action, resource_type, module, result)
       VALUES ($1, 'human', 'email_verified', 'user', 'auth', 'success')`,
      [user_id]
    );

    return NextResponse.json({ success: true, message: 'Email verified' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to verify email' }, { status: 500 });
  }
}