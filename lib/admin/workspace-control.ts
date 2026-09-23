import 'server-only';

import {
  queryControl,
  withControlTransaction,
} from '@/lib/db/control';

import {
  checkTenantDatabaseHealth,
  getTenantDatabaseHealth,
  setTenantDatabaseMaintenance,
} from '@/lib/services/tenant-health';

import {
  reactivateTenantDatabase,
  suspendTenantDatabase,
} from '@/lib/services/tenant-lifecycle';


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


export type PlatformWorkspaceControlAction =
  | 'health_check'
  | 'maintenance_on'
  | 'maintenance_off'
  | 'suspend'
  | 'reactivate';


export class PlatformWorkspaceControlError
  extends Error {
  readonly code:
    | 'INVALID_WORKSPACE'
    | 'WORKSPACE_NOT_FOUND'
    | 'INVALID_ACTION'
    | 'REASON_REQUIRED'
    | 'INVALID_STATE';

  constructor(
    code:
      PlatformWorkspaceControlError['code'],
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'PlatformWorkspaceControlError';

    this.code =
      code;
  }
}


function tenantId(
  value:
    string,
) {
  if (
    !UUID_RE.test(
      value,
    )
  ) {
    throw new PlatformWorkspaceControlError(
      'INVALID_WORKSPACE',
      'The SaMi workspace could not be identified.',
    );
  }

  return value;
}


function reason(
  value:
    unknown,
  required:
    boolean,
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    if (
      required
    ) {
      throw new PlatformWorkspaceControlError(
        'REASON_REQUIRED',
        'An administrative reason is required.',
      );
    }

    return null;
  }

  if (
    typeof value !==
      'string'
  ) {
    throw new PlatformWorkspaceControlError(
      'REASON_REQUIRED',
      'Administrative reason must be text.',
    );
  }

  const normalized =
    value
      .trim()
      .slice(
        0,
        1_000,
      );

  if (
    required &&
    !normalized
  ) {
    throw new PlatformWorkspaceControlError(
      'REASON_REQUIRED',
      'An administrative reason is required.',
    );
  }

  return normalized ||
    null;
}


