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
  requirePermission,
  PermissionGuardError,
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
  /*
   * Browser authentication remains owned by requirePageSession().
   *
   * This keeps the normal login/redirection behavior unchanged.
   */
  const session =
    await requirePageSession(
      '/settings/users',
    );


  try {
    /*
     * Category 8.6
     *
     * Viewing the Users settings surface requires:
     *
     * users.view
     *
     * It no longer requires the broad admin role.
     */
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


  /*
   * Defensive consistency check.
   *
   * The permission guard should already have guaranteed a valid
   * workspace, but do not render an incomplete Users settings
   * surface if account context changed concurrently.
   */
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
    />
  );
}