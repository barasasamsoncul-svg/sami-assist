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
  requireWorkspaceAdmin,
  WorkspaceGuardError,
} from '@/lib/auth/workspace-guards';

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
   * First ensure a valid browser session.
   *
   * requirePageSession() owns login redirection behavior.
   */
  const session =
    await requirePageSession(
      '/settings/users',
    );


  try {
    /*
     * Category 7.8 canonical guard.
     *
     * Today:
     *   owner/admin
     *
     * Category 8:
     *   users.view permission
     */
    await requireWorkspaceAdmin();
  } catch (
    error
  ) {
    if (
      error instanceof
        WorkspaceGuardError ||
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
   * Defensive check.
   *
   * Normally impossible after requireWorkspaceAdmin(), but this
   * prevents rendering an incomplete workspace page if context
   * changed between requests.
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