async function loadWorkspace(
  id:
    string,
) {
  const result =
    await queryControl(
      `
        SELECT
          t.id,
          t.name,
          t.slug,
          t.status,
          t.deleted_at,

          td.status
            AS database_status,
          td.health_status,
          td.failure_code,
          td.failure_message

        FROM tenants t

        LEFT JOIN tenant_databases td
          ON td.tenant_id =
             t.id

        WHERE t.id = $1

        LIMIT 1
      `,
      [
        id,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row ||
    row.deleted_at
  ) {
    throw new PlatformWorkspaceControlError(
      'WORKSPACE_NOT_FOUND',
      'The SaMi workspace could not be found.',
    );
  }

  return row;
}


async function clearWorkspaceFromSessions(
  id:
    string,
) {
  const result =
    await queryControl(
      `
        UPDATE sessions
        SET
          current_tenant_id =
            NULL,
          current_company_id =
            NULL,
          selected_company_ids =
            '{}'::UUID[],
          updated_at =
            NOW()
        WHERE current_tenant_id =
              $1
          AND revoked_at
              IS NULL
          AND is_current =
              TRUE
        RETURNING id
      `,
      [
        id,
      ],
    );

  return result.rows.length;
}


async function setWorkspaceStatus(
  id:
    string,
  next:
    'active' |
    'suspended',
) {
  const result =
    await queryControl(
      `
        UPDATE tenants
        SET
          status =
            $2,
          updated_at =
            NOW()
        WHERE id = $1
          AND deleted_at
              IS NULL
        RETURNING
          id,
          name,
          slug,
          status
      `,
      [
        id,
        next,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row
  ) {
    throw new PlatformWorkspaceControlError(
      'WORKSPACE_NOT_FOUND',
      'The SaMi workspace could not be found.',
    );
  }

  return row;
}


export async function controlPlatformWorkspace(
  input: {
    tenantId:
      string;
    action:
      PlatformWorkspaceControlAction;
    reason?:
      unknown;
  },
) {
  const id =
    tenantId(
      input.tenantId,
    );

  const current =
    await loadWorkspace(
      id,
    );

  const currentStatus =
    String(
      current.status ||
      'unknown',
    )
      .trim()
      .toLowerCase();

  const adminReason =
    reason(
      input.reason,
      input.action ===
        'suspend' ||
      input.action ===
        'reactivate' ||
      input.action ===
        'maintenance_on',
    );

  switch (
    input.action
  ) {
    case 'health_check': {
      const health =
        await checkTenantDatabaseHealth(
          id,
        );

      return {
        tenantId:
          id,
        action:
          input.action,
        changed:
          false,
        workspaceStatus:
          currentStatus,
        sessionsCleared:
          0,
        reason:
          adminReason,
        health,
      };
    }

    case 'maintenance_on': {
      await setTenantDatabaseMaintenance(
        id,
        true,
      );

      return {
        tenantId:
          id,
        action:
          input.action,
        changed:
          true,
        workspaceStatus:
          currentStatus,
        sessionsCleared:
          0,
        reason:
          adminReason,
        health:
          await getTenantDatabaseHealth(
            id,
          ),
      };
    }

    case 'maintenance_off': {
      await setTenantDatabaseMaintenance(
        id,
        false,
      );

      const health =
        await checkTenantDatabaseHealth(
          id,
        );

      return {
        tenantId:
          id,
        action:
          input.action,
        changed:
          true,
        workspaceStatus:
          currentStatus,
        sessionsCleared:
          0,
        reason:
          adminReason,
        health,
      };
    }

    case 'suspend': {
      if (
        currentStatus !==
          'active' &&
        currentStatus !==
          'suspended'
      ) {
        throw new PlatformWorkspaceControlError(
          'INVALID_STATE',
          `A workspace in "${currentStatus}" state cannot be suspended here.`,
        );
      }

      /*
       * Workspace access is disabled first. This is the safer side
       * of any partial failure: users cannot enter an active-looking
       * workspace while its tenant database is being suspended.
       */
      let sessionsCleared =
        0;

      await withControlTransaction(
        async client => {
          const locked =
            await client.query(
              `
                SELECT status
                FROM tenants
                WHERE id = $1
                  AND deleted_at
                      IS NULL
                LIMIT 1
                FOR UPDATE
              `,
              [
                id,
              ],
            );

          if (
            !locked.rows[0]
          ) {
            throw new PlatformWorkspaceControlError(
              'WORKSPACE_NOT_FOUND',
              'The SaMi workspace could not be found.',
            );
          }

          const status =
            String(
              locked.rows[0]
                .status ||
              '',
            )
              .trim()
              .toLowerCase();

          if (
            status !==
              'active' &&
            status !==
              'suspended'
          ) {
            throw new PlatformWorkspaceControlError(
              'INVALID_STATE',
              `A workspace in "${status}" state cannot be suspended here.`,
            );
          }

          await client.query(
            `
              UPDATE tenants
              SET
                status =
                  'suspended',
                updated_at =
                  NOW()
              WHERE id = $1
            `,
            [
              id,
            ],
          );

          const sessions =
            await client.query(
              `
                UPDATE sessions
                SET
                  current_tenant_id =
                    NULL,
                  current_company_id =
                    NULL,
                  selected_company_ids =
                    '{}'::UUID[],
                  updated_at =
                    NOW()
                WHERE current_tenant_id =
                      $1
                  AND revoked_at
                      IS NULL
                  AND is_current =
                      TRUE
                RETURNING id
              `,
              [
                id,
              ],
            );

          sessionsCleared =
            sessions.rows.length;
        },
      );

      try {
        await suspendTenantDatabase(
          id,
        );
      } catch (
        error
      ) {
        /*
         * If DB suspension cannot complete, restore the logical
         * workspace only when the DB still reports active.
         */
        try {
          const health =
            await getTenantDatabaseHealth(
              id,
            );

          if (
            health.lifecycleStatus ===
              'active'
          ) {
            await setWorkspaceStatus(
              id,
              'active',
            );
          }
        } catch {
          // Preserve the safer suspended workspace state.
        }

        throw error;
      }

      return {
        tenantId:
          id,
        action:
          input.action,
        changed:
          currentStatus !==
            'suspended',
        workspaceStatus:
          'suspended',
        sessionsCleared,
        reason:
          adminReason,
        health:
          await getTenantDatabaseHealth(
            id,
          ),
      };
    }

    case 'reactivate': {
      if (
        currentStatus !==
          'suspended' &&
        currentStatus !==
          'active'
      ) {
        throw new PlatformWorkspaceControlError(
          'INVALID_STATE',
          `A workspace in "${currentStatus}" state cannot be reactivated here.`,
        );
      }

      /*
       * Reactivate the tenant database before advertising the
       * workspace as active. If anything fails, the workspace remains
       * suspended rather than presenting an unusable active shell.
       */
      await reactivateTenantDatabase(
        id,
      );

      await setWorkspaceStatus(
        id,
        'active',
      );

      return {
        tenantId:
          id,
        action:
          input.action,
        changed:
          currentStatus !==
            'active',
        workspaceStatus:
          'active',
        sessionsCleared:
          0,
        reason:
          adminReason,
        health:
          await checkTenantDatabaseHealth(
            id,
          ),
      };
    }

    default:
      throw new PlatformWorkspaceControlError(
        'INVALID_ACTION',
        'Unsupported platform workspace action.',
      );
  }
}
