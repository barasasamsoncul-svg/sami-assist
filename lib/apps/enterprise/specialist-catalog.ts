export const SPECIALIST_ENTERPRISE_TABLES = {
  accounting: [
    'accounting_settings',
    'accounting_fiscal_periods',
    'accounting_bank_accounts',
    'accounting_bank_statement_lines',
    'accounting_reconciliation_rules',
    'accounting_recurring_journals',
    'accounting_recurring_journal_lines',
    'accounting_opening_balance_batches',
    'accounting_opening_balance_lines',
    'accounting_vendors',
    'accounting_vendor_documents',
    'accounting_vendor_document_lines',
    'accounting_vendor_credit_applications',
    'accounting_purchase_policies',
    'accounting_purchase_requisitions',
    'accounting_purchase_requisition_lines',
    'accounting_purchase_orders',
    'accounting_purchase_order_lines',
    'accounting_goods_receipts',
    'accounting_goods_receipt_lines',
    'accounting_purchase_matches',
    'accounting_expense_category_mappings',
    'accounting_expense_report_postings',
    'accounting_expense_line_postings',
    'accounting_expense_reimbursements',
  ],
  inventory: [
    'inventory_lots',
    'stock_reservations',
    'inventory_reorder_rules',
    'inventory_adjustments',
    'inventory_item_groups',
    'inventory_composite_items',
    'inventory_composite_components',
    'inventory_price_lists',
    'inventory_price_list_items',
    'inventory_transfer_orders',
    'inventory_transfer_order_lines',
    'inventory_cycle_counts',
  ],
  warehouse: [
    'warehouse_putaway_rules',
    'warehouse_picking_batches',
    'warehouse_picking_batch_operations',
    'warehouse_packages',
  ],
  payroll: [
    'payroll_components',
    'payroll_employee_components',
    'payslips',
    'payslip_lines',
    'payroll_salary_rules',
    'payroll_work_entries',
    'payroll_salary_attachments',
    'payroll_payment_batches',
  ],
  crm: [
    'crm_stages',
    'crm_scoring_rules',
    'crm_forecasts',
    'crm_forecast_lines',
    'crm_assignment_rules',
    'crm_blueprints',
    'crm_blueprint_transitions',
    'crm_approval_requests',
  ],
  projects: [
    'task_dependencies',
    'project_budgets',
    'project_budget_lines',
    'project_resources',
  ],
  helpdesk: [
    'helpdesk_sla_policies',
    'ticket_sla_tracking',
    'knowledge_articles',
    'ticket_escalations',
  ],
  manufacturing: [
    'work_centers',
    'manufacturing_routings',
    'manufacturing_routing_steps',
    'manufacturing_material_reservations',
  ],
  purchase: [
    'purchase_requisitions',
    'purchase_requisition_lines',
    'purchase_receipts',
    'purchase_receipt_lines',
    'supplier_price_lists',
    'supplier_price_list_items',
    'supplier_rfqs',
    'supplier_rfq_responses',
  ],
  expenses: [
    'expense_policies',
    'expense_reports',
    'expense_report_lines',
    'expense_mileage_rates',
  ],
  fixed_assets: [
    'asset_categories',
    'asset_impairments',
    'asset_insurance_policies',
  ],
  tax: [
    'tax_codes',
    'tax_rules',
    'withholding_certificates',
  ],
  budgeting: [
    'budget_scenarios',
    'budget_scenario_lines',
    'budget_approvals',
  ],
  cash_flow: [
    'cash_flow_scenarios',
    'cash_flow_scenario_items',
    'liquidity_alerts',
  ],
  billing: [
    'billing_cycles',
    'billing_account_balances',
    'billing_dunning_cases',
  ],
  subscriptions: [
    'subscription_plan_prices',
    'subscription_changes',
    'subscription_usage_charges',
    'subscription_renewals',
  ],
  payments: [
    'payment_batches',
    'payment_batch_items',
    'payment_refunds',
    'payment_disputes',
  ],
  commissions: [
    'commission_tiers',
    'commission_payouts',
    'commission_payout_lines',
  ],
  employees: [
    'employee_contracts',
    'employee_emergency_contacts',
    'employee_lifecycle_events',
    'employee_departments',
    'employee_certifications',
    'employee_equipment_assignments',
  ],
  recruitment: [
    'recruitment_requisitions',
    'applicant_sources',
    'interview_scorecards',
    'job_offers',
  ],
  attendance: [
    'attendance_exceptions',
    'attendance_corrections',
    'attendance_overtime_requests',
    'attendance_devices',
    'attendance_geofences',
    'attendance_kiosk_sessions',
  ],
  shifts: [
    'open_shifts',
    'shift_swap_requests',
    'shift_availability',
  ],
  time_off: [
    'leave_balances',
    'leave_accruals',
    'leave_blackout_periods',
  ],
  timesheets: [
    'timesheet_periods',
    'timesheet_submissions',
    'timesheet_approvals',
  ],
  benefits: [
    'benefit_claims',
    'benefit_dependents',
    'benefit_contributions',
  ],
  appraisals: [
    'appraisal_competencies',
    'appraisal_competency_scores',
    'appraisal_feedback',
    'appraisal_calibrations',
  ],
  onboarding: [
    'onboarding_documents',
    'onboarding_checkins',
    'onboarding_equipment_assignments',
  ],
  learning: [
    'learning_assessments',
    'learning_assessment_attempts',
    'learning_certificates',
  ],
  org_chart: [
    'succession_plans',
    'succession_candidates',
    'position_requirements',
  ],
  ads: [
  ],
  appointments: [
    'appointment_availability_blocks',
    'appointment_reminders',
    'appointment_questions',
    'appointment_answers',
    'appointment_calendar_links',
    'appointment_payment_requests',
  ],
  assets: [
  ],
  barcode: [
  ],
  bookings: [
  ],
  calendar: [
  ],
  chat: [
  ],
  checkout: [
  ],
  cpq: [
  ],
  customer_portal: [
    'portal_requests',
    'portal_document_views',
  ],
  demand_planning: [
  ],
  documents: [
    'document_versions',
    'document_approvals',
    'document_shares',
    'document_access_events',
  ],
  ecommerce: [
  ],
  email_marketing: [
    'email_templates',
    'email_campaign_events',
    'email_segments',
    'email_segment_members',
    'email_suppressions',
  ],
  events: [
    'event_sessions',
    'event_tickets',
  ],
  facilities: [
  ],
  field_services: [
    'service_checklists',
  ],
  fleet: [
    'vehicle_fuel_logs',
  ],
  gift_cards: [
  ],
  inspections: [
  ],
  landing_pages: [
  ],
  lead_capture: [
  ],
  loyalty: [
  ],
  mail: [
  ],
  maintenance: [
    'preventive_maintenance_plans',
  ],
  marketing_automation: [
    'automation_segments',
  ],
  marketplace: [
  ],
  meetings: [
  ],
  planning: [
    'planning_capacity',
  ],
  plm: [
    'engineering_change_approvals',
  ],
  pos_restaurant: [
    'restaurant_floors',
    'restaurant_sessions',
    'restaurant_payments',
    'restaurant_preparation_tickets',
    'restaurant_self_order_sessions',
  ],
  pos_shop: [
    'shop_returns',
    'pos_shop_sessions',
    'pos_shop_payments',
    'pos_shop_cash_movements',
    'pos_shop_devices',
  ],
  quality: [
    'quality_corrective_actions',
    'quality_control_points',
    'quality_alerts',
  ],
  referrals: [
    'referral_conversions',
    'referral_rewards',
  ],
  rentals: [
    'rental_reservations',
    'rental_charges',
  ],
  safety: [
  ],
  sales_inbox: [
  ],
  seo: [
  ],
  shipping: [
    'shipping_rate_quotes',
    'shipping_labels',
  ],
  sign: [
    'signature_templates',
    'signature_audit_events',
    'signature_documents',
    'signature_fields',
    'signature_auth_challenges',
    'signature_completion_certificates',
  ],
  sms_marketing: [
    'sms_templates',
    'sms_delivery_events',
    'sms_segments',
    'sms_segment_members',
    'sms_opt_outs',
  ],
  social_marketing: [
    'social_campaigns',
    'social_post_metrics',
    'social_inbox_items',
    'social_audiences',
  ],
  spreadsheet: [
    'workbook_data_sources',
    'workbook_versions',
    'dashboard_widgets',
  ],
  surveys: [
  ],
  team_inbox: [
  ],
  vendor_portal: [
    'vendor_portal_rfqs',
    'vendor_portal_rfq_responses',
  ],
  web_analytics: [
  ],
  whiteboard: [
  ],
  work_orders: [
  ],
} as const;

export type SpecialistEnterpriseModuleKey =
  keyof typeof SPECIALIST_ENTERPRISE_TABLES;

export function isSpecialistEnterpriseModuleKey(
  value:
    string,
): value is SpecialistEnterpriseModuleKey {
  return Object.prototype
    .hasOwnProperty
    .call(
      SPECIALIST_ENTERPRISE_TABLES,
      value,
    );
}

export function specialistEnterpriseTables(
  moduleKey:
    string,
) {
  if (
    !isSpecialistEnterpriseModuleKey(
      moduleKey,
    )
  ) {
    return [];
  }

  return [
    ...SPECIALIST_ENTERPRISE_TABLES[
      moduleKey
    ],
  ];
}
