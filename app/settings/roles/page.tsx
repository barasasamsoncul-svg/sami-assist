import {
  redirect,
} from 'next/navigation';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  PermissionGuardError,
  requirePermission,
} from '@/lib/auth/permission-guards';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  requirePageSession,
} from '@/lib/auth/require-page-session';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

import RolesSettingsClient from './RolesSettingsClient';


export const runtime =
  'nodejs';


export const dynamic =
  'force-dynamic';


export default async function RolesSettingsPage() {
  const session =
    await requirePageSession(
      '/settings/roles',
    );


  let permissions;


  try {
    permissions =
      await requirePermission(
        SAMI_PERMISSIONS
          .ROLES_VIEW,
      );
  } catch (
    error
  ) {
    if (
      error instanceof
        PermissionGuardError ||
      error instanceof
        TenantContextError
    ) {
      redirect(
        '/settings',
      );
    }


    throw error;
  }


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


  const shell =
    resolveWorkspaceShellAccess({
      modules:
        context.modules,

      subscription:
        context.subscription,

      permissions,
    });


  return (
    <RolesSettingsClient
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

      canManage={
        permissions
          .permissionSet
          .has(
            SAMI_PERMISSIONS
              .ROLES_MANAGE,
          )
      }

      canUseAi={
        shell.aiAvailable
      }

      canViewFiles={
        permissions
          .permissionSet
          .has(
            SAMI_PERMISSIONS
              .FILES_VIEW,
          )
      }

      canViewNotifications={
        permissions
          .permissionSet
          .has(
            SAMI_PERMISSIONS
              .NOTIFICATIONS_VIEW,
          )
      }
    />
  );
}