import 'server-only';

import type {
  DashboardProvider,
} from '@/lib/dashboard/providers';

import {
  accountingDashboardAnalysisProvider,
  invoicingDashboardAnalysisProvider,
  salesDashboardAnalysisProvider,
} from '@/lib/dashboard/providers/business-analysis';

/*
 * App-owned Dashboard providers.
 * Current business apps use their standalone dashboards directly.
 * Future shared dashboard cards/providers register here.
 */
export const APP_RUNTIME_DASHBOARD_PROVIDERS:
  DashboardProvider[] = [
    accountingDashboardAnalysisProvider,
    invoicingDashboardAnalysisProvider,
    salesDashboardAnalysisProvider,
  ];
