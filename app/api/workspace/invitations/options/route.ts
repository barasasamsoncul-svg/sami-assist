import {
  NextResponse,
} from 'next/server';

import {
  getWorkspaceInvitationFormOptions,
  InvitationServiceError,
} from '@/lib/services/invitations';

import {
  PermissionGuardError,
} from '@/lib/auth/permission-guards';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

import {
  CompanyContextError,
} from '@/lib/auth/company-context';


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
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',
      },
    },
  );
}


/* ================================================================
   ERROR
   ================================================================ */

function handleError(
  error:
    unknown,
) {
  if (
    error instanceof
      InvitationServiceError
  ) {
    switch (
      error.code
    ) {
      case 'ROLE_ACCESS_DENIED':
      case 'PRIVILEGE_ESCALATION_BLOCKED':
      case 'COMPANY_ACCESS_DENIED':
      case 'CONTEXT_MISMATCH':
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
      case 'COMPANY_NOT_FOUND':
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


  if (
    error instanceof
      CompanyContextError
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
    '[SaMi] Invitation options API failed:',
    error,
  );


  return json(
    {
      success:
        false,

      code:
        'INVITATION_OPTIONS_FAILED',

      error:
        'SaMi could not load the invitation options.',
    },

    500,
  );
}


/* ================================================================
   GET /api/workspace/invitations/options

   Used by the Odoo-style "New Invitation" form.

   Returns:

   roles
   companies
   defaultRoleId
   defaultCompanyId

   ================================================================ */

export async function GET() {
  try {
    const options =
      await getWorkspaceInvitationFormOptions();


    return json({
      success:
        true,

      options,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}