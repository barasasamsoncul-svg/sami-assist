import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import SalesModuleShell from '@/app/apps/sales/SalesModuleShell';
import SalesWorkspaceClient from '@/app/apps/sales/SalesWorkspaceClient';
import SalesQuoteDetailClient from '@/app/apps/sales/SalesQuoteDetailClient';
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

import { getAccountContextForUser } from '@/lib/auth/account-context';
import { getPermissionContext } from '@/lib/auth/permission-context';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { requirePageSession } from '@/lib/auth/require-page-session';
import { resolveWorkspaceShellAccess } from '@/lib/auth/workspace-shell';
import { getWorkspaceNotificationSummary } from '@/lib/services/workspace-notifications';
import { getSalesQuoteDetail, getSalesWorkspaceData } from '@/lib/apps/sales/service';
import {
  canAccessSalesView,
  getSalesParentView,
  getSalesRoutePath,
  SALES_NAVIGATION,
  SALES_SIDEBAR_VIEWS,
  type SalesRouteView,
} from '@/lib/apps/sales/navigation';

export type { SalesRouteView } from '@/lib/apps/sales/navigation';

type SalesWorkspaceData = Awaited<ReturnType<typeof getSalesWorkspaceData>>;

/* -------------------------------------------------------------------------- */
/*  UI: report placeholder                                                    */
/* -------------------------------------------------------------------------- */

function ReportUnavailable({ name }: { name: string }) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5 dark:border-slate-700 dark:bg-slate-900/40"
    >
      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
        {name} unavailable
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        This report could not be loaded. Other Sales reports remain available.
      </p>
    </section>
  );
}

