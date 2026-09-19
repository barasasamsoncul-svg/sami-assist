import {
  NextResponse,
} from 'next/server';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';


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
   GET /api/workspace/navigation

   PURPOSE

   Resolve workspace-shell navigation visibility from the real
   Category 8 permission engine.

   The browser receives capability booleans only.

   It does NOT receive:
   - roles
   - database information
   - tenant database registry
   - permission SQL
   - authorization internals

   IMPORTANT

   Navigation visibility is UX only.

   Every protected page/API must STILL enforce its own server-side
   permission guard.

   ================================================================ */

export async function GET() {
  try {
    const context =
      await getPermissionContext();


    const has =
      (
        permission:
          string,
      ) =>
        context.permissionSet.has(
          permission,
        );


    return json({
      success:
        true,

      navigation: {
        workspaceView:
          has(
            SAMI_PERMISSIONS
              .WORKSPACE_VIEW,
          ),

        workspaceManage:
          has(
            SAMI_PERMISSIONS
              .WORKSPACE_MANAGE,
          ),


        usersView:
          has(
            SAMI_PERMISSIONS
              .USERS_VIEW,
          ),

        usersManage:
          has(
            SAMI_PERMISSIONS
              .USERS_MANAGE,
          ),


        rolesView:
          has(
            SAMI_PERMISSIONS
              .ROLES_VIEW,
          ),

        rolesManage:
          has(
            SAMI_PERMISSIONS
              .ROLES_MANAGE,
          ),


        invitationsView:
          has(
            SAMI_PERMISSIONS
              .INVITATIONS_VIEW,
          ),

        invitationsManage:
          has(
            SAMI_PERMISSIONS
              .INVITATIONS_MANAGE,
          ),


        organizationView:
          has(
            SAMI_PERMISSIONS
              .ORGANIZATION_VIEW,
          ),

        organizationManage:
          has(
            SAMI_PERMISSIONS
              .ORGANIZATION_MANAGE,
          ),


        companiesView:
          has(
            SAMI_PERMISSIONS
              .COMPANIES_VIEW,
          ),

        companiesManage:
          has(
            SAMI_PERMISSIONS
              .COMPANIES_MANAGE,
          ),


        appsView:
          has(
            SAMI_PERMISSIONS
              .APPS_VIEW,
          ),

        appsManage:
          has(
            SAMI_PERMISSIONS
              .APPS_MANAGE,
          ),


        filesView:
          has(
            SAMI_PERMISSIONS
              .FILES_VIEW,
          ),

        notificationsView:
          has(
            SAMI_PERMISSIONS
              .NOTIFICATIONS_VIEW,
          ),


        aiUse:
          has(
            SAMI_PERMISSIONS
              .AI_USE,
          ),

        aiManage:
          has(
            SAMI_PERMISSIONS
              .AI_MANAGE,
          ),


        billingView:
          has(
            SAMI_PERMISSIONS
              .BILLING_VIEW,
          ),

        billingManage:
          has(
            SAMI_PERMISSIONS
              .BILLING_MANAGE,
          ),


        settingsView:
          has(
            SAMI_PERMISSIONS
              .SETTINGS_VIEW,
          ),

        settingsManage:
          has(
            SAMI_PERMISSIONS
              .SETTINGS_MANAGE,
          ),
      },
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
      '[SaMi] Workspace navigation permissions could not be resolved:',
      error,
    );


    return json(
      {
        success:
          false,

        code:
          'NAVIGATION_CONTEXT_FAILED',

        error:
          'Workspace navigation could not be loaded.',
      },

      500,
    );
  }
}