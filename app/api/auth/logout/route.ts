import { NextRequest, NextResponse } from 'next/server';
import { logout } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await logout();

    return NextResponse.json(
      {
        success: true,
        message: 'Logged out successfully.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[SaMi] Logout error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to log out.',
      },
      { status: 500 }
    );
  }
}