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
  requirePageSession,
} from '@/lib/auth/require-page-session';

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
    context,
    permissions,
  ] =
    await Promise.all([
      getAccountContextForUser(
        session.user.id,
        session.currentTenantId,
      ),

      getPermissionContext(),
    ]);


  let company:
    {
      currentCompany: {
        id: string;
        name: string;
        currency: string;
        timezone: string;
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
     * Dashboard remains available even if company context
     * is temporarily unavailable.
     */
  }


  const can =
    (
      permission:
        string,
    ) =>
      permissions
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

      company={
        company
      }

      capabilities={{
        ai:
          can(
            'ai.use',
          ),

        files:
          can(
            'files.view',
          ),

        notifications:
          can(
            'notifications.view',
          ),

        usersView:
          can(
            'users.view',
          ),

        usersManage:
          can(
            'users.manage',
          ),

        rolesView:
          can(
            'roles.view',
          ),

        rolesManage:
          can(
            'roles.manage',
          ),

        companiesView:
          can(
            'companies.view',
          ),

        companiesManage:
          can(
            'companies.manage',
          ),

        appsView:
          can(
            'apps.view',
          ),

        appsManage:
          can(
            'apps.manage',
          ),

        billingView:
          can(
            'billing.view',
          ),

        billingManage:
          can(
            'billing.manage',
          ),

        workspaceManage:
          can(
            'workspace.manage',
          ),

        settingsManage:
          can(
            'settings.manage',
          ),

        auditView:
          can(
            'audit.view',
          ),

        usageView:
          can(
            'usage.view',
          ),
      }}
    />
  );
}