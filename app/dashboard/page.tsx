import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  requireCompanyContext,
} from '@/lib/auth/company-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

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
  composeDashboard,
} from '@/lib/dashboard/composer';

import {
  getWorkspaceActivitySummary,
  listWorkspaceActivity,
} from '@/lib/services/workspace-activity';

import {
  getWorkspaceNotificationSummary,
} from '@/lib/services/workspace-notifications';

import DashboardClient from './DashboardClient';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export default async function DashboardPage() {
  const session =
    await requirePageSession(
      '/dashboard',
    );

  const [
    accountContext,
    permissionContext,
  ] =
    await Promise.all([
      getAccountContextForUser(
        session.user.id,
        session.currentTenantId,
      ),
      getPermissionContext(),
    ]);

  const shell =
    resolveWorkspaceShellAccess({
      modules:
        accountContext.modules,
      subscription:
        accountContext.subscription,
      permissions:
        permissionContext,
    });

  let currentCompanyId:
    string | null =
    null;

  let selectedCompanyIds:
    string[] =
    [];

  let allowedCompanyIds:
    string[] =
    [];

  let company:
    {
      currentCompany: {
        id: string;
        name: string;
        logoUrl: string | null;
        currency: string;
        timezone: string;
      };
      selectedCompanyCount: number;
      allowedCompanyCount: number;
    }
    | null =
    null;

  try {
    const companyContext =
      await requireCompanyContext();

    currentCompanyId =
      companyContext
        .currentCompany.id;

    selectedCompanyIds = [
      ...companyContext
        .selectedCompanyIds,
    ];

    allowedCompanyIds = [
      ...companyContext
        .allowedCompanyIds,
    ];

    company = {
      currentCompany: {
        id:
          companyContext
            .currentCompany.id,
        name:
          companyContext
            .currentCompany.name,
        logoUrl:
          companyContext
            .currentCompany.logoUrl,
        currency:
          companyContext
            .currentCompany.currency,
        timezone:
          companyContext
            .currentCompany.timezone,
      },

      selectedCompanyCount:
        companyContext
          .selectedCompanyIds
          .length,

      allowedCompanyCount:
        companyContext
          .allowedCompanyIds
          .length,
    };
  } catch {
    // The shell still renders while company context is recovering.
  }

  const dashboard =
    await composeDashboard({
      userId:
        session.user.id,
      permissions:
        permissionContext,
      modules:
        shell.accessibleModules,
      currentCompanyId,
      selectedCompanyIds,
      allowedCompanyIds,
    });

  let recentActivity:
    Awaited<
      ReturnType<
        typeof listWorkspaceActivity
      >
    >['items'] =
    [];

  let activitySummary:
    Awaited<
      ReturnType<
        typeof getWorkspaceActivitySummary
      >
    > | null =
    null;

  let unreadNotifications =
    0;

  if (
    currentCompanyId
  ) {
    const [
      activityResult,
      summaryResult,
      notificationResult,
    ] =
      await Promise.allSettled([
        listWorkspaceActivity({
          view:
            'activity',
          limit:
            6,
        }),

        getWorkspaceActivitySummary(),

        getWorkspaceNotificationSummary(),
      ]);

    if (
      activityResult.status ===
      'fulfilled'
    ) {
      recentActivity =
        activityResult
          .value
          .items;
    }

    if (
      summaryResult.status ===
      'fulfilled'
    ) {
      activitySummary =
        summaryResult.value;
    }

    if (
      notificationResult.status ===
      'fulfilled'
    ) {
      unreadNotifications =
        notificationResult
          .value
          .unreadCount;
    }
  }

  return (
    <DashboardClient
      user={
        session.user
      }
      tenant={
        accountContext.tenant
      }
      membership={
        accountContext.membership
      }
      subscription={
        shell.subscription
      }
      modules={
        shell.accessibleModules
      }
      company={
        company
      }
      dashboard={
        dashboard
      }
      recentActivity={
        recentActivity
      }
      activitySummary={
        activitySummary
      }
      unreadNotifications={
        unreadNotifications
      }
      capabilities={{
        ai:
          shell.aiAvailable,
        files:
          permissionContext
            .permissionSet
            .has(
              SAMI_PERMISSIONS
                .FILES_VIEW,
            ),
      }}
    />
  );
}
