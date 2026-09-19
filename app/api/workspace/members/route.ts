import {
  NextResponse,
} from 'next/server';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

import {
  PermissionGuardError,
  requirePermission,
} from '@/lib/auth/permission-guards';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  buildWorkspaceMemberDirectory,
} from '@/lib/services/member-directory';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


/* ================================================================
   RESPONSE
   ================================================================ */

function json(
  body:
    Record<
      string,
      unknown
    >,

  status =
    200,
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store',
      },
    },
  );
}


/* ================================================================
   GET MEMBER DIRECTORY
   ================================================================ */

export async function GET() {
  try {
    /*
     * Category 8.6
     *
     * No tenant ID is accepted from the browser.
     *
     * Permission resolution performs:
     *
     * session
     *    ↓
     * active internal membership
     *    ↓
     * trusted workspace
     *    ↓
     * effective roles
     *    ↓
     * users.view
     */
    const context =
      await requirePermission(
        SAMI_PERMISSIONS
          .USERS_VIEW,
      );


    const directory =
      await buildWorkspaceMemberDirectory(
        context.tenantId,
      );


    return json({
      success:
        true,

      directory,
    });
  } catch (
    error
  ) {
    /* ============================================================
       AUTHENTICATION / TENANT
       ============================================================ */

    if (
      error instanceof
        TenantContextError
    ) {
      switch (
        error.code
      ) {
        case 'UNAUTHENTICATED':
          return json(
            {
              success:
                false,

              code:
                error.code,

              error:
                'Authentication is required.',
            },

            401,
          );


        case 'NO_WORKSPACE_SELECTED':
        case 'WORKSPACE_ACCESS_DENIED':
          return json(
            {
              success:
                false,

              code:
                error.code,

              error:
                'The current workspace is not available.',
            },

            403,
          );


        case 'WORKSPACE_DATABASE_UNAVAILABLE':
          return json(
            {
              success:
                false,

              code:
                error.code,

              error:
                'The workspace is not ready.',
            },

            409,
          );
      }
    }


    /* ============================================================
       PERMISSION AUTHORIZATION
       ============================================================ */

    if (
      error instanceof
        PermissionGuardError
    ) {
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,
        },

        403,
      );
    }


    /* ============================================================
       UNKNOWN
       ============================================================ */

    console.error(
      '[SaMi] Member directory request failed:',
      error,
    );


    return json(
      {
        success:
          false,

        code:
          'MEMBER_DIRECTORY_FAILED',

        error:
          'SaMi could not load workspace users.',
      },

      500,
    );
  }
}