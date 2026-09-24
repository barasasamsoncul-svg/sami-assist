export type EnterpriseWorkflowTransition = {
  value: string;
  label: string;
  tone:
    | 'default'
    | 'success'
    | 'warning'
    | 'danger';
};


const GENERIC_GRAPH:
  Record<
    string,
    string[]
  > = {
    draft: [
      'pending',
      'submitted',
      'sent',
      'confirmed',
      'active',
      'cancelled',
    ],
    new: [
      'open',
      'active',
      'in_progress',
      'qualified',
      'rejected',
      'cancelled',
    ],
    pending: [
      'approved',
      'rejected',
      'active',
      'cancelled',
    ],
    submitted: [
      'approved',
      'rejected',
      'cancelled',
    ],
    approved: [
      'active',
      'confirmed',
      'scheduled',
      'completed',
      'cancelled',
    ],
    sent: [
      'viewed',
      'accepted',
      'rejected',
      'expired',
      'cancelled',
    ],
    viewed: [
      'accepted',
      'rejected',
      'expired',
      'cancelled',
    ],
    accepted: [
      'confirmed',
      'active',
      'converted',
      'completed',
      'cancelled',
    ],
    open: [
      'in_progress',
      'pending',
      'resolved',
      'closed',
      'cancelled',
    ],
    in_progress: [
      'on_hold',
      'resolved',
      'completed',
      'closed',
      'cancelled',
    ],
    on_hold: [
      'in_progress',
      'active',
      'cancelled',
    ],
    active: [
      'paused',
      'inactive',
      'completed',
      'closed',
      'cancelled',
      'expired',
    ],
    paused: [
      'active',
      'cancelled',
    ],
    scheduled: [
      'in_progress',
      'active',
      'completed',
      'cancelled',
    ],
    confirmed: [
      'in_progress',
      'processing',
      'ready',
      'completed',
      'cancelled',
    ],
    processing: [
      'ready',
      'shipped',
      'completed',
      'failed',
      'cancelled',
    ],
    ready: [
      'shipped',
      'delivered',
      'completed',
      'cancelled',
    ],
    shipped: [
      'delivered',
      'completed',
      'returned',
    ],
    delivered: [
      'completed',
      'closed',
      'returned',
    ],
    resolved: [
      'closed',
      'open',
    ],
    failed: [
      'pending',
      'processing',
      'cancelled',
    ],
    qualified: [
      'converted',
      'won',
      'lost',
      'rejected',
    ],
    won: [
      'closed',
      'completed',
    ],
    unpaid: [
      'paid',
      'overdue',
      'cancelled',
    ],
    overdue: [
      'paid',
      'cancelled',
    ],
    paid: [
      'completed',
      'closed',
      'refunded',
      'void',
    ],
    partially_paid: [
      'paid',
      'overdue',
      'cancelled',
    ],
    posted: [
      'reversed',
      'void',
    ],
    not_started: [
      'in_progress',
      'partial',
      'completed',
      'cancelled',
    ],
    partial: [
      'in_progress',
      'completed',
      'cancelled',
    ],
  };


