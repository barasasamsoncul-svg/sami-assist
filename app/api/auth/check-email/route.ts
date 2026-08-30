
import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams
      .get('email')
      ?.trim()
      .toLowerCase();

    // Validate email exists
    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email is required.',
        },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please enter a valid email address.',
        },
        { status: 400 }
      );
    }

    // Check whether an active/non-deleted account exists
    const result = await queryControl(
      `
        SELECT id
        FROM users
        WHERE email = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [email]
    );

    return NextResponse.json(
      {
        success: true,
        exists: result.rows.length > 0,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Check email error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check email.',
      },
      { status: 500 }
    );
  }
}