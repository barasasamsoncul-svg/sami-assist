export type SamiSuiteDependencyProfile = {
  required: readonly string[];
  optional: readonly string[];
};


export const SAMI_SUITE_DEPENDENCIES:
  Record<
    string,
    SamiSuiteDependencyProfile
  > = {
  accounting: {
    required: [],
    optional: ['invoicing','payments','expenses','purchase','fixed_assets','tax','payroll','billing','cash_flow','budgeting'],
  },
  invoicing: {
    required: [],
    optional: ['accounting','payments','crm','sales','inventory','tax','subscriptions','customer_portal','documents','sign','cash_flow'],
  },
  expenses: {
    required: [],
    optional: ['employees','accounting','payments','projects'],
  },
  spreadsheet: {
    required: [],
    optional: ['accounting','sales','inventory','web_analytics','surveys'],
  },
  documents: {
    required: [],
    optional: ['sign','projects','mail','customer_portal','vendor_portal'],
  },
  sign: {
    required: ['documents'],
    optional: ['sales','customer_portal','vendor_portal'],
  },
  crm: {
    required: [],
    optional: ['sales','sales_inbox','email_marketing','sms_marketing','lead_capture','invoicing','customer_portal'],
  },
  sales: {
    required: [],
    optional: ['invoicing','crm','inventory','payments','customer_portal','sign','shipping','warehouse','cpq'],
  },
  subscriptions: {
    required: ['billing'],
    optional: ['payments','invoicing','customer_portal','accounting'],
  },
  rentals: {
    required: ['inventory'],
    optional: ['bookings','payments','invoicing','customer_portal'],
  },
  pos_shop: {
    required: ['inventory'],
    optional: ['payments','loyalty','gift_cards','ecommerce','accounting','barcode'],
  },
  pos_restaurant: {
    required: ['inventory'],
    optional: ['payments','loyalty','accounting','barcode'],
  },
  inventory: {
    required: [],
    optional: ['warehouse','purchase','manufacturing','sales','invoicing','barcode','shipping','demand_planning'],
  },
  manufacturing: {
    required: ['inventory'],
    optional: ['warehouse','purchase','quality','plm','maintenance'],
  },
  plm: {
    required: ['manufacturing'],
    optional: ['quality','inventory','documents'],
  },
  purchase: {
    required: [],
    optional: ['inventory','warehouse','vendor_portal','accounting','payments'],
  },
  maintenance: {
    required: [],
    optional: ['assets','work_orders','inventory','quality','fleet','facilities'],
  },
  quality: {
    required: [],
    optional: ['manufacturing','inventory','inspections','work_orders','plm'],
  },
  employees: {
    required: [],
    optional: ['recruitment','attendance','payroll','org_chart','time_off','timesheets','benefits','appraisals','onboarding','learning','planning'],
  },
  fleet: {
    required: [],
    optional: ['employees','maintenance','assets','expenses','field_services'],
  },
  referrals: {
    required: ['crm'],
    optional: ['loyalty','lead_capture','marketing_automation','commissions'],
  },
  appraisals: {
    required: ['employees'],
    optional: ['learning','org_chart','payroll'],
  },
  time_off: {
    required: ['employees'],
    optional: ['attendance','shifts','payroll','planning'],
  },
  recruitment: {
    required: [],
    optional: ['employees','onboarding','org_chart','calendar','documents'],
  },
  social_marketing: {
    required: [],
    optional: ['marketing_automation','ads','web_analytics','crm','lead_capture'],
  },
  email_marketing: {
    required: [],
    optional: ['marketing_automation','crm','lead_capture','web_analytics','mail'],
  },
  sms_marketing: {
    required: [],
    optional: ['marketing_automation','crm','lead_capture','web_analytics'],
  },
  events: {
    required: [],
    optional: ['calendar','email_marketing','sms_marketing','customer_portal','surveys','payments'],
  },
  marketing_automation: {
    required: [],
    optional: ['crm','email_marketing','sms_marketing','web_analytics','lead_capture'],
  },
  surveys: {
    required: [],
    optional: ['crm','employees','events','web_analytics','learning'],
  },
  projects: {
    required: [],
    optional: ['timesheets','expenses','planning','invoicing','documents','whiteboard','meetings'],
  },
  timesheets: {
    required: ['employees','projects'],
    optional: ['payroll','invoicing'],
  },
  field_services: {
    required: [],
    optional: ['work_orders','inventory','appointments','invoicing','fleet','quality'],
  },
  helpdesk: {
    required: [],
    optional: ['crm','customer_portal','team_inbox','projects','mail'],
  },
  planning: {
    required: [],
    optional: ['employees','shifts','projects','field_services','calendar'],
  },
  appointments: {
    required: [],
    optional: ['calendar','employees','customer_portal','invoicing','payments','bookings'],
  },
  billing: {
    required: ['invoicing'],
    optional: ['accounting','payments','subscriptions'],
  },
  payments: {
    required: ['accounting'],
    optional: ['invoicing','billing','subscriptions','checkout','pos_shop','pos_restaurant','marketplace','gift_cards'],
  },
  budgeting: {
    required: ['accounting'],
    optional: ['expenses','cash_flow','purchase','projects'],
  },
  cash_flow: {
    required: ['accounting'],
    optional: ['invoicing','expenses','payments','budgeting'],
  },
  fixed_assets: {
    required: ['accounting'],
    optional: ['assets','maintenance','tax'],
  },
  tax: {
    required: ['accounting'],
    optional: ['invoicing','payments','fixed_assets'],
  },
  bookings: {
    required: ['appointments'],
    optional: ['calendar','crm','customer_portal','payments'],
  },
  customer_portal: {
    required: [],
    optional: ['crm','documents','sales','invoicing','helpdesk','subscriptions','payments','sign'],
  },
  sales_inbox: {
    required: ['crm'],
    optional: ['mail','team_inbox','sales'],
  },
  cpq: {
    required: ['sales'],
    optional: ['crm','inventory','invoicing'],
  },
  commissions: {
    required: ['sales'],
    optional: ['employees','accounting','payroll','crm'],
  },
  ecommerce: {
    required: ['sales','inventory'],
    optional: ['payments','shipping','crm','checkout','loyalty','gift_cards'],
  },
  checkout: {
    required: ['payments'],
    optional: ['ecommerce','sales','subscriptions'],
  },
  loyalty: {
    required: [],
    optional: ['crm','sales','pos_shop','ecommerce','gift_cards','referrals'],
  },
  gift_cards: {
    required: ['payments'],
    optional: ['pos_shop','ecommerce','sales','loyalty'],
  },
  marketplace: {
    required: ['ecommerce','payments'],
    optional: ['shipping','inventory','commissions'],
  },
  warehouse: {
    required: ['inventory'],
    optional: ['barcode','shipping','purchase','manufacturing','sales'],
  },
  shipping: {
    required: ['inventory'],
    optional: ['sales','ecommerce','warehouse','marketplace'],
  },
  demand_planning: {
    required: ['inventory'],
    optional: ['purchase','sales','manufacturing','warehouse'],
  },
  vendor_portal: {
    required: ['purchase'],
    optional: ['documents','payments','quality'],
  },
  barcode: {
    required: ['inventory'],
    optional: ['warehouse','pos_shop','pos_restaurant'],
  },
  facilities: {
    required: [],
    optional: ['maintenance','work_orders','assets','safety','inspections'],
  },
  assets: {
    required: [],
    optional: ['maintenance','fixed_assets','facilities','fleet','documents'],
  },
  work_orders: {
    required: [],
    optional: ['maintenance','assets','inventory','field_services','quality','inspections'],
  },
  inspections: {
    required: [],
    optional: ['quality','work_orders','safety','maintenance'],
  },
  safety: {
    required: [],
    optional: ['quality','inspections','employees','facilities','work_orders'],
  },
  payroll: {
    required: ['employees'],
    optional: ['accounting','attendance','benefits','time_off','timesheets'],
  },
  attendance: {
    required: ['employees'],
    optional: ['shifts','payroll','time_off'],
  },
  shifts: {
    required: ['employees'],
    optional: ['planning','attendance','time_off'],
  },
  onboarding: {
    required: ['employees'],
    optional: ['documents','learning','benefits','assets'],
  },
  learning: {
    required: ['employees'],
    optional: ['surveys','appraisals','onboarding'],
  },
  benefits: {
    required: ['employees'],
    optional: ['payroll'],
  },
  org_chart: {
    required: ['employees'],
    optional: ['recruitment','appraisals','planning'],
  },
  landing_pages: {
    required: [],
    optional: ['crm','lead_capture','web_analytics','email_marketing','ads'],
  },
  web_analytics: {
    required: [],
    optional: ['landing_pages','ecommerce','ads','seo','marketing_automation'],
  },
  ads: {
    required: [],
    optional: ['marketing_automation','web_analytics','crm','landing_pages'],
  },
  seo: {
    required: [],
    optional: ['web_analytics','landing_pages','ecommerce'],
  },
  lead_capture: {
    required: ['crm'],
    optional: ['landing_pages','marketing_automation','email_marketing','sms_marketing'],
  },
  mail: {
    required: [],
    optional: ['crm','documents','sales_inbox','team_inbox','helpdesk'],
  },
  chat: {
    required: [],
    optional: ['documents','meetings','projects'],
  },
  meetings: {
    required: [],
    optional: ['calendar','crm','projects','documents','chat'],
  },
  calendar: {
    required: [],
    optional: ['appointments','meetings','planning','projects'],
  },
  team_inbox: {
    required: [],
    optional: ['mail','crm','helpdesk','sales_inbox','customer_portal'],
  },
  whiteboard: {
    required: [],
    optional: ['projects','documents','meetings','chat'],
  },
};


export function suiteDependencyProfile(
  moduleKey:
    string,
): SamiSuiteDependencyProfile {
  return (
    SAMI_SUITE_DEPENDENCIES[
      moduleKey
        .trim()
        .toLowerCase()
    ] || {
      required: [],
      optional: [],
    }
  );
}
