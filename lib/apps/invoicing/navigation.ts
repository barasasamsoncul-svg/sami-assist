import type {
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';


export const INVOICING_ROUTE_VIEWS = [
  'dashboard',
  'newInvoice',
  'invoices',
  'newCustomer',
  'customers',
  'newItem',
  'items',
  'receivePayment',
  'payments',
  'paymentIntegrations',
  'currencies',
  'taxEngine',
  'etims',
  'eInvoicing',
  'retainers',
  'paymentPlans',
  'recurring',
  'reminders',
  'portal',
  'reports',
  'settings',
] as const;


export type InvoicingRouteView =
  typeof INVOICING_ROUTE_VIEWS[number];


type InvoicingCapabilities =
  InvoicingWorkspaceData['capabilities'];


type InvoicingCapabilityKey =
  keyof InvoicingCapabilities;


export type InvoicingNavigationGroup =
  | 'Overview'
  | 'Billing'
  | 'Money'
  | 'Compliance'
  | 'Automation'
  | 'Insights'
  | 'Configuration';


export type InvoicingNavigationMeta = {
  href: string;
  title: string;
  label: string;
  description: string;
  group: InvoicingNavigationGroup;
  capability: InvoicingCapabilityKey;
  sidebar: boolean;
  parentView?: InvoicingRouteView;
};


export const INVOICING_NAVIGATION:
  Record<
    InvoicingRouteView,
    InvoicingNavigationMeta
  > = {
    dashboard: {
      href:
        '/apps/invoicing',
      title:
        'Overview',
      label:
        'Overview',
      description:
        'See receivables, collections, overdue balances and the health of customer billing.',
      group:
        'Overview',
      capability:
        'canView',
      sidebar:
        true,
    },

    newInvoice: {
      href:
        '/apps/invoicing/new',
      title:
        'Create invoice',
      label:
        'New Invoice',
      description:
        'Create one invoice without the invoice register competing for space on the same page.',
      group:
        'Billing',
      capability:
        'canCreate',
      sidebar:
        true,
      parentView:
        'invoices',
    },

    invoices: {
      href:
        '/apps/invoicing/invoices',
      title:
        'Invoice register',
      label:
        'Invoice Register',
      description:
        'Search, filter, export and open existing invoices without the invoice composer stacked above the register.',
      group:
        'Billing',
      capability:
        'canView',
      sidebar:
        true,
    },

    newCustomer: {
      href:
        '/apps/invoicing/customers/new',
      title:
        'New customer',
      label:
        'New Customer',
      description:
        'Create one billing customer on a focused page.',
      group:
        'Billing',
      capability:
        'canManageCustomers',
      sidebar:
        false,
      parentView:
        'customers',
    },

    customers: {
      href:
        '/apps/invoicing/customers',
      title:
        'Customers',
      label:
        'Customers',
      description:
        'Maintain billing identities, contacts, tax details, payment terms and customer status safely.',
      group:
        'Billing',
      capability:
        'canViewCustomers',
      sidebar:
        true,
    },

    newItem: {
      href:
        '/apps/invoicing/items/new',
      title:
        'New item',
      label:
        'New Item',
      description:
        'Create one product or service billing item without the item register below it.',
      group:
        'Billing',
      capability:
        'canManageCatalog',
      sidebar:
        false,
      parentView:
        'items',
    },

    items: {
      href:
        '/apps/invoicing/items',
      title:
        'Items & pricing',
      label:
        'Items & Pricing',
      description:
        'Maintain products and services, prices, units and default taxes used on invoices.',
      group:
        'Billing',
      capability:
        'canViewCatalog',
      sidebar:
        true,
    },

    receivePayment: {
      href:
        '/apps/invoicing/payments/new',
      title:
        'Receive payment',
      label:
        'Receive Payment',
      description:
        'Record one customer receipt on a focused page before allocating it.',
      group:
        'Money',
      capability:
        'canRecordPayment',
      sidebar:
        false,
      parentView:
        'payments',
    },

    payments: {
      href:
        '/apps/invoicing/payments',
      title:
        'Payments',
      label:
        'Payments',
      description:
        'Review posted and reversed payments and their invoice allocations without changing invoice totals.',
      group:
        'Money',
      capability:
        'canViewPayments',
      sidebar:
        true,
    },

    paymentIntegrations: {
      href:
        '/apps/invoicing/payment-integrations',
      title:
        'Payment integrations',
      label:
        'Payment Integrations',
      description:
        'Connect verified payment-provider events so successful customer payments can settle matching invoices automatically.',
      group:
        'Money',
      capability:
        'canViewPayments',
      sidebar:
        true,
    },

    retainers: {
      href:
        '/apps/invoicing/retainers',
      title:
        'Retainers',
      label:
        'Retainers',
      description:
        'Track customer deposits and unapplied advance funds separately from settled invoice revenue.',
      group:
        'Money',
      capability:
        'canViewRetainers',
      sidebar:
        true,
    },

    paymentPlans: {
      href:
        '/apps/invoicing/payment-plans',
      title:
        'Payment plans',
      label:
        'Payment Plans',
      description:
        'Manage invoice installments and scheduled balances without hiding the original receivable.',
      group:
        'Money',
      capability:
        'canViewPaymentPlans',
      sidebar:
        true,
    },

    currencies: {
      href:
        '/apps/invoicing/currencies',
      title:
        'Currency Center',
      label:
        'Currency Center',
      description:
        'Manage transaction currencies, dated exchange rates, base-currency reporting and foreign-currency exposure.',
      group:
        'Money',
      capability:
        'canViewCurrencies',
      sidebar:
        true,
    },

    taxEngine: {
      href:
        '/apps/invoicing/tax-engine',
      title:
        'Tax engine',
      label:
        'Tax Engine',
      description:
        'Manage rates, tax groups, fiscal positions, rules, exemptions and jurisdiction logic.',
      group:
        'Compliance',
      capability:
        'canViewTax',
      sidebar:
        true,
    },

    etims: {
      href:
        '/apps/invoicing/etims',
      title:
        'Kenya eTIMS',
      label:
        'Kenya eTIMS',
      description:
        'Manage KRA fiscalization, OSCU/VSCU mappings, activation and transmission audit.',
      group:
        'Compliance',
      capability:
        'canViewEtims',
      sidebar:
        true,
    },

    eInvoicing: {
      href:
        '/apps/invoicing/e-invoicing',
      title:
        'International e-invoicing',
      label:
        'International e-Invoicing',
      description:
        'Generate and route Peppol, UBL and provider-backed electronic fiscal documents.',
      group:
        'Compliance',
      capability:
        'canViewEInvoicing',
      sidebar:
        true,
    },

    recurring: {
      href:
        '/apps/invoicing/recurring',
      title:
        'Recurring invoices',
      label:
        'Recurring',
      description:
        'Manage recurring schedules, retries, next runs and automated billing delivery.',
      group:
        'Automation',
      capability:
        'canViewRecurring',
      sidebar:
        true,
    },

    reminders: {
      href:
        '/apps/invoicing/reminders',
      title:
        'Reminders & dunning',
      label:
        'Reminders',
      description:
        'Control collection stages, reminder retries, pauses and delivery history.',
      group:
        'Automation',
      capability:
        'canViewReminders',
      sidebar:
        true,
    },

    portal: {
      href:
        '/apps/invoicing/portal',
      title:
        'Customer portal',
      label:
        'Customer Portal',
      description:
        'Manage customer billing access, secure invoice visibility and portal messages.',
      group:
        'Automation',
      capability:
        'canViewPortal',
      sidebar:
        true,
    },

    reports: {
      href:
        '/apps/invoicing/reports',
      title:
        'Reports',
      label:
        'Reports',
      description:
        'Analyze aging, receivables, invoice status, collections and billing performance.',
      group:
        'Insights',
      capability:
        'canViewReports',
      sidebar:
        true,
    },

    settings: {
      href:
        '/apps/invoicing/settings',
      title:
        'Settings',
      label:
        'Settings',
      description:
        'Configure invoice appearance, defaults, payment terms and module behavior.',
      group:
        'Configuration',
      capability:
        'canManageSettings',
      sidebar:
        true,
    },
  };


export const INVOICING_SIDEBAR_VIEWS:
  InvoicingRouteView[] =
  INVOICING_ROUTE_VIEWS.filter(
    view =>
      INVOICING_NAVIGATION[
        view
      ].sidebar,
  );


export function canAccessInvoicingView(
  capabilities:
    InvoicingCapabilities,
  view:
    InvoicingRouteView,
) {
  const capability =
    INVOICING_NAVIGATION[
      view
    ].capability;

  return Boolean(
    capabilities[
      capability
    ],
  );
}


export function getInvoicingRoutePath(
  view:
    InvoicingRouteView,
) {
  return INVOICING_NAVIGATION[
    view
  ].href;
}


export function getInvoicingParentView(
  view:
    InvoicingRouteView,
) {
  return INVOICING_NAVIGATION[
    view
  ].parentView ||
    view;
}
