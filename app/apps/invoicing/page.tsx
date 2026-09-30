import {
  redirect,
} from 'next/navigation';

import InvoicingRoutePage, {
  type InvoicingRouteView,
} from '@/app/apps/invoicing/InvoicingRoutePage';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


const LEGACY_VIEW_PATHS:
  Record<
    string,
    string
  > = {
    dashboard:
      '/apps/invoicing',
    newInvoice:
      '/apps/invoicing/new',
    invoices:
      '/apps/invoicing/invoices',
    customers:
      '/apps/invoicing/customers',
    items:
      '/apps/invoicing/items',
    payments:
      '/apps/invoicing/payments',
    currencies:
      '/apps/invoicing/currencies',
    taxEngine:
      '/apps/invoicing/tax-engine',
    retainers:
      '/apps/invoicing/retainers',
    paymentPlans:
      '/apps/invoicing/payment-plans',
    recurring:
      '/apps/invoicing/recurring',
    reminders:
      '/apps/invoicing/reminders',
    portal:
      '/apps/invoicing/portal',
    reports:
      '/apps/invoicing/reports',
    settings:
      '/apps/invoicing/settings',
  };


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
    LEGACY_VIEW_PATHS[
      legacyView
    ]
  ) {
    redirect(
      LEGACY_VIEW_PATHS[
        legacyView
      ],
    );
  }

  return (
    <InvoicingRoutePage
      view={
        'dashboard' satisfies
          InvoicingRouteView
      }
    />
  );
}
