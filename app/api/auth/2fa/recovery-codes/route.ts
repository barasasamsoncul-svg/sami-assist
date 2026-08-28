import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Generate 10 recovery codes
    const recoveryCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      recoveryCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }

    // Store codes (hashed)
    for (const code of recoveryCodes) {
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      await queryControl(
        `INSERT INTO user_authenticators (user_id, type, secret_encrypted, label)
         VALUES ($1, 'recovery_code', $2, 'Recovery Code')`,
        [session.user.id, codeHash]
      );
    }

    return NextResponse.json({
      success: true,
      recoveryCodes,
      message: 'Store these codes safely. You won\'t see them again!',
    });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate codes' }, { status: 500 });
  }
}