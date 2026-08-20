export type SamiAppCategory =
  | "finance"
  | "documents"
  | "sales"
  | "commerce"
  | "supply_chain"
  | "operations"
  | "people"
  | "marketing"
  | "work";

export type SamiApp = {
  key: string;
  name: string;
  category: SamiAppCategory;
  description: string;
  icon: string;
  route: string;
  recommended?: boolean;
};

export const SAMI_APPS: SamiApp[] = [
  {
    key: "accounting",
    name: "Accounting",
    category: "finance",
    description:
      "Manage accounts, journals, balances and financial reporting.",
    icon: "calculator",
    route: "accounting",
    recommended: true,
  },
  {
    key: "invoicing",
    name: "Invoicing",
    category: "finance",
    description:
      "Create invoices, track payments and manage receivables.",
    icon: "receipt",
    route: "invoices",
    recommended: true,
  },
  {
    key: "expenses",
    name: "Expenses",
    category: "finance",
    description: "Record and manage business expenses.",
    icon: "file-text",
    route: "expenses",
  },
  {
    key: "spreadsheet",
    name: "Spreadsheet / BI",
    category: "finance",
    description:
      "Analyze business data with AI-powered reports and spreadsheets.",
    icon: "bar-chart",
    route: "spreadsheet",
  },

  {
    key: "documents",
    name: "Documents",
    category: "documents",
    description:
      "Store, organize and search business documents.",
    icon: "folder",
    route: "documents",
  },
  {
    key: "sign",
    name: "Sign",
    category: "documents",
    description:
      "Send and manage documents that need signatures.",
    icon: "pen-tool",
    route: "sign",
  },

  {
    key: "crm",
    name: "CRM",
    category: "sales",
    description:
      "Manage leads, customers, opportunities and relationships.",
    icon: "users",
    route: "customers",
    recommended: true,
  },
  {
    key: "sales",
    name: "Sales",
    category: "sales",
    description:
      "Manage quotations, sales orders and customers.",
    icon: "shopping-cart",
    route: "sales",
    recommended: true,
  },
  {
    key: "subscriptions",
    name: "Subscriptions",
    category: "sales",
    description:
      "Manage recurring customers and subscription billing.",
    icon: "repeat",
    route: "subscriptions",
  },
  {
    key: "rentals",
    name: "Rentals",
    category: "sales",
    description:
      "Manage rental products, contracts and returns.",
    icon: "home",
    route: "rentals",
  },

  {
    key: "pos_shop",
    name: "POS Shop",
    category: "commerce",
    description: "Run a retail point of sale.",
    icon: "store",
    route: "pos-shop",
  },
  {
    key: "pos_restaurant",
    name: "POS Restaurant",
    category: "commerce",
    description:
      "Run restaurant orders and point-of-sale operations.",
    icon: "utensils",
    route: "pos-restaurant",
  },

  {
    key: "inventory",
    name: "Inventory",
    category: "supply_chain",
    description:
      "Manage products, stock, warehouses and movements.",
    icon: "package",
    route: "inventory",
  },
  {
    key: "manufacturing",
    name: "Manufacturing",
    category: "supply_chain",
    description:
      "Manage production, bills of materials and manufacturing orders.",
    icon: "factory",
    route: "manufacturing",
  },
  {
    key: "plm",
    name: "PLM",
    category: "supply_chain",
    description:
      "Manage product lifecycle and engineering changes.",
    icon: "boxes",
    route: "plm",
  },
  {
    key: "purchase",
    name: "Purchase",
    category: "supply_chain",
    description:
      "Manage suppliers, purchase orders and procurement.",
    icon: "shopping-bag",
    route: "purchase",
  },

  {
    key: "maintenance",
    name: "Maintenance",
    category: "operations",
    description:
      "Track equipment and maintenance activities.",
    icon: "wrench",
    route: "maintenance",
  },
  {
    key: "quality",
    name: "Quality",
    category: "operations",
    description:
      "Manage quality checks, controls and issues.",
    icon: "shield-check",
    route: "quality",
  },

  {
    key: "employees",
    name: "Employees",
    category: "people",
    description:
      "Manage employees and workforce information.",
    icon: "user-round",
    route: "employees",
  },
  {
    key: "fleet",
    name: "Fleet",
    category: "people",
    description:
      "Manage company vehicles and fleet operations.",
    icon: "car",
    route: "fleet",
  },
  {
    key: "referrals",
    name: "Referrals",
    category: "people",
    description:
      "Manage employee referral programs.",
    icon: "user-plus",
    route: "referrals",
  },
  {
    key: "appraisals",
    name: "Appraisals",
    category: "people",
    description:
      "Manage employee performance reviews.",
    icon: "clipboard-check",
    route: "appraisals",
  },
  {
    key: "time_off",
    name: "Time Off",
    category: "people",
    description:
      "Manage leave and time-off requests.",
    icon: "calendar-off",
    route: "time-off",
  },
  {
    key: "recruitment",
    name: "Recruitment",
    category: "people",
    description:
      "Manage vacancies, applicants and hiring.",
    icon: "user-search",
    route: "recruitment",
  },

  {
    key: "social_marketing",
    name: "Social Marketing",
    category: "marketing",
    description:
      "Plan and manage social media marketing.",
    icon: "megaphone",
    route: "social-marketing",
  },
  {
    key: "email_marketing",
    name: "Email Marketing",
    category: "marketing",
    description:
      "Create and manage email campaigns.",
    icon: "mail",
    route: "email-marketing",
  },
  {
    key: "sms_marketing",
    name: "SMS Marketing",
    category: "marketing",
    description:
      "Create and manage SMS campaigns.",
    icon: "message-square",
    route: "sms-marketing",
  },
  {
    key: "events",
    name: "Events",
    category: "marketing",
    description:
      "Manage events, registrations and attendees.",
    icon: "calendar-days",
    route: "events",
  },
  {
    key: "marketing_automation",
    name: "Marketing Automation",
    category: "marketing",
    description:
      "Automate campaigns and customer journeys.",
    icon: "workflow",
    route: "marketing-automation",
  },
  {
    key: "surveys",
    name: "Surveys",
    category: "marketing",
    description:
      "Create surveys and collect responses.",
    icon: "clipboard-list",
    route: "surveys",
  },

  {
    key: "projects",
    name: "Projects",
    category: "work",
    description:
      "Plan projects, tasks and team work.",
    icon: "briefcase",
    route: "projects",
    recommended: true,
  },
  {
    key: "timesheets",
    name: "Timesheets",
    category: "work",
    description:
      "Track time spent on work and projects.",
    icon: "clock",
    route: "timesheets",
  },
  {
    key: "field_services",
    name: "Field Services",
    category: "work",
    description:
      "Manage work performed at customer locations.",
    icon: "map-pin",
    route: "field-services",
  },
  {
    key: "helpdesk",
    name: "Helpdesk",
    category: "work",
    description:
      "Manage customer support tickets and service requests.",
    icon: "headphones",
    route: "helpdesk",
  },
  {
    key: "planning",
    name: "Planning",
    category: "work",
    description:
      "Plan schedules, shifts and assignments.",
    icon: "calendar-clock",
    route: "planning",
  },
  {
    key: "appointments",
    name: "Appointments",
    category: "work",
    description:
      "Let customers book appointments and manage schedules.",
    icon: "calendar",
    route: "appointments",
  },
];

export const APP_CATEGORIES: Array<{
  key: SamiAppCategory;
  name: string;
}> = [
  { key: "finance", name: "Finance" },
  { key: "documents", name: "Documents & Sign" },
  { key: "sales", name: "Sales" },
  { key: "commerce", name: "Commerce" },
  { key: "supply_chain", name: "Supply Chain" },
  { key: "operations", name: "Operations" },
  { key: "people", name: "People" },
  { key: "marketing", name: "Marketing" },
  { key: "work", name: "Work Management" },
];

export const CORE_APP_KEYS = ["dashboard", "ai"] as const;

export function getApp(key: string): SamiApp | undefined {
  return SAMI_APPS.find((app) => app.key === key);
}

export function normalizeAppKeys(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const valid = new Set(SAMI_APPS.map((app) => app.key));

  return [
    ...new Set(
      value.filter(
        (key): key is string =>
          typeof key === "string" && valid.has(key)
      )
    ),
  ];
}

export function getRecommendedAppKeys(): string[] {
  return SAMI_APPS
    .filter((app) => app.recommended)
    .map((app) => app.key);
}

export function isValidAppKey(key: string): boolean {
  return SAMI_APPS.some((app) => app.key === key);
}