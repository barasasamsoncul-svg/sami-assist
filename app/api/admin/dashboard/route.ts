import {
  NextResponse,
} from 'next/server';

import {
  getAdminDashboardData,
} from '@/lib/admin/dashboard';

import {
  getAdminSession,
} from '@/lib/auth/admin-session';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   RESPONSE HELPERS
   ============================================================ */

function jsonResponse(
  body:
    Record<string, unknown>,
  status =
    200
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

/* ============================================================
   GET
   ============================================================ */

export async function GET() {
  try {
    /* ========================================================
       1. REQUIRE ADMIN SESSION
       ======================================================== */

    const session =
      await getAdminSession();

    if (
      !session
    ) {
      return jsonResponse(
        {
          success:
            false,

          authenticated:
            false,

          code:
            'ADMIN_AUTH_REQUIRED',

          error:
            'Administrator authentication is required.',
        },
        401
      );
    }

    /* ========================================================
       2. LOAD DASHBOARD DATA
       ======================================================== */

    const dashboard =
      await getAdminDashboardData(
        session.role,
      );

    /* ========================================================
       3. RESPONSE
       ======================================================== */

    return jsonResponse({
      success:
        true,

      authenticated:
        true,

      admin: {
        id:
          session.adminId,

        firstName:
          session.firstName,

        lastName:
          session.lastName,

        fullName:
          session.fullName,

        email:
          session.email,

        role:
          session.role,
      },

      dashboard,
    });
  } catch (
    error
  ) {
    console.error(
      '[Admin Dashboard API]',
      error instanceof Error
        ? error.message
        : 'Unknown dashboard error'
    );

    return jsonResponse(
      {
        success:
          false,

        code:
          'ADMIN_DASHBOARD_ERROR',

        error:
          'SaMi could not load the administrator dashboard.',
      },
      500
    );
  }
}