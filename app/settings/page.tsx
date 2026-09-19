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


  /*
   * Personal account settings must remain usable even if workspace
   * authorization cannot currently be resolved.
   *
   * Workspace functionality therefore fails closed.
   */
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

          canViewAppCatalog:
            false,

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
       * Null unless this user has billing access.
       */
      subscription={
        shell.subscription
      }

      /*
       * Personal shell/sidebar apps.
       */
      accessibleModules={
        shell.accessibleModules
      }

      /*
       * Apps administration only.
       */
      managedModules={
        shell.managedModules
      }

      capabilities={{
        workspaceView:
          can(
            SAMI_PERMISSIONS
              .WORKSPACE_VIEW,
          ),

        workspaceManage:
          can(
            SAMI_PERMISSIONS
              .WORKSPACE_MANAGE,
          ),


        appsView:
          can(
            SAMI_PERMISSIONS
              .APPS_VIEW,
          ),

        appsManage:
          can(
            SAMI_PERMISSIONS
              .APPS_MANAGE,
          ),


        aiUse:
          can(
            SAMI_PERMISSIONS
              .AI_USE,
          ),

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