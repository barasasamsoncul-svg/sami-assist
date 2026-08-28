import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { sendWelcomeEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    // Find token
    const result = await queryControl(
      `SELECT ua.id, ua.user_id, ua.verified_at, ua.revoked_at, ua.created_at,
              u.email, u.full_name
       FROM user_authenticators ua
       INNER JOIN users u ON u.id = ua.user_id
       WHERE ua.type = 'email_verification' 
         AND ua.secret_encrypted = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ 
        error: 'invalid', 
        message: 'Invalid verification link.' 
      }, { status: 400 });
    }

    const { id, user_id, verified_at, revoked_at, created_at, email, full_name } = result.rows[0];

    // Check if already used
    if (verified_at || revoked_at) {
      return NextResponse.json({ 
        error: 'already_used', 
        message: 'Email already verified. Please login.' 
      }, { status: 400 });
    }

    // Check if expired (15 minutes)
    const age = Date.now() - new Date(created_at).getTime();
    if (age > 15 * 60 * 1000) {
      await queryControl(`UPDATE user_authenticators SET revoked_at = NOW() WHERE id = $1`, [id]);
      return NextResponse.json({ 
        error: 'expired', 
        message: 'Link expired. Resend a new verification email.' 
      }, { status: 400 });
    }

    // Verify email
    await queryControl(
      `UPDATE users SET email_verified_at = NOW(), status = 'active', updated_at = NOW() WHERE id = $1`,
      [user_id]
    );

    // Mark token used
    await queryControl(
      `UPDATE user_authenticators SET verified_at = NOW(), revoked_at = NOW() WHERE id = $1`,
      [id]
    );

    // Send welcome email
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

    return NextResponse.json({ success: true, message: 'Email verified successfully' });

  } catch (error) {
    console.error('Verify email error:', error);
    return NextResponse.json({ error: 'failed', message: 'Failed to verify email' }, { status: 500 });
  }
}