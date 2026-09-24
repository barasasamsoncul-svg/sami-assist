export const ENTERPRISE_MODULE_TABLES = {
  accounting: ['accounts','journals','journal_lines'],
  ads: ['ads_settings','ad_accounts','ad_campaigns','ad_daily_metrics'],
  appointments: ['appointment_services','appointments'],
  appraisals: ['appraisal_cycles','appraisals','appraisal_goals'],
  assets: ['assets_settings','operational_assets','operational_asset_events','operational_asset_documents'],
  attendance: ['attendance_settings','attendance_policies','attendance_entries','attendance_events'],
  barcode: ['barcode_settings','barcode_rules','barcode_identifiers','barcode_scan_events'],
  benefits: ['benefits_settings','benefit_plans','benefit_eligibility_rules','benefit_enrollments'],
  billing: ['billing_settings','billing_accounts','billing_schedules','billing_charges','billing_adjustments'],
  bookings: ['bookings_settings','booking_resources','bookings','booking_guests','booking_availability_rules'],
  budgeting: ['budgeting_settings','budgets','budget_lines','budget_revisions'],
  calendar: ['calendar_settings','calendars','calendar_events','calendar_attendees'],
  cash_flow: ['cash_flow_settings','cash_flow_forecasts','cash_flow_items','cash_positions'],
  chat: ['chat_settings','chat_channels','chat_channel_members','chat_messages','chat_reactions'],
  checkout: ['checkout_settings','checkout_links','checkout_sessions','checkout_events'],
  commissions: ['commissions_settings','commission_plans','commission_assignments','commission_entries'],
  cpq: ['cpq_settings','cpq_products','cpq_price_rules','cpq_quotes','cpq_quote_lines'],
  crm: ['leads','opportunities','crm_activities'],
  customer_portal: ['customer_portal_settings','portal_customers','portal_access_grants','portal_messages'],
  demand_planning: ['demand_planning_settings','demand_forecasts','demand_forecast_lines','replenishment_recommendations'],
  documents: ['document_folders','documents'],
  ecommerce: ['ecommerce_settings','storefronts','storefront_products','storefront_orders','storefront_order_lines'],
  email_marketing: ['email_campaigns','email_recipients'],
  employees: ['employees'],
  events: ['events','event_registrations'],
  expenses: ['expense_categories','expenses'],
  facilities: ['facilities_settings','facilities','facility_spaces','facility_requests'],
  field_services: ['service_orders','service_visits','service_materials'],
  fixed_assets: ['fixed_assets_settings','fixed_assets','asset_depreciation_entries','asset_transfers','asset_disposals'],
  fleet: ['vehicles','vehicle_assignments','fleet_services'],
  gift_cards: ['gift_cards_settings','gift_card_programs','gift_cards','gift_card_transactions'],
  helpdesk: ['support_tickets','ticket_messages','ticket_tags'],
  inspections: ['inspections_settings','inspection_templates','inspections','inspection_findings'],
  inventory: ['products','warehouses','stock_levels','stock_movements'],
  landing_pages: ['landing_pages_settings','landing_pages','landing_page_forms','landing_page_submissions'],
  lead_capture: ['lead_capture_settings','lead_capture_forms','lead_capture_entries','lead_capture_events'],
  learning: ['learning_settings','learning_courses','learning_paths','learning_path_courses','learning_enrollments'],
  loyalty: ['loyalty_settings','loyalty_programs','loyalty_members','loyalty_transactions'],
  mail: ['mail_settings','mail_accounts','mail_threads','mail_messages'],
  maintenance: ['equipment','maintenance_requests','maintenance_logs'],
  manufacturing: ['boms','bom_items','manufacturing_orders','production_operations'],
  marketing_automation: ['automation_workflows','automation_steps','automation_runs'],
  marketplace: ['marketplace_settings','marketplace_sellers','marketplace_listings','marketplace_orders','marketplace_order_lines'],
  meetings: ['meetings_settings','meetings','meeting_participants','meeting_notes'],
  onboarding: ['onboarding_settings','onboarding_templates','onboarding_template_tasks','employee_onboardings','employee_onboarding_tasks'],
  org_chart: ['org_chart_settings','org_positions','org_position_history'],
  payments: ['payments_settings','payment_accounts','business_payments','payment_allocations','payment_reconciliations'],
  payroll: ['payroll_settings','payroll_periods','payroll_employees','payroll_runs','payroll_run_lines'],
  planning: ['planning_shifts','planning_assignments','planning_resources'],
  plm: ['product_versions','engineering_changes','change_items'],
  pos_restaurant: ['menu_items','restaurant_tables','restaurant_orders','restaurant_order_items'],
  pos_shop: ['shop_products','shop_orders','shop_order_items'],
  projects: ['projects','tasks','project_milestones'],
  purchase: ['suppliers','purchase_orders','purchase_order_items'],
  quality: ['quality_checks','quality_issues','quality_check_items'],
  recruitment: ['job_positions','applicants','interviews'],
  referrals: ['referral_programs','referrals'],
  rentals: ['rental_items','rental_contracts'],
  safety: ['safety_settings','safety_incidents','safety_actions','safety_checks'],
  sales_inbox: ['sales_inbox_settings','sales_inboxes','sales_conversations','sales_messages'],
  seo: ['seo_settings','seo_sites','seo_keywords','seo_rankings','seo_issues'],
  shifts: ['shifts_settings','shift_templates','shift_schedules','shift_assignments'],
  shipping: ['shipping_settings','shipping_carriers','shipments','shipment_packages','shipment_events'],
  sign: ['signature_requests','signers'],
  sms_marketing: ['sms_campaigns','sms_recipients'],
  social_marketing: ['social_accounts','social_posts'],
  spreadsheet: ['workbooks','sheets','cells','bi_reports'],
  subscriptions: ['subscription_plans','subscriptions','subscription_payments'],
  surveys: ['surveys','survey_questions','survey_responses','survey_answers'],
  tax: ['tax_settings','tax_obligations','tax_filings','tax_payments'],
  team_inbox: ['team_inbox_settings','team_inboxes','team_inbox_threads','team_inbox_messages'],
  time_off: ['leave_types','leave_requests'],
  timesheets: ['time_entries'],
  vendor_portal: ['vendor_portal_settings','vendor_portal_accounts','vendor_portal_documents','vendor_portal_messages'],
  warehouse: ['warehouse_settings','warehouse_locations','warehouse_operations','warehouse_operation_lines'],
  web_analytics: ['web_analytics_settings','analytics_sites','analytics_sessions','analytics_events','analytics_conversions'],
  whiteboard: ['whiteboard_settings','whiteboards','whiteboard_members','whiteboard_versions'],
  work_orders: ['work_orders_settings','work_orders','work_order_tasks','work_order_materials'],
} as const;

export type EnterpriseModuleKey =
  keyof typeof ENTERPRISE_MODULE_TABLES;

export function isEnterpriseModuleKey(
  value:
    string,
): value is EnterpriseModuleKey {
  return Object.prototype
    .hasOwnProperty
    .call(
      ENTERPRISE_MODULE_TABLES,
      value,
    );
}

export function enterpriseModuleTables(
  moduleKey:
    string,
) {
  if (
    !isEnterpriseModuleKey(
      moduleKey,
    )
  ) {
    return [];
  }

  return [
    ...ENTERPRISE_MODULE_TABLES[
      moduleKey
    ],
  ];
}
