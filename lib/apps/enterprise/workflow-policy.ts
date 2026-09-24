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
      scheduled: [
        'in_progress',
        'cancelled',
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
      confirmed: [
        'completed',
        'cancelled',
        'no_show',
      ],
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
