import {
  NextResponse,
} from 'next/server';

import {
  requireTenantContext,
  TenantContextError,
} from '@/lib/auth/tenant-context';

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
     * No tenantId is accepted from the browser.
     *
     * Workspace identity comes only from the authenticated
     * trusted session.
     */
    const context =
      await requireTenantContext();


    /*
     * Category 8 will eventually replace this with a granular
     * permission such as:
     *
     *     users.view
     *
     * Until then, owner/admin is the safest temporary boundary.
     */
    if (
      !context.isOwner &&
      !context.isAdmin
    ) {
      return json(
        {
          success:
            false,

          code:
            'MEMBER_DIRECTORY_ACCESS_DENIED',

          error:
            'You do not have permission to view workspace users.',
        },

        403,
      );
    }


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