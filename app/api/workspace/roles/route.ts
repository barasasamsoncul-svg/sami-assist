import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createWorkspaceRole,
  deleteWorkspaceRole,
  disableWorkspaceRole,
  enableWorkspaceRole,
  listWorkspaceRoles,
  restoreWorkspaceRole,
  updateWorkspaceRole,
  RoleServiceError,
} from '@/lib/services/roles';

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
      RoleServiceError
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


      case 'ROLE_NAME_EXISTS':
      case 'ROLE_KEY_EXISTS':
      case 'ROLE_DELETED':
      case 'INVALID_ROLE_STATE':
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
    '[SaMi] Roles API failed:',
    error,
  );


  return json(
    {
      success:
        false,

      code:
        'ROLES_REQUEST_FAILED',

      error:
        'SaMi could not complete the roles request.',
    },

    500,
  );
}


/* ================================================================
   GET ROLES
   ================================================================ */

export async function GET() {
  try {
    const roles =
      await listWorkspaceRoles({
        includeDisabled:
          true,
      });


    return json({
      success:
        true,

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
   CREATE ROLE
   ================================================================ */

export async function POST(
  request:
    NextRequest,
) {
  try {
    const body =
      await request.json();


    const result =
      await createWorkspaceRole({
        name:
          typeof body?.name ===
            'string'
            ? body.name
            : '',

        description:
          typeof body?.description ===
            'string'
            ? body.description
            : null,

        audit:
          auditContext(
            request,
          ),
      });


    return json(
      {
        success:
          true,

        role:
          result.role,

        changed:
          result.changed,
      },

      201,
    );
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


/* ================================================================
   UPDATE / LIFECYCLE
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


    const action =
      typeof body?.action ===
        'string'
        ? body.action
            .trim()
            .toLowerCase()
        : 'update';


    const audit =
      auditContext(
        request,
      );


    if (
      action ===
      'update'
    ) {
      const result =
        await updateWorkspaceRole({
          roleId,

          name:
            typeof body?.name ===
              'string'
              ? body.name
              : '',

          description:
            typeof body?.description ===
              'string'
              ? body.description
              : null,

          audit,
        });


      return json({
        success:
          true,

        role:
          result.role,

        changed:
          result.changed,
      });
    }


    if (
      action ===
      'enable'
    ) {
      const result =
        await enableWorkspaceRole({
          roleId,
          audit,
        });


      return json({
        success:
          true,

        role:
          result.role,

        changed:
          result.changed,
      });
    }


    if (
      action ===
      'disable'
    ) {
      const result =
        await disableWorkspaceRole({
          roleId,
          audit,
        });


      return json({
        success:
          true,

        role:
          result.role,

        changed:
          result.changed,
      });
    }


    if (
      action ===
      'restore'
    ) {
      const result =
        await restoreWorkspaceRole({
          roleId,
          audit,
        });


      return json({
        success:
          true,

        role:
          result.role,

        changed:
          result.changed,
      });
    }


    return json(
      {
        success:
          false,

        code:
          'INVALID_ROLE_ACTION',

        error:
          'Unsupported role action.',
      },

      400,
    );
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


/* ================================================================
   DELETE ROLE
   ================================================================ */

export async function DELETE(
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


    const result =
      await deleteWorkspaceRole({
        roleId,

        audit:
          auditContext(
            request,
          ),
      });


    return json({
      success:
        true,

      role:
        result.role,

      changed:
        result.changed,

      removedAssignments:
        result.removedAssignments ||
        0,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}