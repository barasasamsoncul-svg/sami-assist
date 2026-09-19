import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getRolePermissionMatrix,
  replaceWorkspaceRolePermissions,
  RolePermissionServiceError,
} from '@/lib/services/role-permissions';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';


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
          'no-store',
      },
    },
  );
}


function auditContext(
  request:
    NextRequest,
) {
  const forwarded =
    request.headers
      .get(
        'x-forwarded-for',
      )
      ?.split(
        ',',
      )[0]
      ?.trim();


  return {
    ipAddress:
      forwarded ||
      request.headers
        .get(
          'x-real-ip',
        ) ||
      null,

    userAgent:
      request.headers
        .get(
          'user-agent',
        ),

    correlationId:
      request.headers
        .get(
          'x-request-id',
        ),
  };
}


function handleError(
  error:
    unknown,
) {
  if (
    error instanceof
      RolePermissionServiceError
  ) {
    switch (
      error.code
    ) {
      case 'ROLE_VIEW_REQUIRED':
      case 'ROLE_MANAGE_REQUIRED':
      case 'SYSTEM_ROLE_PROTECTED':
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


      case 'ROLE_NOT_FOUND':
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              error.message,
          },

          404,
        );


      case 'ROLE_DELETED':
      case 'ROLE_DISABLED':
      case 'PERMISSION_UNAVAILABLE':
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              error.message,
          },

          409,
        );


      default:
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              error.message,
          },

          400,
        );
    }
  }


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
    '[SaMi] Role permissions API failed:',
    error,
  );


  return json(
    {
      success:
        false,

      code:
        'ROLE_PERMISSIONS_FAILED',

      error:
        'SaMi could not complete the permission request.',
    },

    500,
  );
}


/* ================================================================
   GET MATRIX
   ================================================================ */

export async function GET(
  request:
    NextRequest,
) {
  try {
    const roleId =
      request
        .nextUrl
        .searchParams
        .get(
          'roleId',
        );


    if (
      !roleId
    ) {
      return json(
        {
          success:
            false,

          code:
            'ROLE_ID_REQUIRED',

          error:
            'Role ID is required.',
        },

        400,
      );
    }


    const matrix =
      await getRolePermissionMatrix(
        roleId,
      );


    return json({
      success:
        true,

      matrix,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


/* ================================================================
   REPLACE PERMISSIONS
   ================================================================ */

export async function PATCH(
  request:
    NextRequest,
) {
  try {
    const body =
      await request.json();


    const roleId =
      typeof body?.roleId ===
        'string'
        ? body.roleId
        : '';


    const permissionKeys =
      Array.isArray(
        body?.permissionKeys,
      )
        ? body.permissionKeys.filter(
            (
              value:
                unknown,
            ): value is string =>
              typeof value ===
              'string',
          )
        : [];


    const result =
      await replaceWorkspaceRolePermissions({
        roleId,

        permissionKeys,

        audit:
          auditContext(
            request,
          ),
      });


    return json({
      success:
        true,

      changed:
        result.changed,

      added:
        result.added,

      removed:
        result.removed,

      matrix:
        result.matrix,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}