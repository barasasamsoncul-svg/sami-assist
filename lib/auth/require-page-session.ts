import { redirect } from 'next/navigation';

import {
  getSession,
  type Session,
} from '@/lib/auth/session';

import {
  getRuntimePlatformSettings,
} from '@/lib/admin/platform-settings';

import {
  getWorkspaceSubscriptionAccessState,
} from '@/lib/billing/access';

/* ============================================================
   SAFE INTERNAL PATH
   ============================================================ */

/**
 * Only allow redirects to paths inside the SaMi application.
 *
 * Allowed:
 *   /dashboard
 *   /settings?tab=security
 *   /invoices/123
 *
 * Rejected:
 *   https://evil.example
 *   //evil.example
 *   \evil.example
 *   javascript:...
 */
function safeInternalPath(
  value: string | null | undefined,
  fallback: string
): string {
  if (
    typeof value !== 'string'
  ) {
    return fallback;
  }

  const path =
    value.trim();

  if (
    !path ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    /[\r\n]/.test(path)
  ) {
    return fallback;
  }

  return path;
}

/* ============================================================
   REQUIRE AUTHENTICATED PAGE SESSION
   ============================================================ */

export async function requirePageSession(
  nextPath = '/dashboard'
): Promise<Session> {
  const session =
    await getSession();

  if (session) {
    const platformSettings =
      await getRuntimePlatformSettings();

    const maintenanceRecoveryPath =
      nextPath ===
        '/maintenance' ||
      nextPath.startsWith(
        '/maintenance?',
      ) ||
      nextPath ===
        '/settings' ||
      nextPath.startsWith(
        '/settings?',
      ) ||
      nextPath ===
        '/subscription-required' ||
      nextPath.startsWith(
        '/subscription-required?',
      );

    if (
      platformSettings
        .operations
        .maintenanceMode &&
      !maintenanceRecoveryPath
    ) {
      redirect(
        '/maintenance',
      );
    }

    if (
      session.currentTenantId
    ) {
      const access =
        await getWorkspaceSubscriptionAccessState(
          session.currentTenantId,
        );

      const recoveryPath =
        nextPath ===
          '/subscription-required' ||
        nextPath.startsWith(
          '/subscription-required?',
        ) ||
        nextPath ===
          '/settings' ||
        nextPath.startsWith(
          '/settings?',
        ) ||
        nextPath ===
          '/help' ||
        nextPath.startsWith(
          '/help?',
        );

      const subscriptionRestricted =
        access.suspended ||
        !access.entitled;

      if (
        subscriptionRestricted &&
        !recoveryPath
      ) {
        redirect(
          '/subscription-required',
        );
      }
    }

    return session;
  }

  const safeNextPath =
    safeInternalPath(
      nextPath,
      '/dashboard'
    );

  const params =
    new URLSearchParams({
      next:
        safeNextPath,
    });

  redirect(
    `/login?${params.toString()}`
  );
}

/* ============================================================
   REDIRECT AUTHENTICATED USER
   ============================================================ */

/**
 * Intended for authentication pages such as:
 *
 * /login
 * /register
 * /forgot-password
 *
 * An already authenticated user should not normally remain on
 * those pages.
 */
export async function redirectIfAuthenticated(
  redirectTo = '/dashboard'
): Promise<void> {
  const session =
    await getSession();

  if (!session) {
    return;
  }

  const destination =
    safeInternalPath(
      redirectTo,
      '/dashboard'
    );

  redirect(
    destination
  );
}