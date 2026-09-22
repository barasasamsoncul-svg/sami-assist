import {
  defineSamiModule,
  type SamiModuleCategory,
  type SamiModuleManifest,
} from '@/lib/modules/types';

/*
 * SaMi catalog expansion.
 *
 * These modules are part of the first-party product roadmap and may be
 * discovered in the workspace app catalog, but they deliberately remain
 * installable=false until they own a real schema, route, permissions and
 * business implementation.
 *
 * This preserves the Odoo-style manifest architecture without pretending
 * that a catalog card is already a working business application.
 */

const NO_EXTENSIONS = {
  dashboard:
    false,
  search:
    false,
  notifications:
    false,
  activity:
    false,
  automationTriggers:
    false,
  automationActions:
    false,
  aiTools:
    false,
  integrationProviders:
    false,
  apiEndpoints:
    false,
} as const;

function plannedModule({
  key,
  name,
  description,
  category,
  icon,
  recommended =
    false,
}: {
  key:
    string;
  name:
    string;
  description:
    string;
  category:
    SamiModuleCategory;
  icon:
    string;
  recommended?:
    boolean;
}): SamiModuleManifest {
  return defineSamiModule({
    key,
    name,
    version:
      '0.1.0',
    description,
    category,
    icon,
    route:
      `apps/${key}`,
    application:
      true,
    installable:
      false,
    autoInstall:
      false,
    recommended,
    depends: [],
    optionalDepends: [],
    schemaPath:
      null,
    migrationNamespace:
      key,
    navigation: [],
    actions: [],
    views: [],
    resources: [],
    security: {
      permissions: [],
      recordPolicies: [],
      fieldPolicies: [],
    },
    settings: [],
    extensions: {
      ...NO_EXTENSIONS,
    },
  });
}

