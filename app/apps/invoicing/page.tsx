import {
  redirect,
} from 'next/navigation';

import InvoicingSectionPage from '@/app/apps/invoicing/InvoicingSectionPage';

import {
  getInvoicingRoutePath,
  INVOICING_ROUTE_VIEWS,
  type InvoicingRouteView,
} from '@/lib/apps/invoicing/navigation';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


const INVOICING_ROUTE_VIEW_SET =
  new Set<string>(
    INVOICING_ROUTE_VIEWS,
  );


function isInvoicingRouteView(
  value:
    string,
): value is InvoicingRouteView {
  return INVOICING_ROUTE_VIEW_SET
    .has(
      value,
    );
}


export default async function InvoicingPage({
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
      'dashboard' &&
    isInvoicingRouteView(
      legacyView,
    )
  ) {
    redirect(
      getInvoicingRoutePath(
        legacyView,
      ),
    );
  }

  return (
    <InvoicingSectionPage
      view="dashboard"
    />
  );
}
