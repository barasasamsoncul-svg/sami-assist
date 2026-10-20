import type { SalesWorkspaceData } from '@/lib/apps/sales/types';

/* -------------------------------------------------------------------------- */
/*  Route views                                                               */
/* -------------------------------------------------------------------------- */

export const SALES_ROUTE_VIEWS = [
  'overview',
  'pipeline',
  'opportunities',
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
  'approvals',
  'settings',
] as const;

export type SalesRouteView = (typeof SALES_ROUTE_VIEWS)[number];

const SALES_ROUTE_VIEW_SET: ReadonlySet<string> = new Set(SALES_ROUTE_VIEWS);

export function isSalesRouteView(value: string): value is SalesRouteView {
  return SALES_ROUTE_VIEW_SET.has(value);
}

/* -------------------------------------------------------------------------- */
/*  Navigation types                                                          */
/* -------------------------------------------------------------------------- */

type SalesCapabilities = SalesWorkspaceData['capabilities'];
type SalesCapabilityKey = keyof SalesCapabilities;

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
  /** Optional — icon key resolved by the shell's icon registry. */
  icon?: string;
};

/* -------------------------------------------------------------------------- */
/*  Navigation table                                                          */
/* -------------------------------------------------------------------------- */

export const SALES_NAVIGATION: Record<SalesRouteView, SalesNavigationMeta> = {
  overview: {
    href: '/apps/sales',
    title: 'Overview',
    label: 'Overview',
    description: 'Read quoted value, accepted business and overall sales momentum.',
    group: 'Overview',
    capability: 'canView',
    sidebar: true,
    icon: 'layout-dashboard',
  },

  pipeline: {
    href: '/apps/sales/pipeline',
    title: 'Pipeline',
    label: 'Pipeline',
    description:
      'Work the pipeline board with configurable stages, probabilities and weighted value.',
    group: 'Overview',
    capability: 'canViewPipeline',
    sidebar: true,
    icon: 'kanban-square',
  },

  opportunities: {
    href: '/apps/sales/opportunities',
    title: 'Leads & Opportunities',
    label: 'Leads & Opportunities',
    description:
      'Qualify leads, track opportunities and create quotations without losing customer context.',
    group: 'Overview',
    capability: 'canViewPipeline',
    sidebar: true,
    icon: 'target',
  },

  customers: {
    href: '/apps/sales/customers',
    title: 'Customers & contacts',
    label: 'Customers & Contacts',
    description:
      'Maintain the shared customer master used by quotations, orders and invoicing.',
    group: 'Selling',
    capability: 'canUseBillingCustomers',
    sidebar: true,
    icon: 'users',
  },

  quotes: {
    href: '/apps/sales/quotes',
    title: 'Quotations',
    label: 'Quotations',
    description: 'Create, approve, send and convert quotations.',
    group: 'Selling',
    capability: 'canView',
    sidebar: true,
    icon: 'file-text',
  },

  newQuote: {
    href: '/apps/sales/quotes/new',
    title: 'Create quotation',
    label: 'New Quotation',
    description: 'Build a new quotation on a focused page.',
    group: 'Selling',
    capability: 'canCreate',
    sidebar: false,
    parentView: 'quotes',
    icon: 'file-plus',
  },

  orders: {
    href: '/apps/sales/orders',
    title: 'Sales orders',
    label: 'Sales Orders',
    description: 'Run fulfillment, delivery and invoice readiness for accepted business.',
    group: 'Selling',
    capability: 'canViewOrders',
    sidebar: true,
    icon: 'shopping-cart',
  },

  templates: {
    href: '/apps/sales/templates',
    title: 'Quotation templates',
    label: 'Quotation Templates',
    description: 'Reusable quotation presentation and commercial defaults.',
    group: 'Commercial',
    capability: 'canManageSettings',
    sidebar: true,
    icon: 'layout-template',
  },

  pdfBuilder: {
    href: '/apps/sales/pdf-builder',
    title: 'Quote / PDF builder',
    label: 'Quote / PDF Builder',
    description: 'Apply templates to drafts and open the server-generated PDF.',
    group: 'Commercial',
    capability: 'canView',
    sidebar: true,
    icon: 'file-output',
  },

  catalogue: {
    href: '/apps/sales/catalogue',
    title: 'Product catalogue',
    label: 'Product Catalogue',
    description: 'Products and services used by Sales quotations and invoices.',
    group: 'Commercial',
    capability: 'canUseCatalog',
    sidebar: true,
    icon: 'package',
  },

  pricelists: {
    href: '/apps/sales/pricelists',
    title: 'Pricelists',
    label: 'Pricelists',
    description: 'Customer scope, currency, validity and precedence.',
    group: 'Commercial',
    capability: 'canViewPricing',
    sidebar: true,
    icon: 'tags',
  },

  advancedPricing: {
    href: '/apps/sales/advanced-pricing',
    title: 'Advanced pricing',
    label: 'Advanced Pricing',
    description: 'Product, quantity, discount and markup pricing rules.',
    group: 'Commercial',
    capability: 'canViewPricing',
    sidebar: true,
    icon: 'percent',
  },

  currencies: {
    href: '/apps/sales/currencies',
    title: 'Currency & FX',
    label: 'Currency & FX',
    description: 'Dated exchange rates and base-currency exposure.',
    group: 'Commercial',
    capability: 'canViewPricing',
    sidebar: true,
    icon: 'coins',
  },

  organization: {
    href: '/apps/sales/organization',
    title: 'Teams & performance',
    label: 'Teams & Performance',
    description: 'Territories, sales teams, targets and commission plans.',
    group: 'Operations',
    capability: 'canViewOrganization',
    sidebar: true,
    icon: 'building-2',
  },

  operations: {
    href: '/apps/sales/operations',
    title: 'Operations',
    label: 'Operations',
    description: 'Deposits, shipments, returns, refunds and revenue forecast.',
    group: 'Operations',
    capability: 'canViewOperations',
    sidebar: true,
    icon: 'truck',
  },

  reports: {
    href: '/apps/sales/reports',
    title: 'Reports',
    label: 'Reports',
    description: 'Conversion, customer and monthly sales analysis.',
    group: 'Insights',
    capability: 'canViewReports',
    sidebar: true,
    icon: 'bar-chart-3',
  },

  approvals: {
    href: '/apps/sales/approvals',
    title: 'Quotation approval policies',
    label: 'Quote Approvals',
    description: 'Configure sequential review rules and process pending quotations.',
    group: 'Configuration',
    capability: 'canManageSettings',
    sidebar: true,
    icon: 'shield-check',
  },

  settings: {
    href: '/apps/sales/settings',
    title: 'Settings',
    label: 'Settings',
    description: 'Sales policy, approvals and invoice behavior.',
    group: 'Configuration',
    capability: 'canManageSettings',
    sidebar: true,
    icon: 'settings',
  },
};

