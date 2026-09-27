import {
  ENTERPRISE_MODULE_TABLES,
  isEnterpriseModuleKey,
  type EnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';

import {
  getEnterpriseDomainProfile,
  type EnterpriseDomainKey,
} from '@/lib/apps/enterprise/domain-profiles';

export type EnterpriseSpecialistLayout = {
  moduleKey: EnterpriseModuleKey;
  style:
    | 'ledger'
    | 'pipeline'
    | 'logistics'
    | 'procurement'
    | 'manufacturing'
    | 'people'
    | 'project'
    | 'support'
    | 'commerce'
    | 'marketing'
    | 'collaboration'
    | 'analytics';
  eyebrow: string;
  headline: string;
  description: string;
  primaryTables: readonly string[];
  workQueueTables: readonly string[];
  controlTables: readonly string[];
  insightTables?: readonly string[];
  preferredRecordView:
    | 'list'
    | 'kanban'
    | 'calendar';
  crossAppNarrative: string;
};

const SPECIALIST_LAYOUTS:
  Partial<
    Record<
      EnterpriseModuleKey,
      EnterpriseSpecialistLayout
    >
  > = {
  accounting: {
    moduleKey: 'accounting',
    style: 'ledger',
    eyebrow: 'Finance command center',
    headline: 'Books, journals, banking and period control',
    description:
      'Run accounting from posting evidence to reconciliation and close. Journal work stays distinct from bank work and fiscal controls.',
    primaryTables: [
      'journal_lines',
      'journals',
      'accounts',
    ],
    workQueueTables: [
      'accounting_bank_statement_lines',
      'accounting_fiscal_periods',
    ],
    controlTables: [
      'accounting_reconciliation_rules',
      'accounting_bank_accounts',
    ],
    preferredRecordView: 'list',
    crossAppNarrative:
      'Invoices, payments, expenses, purchases, tax and assets should post into the same controlled accounting trail.',
  },
  crm: {
    moduleKey: 'crm',
    style: 'pipeline',
    eyebrow: 'Revenue workspace',
    headline: 'Leads, opportunities, activities and forecast',
    description:
      'Work the pipeline visually, keep next actions close to each opportunity and use forecast evidence instead of a flat customer register.',
    primaryTables: [
      'opportunities',
      'leads',
    ],
    workQueueTables: [
      'crm_activities',
      'crm_forecasts',
      'crm_forecast_lines',
    ],
    controlTables: [
      'crm_stages',
      'crm_scoring_rules',
    ],
    preferredRecordView: 'kanban',
    crossAppNarrative:
      'Qualified demand should continue into Sales, communication and billing without re-entering the commercial context.',
  },
  inventory: {
    moduleKey: 'inventory',
    style: 'logistics',
    eyebrow: 'Inventory control tower',
    headline: 'Availability, reservations, lots and replenishment',
    description:
      'Keep on-hand stock, reservations, movements, lots and reorder exceptions in one operating view.',
    primaryTables: [
      'stock_levels',
      'stock_movements',
      'stock_reservations',
    ],
    workQueueTables: [
      'inventory_reorder_rules',
      'inventory_adjustments',
      'inventory_lots',
    ],
    controlTables: [
      'products',
      'warehouses',
    ],
    preferredRecordView: 'list',
    crossAppNarrative:
      'Sales demand, purchasing, manufacturing and warehouse execution should all change the same inventory position.',
  },
  warehouse: {
    moduleKey: 'warehouse',
    style: 'logistics',
    eyebrow: 'Warehouse execution',
    headline: 'Pick, move, pack and put away',
    description:
      'Organize warehouse work around active operations and picking batches instead of treating movements as isolated rows.',
    primaryTables: [
      'warehouse_operations',
      'warehouse_picking_batches',
    ],
    workQueueTables: [
      'warehouse_operation_lines',
      'warehouse_picking_batch_operations',
      'warehouse_packages',
    ],
    controlTables: [
      'warehouse_locations',
      'warehouse_putaway_rules',
      'warehouse_settings',
    ],
    preferredRecordView: 'kanban',
    crossAppNarrative:
      'Receipts from Purchase and deliveries from Sales should drive warehouse operations and update Inventory atomically.',
  },
  purchase: {
    moduleKey: 'purchase',
    style: 'procurement',
    eyebrow: 'Procurement workspace',
    headline: 'Requisition, purchase, receive and settle',
    description:
      'Manage demand approval, supplier orders and receipt evidence as one procure-to-pay operating chain.',
    primaryTables: [
      'purchase_requisitions',
      'purchase_orders',
      'purchase_receipts',
    ],
    workQueueTables: [
      'purchase_requisition_lines',
      'purchase_order_items',
      'purchase_receipt_lines',
    ],
    controlTables: [
      'suppliers',
    ],
    preferredRecordView: 'list',
    crossAppNarrative:
      'Approved purchasing should feed warehouse receipts, inventory valuation, supplier liabilities and payment controls.',
  },
  manufacturing: {
    moduleKey: 'manufacturing',
    style: 'manufacturing',
    eyebrow: 'Manufacturing floor',
    headline: 'Plan materials, route work and complete production',
    description:
      'Keep production orders, routings, work centers, operations and material reservations visible as one execution flow.',
    primaryTables: [
      'manufacturing_orders',
      'production_operations',
    ],
    workQueueTables: [
      'manufacturing_material_reservations',
      'manufacturing_routing_steps',
      'work_centers',
    ],
    controlTables: [
      'boms',
      'bom_items',
      'manufacturing_routings',
    ],
    preferredRecordView: 'kanban',
    crossAppNarrative:
      'Material reservations and consumption should reconcile with Inventory, Warehouse, Purchase and Quality.',
  },
  payroll: {
    moduleKey: 'payroll',
    style: 'people',
    eyebrow: 'Payroll control',
    headline: 'Periods, computation, payslips and payroll evidence',
    description:
      'Separate payroll preparation, computed lines, payslips and configuration while preserving auditable employee inputs.',
    primaryTables: [
      'payroll_runs',
      'payslips',
    ],
    workQueueTables: [
      'payroll_run_lines',
      'payslip_lines',
      'payroll_employee_components',
    ],
    controlTables: [
      'payroll_periods',
      'payroll_components',
      'payroll_settings',
    ],
    preferredRecordView: 'list',
    crossAppNarrative:
      'Attendance, approved leave, benefits and employee lifecycle changes should become controlled payroll inputs and accounting entries.',
  },
  employees: {
    moduleKey: 'employees',
    style: 'people',
    eyebrow: 'People directory',
    headline: 'Employees, contracts and lifecycle',
    description:
      'Use employee records as the people-system anchor, with employment terms and lifecycle events kept beside the employee.',
    primaryTables: [
      'employees',
      'employee_contracts',
    ],
    workQueueTables: [
      'employee_lifecycle_events',
    ],
    controlTables: [
      'employee_emergency_contacts',
    ],
    preferredRecordView: 'list',
    crossAppNarrative:
      'Recruitment, onboarding, attendance, leave, learning, appraisals, benefits and payroll should converge on the same employee identity.',
  },
  projects: {
    moduleKey: 'projects',
    style: 'project',
    eyebrow: 'Delivery workspace',
    headline: 'Projects, tasks, milestones, capacity and budget',
    description:
      'Run delivery around active work and dependencies, with milestones, resources and financial control visible beside execution.',
    primaryTables: [
      'tasks',
      'projects',
    ],
    workQueueTables: [
      'project_milestones',
      'task_dependencies',
      'project_resources',
    ],
    controlTables: [
      'project_budgets',
      'project_budget_lines',
    ],
    preferredRecordView: 'kanban',
    crossAppNarrative:
      'Timesheets, expenses, planning and invoicing should follow project delivery without creating a second project truth.',
  },
  helpdesk: {
    moduleKey: 'helpdesk',
    style: 'support',
    eyebrow: 'Support desk',
    headline: 'Tickets, SLA queues, escalations and knowledge',
    description:
      'Prioritize live tickets by workflow and SLA risk while keeping messages, escalations and knowledge close to the case.',
    primaryTables: [
      'support_tickets',
    ],
    workQueueTables: [
      'ticket_sla_tracking',
      'ticket_escalations',
      'ticket_messages',
    ],
    controlTables: [
      'helpdesk_sla_policies',
      'knowledge_articles',
      'ticket_tags',
    ],
    preferredRecordView: 'kanban',
    crossAppNarrative:
      'Customer context from CRM and Portal should follow the case, while project escalation remains permission-aware.',
  },
};

const SPECIALIST_STYLE:
  Record<
    EnterpriseDomainKey,
    EnterpriseSpecialistLayout['style']
  > = {
  finance: 'ledger',
  revenue: 'pipeline',
  operations: 'logistics',
  people: 'people',
  service: 'support',
  commerce: 'commerce',
  marketing: 'marketing',
  collaboration: 'collaboration',
  analytics: 'analytics',
};


const SPECIALIST_EYEBROW:
  Record<
    EnterpriseDomainKey,
    string
  > = {
  finance: 'Financial operations',
  revenue: 'Revenue operations',
  operations: 'Operations control',
  people: 'People operations',
  service: 'Service operations',
  commerce: 'Commerce operations',
  marketing: 'Growth operations',
  collaboration: 'Collaboration workspace',
  analytics: 'Analytics workspace',
};


const CALENDAR_FIRST =
  new Set<
    EnterpriseModuleKey
  >([
    'appointments',
    'bookings',
    'calendar',
    'events',
    'field_services',
    'meetings',
    'planning',
    'shifts',
  ]);


const KANBAN_FIRST =
  new Set<
    EnterpriseModuleKey
  >([
    'ads',
    'cpq',
    'crm',
    'ecommerce',
    'email_marketing',
    'helpdesk',
    'maintenance',
    'manufacturing',
    'marketing_automation',
    'marketplace',
    'projects',
    'quality',
    'recruitment',
    'safety',
    'sales_inbox',
    'social_marketing',
    'team_inbox',
    'work_orders',
  ]);


const CONTROL_TABLE =
  /(settings|rules?|polic(?:y|ies)|templates?|stages?|config|plans?|accounts?|carriers?|categories?)$/;


const INSIGHT_TABLE =
  /(metrics?|analytics?|events?|forecasts?|history|logs?|rankings?|results?|responses?|sessions?|snapshots?|conversions?|transactions?|tracking)$/;


function label(
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


function generatedSpecialistLayout(
  moduleKey:
    EnterpriseModuleKey,
): EnterpriseSpecialistLayout {
  const tables =
    [
      ...ENTERPRISE_MODULE_TABLES[
        moduleKey
      ],
    ];

  const profile =
    getEnterpriseDomainProfile(
      moduleKey,
    );

  if (
    !profile
  ) {
    throw new Error(
      'SaMi specialist workspace profile is missing for ' +
      moduleKey +
      '.',
    );
  }

  const controls =
    tables.filter(
      table =>
        CONTROL_TABLE.test(
          table,
        ),
    );

  const insights =
    tables.filter(
      table =>
        !controls.includes(
          table,
        ) &&
        INSIGHT_TABLE.test(
          table,
        ),
    );

  const controlKeys =
    new Set<string>(
      controls,
    );

  const insightKeys =
    new Set<string>(
      insights,
    );

  const preferredPrimary =
    [
      profile.primaryTable,
      ...profile.quickStartTables,
    ]
      .filter(
        (
          table,
          index,
          values,
        ) =>
          tables.includes(
            table as never,
          ) &&
          values.indexOf(
            table,
          ) ===
            index &&
          !controlKeys.has(
            table,
          ) &&
          !insightKeys.has(
            table,
          ),
      )
      .slice(
        0,
        3,
      );

  const remainingOperational =
    tables.filter(
      table =>
        !controlKeys.has(
          table,
        ) &&
        !insightKeys.has(
          table,
        ) &&
        !preferredPrimary.includes(
          table,
        ),
    );

  const primaryTables =
    preferredPrimary.length >
      0
      ? preferredPrimary
      : remainingOperational
          .slice(
            0,
            2,
          );

  const workQueueTables =
    remainingOperational
      .filter(
        table =>
          !primaryTables.includes(
            table,
          ),
      );

  const preferredRecordView:
    EnterpriseSpecialistLayout['preferredRecordView'] =
      CALENDAR_FIRST.has(
        moduleKey,
      )
        ? 'calendar'
        : KANBAN_FIRST.has(
            moduleKey,
          )
          ? 'kanban'
          : 'list';

  return {
    moduleKey,
    style:
      SPECIALIST_STYLE[
        profile.domain
      ],
    eyebrow:
      SPECIALIST_EYEBROW[
        profile.domain
      ],
    headline:
      profile.focus,
    description:
      profile.operatingModel,
    primaryTables,
    workQueueTables,
    controlTables:
      controls,
    insightTables:
      insights,
    preferredRecordView,
    crossAppNarrative:
      label(
        moduleKey,
      ) +
      ' operates inside the same company-scoped workflow, permission, automation and SaMi AI boundary so downstream apps receive governed business context rather than copied records.',
  };
}


function completeLayout(
  moduleKey:
    EnterpriseModuleKey,
  explicit:
    EnterpriseSpecialistLayout |
    undefined,
) {
  const generated =
    generatedSpecialistLayout(
      moduleKey,
    );

  if (
    !explicit
  ) {
    return generated;
  }

  const used =
    new Set([
      ...explicit.primaryTables,
      ...explicit.workQueueTables,
      ...explicit.controlTables,
      ...(
        explicit.insightTables ||
        []
      ),
    ]);

  const remaining =
    ENTERPRISE_MODULE_TABLES[
      moduleKey
    ]
      .filter(
        table =>
          !used.has(
            table,
          ),
      );

  return {
    ...generated,
    ...explicit,
    insightTables:
      explicit.insightTables ||
      remaining,
  };
}


export function getEnterpriseSpecialistLayout(
  moduleKeyInput: string,
): EnterpriseSpecialistLayout | null {
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

  return completeLayout(
    moduleKey,
    SPECIALIST_LAYOUTS[
      moduleKey
    ],
  );
}
