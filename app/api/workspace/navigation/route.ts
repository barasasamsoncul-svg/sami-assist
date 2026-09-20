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
   GET NAVIGATION CAPABILITIES
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


    const workspaceManage =
      has(
        SAMI_PERMISSIONS
          .WORKSPACE_MANAGE,
      );


    const usersManage =
      has(
        SAMI_PERMISSIONS
          .USERS_MANAGE,
      );


    const rolesManage =
      has(
        SAMI_PERMISSIONS
          .ROLES_MANAGE,
      );


    const invitationsManage =
      has(
        SAMI_PERMISSIONS
          .INVITATIONS_MANAGE,
      );


    const organizationManage =
      has(
        SAMI_PERMISSIONS
          .ORGANIZATION_MANAGE,
      );


    const companiesManage =
      has(
        SAMI_PERMISSIONS
          .COMPANIES_MANAGE,
      );


    const appsManage =
      has(
        SAMI_PERMISSIONS
          .APPS_MANAGE,
      );


    const aiManage =
      has(
        SAMI_PERMISSIONS
          .AI_MANAGE,
      );


    const billingManage =
      has(
        SAMI_PERMISSIONS
          .BILLING_MANAGE,
      );


    const settingsManage =
      has(
        SAMI_PERMISSIONS
          .SETTINGS_MANAGE,
      );


    return json({
      success:
        true,

      navigation: {
        workspaceManage,

        workspaceView:
          workspaceManage ||
          has(
            SAMI_PERMISSIONS
              .WORKSPACE_VIEW,
          ),


        usersManage,

        usersView:
          usersManage ||
          has(
            SAMI_PERMISSIONS
              .USERS_VIEW,
          ),


        rolesManage,

        rolesView:
          rolesManage ||
          has(
            SAMI_PERMISSIONS
              .ROLES_VIEW,
          ),


        invitationsManage,

        invitationsView:
          invitationsManage ||
          has(
            SAMI_PERMISSIONS
              .INVITATIONS_VIEW,
          ),


        organizationManage,

        organizationView:
          organizationManage ||
          has(
            SAMI_PERMISSIONS
              .ORGANIZATION_VIEW,
          ),


        companiesManage,

        companiesView:
          companiesManage ||
          has(
            SAMI_PERMISSIONS
              .COMPANIES_VIEW,
          ),


        appsManage,

        appsView:
          appsManage ||
          has(
            SAMI_PERMISSIONS
              .APPS_VIEW,
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


        aiManage,

        aiUse:
          aiManage ||
          has(
            SAMI_PERMISSIONS
              .AI_USE,
          ),


        billingManage,

        billingView:
          billingManage ||
          has(
            SAMI_PERMISSIONS
              .BILLING_VIEW,
          ),


        settingsManage,

        settingsView:
          settingsManage ||
          has(
            SAMI_PERMISSIONS
              .SETTINGS_VIEW,
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