import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';


export const SALES_ROUTE_VIEWS = [
  'overview',
  'pipeline',
  'customers',
  'quotes',
  'newQuote',
  'templates',
  'pdfBuilder',
  'catalogue',
  'pricelists',
  'advancedPricing',
  'currencies',
  'orders',
  'organization',
  'operations',
  'reports',
  'settings',
] as const;


export type SalesRouteView =
  typeof SALES_ROUTE_VIEWS[number];


type SalesCapabilities =
  SalesWorkspaceData['capabilities'];


type SalesCapabilityKey =
  keyof SalesCapabilities;


export type SalesNavigationGroup =
  | 'Overview'
  | 'Selling'
  | 'Commercial'
  | 'Operations'
  | 'Insights'
  | 'Configuration';


export type SalesNavigationMeta = {
  href: string;
  title: string;
  label: string;
  description: string;
  group: SalesNavigationGroup;
  capability: SalesCapabilityKey;
  sidebar: boolean;
  parentView?: SalesRouteView;
};


export const SALES_NAVIGATION:
  Record<
    SalesRouteView,
    SalesNavigationMeta
  > = {
    overview: {
      href:
        '/apps/sales',
      title:
        'Overview',
      label:
        'Overview',
      description:
        'Read quoted value, accepted business and overall sales momentum.',
      group:
        'Overview',
      capability:
        'canView',
      sidebar:
        true,
    },

    pipeline: {
      href:
        '/apps/sales/pipeline',
      title:
        'Pipeline',
      label:
        'Pipeline',
      description:
        'Work the pipeline board with configurable stages, probabilities and weighted value.',
      group:
        'Overview',
      capability:
        'canViewPipeline',
      sidebar:
        true,
    },

    customers: {
      href:
        '/apps/sales/customers',
      title:
        'Customers & contacts',
      label:
        'Customers & Contacts',
      description:
        'Maintain the shared customer master used by quotations, orders and invoicing.',
      group:
        'Selling',
      capability:
        'canUseBillingCustomers',
      sidebar:
        true,
    },

    quotes: {
      href:
        '/apps/sales/quotes',
      title:
        'Quotations',
      label:
        'Quotations',
      description:
        'Create, approve, send and convert quotations.',
      group:
        'Selling',
      capability:
        'canView',
      sidebar:
        true,
    },

    newQuote: {
      href:
        '/apps/sales/quotes/new',
      title:
        'Create quotation',
      label:
        'New Quotation',
      description:
        'Build a new quotation on a focused page.',
      group:
        'Selling',
      capability:
        'canCreate',
      sidebar:
        false,
      parentView:
        'quotes',
    },

    orders: {
      href:
        '/apps/sales/orders',
      title:
        'Sales orders',
      label:
        'Sales Orders',
      description:
        'Run fulfillment, delivery and invoice readiness for accepted business.',
      group:
        'Selling',
      capability:
        'canViewOrders',
      sidebar:
        true,
    },

    templates: {
      href:
        '/apps/sales/templates',
      title:
        'Quotation templates',
      label:
        'Quotation Templates',
      description:
        'Reusable quotation presentation and commercial defaults.',
      group:
        'Commercial',
      capability:
        'canManageSettings',
      sidebar:
        true,
    },

    pdfBuilder: {
      href:
        '/apps/sales/pdf-builder',
      title:
        'Quote / PDF builder',
      label:
        'Quote / PDF Builder',
      description:
        'Apply templates to drafts and open the server-generated PDF.',
      group:
        'Commercial',
      capability:
        'canView',
      sidebar:
        true,
    },

    catalogue: {
      href:
        '/apps/sales/catalogue',
      title:
        'Product catalogue',
      label:
        'Product Catalogue',
      description:
        'Products and services used by Sales quotations and invoices.',
      group:
        'Commercial',
      capability:
        'canUseCatalog',
      sidebar:
        true,
    },

    pricelists: {
      href:
        '/apps/sales/pricelists',
      title:
        'Pricelists',
      label:
        'Pricelists',
      description:
        'Customer scope, currency, validity and precedence.',
      group:
        'Commercial',
      capability:
        'canViewPricing',
      sidebar:
        true,
    },

    advancedPricing: {
      href:
        '/apps/sales/advanced-pricing',
      title:
        'Advanced pricing',
      label:
        'Advanced Pricing',
      description:
        'Product, quantity, discount and markup pricing rules.',
      group:
        'Commercial',
      capability:
        'canViewPricing',
      sidebar:
        true,
    },

    currencies: {
      href:
        '/apps/sales/currencies',
      title:
        'Currency & FX',
      label:
        'Currency & FX',
      description:
        'Dated exchange rates and base-currency exposure.',
      group:
        'Commercial',
      capability:
        'canViewPricing',
      sidebar:
        true,
    },

    organization: {
      href:
        '/apps/sales/organization',
      title:
        'Teams & performance',
      label:
        'Teams & Performance',
      description:
        'Territories, sales teams, targets and commission plans.',
      group:
        'Operations',
      capability:
        'canViewOrganization',
      sidebar:
        true,
    },

    operations: {
      href:
        '/apps/sales/operations',
      title:
        'Operations',
      label:
        'Operations',
      description:
        'Deposits, shipments, returns, refunds and revenue forecast.',
      group:
        'Operations',
      capability:
        'canViewOperations',
      sidebar:
        true,
    },

    reports: {
      href:
        '/apps/sales/reports',
      title:
        'Reports',
      label:
        'Reports',
      description:
        'Conversion, customer and monthly sales analysis.',
      group:
        'Insights',
      capability:
        'canViewReports',
      sidebar:
        true,
    },

    settings: {
      href:
        '/apps/sales/settings',
      title:
        'Settings',
      label:
        'Settings',
      description:
        'Sales policy, approvals and invoice behavior.',
      group:
        'Configuration',
      capability:
        'canManageSettings',
      sidebar:
        true,
    },
  };


export const SALES_SIDEBAR_VIEWS:
  SalesRouteView[] =
  SALES_ROUTE_VIEWS.filter(
    view =>
      SALES_NAVIGATION[
        view
      ].sidebar,
  );


export function canAccessSalesView(
  capabilities:
    SalesCapabilities,
  view:
    SalesRouteView,
) {
  const capability =
    SALES_NAVIGATION[
      view
    ].capability;

  return Boolean(
    capabilities[
      capability
    ],
  );
}


export function getSalesRoutePath(
  view:
    SalesRouteView,
) {
  return SALES_NAVIGATION[
    view
  ].href;
}


export function getSalesParentView(
  view:
    SalesRouteView,
) {
  return SALES_NAVIGATION[
    view
  ].parentView ||
    view;
}