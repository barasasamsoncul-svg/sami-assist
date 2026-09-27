import {
  isEnterpriseModuleKey,
  type EnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';

import {
  getEnterpriseDomainProfile,
  type EnterpriseDomainKey,
} from '@/lib/apps/enterprise/domain-profiles';


export type SamiBusinessModuleKey =
  | EnterpriseModuleKey
  | 'sales'
  | 'invoicing';


export type EnterpriseWorkspaceZone = {
  key:
    | 'operate'
    | 'master'
    | 'control'
    | 'insights';
  label: string;
  description: string;
  tables: string[];
};


export type EnterpriseIntegrationLink = {
  moduleKey:
    SamiBusinessModuleKey;
  label: string;
  description: string;
  href: string;
};


export type EnterpriseModuleExperience = {
  moduleKey:
    EnterpriseModuleKey;
  domain:
    EnterpriseDomainKey;
  process:
    readonly [
      string,
      string,
      string,
      string,
    ];
  zones:
    EnterpriseWorkspaceZone[];
  integrations:
    EnterpriseIntegrationLink[];
};


const DOMAIN_PROCESS:
  Record<
    EnterpriseDomainKey,
    readonly [
      string,
      string,
      string,
      string,
    ]
  > = {
  finance: [
    'Capture',
    'Review',
    'Approve',
    'Reconcile',
  ],
  revenue: [
    'Capture',
    'Qualify',
    'Commit',
    'Close',
  ],
  operations: [
    'Plan',
    'Execute',
    'Validate',
    'Close',
  ],
  people: [
    'Request',
    'Review',
    'Approve',
    'Complete',
  ],
  service: [
    'Request',
    'Schedule',
    'Deliver',
    'Close',
  ],
  commerce: [
    'Create',
    'Confirm',
    'Fulfil',
    'Settle',
  ],
  marketing: [
    'Plan',
    'Launch',
    'Measure',
    'Optimize',
  ],
  collaboration: [
    'Create',
    'Collaborate',
    'Review',
    'Archive',
  ],
  analytics: [
    'Collect',
    'Model',
    'Analyze',
    'Publish',
  ],
};


const DOMAIN_ZONE_COPY:
  Record<
    EnterpriseDomainKey,
    Record<
      EnterpriseWorkspaceZone['key'],
      {
        label:
          string;
        description:
          string;
      }
    >
  > = {
  finance: {
    operate: {
      label:
        'Transactions',
      description:
        'Day-to-day financial work, approvals, postings and settlements.',
    },
    master: {
      label:
        'Financial setup',
      description:
        'Reference data that drives consistent financial processing.',
    },
    control: {
      label:
        'Controls',
      description:
        'Policies, rules and configuration that govern financial execution.',
    },
    insights: {
      label:
        'Analysis',
      description:
        'Forecasts, history and financial performance evidence.',
    },
  },
  revenue: {
    operate: {
      label:
        'Pipeline',
      description:
        'Active commercial work from demand capture through customer commitment.',
    },
    master: {
      label:
        'Commercial data',
      description:
        'Reusable customer, product and sales reference information.',
    },
    control: {
      label:
        'Sales controls',
      description:
        'Stages, rules and configuration that govern commercial execution.',
    },
    insights: {
      label:
        'Performance',
      description:
        'Forecasts, history and conversion evidence for revenue decisions.',
    },
  },
  operations: {
    operate: {
      label:
        'Operations',
      description:
        'Live planning, execution, movements and operational work.',
    },
    master: {
      label:
        'Resources',
      description:
        'Products, assets, locations and other reusable operating records.',
    },
    control: {
      label:
        'Controls',
      description:
        'Rules, policies, templates and configuration for repeatable execution.',
    },
    insights: {
      label:
        'Planning & history',
      description:
        'Forecasts, events and historical evidence for operating decisions.',
    },
  },
  people: {
    operate: {
      label:
        'People operations',
      description:
        'Active employee, applicant, attendance, payroll or development work.',
    },
    master: {
      label:
        'People records',
      description:
        'Authoritative employee and organizational reference information.',
    },
    control: {
      label:
        'Policies & setup',
      description:
        'Rules, plans and configuration that govern people processes.',
    },
    insights: {
      label:
        'People insights',
      description:
        'History, evaluations and measurable workforce outcomes.',
    },
  },
  service: {
    operate: {
      label:
        'Service work',
      description:
        'Customer requests, bookings, visits, tickets and delivery activity.',
    },
    master: {
      label:
        'Service resources',
      description:
        'Reusable services, resources, customers and service reference data.',
    },
    control: {
      label:
        'Service controls',
      description:
        'SLAs, policies, schedules and configuration for consistent delivery.',
    },
    insights: {
      label:
        'Service performance',
      description:
        'History and service outcomes used to manage quality and response.',
    },
  },
  commerce: {
    operate: {
      label:
        'Orders & fulfilment',
      description:
        'Active commerce from order creation through payment and delivery.',
    },
    master: {
      label:
        'Catalog & customers',
      description:
        'Reusable products, offers, customer and selling reference data.',
    },
    control: {
      label:
        'Commerce controls',
      description:
        'Pricing, checkout, loyalty and other selling configuration.',
    },
    insights: {
      label:
        'Commerce performance',
      description:
        'Transaction history and outcomes across selling channels.',
    },
  },
  marketing: {
    operate: {
      label:
        'Campaign execution',
      description:
        'Campaigns, content, audiences and active acquisition work.',
    },
    master: {
      label:
        'Audience & content',
      description:
        'Reusable campaign, channel and audience reference information.',
    },
    control: {
      label:
        'Marketing controls',
      description:
        'Automation rules, templates and campaign configuration.',
    },
    insights: {
      label:
        'Marketing performance',
      description:
        'Delivery, engagement, acquisition and conversion evidence.',
    },
  },
  collaboration: {
    operate: {
      label:
        'Shared work',
      description:
        'Active conversations, documents, meetings and collaborative activity.',
    },
    master: {
      label:
        'Workspace content',
      description:
        'Reusable folders, channels, calendars and collaborative structures.',
    },
    control: {
      label:
        'Collaboration controls',
      description:
        'Access, templates and configuration for shared work.',
    },
    insights: {
      label:
        'History',
      description:
        'Activity, version and participation history for accountable collaboration.',
    },
  },
  analytics: {
    operate: {
      label:
        'Analysis workspace',
      description:
        'Active analytical work, responses, models and data exploration.',
    },
    master: {
      label:
        'Data structures',
      description:
        'Reusable workbooks, sources, surveys and analytical definitions.',
    },
    control: {
      label:
        'Analytics controls',
      description:
        'Configuration and governance for repeatable analysis.',
    },
    insights: {
      label:
        'Published insights',
      description:
        'Reports, events, outcomes and reproducible analytical evidence.',
    },
  },
};


const RELATED_MODULES = {
  accounting: [
    'payments',
    'tax',
    'budgeting',
    'cash_flow',
    'invoicing',
  ],
  ads: [
    'marketing_automation',
    'web_analytics',
    'landing_pages',
    'crm',
  ],
  appointments: [
    'calendar',
    'employees',
    'customer_portal',
    'invoicing',
  ],
  appraisals: [
    'employees',
    'learning',
    'org_chart',
    'payroll',
  ],
  assets: [
    'maintenance',
    'facilities',
    'fixed_assets',
    'accounting',
  ],
  attendance: [
    'employees',
    'shifts',
    'time_off',
    'payroll',
  ],
  barcode: [
    'inventory',
    'warehouse',
    'pos_shop',
    'manufacturing',
  ],
  benefits: [
    'employees',
    'payroll',
    'onboarding',
    'appraisals',
  ],
  billing: [
    'subscriptions',
    'payments',
    'invoicing',
    'accounting',
  ],
  bookings: [
    'calendar',
    'appointments',
    'customer_portal',
    'payments',
  ],
  budgeting: [
    'accounting',
    'cash_flow',
    'purchase',
    'projects',
  ],
  calendar: [
    'meetings',
    'appointments',
    'planning',
    'projects',
  ],
  cash_flow: [
    'accounting',
    'payments',
    'budgeting',
    'invoicing',
  ],
  chat: [
    'team_inbox',
    'mail',
    'meetings',
    'documents',
  ],
  checkout: [
    'ecommerce',
    'payments',
    'gift_cards',
    'loyalty',
  ],
  commissions: [
    'sales',
    'crm',
    'payroll',
    'accounting',
  ],
  cpq: [
    'crm',
    'sales',
    'inventory',
    'invoicing',
  ],
  crm: [
    'sales',
    'sales_inbox',
    'email_marketing',
    'invoicing',
  ],
  customer_portal: [
    'crm',
    'helpdesk',
    'subscriptions',
    'invoicing',
  ],
  demand_planning: [
    'inventory',
    'purchase',
    'manufacturing',
    'warehouse',
  ],
  documents: [
    'sign',
    'projects',
    'mail',
    'customer_portal',
  ],
  ecommerce: [
    'checkout',
    'inventory',
    'shipping',
    'payments',
  ],
  email_marketing: [
    'marketing_automation',
    'crm',
    'lead_capture',
    'web_analytics',
  ],
  employees: [
    'recruitment',
    'attendance',
    'payroll',
    'org_chart',
  ],
  events: [
    'calendar',
    'email_marketing',
    'customer_portal',
    'surveys',
  ],
  expenses: [
    'employees',
    'payments',
    'accounting',
    'projects',
  ],
  facilities: [
    'assets',
    'maintenance',
    'work_orders',
    'safety',
  ],
  field_services: [
    'work_orders',
    'inventory',
    'appointments',
    'invoicing',
  ],
  fixed_assets: [
    'accounting',
    'assets',
    'maintenance',
    'tax',
  ],
  fleet: [
    'maintenance',
    'assets',
    'expenses',
    'field_services',
  ],
  gift_cards: [
    'pos_shop',
    'ecommerce',
    'checkout',
    'payments',
  ],
  helpdesk: [
    'crm',
    'customer_portal',
    'team_inbox',
    'projects',
  ],
  inspections: [
    'quality',
    'safety',
    'maintenance',
    'work_orders',
  ],
  inventory: [
    'warehouse',
    'purchase',
    'manufacturing',
    'sales',
    'invoicing',
  ],
  landing_pages: [
    'lead_capture',
    'crm',
    'email_marketing',
    'web_analytics',
  ],
  lead_capture: [
    'crm',
    'landing_pages',
    'marketing_automation',
    'sales_inbox',
  ],
  learning: [
    'employees',
    'appraisals',
    'onboarding',
    'org_chart',
  ],
  loyalty: [
    'pos_shop',
    'ecommerce',
    'gift_cards',
    'crm',
  ],
  mail: [
    'team_inbox',
    'sales_inbox',
    'crm',
    'documents',
  ],
  maintenance: [
    'assets',
    'work_orders',
    'inventory',
    'quality',
  ],
  manufacturing: [
    'inventory',
    'warehouse',
    'purchase',
    'quality',
  ],
  marketing_automation: [
    'crm',
    'email_marketing',
    'sms_marketing',
    'web_analytics',
  ],
  marketplace: [
    'ecommerce',
    'inventory',
    'shipping',
    'payments',
  ],
  meetings: [
    'calendar',
    'chat',
    'projects',
    'documents',
  ],
  onboarding: [
    'employees',
    'recruitment',
    'learning',
    'benefits',
  ],
  org_chart: [
    'employees',
    'recruitment',
    'appraisals',
    'planning',
  ],
  payments: [
    'invoicing',
    'accounting',
    'billing',
    'subscriptions',
  ],
  payroll: [
    'employees',
    'attendance',
    'time_off',
    'accounting',
  ],
  planning: [
    'employees',
    'shifts',
    'projects',
    'field_services',
  ],
  plm: [
    'manufacturing',
    'quality',
    'inventory',
    'documents',
  ],
  pos_restaurant: [
    'inventory',
    'payments',
    'loyalty',
    'accounting',
  ],
  pos_shop: [
    'inventory',
    'payments',
    'loyalty',
    'ecommerce',
  ],
  projects: [
    'timesheets',
    'expenses',
    'planning',
    'invoicing',
  ],
  purchase: [
    'inventory',
    'warehouse',
    'vendor_portal',
    'accounting',
  ],
  quality: [
    'manufacturing',
    'inventory',
    'inspections',
    'work_orders',
  ],
  recruitment: [
    'employees',
    'onboarding',
    'org_chart',
    'calendar',
  ],
  referrals: [
    'crm',
    'loyalty',
    'lead_capture',
    'marketing_automation',
  ],
  rentals: [
    'inventory',
    'bookings',
    'payments',
    'invoicing',
  ],
  safety: [
    'employees',
    'inspections',
    'facilities',
    'work_orders',
  ],
  sales_inbox: [
    'crm',
    'sales',
    'mail',
    'team_inbox',
  ],
  seo: [
    'landing_pages',
    'web_analytics',
    'ads',
    'ecommerce',
  ],
  shifts: [
    'employees',
    'attendance',
    'planning',
    'time_off',
  ],
  shipping: [
    'warehouse',
    'inventory',
    'ecommerce',
    'sales',
  ],
  sign: [
    'documents',
    'sales',
    'customer_portal',
    'vendor_portal',
  ],
  sms_marketing: [
    'marketing_automation',
    'crm',
    'lead_capture',
    'web_analytics',
  ],
  social_marketing: [
    'marketing_automation',
    'ads',
    'web_analytics',
    'crm',
  ],
  spreadsheet: [
    'web_analytics',
    'accounting',
    'sales',
    'inventory',
  ],
  subscriptions: [
    'billing',
    'payments',
    'invoicing',
    'customer_portal',
  ],
  surveys: [
    'crm',
    'employees',
    'events',
    'web_analytics',
  ],
  tax: [
    'accounting',
    'payments',
    'fixed_assets',
    'invoicing',
  ],
  team_inbox: [
    'mail',
    'helpdesk',
    'crm',
    'customer_portal',
  ],
  time_off: [
    'employees',
    'attendance',
    'shifts',
    'payroll',
  ],
  timesheets: [
    'projects',
    'employees',
    'payroll',
    'invoicing',
  ],
  vendor_portal: [
    'purchase',
    'documents',
    'payments',
    'quality',
  ],
  warehouse: [
    'inventory',
    'shipping',
    'purchase',
    'manufacturing',
  ],
  web_analytics: [
    'ads',
    'seo',
    'landing_pages',
    'ecommerce',
  ],
  whiteboard: [
    'meetings',
    'projects',
    'documents',
    'chat',
  ],
  work_orders: [
    'maintenance',
    'inventory',
    'field_services',
    'quality',
  ],
} satisfies
  Record<
    EnterpriseModuleKey,
    readonly SamiBusinessModuleKey[]
  >;


const MASTER_PATTERNS = [
  /(^|_)accounts?$/,
  /(^|_)assets?$/,
  /(^|_)carriers?$/,
  /(^|_)categories?$/,
  /(^|_)customers?$/,
  /(^|_)employees?$/,
  /(^|_)items?$/,
  /(^|_)locations?$/,
  /(^|_)members?$/,
  /(^|_)plans?$/,
  /(^|_)products?$/,
  /(^|_)resources?$/,
  /(^|_)services?$/,
  /(^|_)suppliers?$/,
  /(^|_)templates?$/,
  /(^|_)types?$/,
  /(^|_)vendors?$/,
  /(^|_)warehouses?$/,
];


const CONTROL_PATTERNS = [
  /settings$/,
  /rules?$/,
  /polic(y|ies)$/,
  /stages?$/,
  /config(uration)?$/,
  /preferences?$/,
  /definitions?$/,
  /schemes?$/,
];


const INSIGHT_PATTERNS = [
  /analytics?/,
  /events?$/,
  /forecasts?$/,
  /history$/,
  /logs?$/,
  /metrics?$/,
  /rankings?$/,
  /reports?$/,
  /responses?$/,
  /results?$/,
  /sessions?$/,
  /snapshots?$/,
  /transactions?$/,
];


function humanize(
  value:
    string,
) {
  return value
    .replaceAll(
      '_',
      ' ',
    )
    .replace(
      /\b\w/g,
      character =>
        character
          .toUpperCase(),
    );
}


function classifyTable(
  table:
    string,
): EnterpriseWorkspaceZone['key'] {
  if (
    CONTROL_PATTERNS.some(
      pattern =>
        pattern.test(
          table,
        ),
    )
  ) {
    return 'control';
  }

  if (
    INSIGHT_PATTERNS.some(
      pattern =>
        pattern.test(
          table,
        ),
    )
  ) {
    return 'insights';
  }

  if (
    MASTER_PATTERNS.some(
      pattern =>
        pattern.test(
          table,
        ),
    )
  ) {
    return 'master';
  }

  return 'operate';
}


export function getEnterpriseModuleExperience(
  moduleKeyInput:
    string,
  tables:
    readonly string[],
): EnterpriseModuleExperience | null {
  const normalized =
    moduleKeyInput
      .trim()
      .toLowerCase();

  if (
    !isEnterpriseModuleKey(
      normalized,
    )
  ) {
    return null;
  }

  const profile =
    getEnterpriseDomainProfile(
      normalized,
    );

  if (
    !profile
  ) {
    return null;
  }

  const grouped:
    Record<
      EnterpriseWorkspaceZone['key'],
      string[]
    > = {
    operate: [],
    master: [],
    control: [],
    insights: [],
  };

  for (
    const table
    of tables
  ) {
    grouped[
      classifyTable(
        table,
      )
    ].push(
      table,
    );
  }

  const zones =
    (
      [
        'operate',
        'master',
        'control',
        'insights',
      ] as const
    )
      .filter(
        key =>
          grouped[
            key
          ].length >
          0,
      )
      .map(
        key => ({
          key,
          label:
            DOMAIN_ZONE_COPY[
              profile.domain
            ][
              key
            ].label,
          description:
            DOMAIN_ZONE_COPY[
              profile.domain
            ][
              key
            ].description,
          tables:
            grouped[
              key
            ],
        }),
      );

  const integrations =
    RELATED_MODULES[
      normalized
    ].map(
      moduleKey => ({
        moduleKey,
        label:
          humanize(
            moduleKey,
          ),
        description:
          'Continue this workflow in ' +
          humanize(
            moduleKey,
          ) +
          ' without leaving the SaMi workspace.',
        href:
          '/apps/' +
          moduleKey,
      }),
    );

  return {
    moduleKey:
      normalized,
    domain:
      profile.domain,
    process:
      DOMAIN_PROCESS[
        profile.domain
      ],
    zones,
    integrations,
  };
}
