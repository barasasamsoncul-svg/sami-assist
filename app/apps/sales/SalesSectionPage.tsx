import {
  notFound,
} from 'next/navigation';

import SalesModuleShell from '@/app/apps/sales/SalesModuleShell';
import SalesWorkspaceClient from '@/app/apps/sales/SalesWorkspaceClient';
import SalesApprovalsManager from '@/app/apps/sales/SalesApprovalsManager';
import SalesManagementInsights from '@/app/apps/sales/SalesManagementInsights';
import SalesOpportunityFunnel from '@/app/apps/sales/SalesOpportunityFunnel';
import SalesPipelineOutcomes from '@/app/apps/sales/SalesPipelineOutcomes';
import SalesPipelineVelocity from '@/app/apps/sales/SalesPipelineVelocity';
import SalesActivityExecution from '@/app/apps/sales/SalesActivityExecution';
import SalesRepresentativePerformance from '@/app/apps/sales/SalesRepresentativePerformance';
import SalesLeadSourceEffectiveness from '@/app/apps/sales/SalesLeadSourceEffectiveness';
import SalesCommissionPerformance from '@/app/apps/sales/SalesCommissionPerformance';
import SalesProductPerformance from '@/app/apps/sales/SalesProductPerformance';
import SalesReturnFulfillmentQuality from '@/app/apps/sales/SalesReturnFulfillmentQuality';
import SalesTargetAttainmentReport from '@/app/apps/sales/SalesTargetAttainmentReport';
import SalesQuotationEffectiveness from '@/app/apps/sales/SalesQuotationEffectiveness';
import SalesCommercialMarginQuality from '@/app/apps/sales/SalesCommercialMarginQuality';
import { getSalesOpportunityFunnelData, getSalesOpportunityRiskQueue } from '@/lib/apps/sales/pipeline-funnel';
import { getSalesPipelineOutcomeReport } from '@/lib/apps/sales/pipeline-outcomes';
import { getSalesPipelineVelocityReport } from '@/lib/apps/sales/pipeline-velocity';
import { getSalesActivityExecutionReport } from '@/lib/apps/sales/activity-execution';
import { getSalesRepresentativePerformance } from '@/lib/apps/sales/representative-performance';
import { getSalesLeadSourceEffectiveness } from '@/lib/apps/sales/lead-source-effectiveness';
import { getSalesCommissionPerformance } from '@/lib/apps/sales/commission-performance';
import { getSalesProductPerformance } from '@/lib/apps/sales/product-performance';
import { getSalesReturnFulfillmentQualityReport } from '@/lib/apps/sales/return-fulfillment-quality';
import { getSalesTargetAttainmentReport } from '@/lib/apps/sales/target-attainment-report';
import { getSalesQuotationEffectivenessReport } from '@/lib/apps/sales/quotation-effectiveness';
import { getSalesCommercialMarginQualityReport } from '@/lib/apps/sales/commercial-margin-quality';
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

function ReportUnavailable({
  name,
}: {
  name: string;
}) {
  return (
    <section
      role="status"
      className="sami-surface rounded-[24px] border border-dashed border-[var(--sami-border)] p-4 sm:p-5"
    >
      <p className="text-sm font-black">{name} unavailable</p>
      <p className="mt-1 text-xs text-slate-500">
        This report could not be loaded. Other Sales reports remain available.
      </p>
    </section>
  );
}


