import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import { sendVerificationEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { newEmail } = await request.json();

    if (!newEmail) {
      return NextResponse.json({ error: 'New email required' }, { status: 400 });
    }

    const normalizedEmail = newEmail.toLowerCase();

    // Check if email already used
    const existing = await queryControl(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    // Generate verification token for new email
    const token = crypto.randomBytes(32).toString('hex');

    await queryControl(
      `INSERT INTO user_authenticators (user_id, type, secret_encrypted, label)
       VALUES ($1, 'email_change', $2, 'New Email: ' || $3)`,
      [session.user.id, token, normalizedEmail]
    );

    const appUrl = request.nextUrl.origin;
    await sendVerificationEmail(normalizedEmail, token, appUrl);

    return NextResponse.json({ success: true, message: 'Verification sent to new email' });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}