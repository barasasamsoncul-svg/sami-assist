export const APP_SCHEMA_TABLES: Record<string, string[]> = {
  "accounting": [
    "accounts",
    "journals",
    "journal_lines"
  ],
  "appointments": [
    "appointment_services",
    "appointments"
  ],
  "appraisals": [
    "appraisal_cycles",
    "appraisals",
    "appraisal_goals"
  ],
  "crm": [
    "leads",
    "opportunities",
    "crm_activities"
  ],
  "documents": [
    "documents",
    "document_folders"
  ],
  "email_marketing": [
    "email_campaigns",
    "email_recipients"
  ],
  "employees": [
    "employees"
  ],
  "events": [
    "events",
    "event_registrations"
  ],
  "expenses": [
    "expense_categories",
    "expenses"
  ],
  "field_services": [
    "service_orders",
    "service_visits",
    "service_materials"
  ],
  "fleet": [
    "vehicles",
    "vehicle_assignments",
    "fleet_services"
  ],
  "helpdesk": [
    "support_tickets",
    "ticket_messages",
    "ticket_tags"
  ],
  "inventory": [
    "products",
    "warehouses",
    "stock_levels",
    "stock_movements"
  ],
  "invoicing": [
    "customers",
    "invoices",
    "invoice_items",
    "payments"
  ],
  "maintenance": [
    "equipment",
    "maintenance_requests",
    "maintenance_logs"
  ],
  "manufacturing": [
    "boms",
    "bom_items",
    "manufacturing_orders",
    "production_operations"
  ],
  "marketing_automation": [
    "automation_workflows",
    "automation_steps",
    "automation_runs"
  ],
  "planning": [
    "planning_shifts",
    "planning_assignments",
    "planning_resources"
  ],
  "plm": [
    "product_versions",
    "engineering_changes",
    "change_items"
  ],
  "pos_restaurant": [
    "menu_items",
    "restaurant_tables",
    "restaurant_orders",
    "restaurant_order_items"
  ],
  "pos_shop": [
    "shop_products",
    "shop_orders",
    "shop_order_items"
  ],
  "projects": [
    "projects",
    "tasks",
    "project_milestones"
  ],
  "purchase": [
    "suppliers",
    "purchase_orders",
    "purchase_order_items"
  ],
  "quality": [
    "quality_checks",
    "quality_issues",
    "quality_check_items"
  ],
  "recruitment": [
    "job_positions",
    "applicants",
    "interviews"
  ],
  "referrals": [
    "referral_programs",
    "referrals"
  ],
  "rentals": [
    "rental_items",
    "rental_contracts"
  ],
  "sales": [
    "quotations",
    "quotation_items",
    "sales_orders",
    "sales_order_items"
  ],
  "sign": [
    "signature_requests",
    "signers"
  ],
  "sms_marketing": [
    "sms_campaigns",
    "sms_recipients"
  ],
  "social_marketing": [
    "social_accounts",
    "social_posts"
  ],
  "spreadsheet": [
    "workbooks",
    "sheets",
    "cells",
    "bi_reports"
  ],
  "subscriptions": [
    "subscription_plans",
    "subscriptions",
    "subscription_payments"
  ],
  "surveys": [
    "surveys",
    "survey_questions",
    "survey_responses",
    "survey_answers"
  ],
  "time_off": [
    "leave_types",
    "leave_requests"
  ],
  "timesheets": [
    "time_entries"
  ]
} as const;