function settledReportValue<T>(
  result: PromiseSettledResult<T> | undefined,
  name: string,
): T | null {
  if (!result) {
    return null;
  }

  if (result.status === 'rejected') {
    console.error('[SaMi Sales] Report failed to load: ' + name, result.reason);
    return null;
  }

  return result.value;
}


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
    ? await Promise.allSettled([
        getSalesManagementInsights(),
        getSalesOpportunityFunnelData(),
        getSalesOpportunityRiskQueue(),
        getSalesPipelineOutcomeReport(),
        getSalesPipelineVelocityReport(),
        getSalesActivityExecutionReport(),
        getSalesRepresentativePerformance(),
        getSalesLeadSourceEffectiveness(),
        getSalesCommissionPerformance(),
        getSalesProductPerformance(),
        getSalesReturnFulfillmentQualityReport(),
        getSalesTargetAttainmentReport(),
        getSalesQuotationEffectivenessReport(),
        getSalesCommercialMarginQualityReport(),
      ] as const)
    : null;
  const managementInsights = settledReportValue(reportData?.[0], 'Management insights');
  const opportunityFunnel = settledReportValue(reportData?.[1], 'Opportunity funnel');
  const opportunityRiskQueue = settledReportValue(reportData?.[2], 'Opportunity risk queue');
  const pipelineOutcomeReport = settledReportValue(reportData?.[3], 'Pipeline outcomes');
  const pipelineVelocityReport = settledReportValue(reportData?.[4], 'Pipeline velocity');
  const activityExecutionReport = settledReportValue(reportData?.[5], 'Activity execution');
  const representativePerformance = settledReportValue(reportData?.[6], 'Representative performance');
  const leadSourceEffectiveness = settledReportValue(reportData?.[7], 'Lead source effectiveness');
  const commissionPerformance = settledReportValue(reportData?.[8], 'Commission performance');
  const productPerformance = settledReportValue(reportData?.[9], 'Product performance');
  const returnFulfillmentQuality = settledReportValue(reportData?.[10], 'Return fulfillment quality');
  const targetAttainmentReport = settledReportValue(reportData?.[11], 'Target attainment');
  const quotationEffectiveness = settledReportValue(reportData?.[12], 'Quotation effectiveness');
  const commercialMarginQuality = settledReportValue(reportData?.[13], 'Commercial margin quality');

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
      {view === 'approvals' ? (
        <SalesApprovalsManager />
      ) : reportsAvailable ? (
        <>
          {managementInsights ? (
            <SalesManagementInsights
              data={managementInsights}
              currency={data.company.currency}
              metrics={{
                quoteCount: data.metrics.quoteCount,
                acceptedCount: data.metrics.acceptedCount,
                convertedCount: data.metrics.convertedCount,
              }}
            />
          ) : (
            <ReportUnavailable name="Management insights" />
          )}

          {opportunityFunnel && opportunityRiskQueue ? (
            <SalesOpportunityFunnel rows={opportunityFunnel} riskRows={opportunityRiskQueue} />
          ) : (
            <ReportUnavailable name="Opportunity funnel and risk queue" />
          )}

          {pipelineOutcomeReport ? (
            <SalesPipelineOutcomes
              summaries={pipelineOutcomeReport.summaries}
              lossReasons={pipelineOutcomeReport.lossReasons}
            />
          ) : (
            <ReportUnavailable name="Pipeline outcomes" />
          )}

          {pipelineVelocityReport ? (
            <SalesPipelineVelocity transitions={pipelineVelocityReport.transitions} />
          ) : (
            <ReportUnavailable name="Pipeline velocity" />
          )}

          {activityExecutionReport ? (
            <SalesActivityExecution report={activityExecutionReport} />
          ) : (
            <ReportUnavailable name="Activity execution" />
          )}

          {representativePerformance ? (
            <SalesRepresentativePerformance rows={representativePerformance.rows} />
          ) : (
            <ReportUnavailable name="Representative performance" />
          )}

          {leadSourceEffectiveness ? (
            <SalesLeadSourceEffectiveness report={leadSourceEffectiveness} />
          ) : (
            <ReportUnavailable name="Lead source effectiveness" />
          )}

          {commissionPerformance ? (
            <SalesCommissionPerformance rows={commissionPerformance.rows} />
          ) : (
            <ReportUnavailable name="Commission performance" />
          )}

          {productPerformance ? (
            <SalesProductPerformance rows={productPerformance.rows} />
          ) : (
            <ReportUnavailable name="Product performance" />
          )}

          {returnFulfillmentQuality ? (
            <SalesReturnFulfillmentQuality report={returnFulfillmentQuality} />
          ) : (
            <ReportUnavailable name="Return fulfillment quality" />
          )}

          {targetAttainmentReport ? (
            <SalesTargetAttainmentReport report={targetAttainmentReport} />
          ) : (
            <ReportUnavailable name="Target attainment" />
          )}

          {quotationEffectiveness ? (
            <SalesQuotationEffectiveness report={quotationEffectiveness} />
          ) : (
            <ReportUnavailable name="Quotation effectiveness" />
          )}

          {commercialMarginQuality ? (
            <SalesCommercialMarginQuality report={commercialMarginQuality} />
          ) : (
            <ReportUnavailable name="Commercial margin quality" />
          )}
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