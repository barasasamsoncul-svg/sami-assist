export const CONTROL_MIGRATION_KEYS = [
  '001-category-22-subscription-billing-profiles.sql',
  '002-category-22-expand-app-catalog.sql',
  '003-registration-request-idempotency.sql',
  '004-category-24-platform-observability.sql',
  '005-category-24-platform-service-subscriptions.sql',
  '006-category-24-platform-admin-alert-preferences.sql',
  '007-category-25-platform-settings.sql',
  '008-user-tutorial-preferences.sql',
] as const;


export type ControlMigrationKey =
  (typeof CONTROL_MIGRATION_KEYS)[number];
