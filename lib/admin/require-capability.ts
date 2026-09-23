import 'server-only';

import {
  getAdminSession,
  type AdminSession,
} from '@/lib/auth/admin-session';

import {
  hasAdminCapability,
  type PlatformAdminCapability,
} from '@/lib/admin/capabilities';


export async function requireAdminCapability(
  capability:
    PlatformAdminCapability,
): Promise<AdminSession> {
  const session =
    await getAdminSession();

  if (
    !session
  ) {
    throw new Error(
      'ADMIN_UNAUTHENTICATED',
    );
  }

  if (
    session.status !==
      'active' ||
    !session.emailVerified ||
    !hasAdminCapability(
      session.role,
      capability,
    )
  ) {
    throw new Error(
      'ADMIN_FORBIDDEN',
    );
  }

  return session;
}
