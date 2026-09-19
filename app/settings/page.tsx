import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  getPermissionContext,
  type PermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  requirePageSession,
} from '@/lib/auth/require-page-session';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import SettingsClient from './SettingsClient';


export const runtime =
  'nodejs';


export const dynamic =
  'force-dynamic';


export default async function SettingsPage() {
  const session =
    await requirePageSession(
      '/settings',
    );


  const context =
    await getAccountContextForUser(
      session.user.id,
      session.currentTenantId,
    );


  /* ==============================================================
     PERMISSIONS

     Personal account settings must remain available even if the
     current workspace authorization context fails.

     Workspace administration therefore fails closed.
     ============================================================== */

  let permissions:
    PermissionContext | null =
    null;


  if (
    context.tenant &&
    context.membership
  ) {
    try {
      permissions =
        await getPermissionContext();
    } catch {
      permissions =
        null;
    }
  }


  /* ==============================================================
     WORKSPACE SHELL
     ============================================================== */

  const shell =
    permissions
      ? resolveWorkspaceShellAccess({
          modules:
            context.modules,

          subscription:
            context.subscription,

          permissions,
        })
      : {
          accessibleModules:
            [],

          managedModules:
            [],

          subscription:
            null,

          canManageApps:
            false,

          canViewBilling:
            false,

          accessibleModuleKeys:
            [],
        };


  const can =
    (
      permission:
        string,
    ) =>
      permissions
        ?.permissionSet
        .has(
          permission,
        ) ===
      true;


  /* ==============================================================
     RENDER
     ============================================================== */

  return (
    <SettingsClient
      user={
        session.user
      }

      tenant={
        context.tenant
      }

      membership={
        context.membership
      }

      /*
       * Already removed unless this person may view billing.
       */
      subscription={
        shell.subscription
      }

      /*
       * Personal working applications.
       */
      accessibleModules={
        shell.accessibleModules
      }

      /*
       * Complete installed application set available only to an
       * Apps administrator / owner.
       */
      managedModules={
        shell.managedModules
      }

      capabilities={{
        /*
         * Normal workspace use.
         */
        aiUse:
          can(
            SAMI_PERMISSIONS
              .AI_USE,
          ),

        filesView:
          can(
            SAMI_PERMISSIONS
              .FILES_VIEW,
          ),

        notificationsView:
          can(
            SAMI_PERMISSIONS
              .NOTIFICATIONS_VIEW,
          ),


        /*
         * Administration.
         *
         * workspace.view is deliberately NOT used here.
         */
        workspaceManage:
          can(
            SAMI_PERMISSIONS
              .WORKSPACE_MANAGE,
          ),


        appsManage:
          shell.canManageApps,


        /*
         * ai.use allows using SaMi AI.
         *
         * ai.manage allows configuring SaMi AI.
         */
        aiManage:
          can(
            SAMI_PERMISSIONS
              .AI_MANAGE,
          ),


        billingView:
          shell.canViewBilling,

        billingManage:
          can(
            SAMI_PERMISSIONS
              .BILLING_MANAGE,
          ),
      }}
    />
  );
}