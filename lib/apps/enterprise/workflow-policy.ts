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
    'accounting:accounting_fiscal_periods': {
      open: ['closing','closed'],
      closing: ['open','closed'],
      closed: ['open'],
    },
    'accounting:accounting_bank_statement_lines': {
      unmatched: ['suggested','matched','excluded'],
      suggested: ['unmatched','matched','excluded'],
      matched: ['unmatched'],
      excluded: ['unmatched'],
    },
    'inventory:inventory_lots': {
      active: ['quarantined','expired','consumed'],
      quarantined: ['active','expired','consumed'],
      expired: ['quarantined'],
    },
    'inventory:stock_reservations': {
      active: ['allocated','released','cancelled'],
      allocated: ['consumed','released','cancelled'],
      released: ['active','cancelled'],
    },
    'inventory:inventory_adjustments': {
      draft: ['submitted','cancelled'],
      submitted: ['approved','draft','cancelled'],
      approved: ['posted','cancelled'],
    },
    'warehouse:warehouse_picking_batches': {
      draft: ['ready','cancelled'],
      ready: ['in_progress','cancelled'],
      in_progress: ['completed','cancelled'],
    },
    'warehouse:warehouse_packages': {
      open: ['packed','cancelled'],
      packed: ['in_transit','cancelled'],
      in_transit: ['delivered','cancelled'],
    },
    'payroll:payslips': {
      draft: ['computed','cancelled'],
      computed: ['approved','draft','cancelled'],
      approved: ['paid','cancelled'],
    },
    'crm:crm_forecasts': {
      draft: ['active','cancelled'],
      active: ['closed','cancelled'],
    },
    'projects:project_budgets': {
      draft: ['submitted','cancelled'],
      submitted: ['approved','draft','cancelled'],
      approved: ['closed','cancelled'],
    },
    'helpdesk:ticket_sla_tracking': {
      active: ['met','breached','paused','cancelled'],
      paused: ['active','breached','cancelled'],
      breached: ['met','cancelled'],
    },
    'helpdesk:knowledge_articles': {
      draft: ['published','archived'],
      published: ['draft','archived'],
      archived: ['draft'],
    },
    'helpdesk:ticket_escalations': {
      open: ['acknowledged','resolved','cancelled'],
      acknowledged: ['resolved','cancelled'],
      resolved: ['open'],
    },
    'manufacturing:work_centers': {
      active: ['maintenance','inactive'],
      maintenance: ['active','inactive'],
      inactive: ['active','maintenance'],
    },
    'manufacturing:manufacturing_routings': {
      draft: ['active','archived'],
      active: ['draft','archived'],
      archived: ['draft'],
    },
    'manufacturing:manufacturing_material_reservations': {
      required: ['reserved','partially_reserved','released','cancelled'],
      partially_reserved: ['reserved','released','cancelled'],
      reserved: ['consumed','released','cancelled'],
      released: ['required','cancelled'],
    },
    'purchase:purchase_requisitions': {
      draft: ['submitted','cancelled'],
      submitted: ['approved','rejected','draft','cancelled'],
      approved: ['converted','cancelled'],
      rejected: ['draft','cancelled'],
    },
    'purchase:purchase_receipts': {
      draft: ['received','cancelled'],
      received: ['inspected','posted','cancelled'],
      inspected: ['posted','received','cancelled'],
    },
    'expenses:expense_reports': {
      draft: ['submitted','cancelled'],
      submitted: ['approved','rejected','draft','cancelled'],
      approved: ['reimbursed','cancelled'],
      rejected: ['draft','cancelled'],
    },
    'fixed_assets:asset_impairments': {
      draft: ['approved','cancelled'],
      approved: ['posted','cancelled'],
    },
    'fixed_assets:asset_insurance_policies': {
      active: ['expired','cancelled'],
      expired: ['active'],
    },
    'tax:withholding_certificates': {
      draft: ['issued','void'],
      issued: ['void'],
    },
    'budgeting:budget_scenarios': {
      draft: ['active','archived'],
      active: ['archived','draft'],
      archived: ['draft'],
    },
    'budgeting:budget_approvals': {
      pending: ['approved','rejected','cancelled'],
      rejected: ['pending','cancelled'],
    },
    'cash_flow:cash_flow_scenarios': {
      active: ['archived'],
      archived: ['active'],
    },
    'cash_flow:liquidity_alerts': {
      open: ['acknowledged','resolved'],
      acknowledged: ['open','resolved'],
      resolved: ['open'],
    },
    'billing:billing_cycles': {
      draft: ['running','cancelled'],
      running: ['completed','failed','cancelled'],
      failed: ['draft','running','cancelled'],
    },
    'billing:billing_dunning_cases': {
      open: ['contacted','promise_to_pay','escalated','resolved','cancelled'],
      contacted: ['promise_to_pay','escalated','resolved','cancelled'],
      promise_to_pay: ['contacted','escalated','resolved','cancelled'],
      escalated: ['contacted','promise_to_pay','resolved','cancelled'],
    },
    'subscriptions:subscription_changes': {
      scheduled: ['applied','cancelled'],
    },
    'subscriptions:subscription_usage_charges': {
      pending: ['billed','waived','cancelled'],
    },
    'subscriptions:subscription_renewals': {
      pending: ['renewed','failed','cancelled'],
      failed: ['pending','cancelled'],
    },
    'payments:payment_batches': {
      draft: ['submitted','cancelled'],
      submitted: ['processing','cancelled'],
      processing: ['completed','failed','cancelled'],
      failed: ['draft','submitted','cancelled'],
    },
    'payments:payment_refunds': {
      requested: ['approved','rejected','cancelled'],
      approved: ['processing','cancelled'],
      processing: ['completed','rejected','cancelled'],
    },
    'payments:payment_disputes': {
      open: ['under_review','cancelled'],
      under_review: ['won','lost','closed','cancelled'],
      won: ['closed'],
      lost: ['closed'],
    },
    'commissions:commission_payouts': {
      draft: ['submitted','cancelled'],
      submitted: ['approved','draft','cancelled'],
      approved: ['paid','cancelled'],
    },
    'employees:employee_contracts': {
      draft: ['active','cancelled'],
      active: ['expired','terminated','cancelled'],
    },
    'employees:employee_lifecycle_events': {
      planned: ['effective','cancelled'],
      effective: ['cancelled'],
    },
    'recruitment:recruitment_requisitions': {
      draft: ['submitted','cancelled'],
      submitted: ['approved','rejected','draft','cancelled'],
      approved: ['open','cancelled'],
      open: ['filled','cancelled'],
      rejected: ['draft','cancelled'],
    },
    'recruitment:job_offers': {
      draft: ['approved','withdrawn'],
      approved: ['sent','withdrawn'],
      sent: ['accepted','rejected','expired','withdrawn'],
    },
    'attendance:attendance_exceptions': {
      open: ['acknowledged','resolved','waived'],
      acknowledged: ['resolved','waived','open'],
    },
    'attendance:attendance_corrections': {
      pending: ['approved','rejected','cancelled'],
      rejected: ['pending','cancelled'],
    },
    'attendance:attendance_overtime_requests': {
      pending: ['approved','rejected','cancelled'],
      rejected: ['pending','cancelled'],
    },
    'shifts:open_shifts': {
      open: ['filled','cancelled'],
      filled: ['open','cancelled'],
    },
    'shifts:shift_swap_requests': {
      pending: ['accepted','approved','rejected','cancelled'],
      accepted: ['approved','rejected','cancelled'],
    },
    'time_off:leave_balances': {
      active: ['closed'],
      closed: ['active'],
    },
    'time_off:leave_accruals': {
      draft: ['posted','reversed'],
      posted: ['reversed'],
    },
    'timesheets:timesheet_periods': {
      open: ['submitted','locked','closed'],
      submitted: ['open','locked','closed'],
      locked: ['closed','open'],
    },
    'timesheets:timesheet_submissions': {
      draft: ['submitted'],
      submitted: ['approved','rejected','draft'],
      approved: ['locked'],
      rejected: ['draft'],
    },
    'timesheets:timesheet_approvals': {
      pending: ['completed','cancelled'],
    },
    'benefits:benefit_claims': {
      submitted: ['under_review','rejected','cancelled'],
      under_review: ['approved','rejected','cancelled'],
      approved: ['paid','cancelled'],
    },
    'benefits:benefit_contributions': {
      draft: ['posted','reversed'],
      posted: ['reversed'],
    },
    'appraisals:appraisal_feedback': {
      draft: ['submitted','withdrawn'],
      submitted: ['withdrawn'],
    },
    'appraisals:appraisal_calibrations': {
      effective: ['reversed'],
    },
    'onboarding:onboarding_documents': {
      pending: ['submitted','waived'],
      submitted: ['verified','rejected','waived'],
      rejected: ['submitted','waived'],
    },
    'onboarding:onboarding_checkins': {
      scheduled: ['completed','cancelled'],
    },
    'onboarding:onboarding_equipment_assignments': {
      pending: ['assigned','cancelled'],
      assigned: ['returned','lost','cancelled'],
      lost: ['returned'],
    },
    'learning:learning_assessment_attempts': {
      in_progress: ['submitted','cancelled'],
      submitted: ['graded','cancelled'],
    },
    'learning:learning_certificates': {
      valid: ['expired','revoked'],
      expired: ['revoked'],
    },
    'org_chart:succession_plans': {
      active: ['closed','cancelled'],
      closed: ['active'],
    },
    'org_chart:succession_candidates': {
      active: ['selected','withdrawn'],
      selected: ['active','withdrawn'],
    },
    'assets:operational_assets': {
      active: ['maintenance','inactive','retired'],
      maintenance: ['active','inactive','retired'],
      inactive: ['active','retired'],
    },
    'barcode:barcode_rules': {
      active: ['inactive'],
      inactive: ['active'],
    },
    'barcode:barcode_identifiers': {
      active: ['inactive'],
      inactive: ['active'],
    },
    'chat:chat_channels': {
      active: ['archived','closed'],
      archived: ['active','closed'],
    },
    'chat:chat_channel_members': {
      active: ['inactive'],
      inactive: ['active'],
    },
    'cpq:cpq_quotes': {
      active: ['sent','cancelled'],
      sent: ['accepted','rejected','expired','cancelled'],
      accepted: ['confirmed','completed','cancelled'],
    },
    'web_analytics:analytics_sites': {
      active: ['inactive'],
      inactive: ['active'],
    },
    'web_analytics:analytics_sessions': {
      active: ['completed'],
      completed: ['active'],
    },
    'whiteboard:whiteboards': {
      active: ['archived','closed'],
      archived: ['active','closed'],
    },
    'appointments:appointment_availability_blocks': {
      blocked: ['released','cancelled'],
      released: ['blocked'],
    },
    'appointments:appointment_reminders': {
      scheduled: ['sent','failed','cancelled'],
      failed: ['scheduled','cancelled'],
    },
    'documents:document_versions': {
      current: ['superseded','archived'],
      superseded: ['archived'],
    },
    'documents:document_approvals': {
      pending: ['approved','rejected','cancelled'],
    },
    'email_marketing:email_templates': {
      draft: ['active','archived'],
      active: ['archived'],
    },
    'email_marketing:email_campaign_events': {
      recorded: ['ignored'],
    },
    'events:event_sessions': {
      scheduled: ['open','completed','cancelled'],
      open: ['completed','cancelled'],
    },
    'events:event_tickets': {
      issued: ['checked_in','refunded','cancelled'],
      checked_in: ['refunded'],
    },
    'field_services:service_checklists': {
      open: ['completed','waived','cancelled'],
    },
    'fleet:vehicle_fuel_logs': {
      draft: ['posted','void'],
      posted: ['void'],
    },
    'maintenance:preventive_maintenance_plans': {
      active: ['paused','retired'],
      paused: ['active','retired'],
    },
    'marketing_automation:automation_segments': {
      draft: ['active','archived'],
      active: ['paused','archived'],
      paused: ['active','archived'],
    },
    'planning:planning_capacity': {
      open: ['overallocated','closed'],
      overallocated: ['open','closed'],
    },
    'plm:engineering_change_approvals': {
      pending: ['approved','rejected','cancelled'],
    },
    'pos_shop:shop_returns': {
      draft: ['approved','rejected','cancelled'],
      approved: ['processed','cancelled'],
    },
    'quality:quality_corrective_actions': {
      open: ['in_progress','cancelled'],
      in_progress: ['implemented','cancelled'],
      implemented: ['verified','in_progress'],
    },
    'referrals:referral_conversions': {
      pending: ['confirmed','reversed'],
      confirmed: ['reversed'],
    },
    'referrals:referral_rewards': {
      pending: ['approved','cancelled'],
      approved: ['issued','cancelled'],
    },
    'rentals:rental_reservations': {
      reserved: ['active','cancelled'],
      active: ['returned','cancelled'],
    },
    'rentals:rental_charges': {
      pending: ['posted','waived','cancelled'],
    },
    'sign:signature_templates': {
      draft: ['active','archived'],
      active: ['archived'],
    },
    'sign:signature_audit_events': {
      recorded: ['ignored'],
    },
    'sms_marketing:sms_templates': {
      draft: ['active','archived'],
      active: ['archived'],
    },
    'sms_marketing:sms_delivery_events': {
      recorded: ['ignored'],
    },
    'social_marketing:social_campaigns': {
      draft: ['scheduled','active','cancelled'],
      scheduled: ['active','cancelled'],
      active: ['completed','cancelled'],
    },
    'social_marketing:social_post_metrics': {
      recorded: ['estimated'],
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
