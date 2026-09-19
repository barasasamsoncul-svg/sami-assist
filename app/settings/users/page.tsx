import {
  redirect,
} from 'next/navigation';

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
  requirePageSession,
} from '@/lib/auth/require-page-session';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import UsersSettingsClient from './UsersSettingsClient';


export const runtime =
  'nodejs';


export const dynamic =
  'force-dynamic';


export default async function UsersSettingsPage() {
  const session =
    await requirePageSession(
      '/settings/users',
    );


  const context =
    await getAccountContextForUser(
      session.user.id,
      session.currentTenantId,
    );


  if (
    !context.tenant ||
    !context.membership
  ) {
    redirect(
      '/settings',
    );
  }


  let permissions;


  try {
    permissions =
      await getPermissionContext();
  } catch {
    redirect(
      '/settings',
    );
  }


  const can =
    (
      permission:
        string,
    ) =>
      permissions.permissionSet.has(
        permission,
      );


  const canViewUsers =
    can(
      SAMI_PERMISSIONS
        .USERS_VIEW,
    );


  const canViewInvitations =
    can(
      SAMI_PERMISSIONS
        .INVITATIONS_VIEW,
    );


  /*
   * Users becomes the unified access-management surface.
   *
   * Somebody must have at least one of:
   *
   * - users.view
   * - invitations.view
   */
  if (
    !canViewUsers &&
    !canViewInvitations
  ) {
    redirect(
      '/settings',
    );
  }


  const shell =
    resolveWorkspaceShellAccess({
      modules:
        context.modules,

      subscription:
        context.subscription,

      permissions,
    });


  return (
    <UsersSettingsClient
      user={
        session.user
      }

      tenant={
        context.tenant
      }

      membership={
        context.membership
      }

      subscription={
        shell.subscription
      }

      modules={
        shell.accessibleModules
      }

      canViewUsers={
        canViewUsers
      }

      canManageUsers={
        can(
          SAMI_PERMISSIONS
            .USERS_MANAGE,
        )
      }

      canViewRoles={
        can(
          SAMI_PERMISSIONS
            .ROLES_VIEW,
        )
      }

      canManageRoles={
        can(
          SAMI_PERMISSIONS
            .ROLES_MANAGE,
        )
      }

      canViewInvitations={
        canViewInvitations
      }

      canManageInvitations={
        can(
          SAMI_PERMISSIONS
            .INVITATIONS_MANAGE,
        )
      }

      canUseAi={
        can(
          SAMI_PERMISSIONS
            .AI_USE,
        )
      }

      canViewFiles={
        can(
          SAMI_PERMISSIONS
            .FILES_VIEW,
        )
      }

      canViewNotifications={
        can(
          SAMI_PERMISSIONS
            .NOTIFICATIONS_VIEW,
        )
      }
    />
  );
}