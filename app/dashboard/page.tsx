import {
  getAccountContextForUser,
  listAccessibleWorkspaces,
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


  /* ==============================================================
     LOAD TRUSTED WORKSPACE CONTEXT
     ============================================================== */

  const [
    accountContext,
    permissionContext,
    workspaces,
  ] =
    await Promise.all([
      getAccountContextForUser(
        session.user.id,
        session.currentTenantId,
      ),

      getPermissionContext(),

      listAccessibleWorkspaces(
        session.user.id,
      ),
    ]);


  /* ==============================================================
     RESOLVE USER-SPECIFIC WORKSPACE SHELL
     ============================================================== */

  const shell =
    resolveWorkspaceShellAccess({
      modules:
        accountContext.modules,

      subscription:
        accountContext.subscription,

      permissions:
        permissionContext,
    });


  /* ==============================================================
     COMPANY CONTEXT
     ============================================================== */

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
     * Dashboard remains available even if company context cannot
     * temporarily be resolved.
     */
  }


  /* ==============================================================
     DYNAMIC DASHBOARD
     ============================================================== */

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


  /* ==============================================================
     CLIENT
     ============================================================== */

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

      /*
       * These are the REAL assigned roles.
       *
       * Example:
       * - Invoicing Clerk
       * - Sales Manager
       * - Accountant
       *
       * Not merely Workspace Member.
       */
      roles={
        permissionContext.roles.map(
          role => ({
            id:
              role.id,

            key:
              role.key,

            name:
              role.name,

            description:
              role.description,

            isSystem:
              role.isSystem,
          }),
        )
      }

      /*
       * All active workspace memberships this user can actually
       * switch into.
       */
      workspaces={
        workspaces
      }

      subscription={
        shell.subscription
      }

      /*
       * User-accessible apps only.
       */
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


        /*
         * Administration requires manage-level access where
         * appropriate.
         */
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

        invitationsView:
          can(
            SAMI_PERMISSIONS
              .INVITATIONS_VIEW,
          ),


        rolesView:
          can(
            SAMI_PERMISSIONS
              .ROLES_VIEW,
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
      }}
    />
  );
}