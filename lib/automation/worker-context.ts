import 'server-only';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  resolvePermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import type {
  TrustedTenantContext,
} from '@/lib/auth/tenant-context';

import {
  queryControl,
} from '@/lib/db/control';

import {
  requireCompanyAccess,
} from '@/lib/services/company-access';

import type {
  SamiAutomationRuntimeContext,
} from '@/lib/automation/types';

export class AutomationWorkerContextError
  extends Error {
  constructor(
    public readonly code:
      | 'RUN_AS_USER_UNAVAILABLE'
      | 'AUTOMATION_AUTHORITY_REVOKED'
      | 'COMPANY_ACCESS_REVOKED',
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'AutomationWorkerContextError';
  }
}

async function resolveTrustedRunAsContext(
  tenantId:
    string,
  userId:
    string,
): Promise<TrustedTenantContext> {
  const result =
    await queryControl(
      `
        SELECT
          tu.id
            AS membership_id,
          tu.is_owner,
          t.id
            AS tenant_id,
          t.name
            AS tenant_name,
          t.slug
            AS tenant_slug,
          td.id
            AS database_id,
          td.database_name,
          td.schema_version,
          EXISTS (
            SELECT 1
            FROM user_roles ur
            INNER JOIN roles r
              ON r.id =
                 ur.role_id
            WHERE ur.user_id =
                  tu.user_id
              AND ur.tenant_id =
                  tu.tenant_id
              AND ur.deleted_at
                  IS NULL
              AND r.deleted_at
                  IS NULL
              AND r.is_system =
                  TRUE
              AND r.tenant_id
                  IS NULL
              AND LOWER(
                COALESCE(
                  r.key,
                  ''
                )
              ) =
              'admin'
              AND LOWER(
                COALESCE(
                  r.status,
                  'active'
                )
              ) =
              'active'
          )
            AS has_system_admin_role
        FROM tenant_users tu
        INNER JOIN users u
          ON u.id =
             tu.user_id
        INNER JOIN tenants t
          ON t.id =
             tu.tenant_id
        LEFT JOIN tenant_databases td
          ON td.tenant_id =
             t.id
         AND LOWER(
               COALESCE(
                 td.status,
                 ''
               )
             ) =
             'active'
        WHERE tu.tenant_id =
              $1
          AND tu.user_id =
              $2
          AND LOWER(
                COALESCE(
                  tu.status,
                  ''
                )
              ) =
              'active'
          AND LOWER(
                COALESCE(
                  tu.member_type,
                  ''
                )
              ) =
              'internal'
          AND tu.deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  u.status,
                  ''
                )
              ) =
              'active'
          AND u.deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  t.status,
                  ''
                )
              ) =
              'active'
          AND t.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        tenantId,
        userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new AutomationWorkerContextError(
      'RUN_AS_USER_UNAVAILABLE',
      'The automation run-as user no longer has an active internal workspace membership.',
    );
  }

  const row =
    result.rows[0];

  if (
    !row.database_id ||
    !row.database_name
  ) {
    throw new AutomationWorkerContextError(
      'RUN_AS_USER_UNAVAILABLE',
      'The workspace database is not currently available.',
    );
  }

  const isOwner =
    row.is_owner ===
      true;

  const isAdmin =
    isOwner ||
    row.has_system_admin_role ===
      true;

  return {
    sessionId:
      'automation-worker',
    userId,
    tenantId:
      String(
        row.tenant_id,
      ),
    membershipId:
      String(
        row.membership_id,
      ),
    memberType:
      'internal',
    tenantName:
      typeof row.tenant_name ===
        'string'
        ? row.tenant_name
        : '',
    tenantSlug:
      typeof row.tenant_slug ===
        'string'
        ? row.tenant_slug
        : '',
    accessLevel:
      isOwner
        ? 'owner'
        : isAdmin
          ? 'admin'
          : 'member',
    isOwner,
    isAdmin,
    databaseId:
      String(
        row.database_id,
      ),
    databaseName:
      String(
        row.database_name,
      ),
    schemaVersion:
      typeof row.schema_version ===
        'string'
        ? row.schema_version
        : null,
  };
}

export async function resolveAutomationWorkerRuntime(
  input: {
    tenantId:
      string;
    userId:
      string;
    companyId:
      string;
  },
): Promise<SamiAutomationRuntimeContext> {
  const trusted =
    await resolveTrustedRunAsContext(
      input.tenantId,
      input.userId,
    );

  const permissions =
    await resolvePermissionContext(
      trusted,
    );

  const canManage =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .AUTOMATION_MANAGE,
    );

  if (
    !canManage
  ) {
    throw new AutomationWorkerContextError(
      'AUTOMATION_AUTHORITY_REVOKED',
      'The automation run-as user no longer has permission to manage Automation.',
    );
  }

  try {
    await requireCompanyAccess(
      input.tenantId,
      input.userId,
      input.companyId,
    );
  } catch {
    if (
      !permissions.isOwner
    ) {
      throw new AutomationWorkerContextError(
        'COMPANY_ACCESS_REVOKED',
        'The automation run-as user no longer has access to the workflow company.',
      );
    }
  }

  const account =
    await getAccountContextForUser(
      input.userId,
      input.tenantId,
    );

  const shell =
    resolveWorkspaceShellAccess({
      modules:
        account.modules,
      subscription:
        account.subscription,
      permissions,
    });

  return {
    userId:
      input.userId,
    sessionId:
      'automation-worker',
    tenantId:
      input.tenantId,
    companyId:
      input.companyId,
    accessibleModuleKeys:
      shell.accessibleModuleKeys,
    permissionSet:
      permissions.permissionSet,
    isOwner:
      permissions.isOwner,
  };
}
