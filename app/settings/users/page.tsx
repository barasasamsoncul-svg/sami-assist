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


  let permissionContext;


  try {
    /*
     * Users page itself requires users.view.
     *
     * The returned PermissionContext also lets us decide whether
     * this person may view/manage roles without another resolution.
     */
    permissionContext =
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
        context.subscription
      }

      modules={
        context.modules
      }

      canViewRoles={
        permissionContext
          .permissionSet
          .has(
            SAMI_PERMISSIONS
              .ROLES_VIEW,
          )
      }

      canManageRoles={
        permissionContext
          .permissionSet
          .has(
            SAMI_PERMISSIONS
              .ROLES_MANAGE,
          )
      }
    />
  );
}