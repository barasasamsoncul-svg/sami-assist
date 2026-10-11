import {
  notFound,
} from 'next/navigation';

import SalesModuleShell from '@/app/apps/sales/SalesModuleShell';
import SalesWorkspaceClient from '@/app/apps/sales/SalesWorkspaceClient';
import SalesManagementInsights from '@/app/apps/sales/SalesManagementInsights';
import SalesOpportunityFunnel from '@/app/apps/sales/SalesOpportunityFunnel';
import SalesPipelineOutcomes from '@/app/apps/sales/SalesPipelineOutcomes';
import SalesPipelineVelocity from '@/app/apps/sales/SalesPipelineVelocity';
import SalesActivityExecution from '@/app/apps/sales/SalesActivityExecution';
import SalesRepresentativePerformance from '@/app/apps/sales/SalesRepresentativePerformance';
import SalesLeadSourceEffectiveness from '@/app/apps/sales/SalesLeadSourceEffectiveness';
import { getSalesOpportunityFunnelData, getSalesOpportunityRiskQueue } from '@/lib/apps/sales/pipeline-funnel';
import { getSalesPipelineOutcomeReport } from '@/lib/apps/sales/pipeline-outcomes';
import { getSalesPipelineVelocityReport } from '@/lib/apps/sales/pipeline-velocity';
import { getSalesActivityExecutionReport } from '@/lib/apps/sales/activity-execution';
import { getSalesRepresentativePerformance } from '@/lib/apps/sales/representative-performance';
import { getSalesLeadSourceEffectiveness } from '@/lib/apps/sales/lead-source-effectiveness';
import { getSalesManagementInsights } from '@/lib/apps/sales/management-insights';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

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
  getWorkspaceNotificationSummary,
} from '@/lib/services/workspace-notifications';

import {
  getSalesWorkspaceData,
} from '@/lib/apps/sales/service';

import {
  canAccessSalesView,
  getSalesParentView,
  getSalesRoutePath,
  SALES_NAVIGATION,
  SALES_SIDEBAR_VIEWS,
  type SalesRouteView,
} from '@/lib/apps/sales/navigation';

export type {
  SalesRouteView,
} from '@/lib/apps/sales/navigation';


export function buildSalesSidebarItems(
  data:
    Awaited<
      ReturnType<
        typeof getSalesWorkspaceData
      >
    >,
) {
  const badges:
    Partial<
      Record<
        SalesRouteView,
        number
      >
    > = {
      quotes:
        data.quotes.length,
      orders:
        data.orders.length,
      customers:
        data.billingCustomers.length,
      templates:
        data.templates.length,
      catalogue:
        data.catalogItems.length,
      pricelists:
        data.pricelists.length,
    };

  return SALES_SIDEBAR_VIEWS
    .filter(
      view =>
        canAccessSalesView(
          data.capabilities,
          view,
        ),
    )
    .map(
      view => {
        const item =
          SALES_NAVIGATION[
            view
          ];

        return {
          key:
            view,
          label:
            item.label,
          href:
            item.href,
          description:
            item.description,
          sectionLabel:
            item.group,
          badge:
            badges[
              view
            ],
        };
      },
    );
}


export default async function SalesSectionPage({
  view,
}: {
  view:
    SalesRouteView;
}) {
  const currentPath =
    getSalesRoutePath(
      view,
    );

  const session =
    await requirePageSession(
      currentPath,
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

  if (
    !shell
      .accessibleModuleKeys
      .includes(
        'sales',
      )
  ) {
    notFound();
  }

  const [
    data,
    notificationResult,
  ] =
    await Promise.all([
      getSalesWorkspaceData(),

      getWorkspaceNotificationSummary()
        .catch(
          () => null,
        ),
    ]);

  if (
    !canAccessSalesView(
      data.capabilities,
      view,
    )
  ) {
    notFound();
  }

  const reportsAvailable = view === 'reports' && data.capabilities.canViewReports;
  const reportData = reportsAvailable
    ? await Promise.all([
        getSalesManagementInsights(),
        getSalesOpportunityFunnelData(),
        getSalesOpportunityRiskQueue(),
        getSalesPipelineOutcomeReport(),
        getSalesPipelineVelocityReport(),
        getSalesActivityExecutionReport(),
        getSalesRepresentativePerformance(),
        getSalesLeadSourceEffectiveness(),
      ])
    : null;
  const managementInsights = reportData?.[0] ?? null;
  const opportunityFunnel = reportData?.[1] ?? null;
  const opportunityRiskQueue = reportData?.[2] ?? null;
  const pipelineOutcomeReport = reportData?.[3] ?? null;
  const pipelineVelocityReport = reportData?.[4] ?? null;
  const activityExecutionReport = reportData?.[5] ?? null;
  const representativePerformance = reportData?.[6] ?? null;
  const leadSourceEffectiveness = reportData?.[7] ?? null;

  return (
    <SalesModuleShell
      user={
        session.user
      }
      tenant={
        accountContext.tenant
      }
      modules={
        shell.accessibleModules
      }
      appSidebarItems={
        buildSalesSidebarItems(
          data,
        )
      }
      activeSidebarKey={
        getSalesParentView(
          view,
        )
      }
      sidebarCapabilities={{
        aiEnabled:
          shell.aiAvailable,

        notificationsEnabled:
          permissionContext
            .permissionSet
            .has(
              SAMI_PERMISSIONS
                .NOTIFICATIONS_VIEW,
            ),
      }}
      unreadNotifications={
        notificationResult
          ?.unreadCount ||
        0
      }
      companyName={
        data.company.name
      }
    >
      {managementInsights && opportunityFunnel && opportunityRiskQueue && pipelineOutcomeReport && pipelineVelocityReport && activityExecutionReport && representativePerformance && leadSourceEffectiveness ? (
        <>
          <SalesManagementInsights
            data={managementInsights}
            currency={data.company.currency}
            metrics={{
              quoteCount: data.metrics.quoteCount,
              acceptedCount: data.metrics.acceptedCount,
              convertedCount: data.metrics.convertedCount,
            }}
          />
          <SalesOpportunityFunnel rows={opportunityFunnel} riskRows={opportunityRiskQueue} />
          <SalesPipelineOutcomes
            summaries={pipelineOutcomeReport.summaries}
            lossReasons={pipelineOutcomeReport.lossReasons}
          />
          <SalesPipelineVelocity transitions={pipelineVelocityReport.transitions} />
          <SalesActivityExecution report={activityExecutionReport} />
          <SalesRepresentativePerformance rows={representativePerformance.rows} />
          <SalesLeadSourceEffectiveness report={leadSourceEffectiveness} />
        </>
      ) : (
        <SalesWorkspaceClient
          initialData={data}
          initialView={view}
          userId={session.user.id}
        />
      )}
    </SalesModuleShell>
  );
}