function ReportSectionSkeleton({ name }: { name: string }) {
  return (
    <section
      aria-busy="true"
      aria-label={`Loading ${name}`}
      className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="h-3 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-3 h-2.5 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
      <div className="mt-2 h-2.5 w-1/2 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function settledReportValue<T>(promise: Promise<T>, name: string): Promise<T | null> {
  try {
    return await promise;
  } catch (reason) {
    console.error('[SaMi Sales] Report failed to load: ' + name, reason);
    return null;
  }
}

export function buildSalesSidebarItems(data: SalesWorkspaceData) {
  const badges: Partial<Record<SalesRouteView, number>> = {
    quotes: data.quotes.length,
    orders: data.orders.length,
    customers: data.billingCustomers.length,
    templates: data.templates.length,
    catalogue: data.catalogItems.length,
    pricelists: data.pricelists.length,
  };

  return SALES_SIDEBAR_VIEWS.filter((view) =>
    canAccessSalesView(data.capabilities, view),
  ).map((view) => {
    const item = SALES_NAVIGATION[view];
    return {
      key: view,
      label: item.label,
      href: item.href,
      description: item.description,
      sectionLabel: item.group,
      badge: badges[view],
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Reports block                                                             */
/* -------------------------------------------------------------------------- */

async function SalesReportsBlock({
  currency,
  metrics,
}: {
  currency: string;
  metrics: {
    quoteCount: number;
    acceptedCount: number;
    convertedCount: number;
  };
}) {
  const [
    managementInsights,
    opportunityFunnel,
    opportunityRiskQueue,
    pipelineOutcomeReport,
    pipelineVelocityReport,
    activityExecutionReport,
    representativePerformance,
    leadSourceEffectiveness,
    commissionPerformance,
    productPerformance,
    returnFulfillmentQuality,
    targetAttainmentReport,
    quotationEffectiveness,
    commercialMarginQuality,
  ] = await Promise.all([
    settledReportValue(getSalesManagementInsights(), 'Management insights'),
    settledReportValue(getSalesOpportunityFunnelData(), 'Opportunity funnel'),
    settledReportValue(getSalesOpportunityRiskQueue(), 'Opportunity risk queue'),
    settledReportValue(getSalesPipelineOutcomeReport(), 'Pipeline outcomes'),
    settledReportValue(getSalesPipelineVelocityReport(), 'Pipeline velocity'),
    settledReportValue(getSalesActivityExecutionReport(), 'Activity execution'),
    settledReportValue(getSalesRepresentativePerformance(), 'Representative performance'),
    settledReportValue(getSalesLeadSourceEffectiveness(), 'Lead source effectiveness'),
    settledReportValue(getSalesCommissionPerformance(), 'Commission performance'),
    settledReportValue(getSalesProductPerformance(), 'Product performance'),
    settledReportValue(getSalesReturnFulfillmentQualityReport(), 'Return fulfillment quality'),
    settledReportValue(getSalesTargetAttainmentReport(), 'Target attainment'),
    settledReportValue(getSalesQuotationEffectivenessReport(), 'Quotation effectiveness'),
    settledReportValue(getSalesCommercialMarginQualityReport(), 'Commercial margin quality'),
  ]);

  return (
    <div className="space-y-6">
      <Suspense fallback={<ReportSectionSkeleton name="Management insights" />}>
        {managementInsights ? (
          <SalesManagementInsights
            data={managementInsights}
            currency={currency}
            metrics={metrics}
          />
        ) : (
          <ReportUnavailable name="Management insights" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Opportunity funnel" />}>
        {opportunityFunnel && opportunityRiskQueue ? (
          <SalesOpportunityFunnel
            rows={opportunityFunnel.rows}
            riskRows={opportunityRiskQueue.rows}
          />
        ) : (
          <ReportUnavailable name="Opportunity funnel and risk queue" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Pipeline outcomes" />}>
        {pipelineOutcomeReport ? (
          <SalesPipelineOutcomes
            summaries={pipelineOutcomeReport.summaries}
            lossReasons={pipelineOutcomeReport.lossReasons}
          />
        ) : (
          <ReportUnavailable name="Pipeline outcomes" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Pipeline velocity" />}>
        {pipelineVelocityReport ? (
          <SalesPipelineVelocity transitions={pipelineVelocityReport.transitions} />
        ) : (
          <ReportUnavailable name="Pipeline velocity" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Activity execution" />}>
        {activityExecutionReport ? (
          <SalesActivityExecution report={activityExecutionReport} />
        ) : (
          <ReportUnavailable name="Activity execution" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Representative performance" />}>
        {representativePerformance ? (
          <SalesRepresentativePerformance rows={representativePerformance.rows} />
        ) : (
          <ReportUnavailable name="Representative performance" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Lead source effectiveness" />}>
        {leadSourceEffectiveness ? (
          <SalesLeadSourceEffectiveness report={leadSourceEffectiveness} />
        ) : (
          <ReportUnavailable name="Lead source effectiveness" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Commission performance" />}>
        {commissionPerformance ? (
          <SalesCommissionPerformance rows={commissionPerformance.rows} />
        ) : (
          <ReportUnavailable name="Commission performance" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Product performance" />}>
        {productPerformance ? (
          <SalesProductPerformance rows={productPerformance.rows} />
        ) : (
          <ReportUnavailable name="Product performance" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Return fulfillment quality" />}>
        {returnFulfillmentQuality ? (
          <SalesReturnFulfillmentQuality report={returnFulfillmentQuality} />
        ) : (
          <ReportUnavailable name="Return fulfillment quality" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Target attainment" />}>
        {targetAttainmentReport ? (
          <SalesTargetAttainmentReport report={targetAttainmentReport} />
        ) : (
          <ReportUnavailable name="Target attainment" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Quotation effectiveness" />}>
        {quotationEffectiveness ? (
          <SalesQuotationEffectiveness report={quotationEffectiveness} />
        ) : (
          <ReportUnavailable name="Quotation effectiveness" />
        )}
      </Suspense>

      <Suspense fallback={<ReportSectionSkeleton name="Commercial margin quality" />}>
        {commercialMarginQuality ? (
          <SalesCommercialMarginQuality report={commercialMarginQuality} />
        ) : (
          <ReportUnavailable name="Commercial margin quality" />
        )}
      </Suspense>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default async function SalesSectionPage({
  view,
  quoteId,
}: {
  view: SalesRouteView;
  quoteId?: string;
}) {
  const currentPath = quoteId
    ? '/apps/sales/quotes/' + quoteId
    : getSalesRoutePath(view);

  const session = await requirePageSession(currentPath);

  const [accountContext, permissionContext] = await Promise.all([
    getAccountContextForUser(session.user.id, session.currentTenantId),
    getPermissionContext(),
  ]);

  const shell = resolveWorkspaceShellAccess({
    modules: accountContext.modules,
    subscription: accountContext.subscription,
    permissions: permissionContext,
  });

  if (!shell.accessibleModuleKeys.includes('sales')) {
    notFound();
  }

  const [data, notificationResult] = await Promise.all([
    getSalesWorkspaceData(),
    getWorkspaceNotificationSummary().catch(() => null),
  ]);

  if (!canAccessSalesView(data.capabilities, view)) {
    notFound();
  }

  // ------------------------------------------------------------------------
  // Quote detail — one shell mount, one sidebar, same convention as siblings.
  // ------------------------------------------------------------------------
  if (quoteId) {
    const quote = await getSalesQuoteDetail(quoteId);

    if (!quote) {
      notFound();
    }

    return (
      <SalesModuleShell
        user={session.user}
        tenant={accountContext.tenant}
        modules={shell.accessibleModules}
        appSidebarItems={buildSalesSidebarItems(data)}
        activeSidebarKey={getSalesParentView(view)}
        sidebarCapabilities={{
          aiEnabled: shell.aiAvailable,
          notificationsEnabled: permissionContext.permissionSet.has(
            SAMI_PERMISSIONS.NOTIFICATIONS_VIEW,
          ),
        }}
        unreadNotifications={notificationResult?.unreadCount || 0}
        companyName={data.company.name}
      >
        <SalesQuoteDetailClient quote={quote} workspace={data} />
      </SalesModuleShell>
    );
  }

  const reportsAvailable = view === 'reports' && data.capabilities.canViewReports;

  return (
    <SalesModuleShell
      user={session.user}
      tenant={accountContext.tenant}
      modules={shell.accessibleModules}
      appSidebarItems={buildSalesSidebarItems(data)}
      activeSidebarKey={getSalesParentView(view)}
      sidebarCapabilities={{
        aiEnabled: shell.aiAvailable,
        notificationsEnabled: permissionContext.permissionSet.has(
          SAMI_PERMISSIONS.NOTIFICATIONS_VIEW,
        ),
      }}
      unreadNotifications={notificationResult?.unreadCount || 0}
      companyName={data.company.name}
    >
      {view === 'approvals' ? (
        <SalesApprovalsManager />
      ) : reportsAvailable ? (
        <Suspense
          fallback={
            <div className="space-y-6">
              <ReportSectionSkeleton name="Sales reports" />
            </div>
          }
        >
          <SalesReportsBlock
            currency={data.company.currency}
            metrics={{
              quoteCount: data.metrics.quoteCount,
              acceptedCount: data.metrics.acceptedCount,
              convertedCount: data.metrics.convertedCount,
            }}
          />
        </Suspense>
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