const DOMAIN_GRAPH:
  Record<
    string,
    Record<
      string,
      string[]
    >
  > = {
    'accounting:journals': {
      draft: [
        'posted',
        'cancelled',
      ],
      posted: [
        'reversed',
      ],
    },
    'expenses:expenses': {
      draft: [
        'submitted',
        'cancelled',
      ],
      submitted: [
        'approved',
        'rejected',
      ],
      approved: [
        'paid',
        'cancelled',
      ],
      rejected: [
        'draft',
      ],
    },
    'time_off:leave_requests': {
      pending: [
        'approved',
        'rejected',
        'cancelled',
      ],
      approved: [
        'cancelled',
      ],
      rejected: [
        'pending',
      ],
    },
    'helpdesk:support_tickets': {
      open: [
        'in_progress',
        'resolved',
        'closed',
      ],
      in_progress: [
        'open',
        'resolved',
        'closed',
      ],
      resolved: [
        'open',
        'closed',
      ],
      closed: [
        'open',
      ],
    },
    'purchase:purchase_orders': {
      draft: [
        'confirmed',
        'cancelled',
      ],
      confirmed: [
        'received',
        'cancelled',
      ],
      received: [
        'closed',
      ],
    },
    'manufacturing:manufacturing_orders': {
      draft: [
        'confirmed',
        'cancelled',
      ],
      confirmed: [
        'in_progress',
        'cancelled',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'manufacturing:production_operations': {
      pending: [
        'in_progress',
        'cancelled',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'projects:tasks': {
      todo: [
        'in_progress',
        'cancelled',
      ],
      open: [
        'in_progress',
        'completed',
        'cancelled',
      ],
      in_progress: [
        'blocked',
        'completed',
        'cancelled',
      ],
      blocked: [
        'in_progress',
        'cancelled',
      ],
      completed: [
        'in_progress',
      ],
    },
    'quality:quality_issues': {
      open: [
        'in_progress',
        'resolved',
        'closed',
      ],
      in_progress: [
        'resolved',
        'closed',
      ],
      resolved: [
        'closed',
        'open',
      ],
    },
    'recruitment:applicants': {
      applied: [
        'screening',
        'rejected',
      ],
      new: [
        'screening',
        'rejected',
      ],
      screening: [
        'interview',
        'rejected',
      ],
      interview: [
        'offer',
        'rejected',
      ],
      offer: [
        'hired',
        'rejected',
      ],
    },
    'recruitment:interviews': {
      scheduled: [
        'completed',
        'cancelled',
        'no_show',
      ],
    },
    'projects:projects': {
      active: [
        'on_hold',
        'completed',
        'cancelled',
      ],
      on_hold: [
        'active',
        'cancelled',
      ],
    },
    'projects:project_milestones': {
      pending: [
        'in_progress',
        'completed',
        'cancelled',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'quality:quality_checks': {
      pending: [
        'in_progress',
        'completed',
        'cancelled',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'maintenance:maintenance_requests': {
      open: [
        'in_progress',
        'cancelled',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'work_orders:work_orders': {
      draft: [
        'scheduled',
        'cancelled',
      ],
      active: [
        'scheduled',
        'in_progress',
        'completed',
        'cancelled',
      ],
      scheduled: [
        'in_progress',
        'cancelled',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'work_orders:work_order_tasks': {
      active: [
        'in_progress',
        'completed',
        'cancelled',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'field_services:service_orders': {
      open: [
        'scheduled',
        'in_progress',
        'completed',
        'cancelled',
      ],
      scheduled: [
        'in_progress',
        'cancelled',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'field_services:service_visits': {
      scheduled: [
        'in_progress',
        'completed',
        'cancelled',
        'no_show',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'shipping:shipments': {
      draft: [
        'ready',
        'cancelled',
      ],
      ready: [
        'shipped',
        'cancelled',
      ],
      shipped: [
        'delivered',
        'returned',
      ],
    },
    'ecommerce:storefront_orders': {
      draft: [
        'confirmed',
        'cancelled',
      ],
      confirmed: [
        'processing',
        'cancelled',
      ],
      processing: [
        'shipped',
        'cancelled',
      ],
      shipped: [
        'delivered',
        'returned',
      ],
      delivered: [
        'completed',
        'returned',
      ],
    },
    'bookings:bookings': {
      draft: [
        'confirmed',
        'cancelled',
      ],
      active: [
        'confirmed',
        'completed',
        'cancelled',
        'no_show',
      ],
      pending: [
        'confirmed',
        'cancelled',
      ],
      confirmed: [
        'completed',
        'cancelled',
        'no_show',
      ],
    },
    'appointments:appointments': {
      draft: [
        'confirmed',
        'cancelled',
      ],
      pending: [
        'confirmed',
        'cancelled',
      ],
      scheduled: [
        'confirmed',
        'completed',
        'cancelled',
        'no_show',
      ],
      confirmed: [
        'completed',
        'cancelled',
        'no_show',
      ],
    },
    'subscriptions:subscriptions': {
      active: [
        'paused',
        'cancelled',
        'expired',
      ],
      paused: [
        'active',
        'cancelled',
      ],
    },
    'timesheets:time_entries': {
      draft: [
        'submitted',
        'cancelled',
      ],
      submitted: [
        'approved',
        'rejected',
      ],
      rejected: [
        'draft',
      ],
    },
    'appraisals:appraisal_cycles': {
      draft: [
        'active',
        'cancelled',
      ],
      active: [
        'completed',
        'cancelled',
      ],
    },
    'appraisals:appraisals': {
      draft: [
        'submitted',
        'cancelled',
      ],
      submitted: [
        'in_review',
        'completed',
        'rejected',
      ],
      in_review: [
        'completed',
        'rejected',
      ],
      rejected: [
        'draft',
      ],
    },
    'learning:learning_enrollments': {
      active: [
        'completed',
        'cancelled',
      ],
    },
    'onboarding:employee_onboardings': {
      active: [
        'in_progress',
        'completed',
        'cancelled',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'onboarding:employee_onboarding_tasks': {
      active: [
        'in_progress',
        'completed',
        'cancelled',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'safety:safety_incidents': {
      active: [
        'in_progress',
        'resolved',
        'closed',
      ],
      in_progress: [
        'resolved',
        'closed',
      ],
      resolved: [
        'closed',
        'active',
      ],
    },
    'safety:safety_actions': {
      active: [
        'in_progress',
        'completed',
        'cancelled',
      ],
      in_progress: [
        'completed',
        'cancelled',
      ],
    },
    'safety:safety_checks': {
      active: [
        'scheduled',
        'completed',
        'cancelled',
      ],
      scheduled: [
        'completed',
        'cancelled',
      ],
    },
    'rentals:rental_contracts': {
      active: [
        'returned',
        'closed',
        'cancelled',
      ],
      returned: [
        'closed',
      ],
    },
    'rentals:rental_items': {
      available: [
        'rented',
        'maintenance',
        'unavailable',
      ],
      rented: [
        'available',
        'maintenance',
      ],
      maintenance: [
        'available',
        'unavailable',
      ],
      unavailable: [
        'available',
        'maintenance',
      ],
    },
    'fleet:vehicles': {
      active: [
        'maintenance',
        'inactive',
      ],
      maintenance: [
        'active',
        'inactive',
      ],
      inactive: [
        'active',
        'maintenance',
      ],
    },
    'fleet:vehicle_assignments': {
      active: [
        'completed',
        'cancelled',
      ],
    },
    'ads:ad_campaigns': {
      draft: ['scheduled','active','cancelled'],
      scheduled: ['active','paused','cancelled'],
      active: ['paused','completed','cancelled'],
      paused: ['active','cancelled'],
    },
    'calendar:calendar_events': {
      draft: ['scheduled','cancelled'],
      scheduled: ['active','completed','cancelled'],
      active: ['completed','cancelled'],
    },
    'checkout:checkout_links': {
      active: ['paused','expired','cancelled'],
      paused: ['active','cancelled'],
    },
    'checkout:checkout_sessions': {
      pending: ['processing','paid','failed','cancelled'],
      processing: ['paid','failed','cancelled'],
      failed: ['pending','cancelled'],
    },
    'commissions:commission_entries': {
      pending: ['approved','rejected'],
      approved: ['paid','cancelled'],
    },
    'customer_portal:portal_customers': {
      active: ['suspended','expired','cancelled'],
      suspended: ['active','cancelled'],
    },
    'demand_planning:demand_forecasts': {
      draft: ['active','approved','cancelled'],
      active: ['approved','completed','cancelled'],
      approved: ['completed','cancelled'],
    },
    'demand_planning:replenishment_recommendations': {
      pending: ['approved','rejected','cancelled'],
      approved: ['completed','cancelled'],
    },
    'email_marketing:email_campaigns': {
      draft: ['scheduled','sent','cancelled'],
      scheduled: ['sent','cancelled'],
    },
    'events:events': {
      draft: ['scheduled','active','cancelled'],
      scheduled: ['active','completed','cancelled'],
      active: ['completed','cancelled'],
    },
    'facilities:facility_requests': {
      active: ['in_progress','completed','cancelled'],
      open: ['in_progress','completed','cancelled'],
      in_progress: ['completed','cancelled'],
    },
    'gift_cards:gift_cards': {
      active: ['redeemed','expired','cancelled'],
    },
    'inspections:inspections': {
      active: ['scheduled','in_progress','completed','cancelled'],
      scheduled: ['in_progress','completed','cancelled'],
      in_progress: ['completed','cancelled'],
    },
    'inspections:inspection_findings': {
      active: ['in_progress','resolved','closed'],
      in_progress: ['resolved','closed'],
      resolved: ['closed','active'],
    },
    'landing_pages:landing_pages': {
      draft: ['published','archived'],
      active: ['published','archived'],
      published: ['archived','draft'],
    },
    'lead_capture:lead_capture_entries': {
      new: ['qualified','rejected','converted'],
      active: ['qualified','rejected','converted'],
      qualified: ['converted','rejected'],
    },
    'loyalty:loyalty_members': {
      active: ['suspended','closed'],
      suspended: ['active','closed'],
    },
    'mail:mail_threads': {
      open: ['closed','archived'],
      active: ['closed','archived'],
      closed: ['open','archived'],
    },
    'marketing_automation:automation_workflows': {
      draft: ['active','cancelled'],
      active: ['paused','completed','cancelled'],
      paused: ['active','cancelled'],
    },
    'marketing_automation:automation_runs': {
      pending: ['in_progress','cancelled'],
      in_progress: ['completed','failed','cancelled'],
      failed: ['pending','cancelled'],
    },
    'marketplace:marketplace_listings': {
      draft: ['active','paused','cancelled'],
      active: ['paused','sold_out','cancelled'],
      paused: ['active','cancelled'],
    },
    'marketplace:marketplace_orders': {
      pending: ['confirmed','cancelled'],
      confirmed: ['processing','cancelled'],
      processing: ['shipped','cancelled'],
      shipped: ['delivered','returned'],
      delivered: ['completed','returned'],
    },
    'meetings:meetings': {
      draft: ['scheduled','cancelled'],
      scheduled: ['in_progress','completed','cancelled'],
      in_progress: ['completed','cancelled'],
    },
    'planning:planning_shifts': {
      draft: ['scheduled','cancelled'],
      scheduled: ['in_progress','completed','cancelled'],
      in_progress: ['completed','cancelled'],
    },
    'plm:engineering_changes': {
      draft: ['submitted','cancelled'],
      submitted: ['approved','rejected','cancelled'],
      approved: ['implemented','closed'],
      rejected: ['draft','closed'],
    },
    'pos_restaurant:restaurant_orders': {
      open: ['in_progress','ready','cancelled'],
      in_progress: ['ready','completed','cancelled'],
      ready: ['completed','cancelled'],
    },
    'pos_shop:shop_orders': {
      open: ['processing','paid','cancelled'],
      processing: ['paid','completed','cancelled'],
      paid: ['completed','refunded'],
    },
    'referrals:referrals': {
      new: ['screening','approved','rejected'],
      active: ['approved','rejected'],
      approved: ['rewarded','closed'],
    },
    'sales_inbox:sales_conversations': {
      open: ['in_progress','closed'],
      active: ['in_progress','closed'],
      in_progress: ['closed','open'],
      closed: ['open'],
    },
    'seo:seo_issues': {
      open: ['in_progress','resolved','closed'],
      active: ['in_progress','resolved','closed'],
      in_progress: ['resolved','closed'],
      resolved: ['closed','open'],
    },
    'sign:signature_requests': {
      draft: ['sent','cancelled'],
      sent: ['completed','expired','cancelled'],
    },
    'sms_marketing:sms_campaigns': {
      draft: ['scheduled','sent','cancelled'],
      scheduled: ['sent','cancelled'],
    },
    'social_marketing:social_posts': {
      draft: ['scheduled','published','cancelled'],
      scheduled: ['published','failed','cancelled'],
      failed: ['scheduled','cancelled'],
    },
    'surveys:surveys': {
      draft: ['active','cancelled'],
      active: ['closed','completed','cancelled'],
    },
    'team_inbox:team_inbox_threads': {
      open: ['in_progress','closed'],
      active: ['in_progress','closed'],
      in_progress: ['closed','open'],
      closed: ['open'],
    },
    'vendor_portal:vendor_portal_accounts': {
      active: ['suspended','expired','closed'],
      suspended: ['active','closed'],
    },
    'warehouse:warehouse_operations': {
      draft: ['scheduled','cancelled'],
      active: ['scheduled','in_progress','completed','cancelled'],
      scheduled: ['in_progress','completed','cancelled'],
      in_progress: ['completed','cancelled'],
    },
    'whiteboard:whiteboards': {
      active: ['archived','closed'],
      archived: ['active','closed'],
    },
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


function tone(
  value:
    string,
): EnterpriseWorkflowTransition[
  'tone'
] {
  if (
    [
      'approved',
      'accepted',
      'active',
      'confirmed',
      'completed',
      'resolved',
      'closed',
      'paid',
      'posted',
      'delivered',
      'hired',
      'won',
    ].includes(
      value,
    )
  ) {
    return 'success';
  }

  if (
    [
      'cancelled',
      'rejected',
      'failed',
      'void',
      'lost',
      'returned',
      'expired',
    ].includes(
      value,
    )
  ) {
    return 'danger';
  }

  if (
    [
      'pending',
      'submitted',
      'on_hold',
      'paused',
      'overdue',
      'in_progress',
      'processing',
    ].includes(
      value,
    )
  ) {
    return 'warning';
  }

  return 'default';
}


export function getEnterpriseWorkflowTransitions(
  moduleKey:
    string,
  table:
    string,
  current:
    unknown,
  databaseAllowedValues?:
    string[],
): EnterpriseWorkflowTransition[] {
  const state =
    String(
      current ||
      '',
    )
      .trim()
      .toLowerCase();

  if (
    !state
  ) {
    return [];
  }

  const domain =
    DOMAIN_GRAPH[
      moduleKey +
      ':' +
      table
    ];

  const candidates =
    domain?.[
      state
    ] ||
    GENERIC_GRAPH[
      state
    ] ||
    [];

  const allowed =
    databaseAllowedValues &&
    databaseAllowedValues.length >
      0
      ? new Set(
          databaseAllowedValues.map(
            value =>
              value.toLowerCase(),
          ),
        )
      : null;

  return [
    ...new Set(
      candidates,
    ),
  ]
    .filter(
      value =>
        !allowed ||
        allowed.has(
          value,
        ),
    )
    .map(
      value => ({
        value,
        label:
          humanize(
            value,
          ),
        tone:
          tone(
            value,
          ),
      }),
    );
}
