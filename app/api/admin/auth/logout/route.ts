// app/api/admin/auth/logout/route.ts

import {
  NextResponse,
} from 'next/server';

import {
  revokeCurrentAdminSession,
} from '@/lib/auth/admin-session';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

function jsonResponse(
  body: Record<
    string,
    unknown
  >,
  status = 200
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',
      },
    }
  );
}

export async function POST() {
  try {
    await revokeCurrentAdminSession(
      'admin_logout'
    );

    return jsonResponse({
      success:
        true,

      code:
        'ADMIN_LOGOUT_SUCCESS',

      message:
        'Administrator signed out successfully.',
    });
  } catch (
    error
  ) {
    console.error(
      '[Admin Auth] Logout error:',
      error instanceof Error
        ? error.message
        : 'Unknown administrator logout error'
    );

    return jsonResponse(
      {
        success:
          false,

        code:
          'ADMIN_LOGOUT_ERROR',

        error:
          'SaMi could not complete administrator sign-out.',
      },
      500
    );
  }
}