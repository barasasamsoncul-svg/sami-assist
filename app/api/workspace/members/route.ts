import {
  NextResponse,
} from 'next/server';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

import {
  requireWorkspaceAdmin,
  WorkspaceGuardError,
} from '@/lib/auth/workspace-guards';

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
     * No tenant ID is accepted from the browser.
     *
     * requireWorkspaceAdmin() resolves:
     *
     * session
     *      ↓
     * active internal workspace
     *      ↓
     * membership
     *      ↓
     * administrator / owner access
     */
    const context =
      await requireWorkspaceAdmin();


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
       MEMBERSHIP AUTHORIZATION
       ============================================================ */

    if (
      error instanceof
        WorkspaceGuardError
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