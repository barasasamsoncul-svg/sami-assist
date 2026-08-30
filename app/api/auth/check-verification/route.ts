
import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams
      .get('email')
      ?.trim()
      .toLowerCase();

    // Email is required
    if (!email) {
      return NextResponse.json(
        {
          success: true,
          verified: false,
        },
        { status: 200 }
      );
    }

    // Basic email validation
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: true,
          verified: false,
        },
        { status: 200 }
      );
    }

    // Check verification status
    const result = await queryControl(
      `
        SELECT email_verified_at
        FROM users
        WHERE email = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [email]
    );

    // User doesn't exist
    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          success: true,
          verified: false,
        },
        { status: 200 }
      );
    }

    // User exists
    const verified =
      result.rows[0].email_verified_at !== null;

    return NextResponse.json(
      {
        success: true,
        verified,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      'Check email verification error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        verified: false,
        error:
          'Failed to check email verification status.',
      },
      { status: 500 }
    );
  }
}