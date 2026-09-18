import {
  redirect,
} from 'next/navigation';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  requirePageSession,
} from '@/lib/auth/require-page-session';

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


  /*
   * Category 8 will replace this broad admin check with the
   * dedicated users.view permission.
   */
  const canViewUsers =
    Boolean(
      context.tenant &&
      context.membership &&
      (
        context.membership
          .isOwner ||

        context.membership
          .isAdmin
      ),
    );


  if (
    !canViewUsers
  ) {
    redirect(
      '/settings?tab=account',
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