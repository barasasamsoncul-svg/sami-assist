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
        id:
          string;

        name:
          string;

        currency:
          string;

        timezone:
          string;
      };

      selectedCompanyCount:
        number;

      allowedCompanyCount:
        number;
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
    /*
     * Dashboard stays usable even if company context is
     * temporarily unavailable.
     */
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


  const can =
    (
      permission:
        string,
    ) =>
      permissionContext
        .permissionSet
        .has(
          permission,
        );


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

      capabilities={{
        ai:
          can(
            SAMI_PERMISSIONS
              .AI_USE,
          ),

        files:
          can(
            SAMI_PERMISSIONS
              .FILES_VIEW,
          ),

        notifications:
          can(
            SAMI_PERMISSIONS
              .NOTIFICATIONS_VIEW,
          ),


        workspaceView:
          can(
            SAMI_PERMISSIONS
              .WORKSPACE_VIEW,
          ),

        workspaceManage:
          can(
            SAMI_PERMISSIONS
              .WORKSPACE_MANAGE,
          ),


        usersView:
          can(
            SAMI_PERMISSIONS
              .USERS_VIEW,
          ),

        usersManage:
          can(
            SAMI_PERMISSIONS
              .USERS_MANAGE,
          ),


        rolesView:
          can(
            SAMI_PERMISSIONS
              .ROLES_VIEW,
          ),

        rolesManage:
          can(
            SAMI_PERMISSIONS
              .ROLES_MANAGE,
          ),


        invitationsView:
          can(
            SAMI_PERMISSIONS
              .INVITATIONS_VIEW,
          ),

        invitationsManage:
          can(
            SAMI_PERMISSIONS
              .INVITATIONS_MANAGE,
          ),


        companiesView:
          can(
            SAMI_PERMISSIONS
              .COMPANIES_VIEW,
          ),

        companiesManage:
          can(
            SAMI_PERMISSIONS
              .COMPANIES_MANAGE,
          ),


        appsView:
          can(
            SAMI_PERMISSIONS
              .APPS_VIEW,
          ),

        appsManage:
          can(
            SAMI_PERMISSIONS
              .APPS_MANAGE,
          ),


        billingView:
          shell.canViewBilling,

        billingManage:
          can(
            SAMI_PERMISSIONS
              .BILLING_MANAGE,
          ),


        settingsView:
          can(
            SAMI_PERMISSIONS
              .SETTINGS_VIEW,
          ),

        settingsManage:
          can(
            SAMI_PERMISSIONS
              .SETTINGS_MANAGE,
          ),


        auditView:
          can(
            SAMI_PERMISSIONS
              .AUDIT_VIEW,
          ),

        usageView:
          can(
            SAMI_PERMISSIONS
              .USAGE_VIEW,
          ),
      }}
    />
  );
}