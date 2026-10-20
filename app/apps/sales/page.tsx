import { redirect } from 'next/navigation';

import SalesSectionPage from '@/app/apps/sales/SalesSectionPage';

import {
  getSalesRoutePath,
  SALES_ROUTE_VIEWS,
  type SalesRouteView,
} from '@/lib/apps/sales/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sales landing page.
 *
 * Responsibilities (and nothing else):
 *   1. Translate legacy `?view=<SalesRouteView>` URLs to the canonical route.
 *   2. Render the overview.
 *
 * Anything heavier (data fetch, auth gates, module guards) belongs in
 * `SalesSectionPage` or the layout — not here.
 */

const SALES_ROUTE_VIEW_SET = new Set<string>(SALES_ROUTE_VIEWS);

function isSalesRouteView(value: string): value is SalesRouteView {
  return SALES_ROUTE_VIEW_SET.has(value);
}

/** Pull the first value out of Next's `string | string[]` searchParams. */
function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

type SalesPageSearchParams = {
  view?: string | string[];
};

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SalesPageSearchParams>;
}) {
  const query = await searchParams;
  const legacyView = firstValue(query.view);

  // Redirect legacy `?view=` deep links to their canonical route.
  // `overview` is the default view and lives at this path — don't redirect to itself.
  if (legacyView && legacyView !== 'overview' && isSalesRouteView(legacyView)) {
    redirect(getSalesRoutePath(legacyView));
  }

  return <SalesSectionPage view="overview" />;
}