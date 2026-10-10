import {
  redirect,
} from 'next/navigation';

import SalesSectionPage from '@/app/apps/sales/SalesSectionPage';

import {
  getSalesRoutePath,
  SALES_ROUTE_VIEWS,
  type SalesRouteView,
} from '@/lib/apps/sales/navigation';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


const SALES_ROUTE_VIEW_SET =
  new Set<string>(
    SALES_ROUTE_VIEWS,
  );


function isSalesRouteView(
  value:
    string,
): value is SalesRouteView {
  return SALES_ROUTE_VIEW_SET
    .has(
      value,
    );
}


export default async function SalesPage({
  searchParams,
}: {
  searchParams:
    Promise<{
      view?:
        string |
        string[];
    }>;
}) {
  const query =
    await searchParams;

  const legacyView =
    Array.isArray(
      query.view,
    )
      ? query.view[0]
      : query.view;

  if (
    legacyView &&
    legacyView !==
      'overview' &&
    isSalesRouteView(
      legacyView,
    )
  ) {
    redirect(
      getSalesRoutePath(
        legacyView,
      ),
    );
  }

  return (
    <SalesSectionPage
      view="overview"
    />
  );
}