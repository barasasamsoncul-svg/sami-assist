import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requirePermission,
  PermissionGuardError,
} from '@/lib/auth/permission-guards';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

import {
  MembershipLifecycleError,
  suspendWorkspaceMember,
  reactivateWorkspaceMember,
  removeWorkspaceMember,
  restoreWorkspaceMember,
} from '@/lib/services/membership-lifecycle';


export const runtime =
  'nodejs';


export const dynamic =
  'force-dynamic';


/* ================================================================
   JSON RESPONSE
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
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',
      },
    },
  );
}


/* ================================================================
   AUDIT CONTEXT
   ================================================================ */

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


  const correlationId =
    request.headers
      .get(
        'x-request-id',
      )
      ?.trim() ||
    request.headers
      .get(
        'x-correlation-id',
      )
      ?.trim() ||
    null;


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

    correlationId,
  };
}


/* ================================================================
   ERROR HANDLING
   ================================================================ */

function handleError(
  error:
    unknown,
) {
  /* ==============================================================
     MEMBERSHIP LIFECYCLE
     ============================================================== */

  if (
    error instanceof
      MembershipLifecycleError
  ) {
    switch (
      error.code
    ) {
      /* ----------------------------------------------------------
         BAD REQUEST
         ---------------------------------------------------------- */

      case 'INVALID_TENANT_ID':
      case 'INVALID_ACTOR_USER_ID':
      case 'INVALID_TARGET_USER_ID':
      case 'INVALID_REASON':
      case 'REASON_REQUIRED':
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


      /* ----------------------------------------------------------
         NOT FOUND
         ---------------------------------------------------------- */

      case 'WORKSPACE_NOT_FOUND':
      case 'ACTOR_MEMBERSHIP_NOT_FOUND':
      case 'MEMBERSHIP_NOT_FOUND':
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


      /* ----------------------------------------------------------
         FORBIDDEN
         ---------------------------------------------------------- */

      case 'ACTOR_ACCESS_DENIED':
      case 'USERS_MANAGE_REQUIRED':
      case 'SELF_MANAGEMENT_PROTECTED':
      case 'OWNER_PROTECTED':
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


      /* ----------------------------------------------------------
         CONFLICT
         ---------------------------------------------------------- */

      case 'WORKSPACE_NOT_ACTIVE':
      case 'MEMBERSHIP_REMOVED':
      case 'MEMBERSHIP_NOT_REMOVED':
      case 'INVALID_MEMBERSHIP_STATE':
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
              'MEMBERSHIP_LIFECYCLE_FAILED',

            error:
              'Workspace membership could not be updated.',
          },

          400,
        );
    }
  }


  /* ==============================================================
     PERMISSION GUARD
     ============================================================== */

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


  /* ==============================================================
     TENANT CONTEXT
     ============================================================== */

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


  /* ==============================================================
     UNKNOWN
     ============================================================== */

  console.error(
    '[SaMi] Employee lifecycle request failed:',
    error,
  );


  return json(
    {
      success:
        false,

      code:
        'EMPLOYEE_LIFECYCLE_FAILED',

      error:
        'SaMi could not update the employee access.',
    },

    500,
  );
}


/* ================================================================
   REQUEST BODY
   ================================================================ */

type LifecycleRequestBody = {
  action?:
    unknown;

  userId?:
    unknown;

  reason?:
    unknown;
};


async function readBody(
  request:
    NextRequest,
): Promise<
  LifecycleRequestBody | null
> {
  try {
    const body =
      await request.json();


    if (
      !body ||
      typeof body !==
        'object' ||
      Array.isArray(
        body,
      )
    ) {
      return null;
    }


    return body as LifecycleRequestBody;
  } catch {
    return null;
  }
}


/* ================================================================
   PATCH

   Supported actions:

   suspend
   reactivate
   remove
   restore

   Security boundary:

   - tenantId NEVER comes from browser
   - actorUserId NEVER comes from browser
   - target userId is validated by lifecycle service
   - users.manage required
   - owner protected
   - self lifecycle protected
   ================================================================ */

