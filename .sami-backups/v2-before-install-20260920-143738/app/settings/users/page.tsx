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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function UsersSettingsPage() {
  const session = await requirePageSession('/settings/users');
  const context = await getAccountContextForUser(
    session.user.id,
    session.currentTenantId,
  );

  if (!context.tenant || !context.membership) {
    redirect('/settings');
  }

  let permissions;
  try {
    permissions = await getPermissionContext();
  } catch {
    redirect('/settings');
  }

  const can = (permission: string) => permissions.permissionSet.has(permission);

  const canManageUsers = can(SAMI_PERMISSIONS.USERS_MANAGE);
  const canViewUsers = canManageUsers || can(SAMI_PERMISSIONS.USERS_VIEW);

  const canManageRoles = can(SAMI_PERMISSIONS.ROLES_MANAGE);
  const canViewRoles = canManageRoles || can(SAMI_PERMISSIONS.ROLES_VIEW);

  const canManageInvitations = can(SAMI_PERMISSIONS.INVITATIONS_MANAGE);
  const canViewInvitations = canManageInvitations || can(SAMI_PERMISSIONS.INVITATIONS_VIEW);

  const canManageApps = can(SAMI_PERMISSIONS.APPS_MANAGE);
  const canViewApps = canManageApps || can(SAMI_PERMISSIONS.APPS_VIEW);

  const canManageCompanies = can(SAMI_PERMISSIONS.COMPANIES_MANAGE);
  const canViewCompanies = canManageCompanies || can(SAMI_PERMISSIONS.COMPANIES_VIEW);

  if (!canViewUsers && !canViewInvitations) {
    redirect('/settings');
  }

  const shell = resolveWorkspaceShellAccess({
    modules: context.modules,
    subscription: context.subscription,
    permissions,
  });

  return (
    <UsersSettingsClient
      user={session.user}
      tenant={context.tenant}
      membership={context.membership}
      subscription={shell.subscription}
      modules={shell.accessibleModules}
      canViewUsers={canViewUsers}
      canManageUsers={canManageUsers}
      canViewRoles={canViewRoles}
      canManageRoles={canManageRoles}
      canViewInvitations={canViewInvitations}
      canManageInvitations={canManageInvitations}
      canViewApps={canViewApps}
      canManageApps={canManageApps}
      canViewCompanies={canViewCompanies}
      canManageCompanies={canManageCompanies}
      canUseAi={shell.aiAvailable}
      canViewFiles={can(SAMI_PERMISSIONS.FILES_VIEW)}
      canViewNotifications={can(SAMI_PERMISSIONS.NOTIFICATIONS_VIEW)}
    />
  );
}
