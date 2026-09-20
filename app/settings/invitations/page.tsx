import {
  redirect,
} from 'next/navigation';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  requirePageSession,
} from '@/lib/auth/require-page-session';


export const runtime =
  'nodejs';


export const dynamic =
  'force-dynamic';


export default async function InvitationsSettingsPage() {
  await requirePageSession(
    '/settings/invitations',
  );


  try {
    const permissions =
      await getPermissionContext();


    const allowed =
      permissions.permissionSet.has(
        SAMI_PERMISSIONS
          .INVITATIONS_VIEW,
      ) ||
      permissions.permissionSet.has(
        SAMI_PERMISSIONS
          .INVITATIONS_MANAGE,
      );


    if (
      allowed
    ) {
      redirect(
        '/settings/users?view=invited',
      );
    }
  } catch {
    // Fall through.
  }


  redirect(
    '/settings',
  );
}