/* -------------------------------------------------------------------------- */
/*  Derived exports                                                           */
/* -------------------------------------------------------------------------- */

export const SALES_SIDEBAR_VIEWS: SalesRouteView[] = SALES_ROUTE_VIEWS.filter(
  (view) => SALES_NAVIGATION[view].sidebar,
);

export const SALES_NAVIGATION_GROUP_ORDER: SalesNavigationGroup[] = [
  'Overview',
  'Selling',
  'Commercial',
  'Operations',
  'Insights',
  'Configuration',
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

export function canAccessSalesView(
  capabilities: SalesCapabilities,
  view: SalesRouteView,
): boolean {
  const capability = SALES_NAVIGATION[view].capability;
  return Boolean(capabilities[capability]);
}

export function getSalesRoutePath(view: SalesRouteView): string {
  return SALES_NAVIGATION[view].href;
}

export function getSalesParentView(view: SalesRouteView): SalesRouteView {
  return SALES_NAVIGATION[view].parentView ?? view;
}

/** Resolve a route view from a pathname (e.g. `/apps/sales/quotes/new` → `newQuote`). */
export function salesViewFromPathname(pathname: string): SalesRouteView | null {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  let best: SalesRouteView | null = null;
  let bestLength = -1;
  for (const view of SALES_ROUTE_VIEWS) {
    const href = SALES_NAVIGATION[view].href.replace(/\/+$/, '') || '/';
    if (normalized === href && href.length > bestLength) {
      best = view;
      bestLength = href.length;
    }
  }
  return best;
}

/** Grouped sidebar, sorted by `SALES_NAVIGATION_GROUP_ORDER`. */
export function buildSalesSidebarGroups(
  capabilities: SalesCapabilities,
): Array<{
  group: SalesNavigationGroup;
  items: Array<SalesNavigationMeta & { key: SalesRouteView }>;
}> {
  const buckets = new Map<SalesNavigationGroup, Array<SalesNavigationMeta & { key: SalesRouteView }>>();

  for (const view of SALES_SIDEBAR_VIEWS) {
    if (!canAccessSalesView(capabilities, view)) continue;
    const meta = SALES_NAVIGATION[view];
    const list = buckets.get(meta.group) ?? [];
    list.push({ ...meta, key: view });
    buckets.set(meta.group, list);
  }

  return SALES_NAVIGATION_GROUP_ORDER.filter((group) => buckets.has(group)).map(
    (group) => ({ group, items: buckets.get(group)! }),
  );
}