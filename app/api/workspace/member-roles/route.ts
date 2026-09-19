import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getWorkspaceMemberRoles,
  listAssignableWorkspaceRoles,
  replaceWorkspaceMemberRoles,
  UserRoleServiceError,
} from '@/lib/services/user-roles';

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


function getAuditContext(
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
      request.headers.get(
        'x-real-ip',
      ) ||
      null,

    userAgent:
      request.headers.get(
        'user-agent',
      ),

    correlationId:
      request.headers.get(
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
      UserRoleServiceError
  ) {
    switch (
      error.code
    ) {
      case 'ROLE_VIEW_REQUIRED':
      case 'ROLE_MANAGE_REQUIRED':
      case 'ROLE_ACCESS_DENIED':
      case 'PRIVILEGE_ESCALATION_BLOCKED':
      case 'OWNER_ROLE_ASSIGNMENTS_PROTECTED':
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


      case 'MEMBER_NOT_FOUND':
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


      case 'MEMBER_NOT_ACTIVE':
      case 'INTERNAL_MEMBER_REQUIRED':
      case 'ROLE_NOT_ACTIVE':
      case 'EMPTY_ROLE_SET':
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
    '[SaMi] Member role request failed:',
    error,
  );


  return json(
    {
      success:
        false,

      code:
        'MEMBER_ROLES_FAILED',

      error:
        'SaMi could not complete the role assignment request.',
    },

    500,
  );
}


/* ================================================================
   GET MEMBER ROLES + ASSIGNABLE ROLES
   ================================================================ */

export async function GET(
  request:
    NextRequest,
) {
  try {
    const userId =
      request
        .nextUrl
        .searchParams
        .get(
          'userId',
        );


    if (
      !userId
    ) {
      return json(
        {
          success:
            false,

          code:
            'USER_ID_REQUIRED',

          error:
            'User ID is required.',
        },

        400,
      );
    }


    /*
     * listAssignableWorkspaceRoles requires roles.manage.
     *
     * Therefore this endpoint is specifically for the assignment
     * editor rather than ordinary Users-directory viewing.
     */
    const [
      member,
      roles,
    ] =
      await Promise.all([
        getWorkspaceMemberRoles(
          userId,
        ),

        listAssignableWorkspaceRoles(),
      ]);


    return json({
      success:
        true,

      member,

      roles,
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
   REPLACE MEMBER ROLE SET
   ================================================================ */

export async function PATCH(
  request:
    NextRequest,
) {
  try {
    const body =
      await request.json();


    const userId =
      typeof body?.userId ===
        'string'
        ? body.userId
        : '';


    const roleIds =
      Array.isArray(
        body?.roleIds,
      )
        ? body.roleIds.filter(
            (
              value:
                unknown,
            ): value is string =>
              typeof value ===
              'string',
          )
        : [];


    const result =
      await replaceWorkspaceMemberRoles({
        userId,

        roleIds,

        audit:
          getAuditContext(
            request,
          ),
      });


    return json({
      success:
        true,

      changed:
        result.changed,

      addedRoleIds:
        result.addedRoleIds,

      removedRoleIds:
        result.removedRoleIds,

      member:
        result.member,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}