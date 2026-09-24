import {
  ENTERPRISE_MODULE_TABLES,
  isEnterpriseModuleKey,
  type EnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';


export type EnterpriseDomainKey =
  | 'finance'
  | 'revenue'
  | 'operations'
  | 'people'
  | 'service'
  | 'commerce'
  | 'marketing'
  | 'collaboration'
  | 'analytics';


export type EnterpriseDomainProfile = {
  moduleKey: EnterpriseModuleKey;
  domain: EnterpriseDomainKey;
  focus: string;
  primaryTable: string;
  primaryLabel: string;
  navigationLabel: string;
  reportsLabel: string;
  attentionStates: string[];
  successStates: string[];
  operatingModel: string;
  quickStartTables: string[];
};


const DOMAIN_CONFIG:
  Record<
    EnterpriseDomainKey,
    {
      navigationLabel: string;
      reportsLabel: string;
      attentionStates: string[];
      successStates: string[];
      operatingModel: string;
    }
  > = {
  finance: {
    navigationLabel: 'Transactions',
    reportsLabel: 'Financial control',
    attentionStates: [
      'draft',
      'pending',
      'submitted',
      'unpaid',
      'overdue',
      'failed',
      'rejected',
    ],
    successStates: [
      'approved',
      'paid',
      'posted',
      'reconciled',
      'closed',
      'completed',
    ],
    operatingModel:
      'Review financial exceptions first, preserve an auditable transaction history, then close or reconcile completed work.',
  },
  revenue: {
    navigationLabel: 'Pipeline',
    reportsLabel: 'Revenue performance',
    attentionStates: [
      'new',
      'open',
      'pending',
      'submitted',
      'sent',
      'viewed',
      'qualified',
    ],
    successStates: [
      'accepted',
      'won',
      'converted',
      'closed',
      'completed',
    ],
    operatingModel:
      'Prioritize open customer work, move qualified demand through governed commercial stages, and measure conversion rather than raw record volume.',
  },
  operations: {
    navigationLabel: 'Operations',
    reportsLabel: 'Operational control',
    attentionStates: [
      'draft',
      'open',
      'pending',
      'scheduled',
      'in_progress',
      'blocked',
      'on_hold',
      'failed',
    ],
    successStates: [
      'approved',
      'received',
      'ready',
      'completed',
      'closed',
      'delivered',
    ],
    operatingModel:
      'Work exceptions and constrained operations first, keep material or resource movements traceable, and close only after the operational outcome is recorded.',
  },
  people: {
    navigationLabel: 'People records',
    reportsLabel: 'People operations',
    attentionStates: [
      'new',
      'pending',
      'submitted',
      'screening',
      'interview',
      'offer',
      'in_progress',
    ],
    successStates: [
      'approved',
      'active',
      'hired',
      'completed',
      'closed',
    ],
    operatingModel:
      'Protect employee data, keep approvals attributable, and manage each people process through a clear lifecycle with accountable ownership.',
  },
  service: {
    navigationLabel: 'Service work',
    reportsLabel: 'Service performance',
    attentionStates: [
      'new',
      'open',
      'pending',
      'scheduled',
      'confirmed',
      'in_progress',
    ],
    successStates: [
      'resolved',
      'completed',
      'closed',
      'delivered',
    ],
    operatingModel:
      'Surface active customer or service commitments, progress them through execution, and close only when the service outcome is recorded.',
  },
  commerce: {
    navigationLabel: 'Commerce',
    reportsLabel: 'Commerce performance',
    attentionStates: [
      'draft',
      'pending',
      'confirmed',
      'processing',
      'ready',
      'unpaid',
    ],
    successStates: [
      'paid',
      'shipped',
      'delivered',
      'completed',
      'closed',
    ],
    operatingModel:
      'Protect order and payment integrity, expose fulfilment bottlenecks early, and keep commercial state aligned with delivery state.',
  },
  marketing: {
    navigationLabel: 'Campaigns',
    reportsLabel: 'Marketing performance',
    attentionStates: [
      'draft',
      'pending',
      'scheduled',
      'active',
      'open',
    ],
    successStates: [
      'sent',
      'published',
      'completed',
      'converted',
      'closed',
    ],
    operatingModel:
      'Plan campaigns against a measurable objective, monitor delivery and acquisition signals, then compare outcomes instead of activity alone.',
  },
  collaboration: {
    navigationLabel: 'Workspace',
    reportsLabel: 'Collaboration activity',
    attentionStates: [
      'draft',
      'open',
      'pending',
      'scheduled',
      'in_progress',
    ],
    successStates: [
      'sent',
      'signed',
      'completed',
      'closed',
    ],
    operatingModel:
      'Keep shared work discoverable, permission-aware and attributable while preserving durable history for decisions and documents.',
  },
  analytics: {
    navigationLabel: 'Data',
    reportsLabel: 'Analysis',
    attentionStates: [
      'draft',
      'open',
      'pending',
      'processing',
      'failed',
    ],
    successStates: [
      'active',
      'completed',
      'published',
      'closed',
    ],
    operatingModel:
      'Keep source data governed, distinguish raw activity from business outcomes, and make reporting reproducible from company-scoped records.',
  },
};


const MODULE_DOMAIN =
{
  "accounting": "finance",
  "ads": "marketing",
  "appointments": "service",
  "appraisals": "people",
  "assets": "operations",
  "attendance": "people",
  "barcode": "operations",
  "benefits": "people",
  "billing": "finance",
  "bookings": "service",
  "budgeting": "finance",
  "calendar": "collaboration",
  "cash_flow": "finance",
  "chat": "collaboration",
  "checkout": "commerce",
  "commissions": "finance",
  "cpq": "revenue",
  "crm": "revenue",
  "customer_portal": "revenue",
  "demand_planning": "operations",
  "documents": "collaboration",
  "ecommerce": "commerce",
  "email_marketing": "marketing",
  "employees": "people",
  "events": "service",
  "expenses": "finance",
  "facilities": "operations",
  "field_services": "service",
  "fixed_assets": "finance",
  "fleet": "operations",
  "gift_cards": "commerce",
  "helpdesk": "service",
  "inspections": "operations",
  "inventory": "operations",
  "landing_pages": "marketing",
  "lead_capture": "marketing",
  "learning": "people",
  "loyalty": "commerce",
  "mail": "collaboration",
  "maintenance": "operations",
  "manufacturing": "operations",
  "marketing_automation": "marketing",
  "marketplace": "commerce",
  "meetings": "collaboration",
  "onboarding": "people",
  "org_chart": "people",
  "payments": "finance",
  "payroll": "people",
  "planning": "operations",
  "plm": "operations",
  "pos_restaurant": "commerce",
  "pos_shop": "commerce",
  "projects": "operations",
  "purchase": "operations",
  "quality": "operations",
  "recruitment": "people",
  "referrals": "marketing",
  "rentals": "operations",
  "safety": "operations",
  "sales_inbox": "revenue",
  "seo": "marketing",
  "shifts": "people",
  "shipping": "operations",
  "sign": "collaboration",
  "sms_marketing": "marketing",
  "social_marketing": "marketing",
  "spreadsheet": "analytics",
  "subscriptions": "finance",
  "surveys": "analytics",
  "tax": "finance",
  "team_inbox": "collaboration",
  "time_off": "people",
  "timesheets": "people",
  "vendor_portal": "operations",
  "warehouse": "operations",
  "web_analytics": "analytics",
  "whiteboard": "collaboration",
  "work_orders": "operations"
} satisfies
  Record<
    EnterpriseModuleKey,
    EnterpriseDomainKey
  >;


const MODULE_FOCUS =
{
  "accounting": "Control the chart of accounts, journals and balanced financial postings.",
  "ads": "Manage paid media accounts, campaigns and daily advertising performance.",
  "appointments": "Run bookable services and appointment fulfilment from request to completion.",
  "appraisals": "Manage appraisal cycles, employee reviews and measurable performance goals.",
  "assets": "Track operational assets, lifecycle events and supporting asset documents.",
  "attendance": "Control attendance policies, daily entries and attendance exceptions.",
  "barcode": "Govern barcode rules, identifiers and operational scan events.",
  "benefits": "Manage benefit plans, eligibility rules and employee enrolments.",
  "billing": "Operate billing accounts, schedules, charges and controlled adjustments.",
  "bookings": "Manage resources, availability, guests and booking fulfilment.",
  "budgeting": "Build budgets, budget lines and controlled revisions against operating plans.",
  "calendar": "Coordinate shared calendars, events and attendee participation.",
  "cash_flow": "Forecast cash movements and compare expected flows with cash positions.",
  "chat": "Coordinate company conversations, channel membership, messages and reactions.",
  "checkout": "Operate payment-ready checkout links, sessions and checkout lifecycle events.",
  "commissions": "Define commission plans, assignments and earned commission entries.",
  "cpq": "Configure products and pricing rules, then produce governed commercial quotes.",
  "crm": "Move leads through qualification, opportunities and customer-facing sales activities.",
  "customer_portal": "Manage customer identities, portal access and customer conversations.",
  "demand_planning": "Forecast demand and convert planning signals into replenishment recommendations.",
  "documents": "Organize company folders and documents under workspace permissions.",
  "ecommerce": "Operate storefronts, products, orders and order lines from sale to fulfilment.",
  "email_marketing": "Run email campaigns and recipient delivery/engagement operations.",
  "employees": "Maintain the authoritative employee register for people operations.",
  "events": "Plan events and manage attendee registrations.",
  "expenses": "Capture, approve and settle employee or business expenses.",
  "facilities": "Manage facilities, spaces and requests for workplace services.",
  "field_services": "Dispatch service orders, visits and materials used in field execution.",
  "fixed_assets": "Control fixed assets, depreciation, transfers and disposals.",
  "fleet": "Track vehicles, assignments and fleet service history.",
  "gift_cards": "Operate gift-card programmes, cards and financial transaction history.",
  "helpdesk": "Manage support tickets, customer conversations and ticket classification.",
  "inspections": "Standardize inspections, findings and corrective follow-up.",
  "inventory": "Control products, warehouses, stock levels and immutable stock movements.",
  "landing_pages": "Publish landing pages, capture forms and track submissions.",
  "lead_capture": "Operate lead forms, captured entries and acquisition events.",
  "learning": "Manage courses, learning paths and employee enrolments.",
  "loyalty": "Operate loyalty programmes, members and points transactions.",
  "mail": "Manage connected mail accounts, threads and business messages.",
  "maintenance": "Control equipment maintenance requests and maintenance history.",
  "manufacturing": "Manage bills of materials, production orders and production operations.",
  "marketing_automation": "Run multi-step marketing workflows and execution history.",
  "marketplace": "Operate marketplace sellers, listings, orders and order lines.",
  "meetings": "Schedule meetings, participants and durable meeting notes.",
  "onboarding": "Standardize employee onboarding templates, assignments and task completion.",
  "org_chart": "Model positions and organizational reporting history.",
  "payments": "Control payment accounts, business payments, allocations and reconciliations.",
  "payroll": "Run payroll periods, employees, payroll runs and calculated run lines.",
  "planning": "Schedule resources, shifts and assignments against operating demand.",
  "plm": "Manage product versions and controlled engineering changes.",
  "pos_restaurant": "Operate restaurant menu items, tables, orders and order items.",
  "pos_shop": "Operate shop products, point-of-sale orders and order items.",
  "projects": "Run projects, tasks and milestones with accountable delivery states.",
  "purchase": "Manage suppliers, purchase orders and purchase-order lines.",
  "quality": "Perform quality checks, manage issues and track check items.",
  "recruitment": "Manage positions, applicants and interviews from application to hire.",
  "referrals": "Operate referral programmes and referred-customer activity.",
  "rentals": "Manage rentable items and rental contracts through their lifecycle.",
  "safety": "Record incidents, corrective actions and safety checks.",
  "sales_inbox": "Centralize sales conversations and messages across assigned sales inboxes.",
  "seo": "Monitor sites, target keywords, rankings and actionable SEO issues.",
  "shifts": "Define shift templates, schedules and employee assignments.",
  "shipping": "Manage carriers, shipments, packages and shipment events.",
  "sign": "Manage signature requests and signer completion.",
  "sms_marketing": "Run SMS campaigns and recipient delivery operations.",
  "social_marketing": "Manage social accounts and scheduled/published social posts.",
  "spreadsheet": "Maintain collaborative workbooks, sheets, cells and business intelligence reports.",
  "subscriptions": "Manage commercial subscription plans, subscriptions and subscription payments.",
  "surveys": "Build surveys, questions, responses and answer data.",
  "tax": "Control tax settings, obligations, filings and tax payments.",
  "team_inbox": "Operate shared team inboxes, threads and business messages.",
  "time_off": "Manage leave types and approval-controlled leave requests.",
  "timesheets": "Capture accountable time entries for work and cost tracking.",
  "vendor_portal": "Manage vendor identities, portal documents and vendor conversations.",
  "warehouse": "Control warehouse locations, operations and warehouse operation lines.",
  "web_analytics": "Track sites, sessions, events and conversion outcomes.",
  "whiteboard": "Manage collaborative whiteboards, membership and version history.",
  "work_orders": "Run work orders, tasks and materials from planning to completion."
} satisfies
  Record<
    EnterpriseModuleKey,
    string
  >;


const PRIMARY_TABLE_OVERRIDES:
  Partial<
    Record<
      EnterpriseModuleKey,
      string
    >
  > =
{
  "accounting": "journals",
  "ads": "ad_campaigns",
  "appointments": "appointments",
  "appraisals": "appraisals",
  "assets": "operational_assets",
  "attendance": "attendance_entries",
  "benefits": "benefit_enrollments",
  "billing": "billing_charges",
  "bookings": "bookings",
  "budgeting": "budgets",
  "cash_flow": "cash_flow_forecasts",
  "checkout": "checkout_sessions",
  "commissions": "commission_entries",
  "cpq": "cpq_quotes",
  "crm": "opportunities",
  "customer_portal": "portal_customers",
  "demand_planning": "demand_forecasts",
  "ecommerce": "storefront_orders",
  "email_marketing": "email_campaigns",
  "events": "events",
  "expenses": "expenses",
  "facilities": "facility_requests",
  "field_services": "service_orders",
  "fixed_assets": "fixed_assets",
  "fleet": "vehicles",
  "gift_cards": "gift_cards",
  "helpdesk": "support_tickets",
  "inspections": "inspections",
  "inventory": "stock_movements",
  "landing_pages": "landing_pages",
  "lead_capture": "lead_capture_entries",
  "learning": "learning_enrollments",
  "loyalty": "loyalty_members",
  "maintenance": "maintenance_requests",
  "manufacturing": "manufacturing_orders",
  "marketing_automation": "automation_workflows",
  "marketplace": "marketplace_orders",
  "meetings": "meetings",
  "onboarding": "employee_onboardings",
  "org_chart": "org_positions",
  "payments": "business_payments",
  "payroll": "payroll_runs",
  "planning": "planning_assignments",
  "plm": "engineering_changes",
  "pos_restaurant": "restaurant_orders",
  "pos_shop": "shop_orders",
  "projects": "projects",
  "purchase": "purchase_orders",
  "quality": "quality_issues",
  "recruitment": "applicants",
  "referrals": "referrals",
  "rentals": "rental_contracts",
  "safety": "safety_incidents",
  "sales_inbox": "sales_conversations",
  "seo": "seo_issues",
  "shifts": "shift_assignments",
  "shipping": "shipments",
  "sign": "signature_requests",
  "sms_marketing": "sms_campaigns",
  "social_marketing": "social_posts",
  "subscriptions": "subscriptions",
  "surveys": "survey_responses",
  "tax": "tax_obligations",
  "team_inbox": "team_inbox_threads",
  "time_off": "leave_requests",
  "timesheets": "time_entries",
  "vendor_portal": "vendor_portal_accounts",
  "warehouse": "warehouse_operations",
  "web_analytics": "analytics_sessions",
  "work_orders": "work_orders"
};


function humanize(
  value:
    string,
) {
  return value
    .replace(
      /_/g,
      ' ',
    )
    .replace(
      /\b\w/g,
      character =>
        character.toUpperCase(),
    );
}


function defaultPrimaryTable(
  moduleKey:
    EnterpriseModuleKey,
) {
  const tables =
    ENTERPRISE_MODULE_TABLES[
      moduleKey
    ];

  return (
    tables.find(
      table =>
        !table.endsWith(
          '_settings',
        ),
    ) ||
    tables[0]
  );
}


export function getEnterpriseDomainProfile(
  moduleKeyInput:
    string,
): EnterpriseDomainProfile | null {
  const moduleKey =
    moduleKeyInput
      .trim()
      .toLowerCase();

  if (
    !isEnterpriseModuleKey(
      moduleKey,
    )
  ) {
    return null;
  }

  const domain =
    MODULE_DOMAIN[
      moduleKey
    ];

  const config =
    DOMAIN_CONFIG[
      domain
    ];

  const tables =
    [
      ...ENTERPRISE_MODULE_TABLES[
        moduleKey
      ],
    ];

  const requestedPrimary =
    PRIMARY_TABLE_OVERRIDES[
      moduleKey
    ];

  const primaryTable =
    requestedPrimary &&
    tables.includes(
      requestedPrimary as never,
    )
      ? requestedPrimary
      : defaultPrimaryTable(
          moduleKey,
        );

  const quickStartTables =
    [
      primaryTable,
      ...tables.filter(
        table =>
          table !==
            primaryTable &&
          !table.endsWith(
            '_settings',
          ),
      ),
    ]
      .filter(
        (
          table,
          index,
          source,
        ) =>
          source.indexOf(
            table,
          ) ===
          index,
      )
      .slice(
        0,
        3,
      );

  return {
    moduleKey,
    domain,
    focus:
      MODULE_FOCUS[
        moduleKey
      ],
    primaryTable,
    primaryLabel:
      humanize(
        primaryTable,
      ),
    navigationLabel:
      config
        .navigationLabel,
    reportsLabel:
      config
        .reportsLabel,
    attentionStates:
      [
        ...config
          .attentionStates,
      ],
    successStates:
      [
        ...config
          .successStates,
      ],
    operatingModel:
      config
        .operatingModel,
    quickStartTables,
  };
}
