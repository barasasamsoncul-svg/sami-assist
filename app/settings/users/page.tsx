import {
  redirect,
} from 'next/navigation';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  requirePageSession,
} from '@/lib/auth/require-page-session';

import {
  PermissionGuardError,
  requirePermission,
} from '@/lib/auth/permission-guards';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

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


  let permissions;


  try {
    permissions =
      await requirePermission(
        SAMI_PERMISSIONS
          .USERS_VIEW,
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

      canViewRoles={
        permissions
          .permissionSet
          .has(
            SAMI_PERMISSIONS
              .ROLES_VIEW,
          )
      }

      canManageRoles={
        permissions
          .permissionSet
          .has(
            SAMI_PERMISSIONS
              .ROLES_MANAGE,
          )
      }
    />
  );
}