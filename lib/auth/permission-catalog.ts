import 'server-only';


/* ================================================================
   SaMi CORE PERMISSION CATALOG
   ================================================================

   Category 8

   IMPORTANT

   This catalog contains SaMi PLATFORM permissions.

   Module permissions added later may use additional keys such as:

       invoicing.invoice.view
       invoicing.invoice.create
       crm.lead.manage

   The permission resolver therefore accepts any registered
   permission key from the database. It does not restrict itself
   only to this static catalog.

   ================================================================ */


export const SAMI_PERMISSIONS = {
  WORKSPACE_VIEW:
    'workspace.view',

  WORKSPACE_MANAGE:
    'workspace.manage',


  USERS_VIEW:
    'users.view',

  USERS_MANAGE:
    'users.manage',


  ROLES_VIEW:
    'roles.view',

  ROLES_MANAGE:
    'roles.manage',


  INVITATIONS_VIEW:
    'invitations.view',

  INVITATIONS_MANAGE:
    'invitations.manage',


  ORGANIZATION_VIEW:
    'organization.view',

  ORGANIZATION_MANAGE:
    'organization.manage',


  COMPANIES_VIEW:
    'companies.view',

  COMPANIES_MANAGE:
    'companies.manage',


  APPS_VIEW:
    'apps.view',

  APPS_MANAGE:
    'apps.manage',


  FILES_VIEW:
    'files.view',

  FILES_MANAGE:
    'files.manage',


  NOTIFICATIONS_VIEW:
    'notifications.view',

  NOTIFICATIONS_MANAGE:
    'notifications.manage',


  AUDIT_VIEW:
    'audit.view',


  SEARCH_USE:
    'search.use',


  AI_USE:
    'ai.use',

  AI_MANAGE:
    'ai.manage',


  AUTOMATION_VIEW:
    'automation.view',

  AUTOMATION_MANAGE:
    'automation.manage',


  INTEGRATIONS_VIEW:
    'integrations.view',

  INTEGRATIONS_MANAGE:
    'integrations.manage',


  API_VIEW:
    'api.view',

  API_MANAGE:
    'api.manage',


  BILLING_VIEW:
    'billing.view',

  BILLING_MANAGE:
    'billing.manage',


  USAGE_VIEW:
    'usage.view',


  SETTINGS_VIEW:
    'settings.view',

  SETTINGS_MANAGE:
    'settings.manage',
} as const;


/* ================================================================
   CORE PERMISSION TYPE
   ================================================================ */

export type CoreSamiPermission =
  (
    typeof SAMI_PERMISSIONS
  )[
    keyof typeof SAMI_PERMISSIONS
  ];


/* ================================================================
   GROUPS

   Used later by:
   - Settings UI
   - role editor
   - permission matrix
   - role templates
   ================================================================ */

export const SAMI_PERMISSION_GROUPS = {
  workspace: [
    SAMI_PERMISSIONS
      .WORKSPACE_VIEW,

    SAMI_PERMISSIONS
      .WORKSPACE_MANAGE,
  ],

  users: [
    SAMI_PERMISSIONS
      .USERS_VIEW,

    SAMI_PERMISSIONS
      .USERS_MANAGE,
  ],

  roles: [
    SAMI_PERMISSIONS
      .ROLES_VIEW,

    SAMI_PERMISSIONS
      .ROLES_MANAGE,
  ],

  invitations: [
    SAMI_PERMISSIONS
      .INVITATIONS_VIEW,

    SAMI_PERMISSIONS
      .INVITATIONS_MANAGE,
  ],

  organization: [
    SAMI_PERMISSIONS
      .ORGANIZATION_VIEW,

    SAMI_PERMISSIONS
      .ORGANIZATION_MANAGE,
  ],

  companies: [
    SAMI_PERMISSIONS
      .COMPANIES_VIEW,

    SAMI_PERMISSIONS
      .COMPANIES_MANAGE,
  ],

  apps: [
    SAMI_PERMISSIONS
      .APPS_VIEW,

    SAMI_PERMISSIONS
      .APPS_MANAGE,
  ],

  files: [
    SAMI_PERMISSIONS
      .FILES_VIEW,

    SAMI_PERMISSIONS
      .FILES_MANAGE,
  ],

  notifications: [
    SAMI_PERMISSIONS
      .NOTIFICATIONS_VIEW,

    SAMI_PERMISSIONS
      .NOTIFICATIONS_MANAGE,
  ],

  audit: [
    SAMI_PERMISSIONS
      .AUDIT_VIEW,
  ],

  search: [
    SAMI_PERMISSIONS
      .SEARCH_USE,
  ],

  ai: [
    SAMI_PERMISSIONS
      .AI_USE,

    SAMI_PERMISSIONS
      .AI_MANAGE,
  ],

  automation: [
    SAMI_PERMISSIONS
      .AUTOMATION_VIEW,

    SAMI_PERMISSIONS
      .AUTOMATION_MANAGE,
  ],

  integrations: [
    SAMI_PERMISSIONS
      .INTEGRATIONS_VIEW,

    SAMI_PERMISSIONS
      .INTEGRATIONS_MANAGE,
  ],

  api: [
    SAMI_PERMISSIONS
      .API_VIEW,

    SAMI_PERMISSIONS
      .API_MANAGE,
  ],

  billing: [
    SAMI_PERMISSIONS
      .BILLING_VIEW,

    SAMI_PERMISSIONS
      .BILLING_MANAGE,
  ],

  usage: [
    SAMI_PERMISSIONS
      .USAGE_VIEW,
  ],

  settings: [
    SAMI_PERMISSIONS
      .SETTINGS_VIEW,

    SAMI_PERMISSIONS
      .SETTINGS_MANAGE,
  ],
} as const;


/* ================================================================
   CORE PERMISSION LOOKUP
   ================================================================ */

const CORE_PERMISSION_SET =
  new Set<string>(
    Object.values(
      SAMI_PERMISSIONS,
    ),
  );


export function isCoreSamiPermission(
  value:
    unknown,
): value is CoreSamiPermission {
  return (
    typeof value ===
      'string' &&
    CORE_PERMISSION_SET.has(
      value,
    )
  );
}