export const PLANNED_FIRST_PARTY_SAMI_MODULES:
  SamiModuleManifest[] = [
  /* Finance */
  plannedModule({
    key:
      'billing',
    name:
      'Billing',
    description:
      'Manage customer billing cycles, recurring charges and revenue schedules.',
    category:
      'finance',
    icon:
      'repeat',
  }),
  plannedModule({
    key:
      'payments',
    name:
      'Payments',
    description:
      'Collect, reconcile and track business payments across supported channels.',
    category:
      'finance',
    icon:
      'receipt',
  }),
  plannedModule({
    key:
      'budgeting',
    name:
      'Budgeting',
    description:
      'Plan budgets, compare actuals and manage departmental spending targets.',
    category:
      'finance',
    icon:
      'bar-chart',
  }),
  plannedModule({
    key:
      'cash_flow',
    name:
      'Cash Flow',
    description:
      'Forecast cash positions, inflows, outflows and liquidity requirements.',
    category:
      'finance',
    icon:
      'bar-chart',
  }),
  plannedModule({
    key:
      'fixed_assets',
    name:
      'Fixed Assets',
    description:
      'Track capitalization, depreciation, transfers and disposal of fixed assets.',
    category:
      'finance',
    icon:
      'calculator',
  }),
  plannedModule({
    key:
      'tax',
    name:
      'Tax',
    description:
      'Manage tax configurations, filings, obligations and compliance workflows.',
    category:
      'finance',
    icon:
      'file-text',
  }),

  /* Sales */
  plannedModule({
    key:
      'bookings',
    name:
      'Bookings',
    description:
      'Accept customer bookings for services, resources, locations and staff.',
    category:
      'sales',
    icon:
      'calendar',
  }),
  plannedModule({
    key:
      'customer_portal',
    name:
      'Customer Portal',
    description:
      'Give customers secure self-service access to documents, orders and requests.',
    category:
      'sales',
    icon:
      'users',
  }),
  plannedModule({
    key:
      'sales_inbox',
    name:
      'Sales Inbox',
    description:
      'Unify sales conversations, customer replies and deal-related communication.',
    category:
      'sales',
    icon:
      'mail',
  }),
  plannedModule({
    key:
      'cpq',
    name:
      'CPQ',
    description:
      'Configure complex offers, calculate prices and generate governed quotations.',
    category:
      'sales',
    icon:
      'calculator',
  }),
  plannedModule({
    key:
      'commissions',
    name:
      'Sales Commissions',
    description:
      'Define commission rules and track earned sales incentives.',
    category:
      'sales',
    icon:
      'users',
  }),

  /* Commerce */
  plannedModule({
    key:
      'ecommerce',
    name:
      'E-commerce',
    description:
      'Run an online storefront connected to products, customers and fulfillment.',
    category:
      'commerce',
    icon:
      'shopping-bag',
  }),
  plannedModule({
    key:
      'checkout',
    name:
      'Checkout',
    description:
      'Create hosted checkout experiences for products, services and payment links.',
    category:
      'commerce',
    icon:
      'shopping-cart',
  }),
  plannedModule({
    key:
      'loyalty',
    name:
      'Loyalty',
    description:
      'Manage customer points, rewards, tiers and retention programs.',
    category:
      'commerce',
    icon:
      'users',
  }),
  plannedModule({
    key:
      'gift_cards',
    name:
      'Gift Cards',
    description:
      'Issue, redeem and reconcile digital and physical gift-card balances.',
    category:
      'commerce',
    icon:
      'shopping-bag',
  }),
  plannedModule({
    key:
      'marketplace',
    name:
      'Marketplace',
    description:
      'Coordinate multi-seller catalogs, orders, commissions and settlements.',
    category:
      'commerce',
    icon:
      'store',
  }),

  /* Supply chain */
  plannedModule({
    key:
      'warehouse',
    name:
      'Warehouse',
    description:
      'Coordinate warehouse locations, put-away, picking and internal stock flows.',
    category:
      'supply_chain',
    icon:
      'boxes',
  }),
  plannedModule({
    key:
      'shipping',
    name:
      'Shipping',
    description:
      'Prepare shipments, carrier handoffs, tracking and delivery exceptions.',
    category:
      'supply_chain',
    icon:
      'package',
  }),
  plannedModule({
    key:
      'demand_planning',
    name:
      'Demand Planning',
    description:
      'Forecast product demand and translate forecasts into replenishment signals.',
    category:
      'supply_chain',
    icon:
      'bar-chart',
  }),
  plannedModule({
    key:
      'vendor_portal',
    name:
      'Vendor Portal',
    description:
      'Give suppliers controlled access to purchase orders, deliveries and documents.',
    category:
      'supply_chain',
    icon:
      'users',
  }),
  plannedModule({
    key:
      'barcode',
    name:
      'Barcode',
    description:
      'Use barcode workflows for receiving, picking, inventory and fulfillment.',
    category:
      'supply_chain',
    icon:
      'package',
  }),

  /* Operations */
  plannedModule({
    key:
      'facilities',
    name:
      'Facilities',
    description:
      'Manage sites, rooms, utilities, service requests and facility operations.',
    category:
      'operations',
    icon:
      'home',
  }),
  plannedModule({
    key:
      'assets',
    name:
      'Operational Assets',
    description:
      'Track operational equipment, ownership, assignment and lifecycle status.',
    category:
      'operations',
    icon:
      'wrench',
  }),
  plannedModule({
    key:
      'work_orders',
    name:
      'Work Orders',
    description:
      'Create, assign and monitor operational jobs from request through completion.',
    category:
      'operations',
    icon:
      'clipboard-list',
  }),
  plannedModule({
    key:
      'inspections',
    name:
      'Inspections',
    description:
      'Run structured inspections, checklists, findings and corrective actions.',
    category:
      'operations',
    icon:
      'clipboard-check',
  }),
  plannedModule({
    key:
      'safety',
    name:
      'Safety',
    description:
      'Manage incidents, safety actions, compliance checks and operational risk.',
    category:
      'operations',
    icon:
      'shield-check',
  }),

  /* People */
  plannedModule({
    key:
      'payroll',
    name:
      'Payroll',
    description:
      'Calculate payroll, deductions, benefits and employee pay runs.',
    category:
      'people',
    icon:
      'calculator',
  }),
  plannedModule({
    key:
      'attendance',
    name:
      'Attendance',
    description:
      'Track attendance, clock events, lateness and attendance policies.',
    category:
      'people',
    icon:
      'clock',
  }),
  plannedModule({
    key:
      'shifts',
    name:
      'Shifts',
    description:
      'Build staff rosters, shift rotations and coverage schedules.',
    category:
      'people',
    icon:
      'calendar-clock',
  }),
  plannedModule({
    key:
      'onboarding',
    name:
      'Employee Onboarding',
    description:
      'Coordinate new-hire tasks, documents, access and induction journeys.',
    category:
      'people',
    icon:
      'user-plus',
  }),
  plannedModule({
    key:
      'learning',
    name:
      'Learning',
    description:
      'Create internal courses, learning paths, assessments and training records.',
    category:
      'people',
    icon:
      'file-text',
  }),
  plannedModule({
    key:
      'benefits',
    name:
      'Benefits',
    description:
      'Manage employee benefit programs, eligibility and enrollment records.',
    category:
      'people',
    icon:
      'users',
  }),
  plannedModule({
    key:
      'org_chart',
    name:
      'Organization Chart',
    description:
      'Visualize reporting lines, teams, roles and organizational structure.',
    category:
      'people',
    icon:
      'users',
  }),

  /* Marketing */
  plannedModule({
    key:
      'landing_pages',
    name:
      'Landing Pages',
    description:
      'Build campaign landing pages connected to leads, forms and analytics.',
    category:
      'marketing',
    icon:
      'app-window',
  }),
  plannedModule({
    key:
      'web_analytics',
    name:
      'Web Analytics',
    description:
      'Measure website acquisition, behavior, conversion and campaign performance.',
    category:
      'marketing',
    icon:
      'bar-chart',
  }),
  plannedModule({
    key:
      'ads',
    name:
      'Ads',
    description:
      'Coordinate paid campaigns, audiences, spend and performance reporting.',
    category:
      'marketing',
    icon:
      'megaphone',
  }),
  plannedModule({
    key:
      'seo',
    name:
      'SEO',
    description:
      'Track search visibility, content opportunities and organic performance.',
    category:
      'marketing',
    icon:
      'bar-chart',
  }),
  plannedModule({
    key:
      'lead_capture',
    name:
      'Lead Capture',
    description:
      'Capture and route inbound leads from forms, campaigns and digital channels.',
    category:
      'marketing',
    icon:
      'user-plus',
  }),

  /* Work and collaboration */
  plannedModule({
    key:
      'mail',
    name:
      'Mail',
    description:
      'Business email connected to SaMi contacts, activities and AI assistance.',
    category:
      'work',
    icon:
      'mail',
  }),
  plannedModule({
    key:
      'chat',
    name:
      'Team Chat',
    description:
      'Real-time team messaging with workspace-aware channels and conversations.',
    category:
      'work',
    icon:
      'message-square',
  }),
  plannedModule({
    key:
      'meetings',
    name:
      'Meetings',
    description:
      'Plan and run online meetings linked to customers, projects and teams.',
    category:
      'work',
    icon:
      'users',
  }),
  plannedModule({
    key:
      'calendar',
    name:
      'Calendar',
    description:
      'Coordinate personal, team and business calendars across SaMi apps.',
    category:
      'work',
    icon:
      'calendar',
  }),
  plannedModule({
    key:
      'team_inbox',
    name:
      'Team Inbox',
    description:
      'Manage shared business inboxes with assignment, ownership and collaboration.',
    category:
      'work',
    icon:
      'mail',
  }),
  plannedModule({
    key:
      'whiteboard',
    name:
      'Whiteboard',
    description:
      'Collaborate visually on plans, workflows, ideas and business processes.',
    category:
      'work',
    icon:
      'pen-tool',
  }),
];

export const PLANNED_FIRST_PARTY_SAMI_MODULE_COUNT =
  PLANNED_FIRST_PARTY_SAMI_MODULES.length;
