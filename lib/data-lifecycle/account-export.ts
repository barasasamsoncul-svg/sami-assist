import 'server-only';

import {
  getUserAccountWithPreferences,
} from '@/lib/account/user-account';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import {
  getSession,
  listActiveSessions,
} from '@/lib/auth/session';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  listUserWorkspaceMemberships,
} from '@/lib/services/membership';

import {
  getAccessibleModuleDataExportHandlers,
  type SamiDataLifecycleContext,
} from '@/lib/data-lifecycle/registry';

export type SamiAccountDataExport = {
  exportVersion: '1.0';
  generatedAt: string;
  account: Awaited<
    ReturnType<
      typeof getUserAccountWithPreferences
    >
  >;
  memberships: Awaited<
    ReturnType<
      typeof listUserWorkspaceMemberships
    >
  >;
  activeSessions: Awaited<
    ReturnType<
      typeof listActiveSessions
    >
  >;
  currentWorkspace: {
    id: string;
    name: string;
    slug: string;
    accessibleModuleKeys: string[];
    moduleData: unknown[];
  } | null;
};

export async function buildAccountDataExport(
  input: {
    userId: string;
    currentTenantId: string | null;
  },
): Promise<SamiAccountDataExport> {
  const [
    account,
    memberships,
    activeSessions,
    currentSession,
  ] =
    await Promise.all([
      getUserAccountWithPreferences(
        input.userId,
      ),

      listUserWorkspaceMemberships(
        input.userId,
        {
          includeRemoved:
            true,
        },
      ),

      listActiveSessions(
        input.userId,
      ),

      getSession(),
    ]);

  let currentWorkspace:
    SamiAccountDataExport[
      'currentWorkspace'
    ] =
    null;

  if (
    input.currentTenantId
  ) {
    const context =
      await getAccountContextForUser(
        input.userId,
        input.currentTenantId,
      );

    if (
      context.tenant &&
      context.membership
    ) {
      try {
        const permissions =
          await getPermissionContext();

        if (
          permissions.userId ===
            input.userId &&
          permissions.tenantId ===
            context.tenant.id
        ) {
          const shell =
            resolveWorkspaceShellAccess({
              modules:
                context.modules,
              subscription:
                context.subscription,
              permissions,
            });

          const lifecycleContext:
            SamiDataLifecycleContext = {
              userId:
                input.userId,
              tenantId:
                permissions.tenantId,
              membershipId:
                permissions.membershipId,
              isOwner:
                permissions.isOwner,
              permissionKeys:
                [
                  ...permissions
                    .permissionKeys,
                ],
              accessibleModuleKeys:
                [
                  ...shell
                    .accessibleModuleKeys,
                ],
              companyId:
                currentSession &&
                currentSession
                  .user.id ===
                  input.userId &&
                currentSession
                  .currentTenantId ===
                  permissions.tenantId
                  ? currentSession
                      .currentCompanyId
                  : null,
            };

          const handlers =
            getAccessibleModuleDataExportHandlers(
              shell
                .accessibleModuleKeys,
            );

          const moduleData =
            await Promise.all(
              handlers.map(
                handler =>
                  handler
                    .exportData!(
                      lifecycleContext,
                    ),
              ),
            );

          currentWorkspace = {
            id:
              context.tenant.id,
            name:
              context.tenant.name,
            slug:
              context.tenant.slug,
            accessibleModuleKeys:
              [
                ...shell
                  .accessibleModuleKeys,
              ],
            moduleData,
          };
        }
      } catch (
        error
      ) {
        /*
         * Global account export must remain available even when the
         * current workspace is no longer enterable. We omit workspace
         * module data rather than bypassing authorization.
         */
        console.warn(
          '[SaMi Data Export] Current workspace data was omitted:',
          error,
        );
      }
    }
  }

  return {
    exportVersion:
      '1.0',
    generatedAt:
      new Date()
        .toISOString(),
    account,
    memberships,
    activeSessions,
    currentWorkspace,
  };
}
