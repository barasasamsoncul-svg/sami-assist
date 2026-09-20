import {
  NextResponse,
} from 'next/server';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

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

   SaMi AI is entitlement-driven, not role-driven.
   ================================================================ */

export async function GET() {
  try {
    const context =
      await getPermissionContext();


    const account =
      await getAccountContextForUser(
        context.userId,
        context.tenantId,
      );


    const shell =
      resolveWorkspaceShellAccess({
        modules:
          account.modules,

        subscription:
          account.subscription,

        permissions:
          context,
      });


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
        apps:
          shell.accessibleModules.map(
            module => ({
              key:
                module.key,

              registryKey:
                module.registryKey,

              name:
                module.name,

              description:
                module.description,

              href:
                module.href,

              iconKey:
                module.iconKey,

              category:
                module.category,

              categoryLabel:
                module.categoryLabel,

              order:
                module.order,

              recommended:
                module.recommended,

              keywords:
                module.keywords,

              registered:
                module.registered,

              status:
                module.status,
            }),
          ),

        appCount:
          shell.accessibleModules.length,


        /*
         * Core platform entitlement.
         *
         * The sidebar and personal settings use this field.
         */
        aiAvailable:
          shell.aiAvailable,


        /*
         * Temporary compatibility aliases.
         *
         * ai.use / ai.manage are no longer the canonical shell
         * authorization model. They remain here only so an older
         * client does not suddenly lose access during migration.
         */
        aiUse:
          shell.aiAvailable,

        aiManage:
          false,


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


        notificationsManage:
          has(
            SAMI_PERMISSIONS
              .NOTIFICATIONS_MANAGE,
          ),

        /*
         * Core workspace communication is available to every trusted
         * active internal member. Management actions remain permission
         * gated through notifications.manage.
         */
        notificationsView:
          true,

        /*
         * Activity is a core workspace timeline for every trusted
         * active internal member. Audit detail remains permission-gated.
         */
        activityView:
          true,

        /*
         * Search itself is core workspace access. Each provider
         * enforces its own app/company/record/file boundary.
         */
        searchView:
          true,

        auditView:
          context.isOwner ||
          has(
            SAMI_PERMISSIONS
              .AUDIT_VIEW,
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
