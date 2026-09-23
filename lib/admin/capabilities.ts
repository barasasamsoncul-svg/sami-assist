import type {
  PlatformAdminRole,
} from '@/lib/auth/admin-session';


export type PlatformAdminCapability =
  | 'dashboard.read'
  | 'administrators.read'
  | 'administrators.manage'
  | 'users.read'
  | 'users.security.manage'
  | 'tenants.read'
  | 'tenants.manage'
  | 'subscriptions.read'
  | 'subscriptions.manage'
  | 'modules.read'
  | 'modules.manage'
  | 'security.read'
  | 'notifications.read'
  | 'audit.read'
  | 'health.read'
  | 'incidents.read'
  | 'incidents.manage'
  | 'providers.read'
  | 'providers.manage'
  | 'jobs.read'
  | 'support.read';


const ALL_CAPABILITIES:
  readonly PlatformAdminCapability[] = [
    'dashboard.read',
    'administrators.read',
    'administrators.manage',
    'users.read',
    'users.security.manage',
    'tenants.read',
    'tenants.manage',
    'subscriptions.read',
    'subscriptions.manage',
    'modules.read',
    'modules.manage',
    'security.read',
    'notifications.read',
    'audit.read',
    'health.read',
    'incidents.read',
    'incidents.manage',
    'providers.read',
    'providers.manage',
    'jobs.read',
    'support.read',
  ];


const ROLE_CAPABILITIES:
  Readonly<
    Record<
      PlatformAdminRole,
      readonly PlatformAdminCapability[]
    >
  > = {
    super_admin:
      ALL_CAPABILITIES,

    security_admin: [
      'dashboard.read',
      'users.read',
      'users.security.manage',
      'security.read',
      'audit.read',
      'health.read',
      'incidents.read',
      'incidents.manage',
      'providers.read',
      'jobs.read',
    ],

    support_admin: [
      'dashboard.read',
      'users.read',
      'tenants.read',
      'notifications.read',
      'incidents.read',
      'providers.read',
      'support.read',
    ],

    billing_admin: [
      'dashboard.read',
      'tenants.read',
      'subscriptions.read',
      'subscriptions.manage',
      'incidents.read',
      'providers.read',
      'providers.manage',
      'jobs.read',
    ],

    operations_admin: [
      'dashboard.read',
      'users.read',
      'tenants.read',
      'tenants.manage',
      'subscriptions.read',
      'modules.read',
      'health.read',
      'incidents.read',
      'incidents.manage',
      'providers.read',
      'providers.manage',
      'jobs.read',
      'notifications.read',
      'support.read',
    ],

    developer_admin: [
      'dashboard.read',
      'modules.read',
      'modules.manage',
      'health.read',
      'incidents.read',
      'providers.read',
      'jobs.read',
    ],

    read_only_admin: [
      'dashboard.read',
      'users.read',
      'tenants.read',
      'subscriptions.read',
      'modules.read',
      'security.read',
      'notifications.read',
      'audit.read',
      'health.read',
      'incidents.read',
      'providers.read',
      'jobs.read',
      'support.read',
    ],
  };


export function getAdminCapabilities(
  role:
    PlatformAdminRole,
): readonly PlatformAdminCapability[] {
  return ROLE_CAPABILITIES[
    role
  ] || [];
}


export function hasAdminCapability(
  role:
    PlatformAdminRole,
  capability:
    PlatformAdminCapability,
) {
  return getAdminCapabilities(
    role,
  ).includes(
    capability,
  );
}


export function hasEveryAdminCapability(
  role:
    PlatformAdminRole,
  capabilities:
    readonly PlatformAdminCapability[],
) {
  return capabilities.every(
    capability =>
      hasAdminCapability(
        role,
        capability,
      ),
  );
}


export function hasAnyAdminCapability(
  role:
    PlatformAdminRole,
  capabilities:
    readonly PlatformAdminCapability[],
) {
  return capabilities.some(
    capability =>
      hasAdminCapability(
        role,
        capability,
      ),
  );
}
