export const ENTERPRISE_MODULE_TABLES = {
  accounting: ['accounting_settings','accounts','journals','journal_lines','accounting_fiscal_periods','accounting_bank_accounts','accounting_bank_statement_lines','accounting_reconciliation_rules','accounting_recurring_journals','accounting_recurring_journal_lines','accounting_opening_balance_batches','accounting_opening_balance_lines','accounting_vendors','accounting_vendor_documents','accounting_vendor_document_lines','accounting_vendor_credit_applications','accounting_purchase_policies','accounting_purchase_requisitions','accounting_purchase_requisition_lines','accounting_purchase_orders','accounting_purchase_order_lines','accounting_goods_receipts','accounting_goods_receipt_lines','accounting_purchase_matches','accounting_expense_category_mappings','accounting_expense_report_postings','accounting_expense_line_postings','accounting_expense_reimbursements','accounting_internal_transfers','accounting_bank_feed_connections','accounting_statement_import_batches','accounting_statement_import_rows','accounting_reconciliations','accounting_reconciliation_matches','accounting_reconciliation_suggestions', 'accounting_payment_batches', 'accounting_payment_allocations','accounting_tax_codes','accounting_tax_groups','accounting_tax_group_lines','accounting_tax_ledger_entries','accounting_kenya_settings','accounting_kenya_tax_mappings','accounting_kenya_sync_runs','accounting_localization_settings','accounting_localization_report_boxes','accounting_localization_report_rules','accounting_localization_report_runs','accounting_localization_pack_history','accounting_fx_settings','accounting_fx_currencies','accounting_exchange_rates','accounting_fx_financial_movements','accounting_fx_revaluation_runs','accounting_fx_revaluation_lines','accounting_inventory_settings','accounting_inventory_product_mappings','accounting_inventory_movement_rules','accounting_inventory_source_events','accounting_inventory_sync_runs','accounting_inventory_reconciliation_runs','accounting_inventory_reconciliation_lines','accounting_accrual_settings','accounting_accrual_schedules','accounting_accrual_schedule_lines','accounting_accrual_runs','accounting_financing_settings','accounting_financing_facilities','accounting_financing_rate_periods','accounting_financing_schedule_lines','accounting_financing_transactions','accounting_financing_interest_accruals','accounting_financing_reclassifications','accounting_financing_runs','accounting_budget_settings','accounting_budget_plans','accounting_budget_versions','accounting_budget_assumptions','accounting_budget_lines','accounting_budget_runs','accounting_budget_variance_snapshots','accounting_dimension_settings','accounting_analytic_projects','accounting_dimension_rules','accounting_journal_line_dimensions','accounting_dimension_budget_lines'],
  ads: ['ads_settings','ad_accounts','ad_campaigns','ad_daily_metrics'],
  appointments: ['appointment_services','appointments','appointment_availability_blocks','appointment_reminders','appointment_questions','appointment_answers','appointment_calendar_links','appointment_payment_requests'],
  appraisals: ['appraisal_cycles','appraisals','appraisal_goals','appraisal_competencies','appraisal_competency_scores','appraisal_feedback','appraisal_calibrations'],
  assets: ['assets_settings','operational_assets','operational_asset_events','operational_asset_documents'],
  attendance: ['attendance_settings','attendance_policies','attendance_entries','attendance_events','attendance_exceptions','attendance_corrections','attendance_overtime_requests','attendance_devices','attendance_geofences','attendance_kiosk_sessions'],
  barcode: ['barcode_settings','barcode_rules','barcode_identifiers','barcode_scan_events'],
  benefits: ['benefits_settings','benefit_plans','benefit_eligibility_rules','benefit_enrollments','benefit_claims','benefit_dependents','benefit_contributions'],
  billing: ['billing_settings','billing_accounts','billing_schedules','billing_charges','billing_adjustments','billing_cycles','billing_account_balances','billing_dunning_cases'],
  bookings: ['bookings_settings','booking_resources','bookings','booking_guests','booking_availability_rules'],
  budgeting: ['budgeting_settings','budgets','budget_lines','budget_revisions','budget_scenarios','budget_scenario_lines','budget_approvals'],
  calendar: ['calendar_settings','calendars','calendar_events','calendar_attendees'],
  cash_flow: ['cash_flow_settings','cash_flow_forecasts','cash_flow_items','cash_positions','cash_flow_scenarios','cash_flow_scenario_items','liquidity_alerts'],
  chat: ['chat_settings','chat_channels','chat_channel_members','chat_messages','chat_reactions'],
  checkout: ['checkout_settings','checkout_links','checkout_sessions','checkout_events'],
  commissions: ['commissions_settings','commission_plans','commission_assignments','commission_entries','commission_tiers','commission_payouts','commission_payout_lines'],
  cpq: ['cpq_settings','cpq_products','cpq_price_rules','cpq_quotes','cpq_quote_lines'],
  crm: ['leads','opportunities','crm_activities','crm_stages','crm_scoring_rules','crm_forecasts','crm_forecast_lines','crm_assignment_rules','crm_blueprints','crm_blueprint_transitions','crm_approval_requests'],
  customer_portal: ['customer_portal_settings','portal_customers','portal_access_grants','portal_messages','portal_requests','portal_document_views'],
  demand_planning: ['demand_planning_settings','demand_forecasts','demand_forecast_lines','replenishment_recommendations'],
  documents: ['document_folders','documents','document_versions','document_approvals','document_shares','document_access_events'],
  ecommerce: ['ecommerce_settings','storefronts','storefront_products','storefront_orders','storefront_order_lines'],
  email_marketing: ['email_campaigns','email_recipients','email_templates','email_campaign_events','email_segments','email_segment_members','email_suppressions'],
  employees: ['employees','employee_contracts','employee_emergency_contacts','employee_lifecycle_events','employee_departments','employee_certifications','employee_equipment_assignments'],
  events: ['events','event_registrations','event_sessions','event_tickets'],
  expenses: ['expense_categories','expenses','expense_policies','expense_reports','expense_report_lines','expense_mileage_rates'],
  facilities: ['facilities_settings','facilities','facility_spaces','facility_requests'],
  field_services: ['service_orders','service_visits','service_materials','service_checklists'],
  fixed_assets: ['fixed_assets_settings','fixed_assets','asset_depreciation_entries','asset_transfers','asset_disposals','asset_categories','asset_impairments','asset_insurance_policies','asset_depreciation_runs','asset_revaluations','asset_source_links'],
  fleet: ['vehicles','vehicle_assignments','fleet_services','vehicle_fuel_logs'],
  gift_cards: ['gift_cards_settings','gift_card_programs','gift_cards','gift_card_transactions'],
  helpdesk: ['support_tickets','ticket_messages','ticket_tags','helpdesk_sla_policies','ticket_sla_tracking','knowledge_articles','ticket_escalations'],
  inspections: ['inspections_settings','inspection_templates','inspections','inspection_findings'],
  inventory: ['products','warehouses','stock_levels','stock_movements','inventory_lots','stock_reservations','inventory_reorder_rules','inventory_adjustments','inventory_item_groups','inventory_composite_items','inventory_composite_components','inventory_price_lists','inventory_price_list_items','inventory_transfer_orders','inventory_transfer_order_lines','inventory_cycle_counts'],
  landing_pages: ['landing_pages_settings','landing_pages','landing_page_forms','landing_page_submissions'],
  lead_capture: ['lead_capture_settings','lead_capture_forms','lead_capture_entries','lead_capture_events'],
  learning: ['learning_settings','learning_courses','learning_paths','learning_path_courses','learning_enrollments','learning_assessments','learning_assessment_attempts','learning_certificates'],
  loyalty: ['loyalty_settings','loyalty_programs','loyalty_members','loyalty_transactions'],
  mail: ['mail_settings','mail_accounts','mail_threads','mail_messages'],
  maintenance: ['equipment','maintenance_requests','maintenance_logs','preventive_maintenance_plans'],
  manufacturing: ['boms','bom_items','manufacturing_orders','production_operations','work_centers','manufacturing_routings','manufacturing_routing_steps','manufacturing_material_reservations'],
  marketing_automation: ['automation_workflows','automation_steps','automation_runs','automation_segments'],
  marketplace: ['marketplace_settings','marketplace_sellers','marketplace_listings','marketplace_orders','marketplace_order_lines'],
  meetings: ['meetings_settings','meetings','meeting_participants','meeting_notes'],
  onboarding: ['onboarding_settings','onboarding_templates','onboarding_template_tasks','employee_onboardings','employee_onboarding_tasks','onboarding_documents','onboarding_checkins','onboarding_equipment_assignments'],
  org_chart: ['org_chart_settings','org_positions','org_position_history','succession_plans','succession_candidates','position_requirements'],
  payments: ['payments_settings','payment_accounts','business_payments','payment_allocations','payment_reconciliations','payment_batches','payment_batch_items','payment_refunds','payment_disputes'],
  payroll: ['payroll_settings','payroll_periods','payroll_employees','payroll_runs','payroll_run_lines','payroll_components','payroll_employee_components','payslips','payslip_lines','payroll_salary_rules','payroll_work_entries','payroll_salary_attachments','payroll_payment_batches'],
  planning: ['planning_shifts','planning_assignments','planning_resources','planning_capacity'],
  plm: ['product_versions','engineering_changes','change_items','engineering_change_approvals'],
  pos_restaurant: ['menu_items','restaurant_tables','restaurant_orders','restaurant_order_items','restaurant_floors','restaurant_sessions','restaurant_payments','restaurant_preparation_tickets','restaurant_self_order_sessions'],
  pos_shop: ['shop_products','shop_orders','shop_order_items','shop_returns','pos_shop_sessions','pos_shop_payments','pos_shop_cash_movements','pos_shop_devices'],
  projects: ['projects','tasks','project_milestones','task_dependencies','project_budgets','project_budget_lines','project_resources'],
  purchase: ['suppliers','purchase_orders','purchase_order_items','purchase_requisitions','purchase_requisition_lines','purchase_receipts','purchase_receipt_lines','supplier_price_lists','supplier_price_list_items','supplier_rfqs','supplier_rfq_responses'],
  quality: ['quality_checks','quality_issues','quality_check_items','quality_corrective_actions','quality_control_points','quality_alerts'],
  recruitment: ['job_positions','applicants','interviews','recruitment_requisitions','applicant_sources','interview_scorecards','job_offers'],
  referrals: ['referral_programs','referrals','referral_conversions','referral_rewards'],
  rentals: ['rental_items','rental_contracts','rental_reservations','rental_charges'],
  safety: ['safety_settings','safety_incidents','safety_actions','safety_checks'],
  sales_inbox: ['sales_inbox_settings','sales_inboxes','sales_conversations','sales_messages'],
  seo: ['seo_settings','seo_sites','seo_keywords','seo_rankings','seo_issues'],
  shifts: ['shifts_settings','shift_templates','shift_schedules','shift_assignments','open_shifts','shift_swap_requests','shift_availability'],
  shipping: ['shipping_settings','shipping_carriers','shipments','shipment_packages','shipment_events','shipping_rate_quotes','shipping_labels'],
  sign: ['signature_requests','signers','signature_templates','signature_audit_events','signature_documents','signature_fields','signature_auth_challenges','signature_completion_certificates'],
  sms_marketing: ['sms_campaigns','sms_recipients','sms_templates','sms_delivery_events','sms_segments','sms_segment_members','sms_opt_outs'],
  social_marketing: ['social_accounts','social_posts','social_campaigns','social_post_metrics','social_inbox_items','social_audiences'],
  spreadsheet: ['workbooks','sheets','cells','bi_reports','workbook_data_sources','workbook_versions','dashboard_widgets'],
  subscriptions: ['subscription_plans','subscriptions','subscription_payments','subscription_plan_prices','subscription_changes','subscription_usage_charges','subscription_renewals'],
  surveys: ['surveys','survey_questions','survey_responses','survey_answers'],
  tax: ['tax_settings','tax_obligations','tax_filings','tax_payments','tax_codes','tax_rules','withholding_certificates'],
  team_inbox: ['team_inbox_settings','team_inboxes','team_inbox_threads','team_inbox_messages'],
  time_off: ['leave_types','leave_requests','leave_balances','leave_accruals','leave_blackout_periods'],
  timesheets: ['time_entries','timesheet_periods','timesheet_submissions','timesheet_approvals'],
  vendor_portal: ['vendor_portal_settings','vendor_portal_accounts','vendor_portal_documents','vendor_portal_messages','vendor_portal_rfqs','vendor_portal_rfq_responses'],
  warehouse: ['warehouse_settings','warehouse_locations','warehouse_operations','warehouse_operation_lines','warehouse_putaway_rules','warehouse_picking_batches','warehouse_picking_batch_operations','warehouse_packages'],
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