export async function PATCH(
  request:
    NextRequest,
) {
  try {
    /* ============================================================
       AUTHORIZATION
       ============================================================ */

    const context =
      await requirePermission(
        SAMI_PERMISSIONS
          .USERS_MANAGE,
      );


    /* ============================================================
       BODY
       ============================================================ */

    const body =
      await readBody(
        request,
      );


    if (
      !body
    ) {
      return json(
        {
          success:
            false,

          code:
            'INVALID_REQUEST',

          error:
            'Invalid employee lifecycle request.',
        },

        400,
      );
    }


    const action =
      typeof body.action ===
        'string'
        ? body.action
            .trim()
            .toLowerCase()
        : '';


    const targetUserId =
      typeof body.userId ===
        'string'
        ? body.userId
            .trim()
        : '';


    const reason =
      typeof body.reason ===
        'string'
        ? body.reason
            .trim() ||
          null
        : body.reason ===
            null ||
          body.reason ===
            undefined
          ? null
          : '__INVALID_REASON__';


    /* ============================================================
       BASIC VALIDATION
       ============================================================ */

    if (
      !targetUserId
    ) {
      return json(
        {
          success:
            false,

          code:
            'TARGET_USER_REQUIRED',

          error:
            'Select an employee.',
        },

        400,
      );
    }


    if (
      reason ===
      '__INVALID_REASON__'
    ) {
      return json(
        {
          success:
            false,

          code:
            'INVALID_REASON',

          error:
            'Employee lifecycle reason must be text.',
        },

        400,
      );
    }


    if (
      ![
        'suspend',
        'reactivate',
        'remove',
        'restore',
      ].includes(
        action,
      )
    ) {
      return json(
        {
          success:
            false,

          code:
            'INVALID_EMPLOYEE_ACTION',

          error:
            'Unsupported employee lifecycle action.',
        },

        400,
      );
    }


    /* ============================================================
       SELF PROTECTION

       The service repeats this check.
       ============================================================ */

    if (
      targetUserId ===
      context.userId
    ) {
      return json(
        {
          success:
            false,

          code:
            'SELF_MANAGEMENT_PROTECTED',

          error:
            'You cannot change your own workspace membership from Employee Management.',
        },

        403,
      );
    }


    /* ============================================================
       COMMON SERVICE INPUT
       ============================================================ */

    const input = {
      tenantId:
        context.tenantId,

      actorUserId:
        context.userId,

      targetUserId,

      reason:
        reason as string | null,

      audit:
        getAuditContext(
          request,
        ),
    };


    /* ============================================================
       EXECUTE
       ============================================================ */

    switch (
      action
    ) {
      /* ----------------------------------------------------------
         SUSPEND
         ---------------------------------------------------------- */

      case 'suspend': {
        const result =
          await suspendWorkspaceMember(
            input,
          );


        return json({
          success:
            true,

          code:
            result.changed
              ? 'EMPLOYEE_SUSPENDED'
              : 'EMPLOYEE_ALREADY_SUSPENDED',

          message:
            result.changed
              ? 'Employee workspace access suspended.'
              : 'Employee access was already suspended.',

          result,
        });
      }


      /* ----------------------------------------------------------
         REACTIVATE
         ---------------------------------------------------------- */

      case 'reactivate': {
        const result =
          await reactivateWorkspaceMember(
            input,
          );


        return json({
          success:
            true,

          code:
            result.changed
              ? 'EMPLOYEE_REACTIVATED'
              : 'EMPLOYEE_ALREADY_ACTIVE',

          message:
            result.changed
              ? 'Employee workspace access reactivated.'
              : 'Employee access was already active.',

          result,
        });
      }


      /* ----------------------------------------------------------
         REMOVE
         ---------------------------------------------------------- */

      case 'remove': {
        const result =
          await removeWorkspaceMember(
            input,
          );


        return json({
          success:
            true,

          code:
            result.changed
              ? 'EMPLOYEE_REMOVED'
              : 'EMPLOYEE_ALREADY_REMOVED',

          message:
            result.changed
              ? 'Employee removed from the workspace.'
              : 'Employee was already removed from this workspace.',

          result,
        });
      }


      /* ----------------------------------------------------------
         RESTORE
         ---------------------------------------------------------- */

      case 'restore': {
        const result =
          await restoreWorkspaceMember(
            input,
          );


        return json({
          success:
            true,

          code:
            'EMPLOYEE_RESTORED',

          message:
            'Employee restored to the workspace.',

          result,
        });
      }


      default:
        return json(
          {
            success:
              false,

            code:
              'INVALID_EMPLOYEE_ACTION',

            error:
              'Unsupported employee lifecycle action.',
          },

          400,
        );
    }
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


/* ================================================================
   METHOD GUARDS

   Lifecycle changes are mutations only.
   ================================================================ */

export async function GET() {
  return json(
    {
      success:
        false,

      code:
        'METHOD_NOT_ALLOWED',

      error:
        'Employee lifecycle operations must use PATCH.',
    },

    405,
  );
}


export async function POST() {
  return json(
    {
      success:
        false,

      code:
        'METHOD_NOT_ALLOWED',

      error:
        'Employee lifecycle operations must use PATCH.',
    },

    405,
  );
}


export async function DELETE() {
  return json(
    {
      success:
        false,

      code:
        'METHOD_NOT_ALLOWED',

      error:
        'Employee lifecycle operations must use PATCH.',
    },

    405,
  );
}