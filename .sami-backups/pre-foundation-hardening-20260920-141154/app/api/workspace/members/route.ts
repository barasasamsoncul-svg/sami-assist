import {
  NextResponse,
} from 'next/server';

import {
  getPermissionContext,
  permissionContextHasAny,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

import {
  buildWorkspaceMemberDirectory,
} from '@/lib/services/member-directory';


export const runtime =
  'nodejs';


export const dynamic =
  'force-dynamic';


function json(
  body:
    Record<string, unknown>,

  status =
    200,
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
    },
  );
}


export async function GET() {
  try {
    const context =
      await getPermissionContext();


    const allowed =
      context.isOwner ||
      permissionContextHasAny(
        context,
        [
          SAMI_PERMISSIONS
            .USERS_VIEW,

          SAMI_PERMISSIONS
            .USERS_MANAGE,
        ],
      );


    if (
      !allowed
    ) {
      return json(
        {
          success:
            false,

          code:
            'USERS_VIEW_REQUIRED',

          error:
            'You do not have permission to view workspace people and access.',
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
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,
        },

        error.code ===
          'UNAUTHENTICATED'
          ? 401
          : 403,
      );
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
          'SaMi could not load workspace people and access.',
      },
      500,
    );
  }
}
