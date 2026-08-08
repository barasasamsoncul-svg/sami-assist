// lib/ai-query/plugins.ts

export type QueryPlugin = {
  key: string;
  tables: string[];
};

/**
 * Application metadata for the AI query layer.
 *
 * The live tenant database schema remains the source of truth.
 * These entries are only used to describe which business tables
 * belong to each application.
 */
export const QUERY_PLUGINS: QueryPlugin[] = [
  {
    key: "accounting",
    tables: ["accounts", "journals", "journal_lines"],
  },
  {
    key: "appointments",
    tables: ["appointment_services", "appointments"],
  },
  {
    key: "appraisals",
    tables: ["appraisal_cycles", "appraisals", "appraisal_goals"],
  },
  {
    key: "crm",
    tables: ["leads", "opportunities", "crm_activities"],
  },
  {
    key: "documents",
    tables: ["documents", "document_folders"],
  },
  {
    key: "email_marketing",
    tables: ["email_campaigns", "email_recipients"],
  },
  {
    key: "employees",
    tables: ["employees"],
  },
  {
    key: "events",
    tables: ["events", "event_registrations"],
  },
  {
    key: "expenses",
    tables: ["expense_categories", "expenses"],
  },
  {
    key: "field_services",
    tables: ["service_orders", "service_visits", "service_materials"],
  },
  {
    key: "fleet",
    tables: ["vehicles", "vehicle_assignments", "fleet_services"],
  },
  {
    key: "helpdesk",
    tables: ["support_tickets", "ticket_messages", "ticket_tags"],
  },
  {
    key: "inventory",
    tables: [
      "products",
      "warehouses",
      "stock_levels",
      "stock_movements",
    ],
  },
  {
    key: "invoicing",
    tables: ["customers", "invoices", "invoice_items", "payments"],
  },
  {
    key: "maintenance",
    tables: [
      "equipment",
      "maintenance_requests",
      "maintenance_logs",
    ],
  },
  {
    key: "manufacturing",
    tables: [
      "boms",
      "bom_items",
      "manufacturing_orders",
      "production_operations",
    ],
  },
  {
    key: "marketing_automation",
    tables: [
      "automation_workflows",
      "automation_steps",
      "automation_runs",
    ],
  },
  {
    key: "planning",
    tables: [
      "planning_shifts",
      "planning_assignments",
      "planning_resources",
    ],
  },
  {
    key: "plm",
    tables: [
      "product_versions",
      "engineering_changes",
      "change_items",
    ],
  },
  {
    key: "pos_restaurant",
    tables: [
      "menu_items",
      "restaurant_tables",
      "restaurant_orders",
      "restaurant_order_items",
    ],
  },
  {
    key: "pos_shop",
    tables: [
      "shop_products",
      "shop_orders",
      "shop_order_items",
    ],
  },
  {
    key: "projects",
    tables: ["projects", "tasks", "project_milestones"],
  },
  {
    key: "purchase",
    tables: [
      "suppliers",
      "purchase_orders",
      "purchase_order_items",
    ],
  },
  {
    key: "quality",
    tables: [
      "quality_checks",
      "quality_issues",
      "quality_check_items",
    ],
  },
  {
    key: "recruitment",
    tables: [
      "job_positions",
      "applicants",
      "interviews",
    ],
  },
  {
    key: "referrals",
    tables: ["referral_programs", "referrals"],
  },
  {
    key: "rentals",
    tables: ["rental_items", "rental_contracts"],
  },
  {
    key: "sales",
    tables: [
      "quotations",
      "quotation_items",
      "sales_orders",
      "sales_order_items",
    ],
  },
  {
    key: "sign",
    tables: ["signature_requests", "signers"],
  },
  {
    key: "sms_marketing",
    tables: ["sms_campaigns", "sms_recipients"],
  },
  {
    key: "social_marketing",
    tables: ["social_accounts", "social_posts"],
  },
  {
    key: "spreadsheet",
    tables: [
      "workbooks",
      "sheets",
      "cells",
      "bi_reports",
    ],
  },
  {
    key: "subscriptions",
    tables: [
      "subscription_plans",
      "subscriptions",
      "subscription_payments",
    ],
  },
  {
    key: "surveys",
    tables: [
      "surveys",
      "survey_questions",
      "survey_responses",
      "survey_answers",
    ],
  },
  {
    key: "timesheets",
    tables: ["time_entries"],
  },
  {
    key: "time_off",
    tables: ["leave_types", "leave_requests"],
  },
];
