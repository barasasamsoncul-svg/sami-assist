import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user data
    const userResult = await queryControl(
      `SELECT id, email, full_name, status, created_at, last_login_at FROM users WHERE id = $1`,
      [session.user.id]
    );

    const businesses = await getUserBusinesses(session.user.id);

    const apiKeys = await queryControl(
      `SELECT name, key_preview, permissions, last_used, created_at FROM api_keys WHERE user_id = $1`,
      [session.user.id]
    );

    const sessions = await queryControl(
      `SELECT device, browser, os, ip, location, last_active, created_at FROM sessions WHERE user_id = $1`,
      [session.user.id]
    );

    const auditLogs = await queryControl(
      `SELECT action, resource_type, details, created_at FROM audit_logs WHERE user_id = $1`,
      [session.user.id]
    );

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: userResult.rows[0],
      businesses,
      apiKeys: apiKeys.rows,
      sessions: sessions.rows,
      auditLogs: auditLogs.rows,
    };

    return NextResponse.json({
      success: true,
      data: exportData,
    });

  } catch (error) {
    console.error('Export data error:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}