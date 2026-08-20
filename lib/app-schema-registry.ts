import path from "path";

export type SamiAppSchemaDefinition = {
  key: string;
  schemaFile: string;
};

export const APP_SCHEMA_REGISTRY: Record<
  string,
  SamiAppSchemaDefinition
> = {
  accounting: {
    key: "accounting",
    schemaFile: "apps/accounting/schema.sql",
  },

  invoicing: {
    key: "invoicing",
    schemaFile: "apps/invoicing/schema.sql",
  },

  expenses: {
    key: "expenses",
    schemaFile: "apps/expenses/schema.sql",
  },

  spreadsheet: {
    key: "spreadsheet",
    schemaFile: "apps/spreadsheet/schema.sql",
  },

  documents: {
    key: "documents",
    schemaFile: "apps/documents/schema.sql",
  },

  sign: {
    key: "sign",
    schemaFile: "apps/sign/schema.sql",
  },

  crm: {
    key: "crm",
    schemaFile: "apps/crm/schema.sql",
  },

  sales: {
    key: "sales",
    schemaFile: "apps/sales/schema.sql",
  },

  subscriptions: {
    key: "subscriptions",
    schemaFile: "apps/subscriptions/schema.sql",
  },

  rentals: {
    key: "rentals",
    schemaFile: "apps/rentals/schema.sql",
  },

  pos_shop: {
    key: "pos_shop",
    schemaFile: "apps/pos_shop/schema.sql",
  },

  pos_restaurant: {
    key: "pos_restaurant",
    schemaFile: "apps/pos_restaurant/schema.sql",
  },

  inventory: {
    key: "inventory",
    schemaFile: "apps/inventory/schema.sql",
  },

  manufacturing: {
    key: "manufacturing",
    schemaFile: "apps/manufacturing/schema.sql",
  },

  plm: {
    key: "plm",
    schemaFile: "apps/plm/schema.sql",
  },

  purchase: {
    key: "purchase",
    schemaFile: "apps/purchase/schema.sql",
  },

  maintenance: {
    key: "maintenance",
    schemaFile: "apps/maintenance/schema.sql",
  },

  quality: {
    key: "quality",
    schemaFile: "apps/quality/schema.sql",
  },

  employees: {
    key: "employees",
    schemaFile: "apps/employees/schema.sql",
  },

  fleet: {
    key: "fleet",
    schemaFile: "apps/fleet/schema.sql",
  },

  referrals: {
    key: "referrals",
    schemaFile: "apps/referrals/schema.sql",
  },

  appraisals: {
    key: "appraisals",
    schemaFile: "apps/appraisals/schema.sql",
  },

  time_off: {
    key: "time_off",
    schemaFile: "apps/time_off/schema.sql",
  },

  recruitment: {
    key: "recruitment",
    schemaFile: "apps/recruitment/schema.sql",
  },

  social_marketing: {
    key: "social_marketing",
    schemaFile: "apps/social_marketing/schema.sql",
  },

  email_marketing: {
    key: "email_marketing",
    schemaFile: "apps/email_marketing/schema.sql",
  },

  sms_marketing: {
    key: "sms_marketing",
    schemaFile: "apps/sms_marketing/schema.sql",
  },

  events: {
    key: "events",
    schemaFile: "apps/events/schema.sql",
  },

  marketing_automation: {
    key: "marketing_automation",
    schemaFile: "apps/marketing_automation/schema.sql",
  },

  surveys: {
    key: "surveys",
    schemaFile: "apps/surveys/schema.sql",
  },

  projects: {
    key: "projects",
    schemaFile: "apps/projects/schema.sql",
  },

  timesheets: {
    key: "timesheets",
    schemaFile: "apps/timesheets/schema.sql",
  },

  field_services: {
    key: "field_services",
    schemaFile: "apps/field_services/schema.sql",
  },

  helpdesk: {
    key: "helpdesk",
    schemaFile: "apps/helpdesk/schema.sql",
  },

  planning: {
    key: "planning",
    schemaFile: "apps/planning/schema.sql",
  },

  appointments: {
    key: "appointments",
    schemaFile: "apps/appointments/schema.sql",
  },
};

export function getAppSchemaPath(
  appKey: string
): string | null {
  const definition = APP_SCHEMA_REGISTRY[appKey];

  if (!definition) {
    return null;
  }

  return path.join(
    process.cwd(),
    "lib",
    definition.schemaFile
  );
}

export function getAppSchemaDefinition(
  appKey: string
): SamiAppSchemaDefinition | null {
  return APP_SCHEMA_REGISTRY[appKey] ?? null;
}

export function hasAppSchema(
  appKey: string
): boolean {
  return Boolean(APP_SCHEMA_REGISTRY[appKey]);
}