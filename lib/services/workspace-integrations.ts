import 'server-only';

import crypto from 'node:crypto';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  getSession,
} from '@/lib/auth/session';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  getAccessibleIntegrationProviders,
} from '@/lib/integrations/registry';

import {
  generateIntegrationToken,
  hashIntegrationToken,
} from '@/lib/integrations/crypto';

import type {
  SamiIntegrationRuntimeContext,
} from '@/lib/integrations/types';

import {
  checkIntegrationConnectionHealth,
  getIntegrationSyncHandler,
  runIntegrationSync,
} from '@/lib/integrations/runtime';

import {
  requireCompanyAccess,
} from '@/lib/services/company-access';

import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceIntegrationErrorCode =
  | 'UNAUTHENTICATED'
  | 'WORKSPACE_CONTEXT_CHANGED'
  | 'COMPANY_REQUIRED'
  | 'COMPANY_ACCESS_DENIED'
  | 'INTEGRATIONS_VIEW_REQUIRED'
  | 'INTEGRATIONS_MANAGE_REQUIRED'
  | 'INVALID_INTEGRATION'
  | 'INTEGRATION_NOT_FOUND'
  | 'INTEGRATION_PROVIDER_UNAVAILABLE';

export class WorkspaceIntegrationError
  extends Error {
  readonly code:
    WorkspaceIntegrationErrorCode;

  constructor(
    code:
      WorkspaceIntegrationErrorCode,
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'WorkspaceIntegrationError';

    this.code =
      code;
  }
}

type ResolvedIntegrationContext = {
  runtime:
    SamiIntegrationRuntimeContext;
  canManage:
    boolean;
};

function cleanText(
  value:
    unknown,
  max:
    number,
) {
  return typeof value ===
    'string'
    ? value
        .replace(
          /[\u0000-\u001f\u007f]/g,
          ' ',
        )
        .replace(
          /\s+/g,
          ' ',
        )
        .trim()
        .slice(
          0,
          max,
        )
    : '';
}

function cleanDescription(
  value:
    unknown,
) {
  return typeof value ===
    'string'
    ? value
        .replace(
          /\u0000/g,
          '',
        )
        .trim()
        .slice(
          0,
          4_000,
        )
    : '';
}

function requireUuid(
  value:
    unknown,
  label:
    string,
) {
  if (
    typeof value !==
      'string' ||
    !UUID_RE.test(
      value,
    )
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      `A valid ${label} ID is required.`,
    );
  }

  return value;
}

function normalizeExternalLaunchUrl(
  value:
    unknown,
) {
  if (
    typeof value !==
      'string'
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'External app URL is required.',
    );
  }

  let url:
    URL;

  try {
    url =
      new URL(
        value.trim(),
      );
  } catch {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'Enter a valid external app URL.',
    );
  }

  if (
    url.protocol !==
      'https:' &&
    url.protocol !==
      'http:'
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'External apps must use an HTTP or HTTPS URL.',
    );
  }

  if (
    url.username ||
    url.password
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'External app URLs cannot contain embedded credentials.',
    );
  }

  return url.toString();
}

export async function resolveWorkspaceIntegrationContext(
  required:
    'view' |
    'manage' =
    'view',
): Promise<ResolvedIntegrationContext> {
  const [
    permissions,
    session,
  ] =
    await Promise.all([
      getPermissionContext(),
      getSession(),
    ]);

  if (
    !session
  ) {
    throw new WorkspaceIntegrationError(
      'UNAUTHENTICATED',
      'Sign in to use Integrations.',
    );
  }

  if (
    session.sessionId !==
      permissions.sessionId ||
    session.user.id !==
      permissions.userId ||
    session.currentTenantId !==
      permissions.tenantId
  ) {
    throw new WorkspaceIntegrationError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your selected workspace changed. Please try again.',
    );
  }

  const companyId =
    session.currentCompanyId;

  if (
    !companyId
  ) {
    throw new WorkspaceIntegrationError(
      'COMPANY_REQUIRED',
      'Select a company before using Integrations.',
    );
  }

  try {
    await requireCompanyAccess(
      permissions.tenantId,
      permissions.userId,
      companyId,
    );
  } catch {
    if (
      !permissions.isOwner
    ) {
      throw new WorkspaceIntegrationError(
        'COMPANY_ACCESS_DENIED',
        'You do not have access to the selected company.',
      );
    }
  }

  const canView =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .INTEGRATIONS_VIEW,
    ) ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .INTEGRATIONS_MANAGE,
    );

  const canManage =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .INTEGRATIONS_MANAGE,
    );

  if (
    !canView
  ) {
    throw new WorkspaceIntegrationError(
      'INTEGRATIONS_VIEW_REQUIRED',
      'You do not have permission to view Integrations.',
    );
  }

  if (
    required ===
      'manage' &&
    !canManage
  ) {
    throw new WorkspaceIntegrationError(
      'INTEGRATIONS_MANAGE_REQUIRED',
      'You do not have permission to manage Integrations.',
    );
  }

  const account =
    await getAccountContextForUser(
      permissions.userId,
      permissions.tenantId,
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
    runtime: {
      userId:
        permissions.userId,
      sessionId:
        permissions.sessionId,
      tenantId:
        permissions.tenantId,
      companyId,
      isOwner:
        permissions.isOwner,
      permissionSet:
        permissions.permissionSet,
      accessibleModuleKeys:
        shell.accessibleModuleKeys,
    },
    canManage,
  };
}

async function auditIntegration(
  context:
    SamiIntegrationRuntimeContext,
  input: {
    action:
      string;
    resourceId?:
      string | null;
    summary:
      string;
    metadata?:
      Record<
        string,
        unknown
      >;
  },
) {
  try {
    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      actorType:
        'human',
      action:
        input.action,
      eventType:
        input.action,
      category:
        'activity',
      severity:
        'info',
      result:
        'success',
      resourceType:
        'integration',
      resourceId:
        input.resourceId ||
        undefined,
      entityType:
        'integration',
      entityId:
        input.resourceId ||
        undefined,
      module:
        'integrations',
      summary:
        input.summary,
      metadata:
        input.metadata ||
        {},
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Integrations] Audit write failed:',
      error,
    );
  }
}

export async function getWorkspaceIntegrationState() {
  const context =
    await resolveWorkspaceIntegrationContext(
      'view',
    );

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const [
    connections,
    webhooks,
    externalApps,
    syncJobs,
  ] =
    await Promise.all([
      pool.query(
        `
          SELECT
            id,
            provider_key,
            connection_type,
            name,
            status,
            external_account_id,
            external_account_name,
            external_account_email,
            scopes,
            capabilities,
            health_status,
            last_health_check_at,
            last_sync_at,
            connected_at,
            disconnected_at,
            created_at,
            updated_at
          FROM integration_connections
          WHERE company_id = $1
            AND archived_at
                IS NULL
          ORDER BY
            updated_at DESC,
            id DESC
        `,
        [
          context.runtime
            .companyId,
        ],
      ),

      pool.query(
        `
          SELECT
            id,
            connection_id,
            provider_key,
            endpoint_key,
            name,
            status,
            event_keys,
            last_received_at,
            created_at,
            updated_at
          FROM integration_webhook_endpoints
          WHERE company_id = $1
            AND archived_at
                IS NULL
          ORDER BY
            created_at DESC,
            id DESC
        `,
        [
          context.runtime
            .companyId,
        ],
      ),

      pool.query(
        `
          SELECT
            a.id,
            a.name,
            a.description,
            a.launch_url,
            a.icon_key,
            a.auth_mode,
            a.status,
            a.assignment_mode,
            a.last_health_check_at,
            a.created_at,
            a.updated_at,
            CASE
              WHEN a.assignment_mode =
                   'all_internal'
              THEN TRUE
              WHEN EXISTS (
                SELECT 1
                FROM integration_external_app_assignments aa
                WHERE aa.external_app_id =
                      a.id
                  AND aa.user_id =
                      $2
              )
              THEN TRUE
              ELSE FALSE
            END
              AS assigned_to_current_user
          FROM integration_external_apps a
          WHERE a.company_id = $1
            AND a.archived_at
                IS NULL
          ORDER BY
            a.updated_at DESC,
            a.id DESC
        `,
        [
          context.runtime
            .companyId,
          context.runtime
            .userId,
        ],
      ),

      pool.query(
        `
          SELECT
            j.id,
            j.connection_id,
            c.name
              AS connection_name,
            c.provider_key,
            j.direction,
            j.job_type,
            j.status,
            j.attempt,
            j.max_attempts,
            j.error_code,
            j.error_message,
            j.correlation_id,
            j.started_at,
            j.completed_at,
            j.created_at
          FROM integration_sync_jobs j
          INNER JOIN integration_connections c
            ON c.id =
               j.connection_id
          WHERE j.company_id = $1
          ORDER BY
            j.created_at DESC,
            j.id DESC
          LIMIT 40
        `,
        [
          context.runtime
            .companyId,
        ],
      ),
    ]);

  return {
    canManage:
      context.canManage,

    providers:
      getAccessibleIntegrationProviders(
        context.runtime,
      ),

    connections:
      connections.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          providerKey:
            String(
              row.provider_key,
            ),
          connectionType:
            String(
              row.connection_type,
            ),
          name:
            String(
              row.name,
            ),
          status:
            String(
              row.status,
            ),
          externalAccountId:
            row.external_account_id
              ? String(
                  row.external_account_id,
                )
              : null,
          externalAccountName:
            row.external_account_name
              ? String(
                  row.external_account_name,
                )
              : null,
          externalAccountEmail:
            row.external_account_email
              ? String(
                  row.external_account_email,
                )
              : null,
          scopes:
            Array.isArray(
              row.scopes,
            )
              ? row.scopes
              : [],
          capabilities:
            Array.isArray(
              row.capabilities,
            )
              ? row.capabilities
              : [],
          syncAvailable:
            Boolean(
              getIntegrationSyncHandler(
                String(
                  row.provider_key,
                ),
              ),
            ),
          healthStatus:
            String(
              row.health_status ||
              'unknown',
            ),
          lastHealthCheckAt:
            row.last_health_check_at ||
            null,
          lastSyncAt:
            row.last_sync_at ||
            null,
          connectedAt:
            row.connected_at ||
            null,
          disconnectedAt:
            row.disconnected_at ||
            null,
          createdAt:
            row.created_at,
          updatedAt:
            row.updated_at,
        }),
      ),

    webhooks:
      webhooks.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          connectionId:
            row.connection_id
              ? String(
                  row.connection_id,
                )
              : null,
          providerKey:
            String(
              row.provider_key,
            ),
          endpointKey:
            String(
              row.endpoint_key,
            ),
          endpointPath:
            '/api/integrations/webhooks/inbound/' +
            context.runtime.tenantId +
            '/' +
            String(
              row.endpoint_key,
            ),
          name:
            String(
              row.name,
            ),
          status:
            String(
              row.status,
            ),
          eventKeys:
            Array.isArray(
              row.event_keys,
            )
              ? row.event_keys
              : [],
          lastReceivedAt:
            row.last_received_at ||
            null,
          createdAt:
            row.created_at,
          updatedAt:
            row.updated_at,
        }),
      ),

    externalApps:
      externalApps.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
          description:
            row.description
              ? String(
                  row.description,
                )
              : null,
          launchUrl:
            String(
              row.launch_url,
            ),
          iconKey:
            row.icon_key
              ? String(
                  row.icon_key,
                )
              : null,
          authMode:
            String(
              row.auth_mode,
            ),
          status:
            String(
              row.status,
            ),
          assignmentMode:
            String(
              row.assignment_mode,
            ),
          assignedToCurrentUser:
            row.assigned_to_current_user ===
              true,
          lastHealthCheckAt:
            row.last_health_check_at ||
            null,
          createdAt:
            row.created_at,
          updatedAt:
            row.updated_at,
        }),
      ),

    syncJobs:
      syncJobs.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          connectionId:
            String(
              row.connection_id,
            ),
          connectionName:
            String(
              row.connection_name,
            ),
          providerKey:
            String(
              row.provider_key,
            ),
          direction:
            String(
              row.direction,
            ),
          jobType:
            String(
              row.job_type,
            ),
          status:
            String(
              row.status,
            ),
          attempt:
            Number(
              row.attempt ||
              1,
            ),
          maxAttempts:
            Number(
              row.max_attempts ||
              1,
            ),
          errorCode:
            row.error_code
              ? String(
                  row.error_code,
                )
              : null,
          errorMessage:
            row.error_message
              ? String(
                  row.error_message,
                )
              : null,
          correlationId:
            String(
              row.correlation_id,
            ),
          startedAt:
            row.started_at ||
            null,
          completedAt:
            row.completed_at ||
            null,
          createdAt:
            row.created_at,
        }),
      ),
  };
}

export async function createWorkspaceWebhookEndpoint(
  input: {
    name?:
      unknown;
    eventKeys?:
      unknown;
  },
) {
  const context =
    await resolveWorkspaceIntegrationContext(
      'manage',
    );

  const name =
    cleanText(
      input.name,
      200,
    );

  if (
    !name
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'Webhook name is required.',
    );
  }

  const rawEventKeys =
    Array.isArray(
      input.eventKeys,
    )
      ? input.eventKeys
      : [];

  const eventKeys =
    Array.from(
      new Set(
        rawEventKeys
          .filter(
            (
              value:
                unknown,
            ) =>
              typeof value ===
                'string',
          )
          .map(
            (
              value:
                string,
            ) =>
              value
                .trim()
                .toLowerCase()
                .slice(
                  0,
                  200,
                ),
          )
          .filter(
            value =>
              /^[a-z0-9_.:-]+$/.test(
                value,
              ),
          ),
      ),
    )
      .slice(
        0,
        50,
      );

  const endpointKey =
    'wh_' +
    generateIntegrationToken(
      18,
    );

  const secret =
    generateIntegrationToken(
      32,
    );

  const secretHash =
    hashIntegrationToken(
      secret,
    );

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const client =
    await pool.connect();

  let connectionId =
    '';

  let endpointId =
    '';

  try {
    await client.query(
      'BEGIN',
    );

    const connection =
      await client.query(
        `
          INSERT INTO integration_connections (
            company_id,
            provider_key,
            connection_type,
            name,
            status,
            owner_user_id,
            scopes,
            capabilities,
            settings,
            health_status,
            connected_at,
            created_by,
            updated_by
          )
          VALUES (
            $1,
            'custom_webhook',
            'webhook',
            $2,
            'connected',
            $3,
            '[]'::jsonb,
            $4::jsonb,
            '{}'::jsonb,
            'healthy',
            NOW(),
            $3,
            $3
          )
          RETURNING id
        `,
        [
          context.runtime
            .companyId,
          name,
          context.runtime
            .userId,
          JSON.stringify([
            'inbound_webhook',
            'automation_triggers',
          ]),
        ],
      );

    connectionId =
      String(
        connection.rows[0]
          .id,
      );

    const endpoint =
      await client.query(
        `
          INSERT INTO integration_webhook_endpoints (
            company_id,
            connection_id,
            provider_key,
            endpoint_key,
            name,
            status,
            secret_hash,
            event_keys,
            created_by
          )
          VALUES (
            $1,
            $2,
            'custom_webhook',
            $3,
            $4,
            'active',
            $5,
            $6::jsonb,
            $7
          )
          RETURNING id
        `,
        [
          context.runtime
            .companyId,
          connectionId,
          endpointKey,
          name,
          secretHash,
          JSON.stringify(
            eventKeys,
          ),
          context.runtime
            .userId,
        ],
      );

    endpointId =
      String(
        endpoint.rows[0]
          .id,
      );

    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    );

    throw error;
  } finally {
    client.release();
  }

  await auditIntegration(
    context.runtime,
    {
      action:
        'integration.webhook.created',
      resourceId:
        endpointId,
      summary:
        `Created webhook integration "${name}".`,
      metadata: {
        providerKey:
          'custom_webhook',
        connectionId,
      },
    },
  );

  return {
    endpointId,
    connectionId,
    endpointKey,
    endpointPath:
      '/api/integrations/webhooks/inbound/' +
      context.runtime.tenantId +
      '/' +
      endpointKey,
    secret,
  };
}

export async function createWorkspaceExternalApp(
  input: {
    name?:
      unknown;
    description?:
      unknown;
    launchUrl?:
      unknown;
    assignmentMode?:
      unknown;
  },
) {
  const context =
    await resolveWorkspaceIntegrationContext(
      'manage',
    );

  const name =
    cleanText(
      input.name,
      200,
    );

  if (
    !name
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'External app name is required.',
    );
  }

  const description =
    cleanDescription(
      input.description,
    );

  const launchUrl =
    normalizeExternalLaunchUrl(
      input.launchUrl,
    );

  const assignmentMode =
    input.assignmentMode ===
      'all_internal'
      ? 'all_internal'
      : 'manual';

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const result =
    await pool.query(
      `
        INSERT INTO integration_external_apps (
          company_id,
          name,
          description,
          launch_url,
          auth_mode,
          status,
          assignment_mode,
          sso_config,
          created_by,
          updated_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'bookmark',
          'active',
          $5,
          '{}'::jsonb,
          $6,
          $6
        )
        RETURNING
          id,
          name,
          description,
          launch_url,
          auth_mode,
          status,
          assignment_mode,
          created_at,
          updated_at
      `,
      [
        context.runtime
          .companyId,
        name,
        description ||
          null,
        launchUrl,
        assignmentMode,
        context.runtime
          .userId,
      ],
    );

  const row =
    result.rows[0];

  if (
    assignmentMode ===
      'manual'
  ) {
    await pool.query(
      `
        INSERT INTO integration_external_app_assignments (
          external_app_id,
          company_id,
          user_id,
          assignment_source,
          assigned_by
        )
        VALUES (
          $1,
          $2,
          $3,
          'manual',
          $3
        )
        ON CONFLICT (
          external_app_id,
          user_id
        )
        DO NOTHING
      `,
      [
        row.id,
        context.runtime
          .companyId,
        context.runtime
          .userId,
      ],
    );
  }

  await auditIntegration(
    context.runtime,
    {
      action:
        'integration.external_app.created',
      resourceId:
        String(
          row.id,
        ),
      summary:
        `Added external app "${name}" to the company launcher.`,
      metadata: {
        authMode:
          'bookmark',
        assignmentMode,
      },
    },
  );

  return {
    id:
      String(
        row.id,
      ),
    name:
      String(
        row.name,
      ),
    description:
      row.description ||
      null,
    launchUrl:
      String(
        row.launch_url,
      ),
    authMode:
      String(
        row.auth_mode,
      ),
    status:
      String(
        row.status,
      ),
    assignmentMode:
      String(
        row.assignment_mode,
      ),
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}

export async function disconnectWorkspaceIntegration(
  connectionId:
    unknown,
) {
  const context =
    await resolveWorkspaceIntegrationContext(
      'manage',
    );

  const id =
    requireUuid(
      connectionId,
      'connection',
    );

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          UPDATE integration_connections
          SET
            status =
              'revoked',
            health_status =
              'revoked',
            disconnected_at =
              NOW(),
            updated_by =
              $3,
            updated_at =
              NOW()
          WHERE id = $1
            AND company_id = $2
            AND archived_at
                IS NULL
          RETURNING
            id,
            name,
            provider_key
        `,
        [
          id,
          context.runtime
            .companyId,
          context.runtime
            .userId,
        ],
      );

    if (
      result.rows.length ===
        0
    ) {
      throw new WorkspaceIntegrationError(
        'INTEGRATION_NOT_FOUND',
        'Integration connection could not be found in the current company.',
      );
    }

    await client.query(
      `
        DELETE FROM integration_credentials
        WHERE connection_id = $1
      `,
      [
        id,
      ],
    );

    await client.query(
      `
        UPDATE integration_webhook_endpoints
        SET
          status =
            'revoked',
          updated_at =
            NOW()
        WHERE connection_id = $1
          AND company_id = $2
      `,
      [
        id,
        context.runtime
          .companyId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    const row =
      result.rows[0];

    await auditIntegration(
      context.runtime,
      {
        action:
          'integration.disconnected',
        resourceId:
          id,
        summary:
          `Disconnected integration "${String(
            row.name,
          )}".`,
        metadata: {
          providerKey:
            String(
              row.provider_key,
            ),
        },
      },
    );

    return {
      id,
      status:
        'revoked',
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    );

    throw error;
  } finally {
    client.release();
  }
}

export async function checkWorkspaceIntegrationHealth(
  connectionId:
    unknown,
) {
  const context =
    await resolveWorkspaceIntegrationContext(
      'manage',
    );

  const id =
    requireUuid(
      connectionId,
      'connection',
    );

  try {
    const result =
      await checkIntegrationConnectionHealth(
        context.runtime,
        id,
      );

    await auditIntegration(
      context.runtime,
      {
        action:
          'integration.health.checked',
        resourceId:
          id,
        summary:
          'Checked integration connection health.',
        metadata: {
          healthStatus:
            result.status,
        },
      },
    );

    return result;
  } catch (
    error
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      error instanceof
        Error
        ? error.message
        : 'Integration health check failed.',
    );
  }
}

export async function runWorkspaceIntegrationSync(
  connectionId:
    unknown,
) {
  const context =
    await resolveWorkspaceIntegrationContext(
      'manage',
    );

  const id =
    requireUuid(
      connectionId,
      'connection',
    );

  try {
    const result =
      await runIntegrationSync(
        context.runtime,
        id,
      );

    await auditIntegration(
      context.runtime,
      {
        action:
          'integration.sync.completed',
        resourceId:
          id,
        summary:
          'Ran integration sync.',
        metadata: {
          jobId:
            result.jobId,
          correlationId:
            result.correlationId,
        },
      },
    );

    return result;
  } catch (
    error
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      error instanceof
        Error
        ? error.message
        : 'Integration sync failed.',
    );
  }
}


export async function getWorkspaceExternalAppLauncherEntries() {
  const [
    permissions,
    session,
  ] =
    await Promise.all([
      getPermissionContext(),
      getSession(),
    ]);

  if (
    !session ||
    session.sessionId !==
      permissions.sessionId ||
    session.user.id !==
      permissions.userId ||
    session.currentTenantId !==
      permissions.tenantId
  ) {
    return [];
  }

  const companyId =
    session.currentCompanyId;

  if (
    !companyId
  ) {
    return [];
  }

  try {
    await requireCompanyAccess(
      permissions.tenantId,
      permissions.userId,
      companyId,
    );
  } catch {
    if (
      !permissions.isOwner
    ) {
      return [];
    }
  }

  const pool =
    await getTenantPoolByTenantId(
      permissions.tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          a.id,
          a.name,
          a.description,
          a.launch_url,
          a.icon_key,
          a.auth_mode,
          a.assignment_mode
        FROM integration_external_apps a
        WHERE a.company_id = $1
          AND a.status =
              'active'
          AND a.archived_at
              IS NULL
          AND (
            a.assignment_mode =
              'all_internal'
            OR a.assignment_mode =
              'rule'
            OR EXISTS (
              SELECT 1
              FROM integration_external_app_assignments aa
              WHERE aa.external_app_id =
                    a.id
                AND aa.user_id =
                    $2
            )
          )
        ORDER BY
          LOWER(a.name),
          a.id
      `,
      [
        companyId,
        permissions.userId,
      ],
    );

  const ruleAppIds =
    result.rows
      .filter(
        row =>
          String(
            row.assignment_mode ||
            '',
          ) ===
          'rule',
      )
      .map(
        row =>
          String(
            row.id,
          ),
      );

  let allowedRuleApps =
    new Set<string>();

  if (
    ruleAppIds.length >
      0
  ) {
    const [
      identity,
      rules,
    ] =
      await Promise.all([
        queryControl(
          `
            SELECT
              u.email,
              COALESCE(
                ARRAY_AGG(
                  DISTINCT LOWER(r.key)
                ) FILTER (
                  WHERE r.key IS NOT NULL
                ),
                ARRAY[]::text[]
              )
                AS role_keys
            FROM users u
            LEFT JOIN user_roles ur
              ON ur.user_id =
                 u.id
             AND ur.tenant_id =
                 $2
             AND ur.deleted_at
                 IS NULL
            LEFT JOIN roles r
              ON r.id =
                 ur.role_id
             AND r.deleted_at
                 IS NULL
             AND LOWER(
                   COALESCE(
                     r.status,
                     'active'
                   )
                 ) =
                 'active'
            WHERE u.id = $1
              AND u.deleted_at
                  IS NULL
            GROUP BY
              u.id,
              u.email
          `,
          [
            permissions.userId,
            permissions.tenantId,
          ],
        ),

        pool.query(
          `
            SELECT
              external_app_id,
              conditions
            FROM integration_assignment_rules
            WHERE company_id = $1
              AND external_app_id =
                  ANY($2::uuid[])
              AND enabled =
                  TRUE
            ORDER BY
              priority,
              created_at,
              id
          `,
          [
            companyId,
            ruleAppIds,
          ],
        ),
      ]);

    const email =
      String(
        identity.rows[0]
          ?.email ||
        '',
      )
        .trim()
        .toLowerCase();

    const emailDomain =
      email.includes(
        '@',
      )
        ? email.split(
            '@',
          )[1] ||
          ''
        : '';

    const roleKeys =
      new Set(
        Array.isArray(
          identity.rows[0]
            ?.role_keys,
        )
          ? identity.rows[0]
              .role_keys
              .map(
                (
                  value:
                    unknown,
                ) =>
                  String(
                    value ||
                    '',
                  )
                    .trim()
                    .toLowerCase(),
              )
              .filter(
                Boolean,
              )
          : [],
      );

    for (
      const row
      of rules.rows
    ) {
      const conditions =
        row.conditions &&
        typeof row.conditions ===
          'object' &&
        !Array.isArray(
          row.conditions,
        )
          ? row.conditions as
              Record<
                string,
                unknown
              >
          : {};

      const match =
        conditions.match ===
          'any'
          ? 'any'
          : 'all';

      const requestedRoles =
        Array.isArray(
          conditions.roleKeysAny,
        )
          ? conditions
              .roleKeysAny
              .filter(
                (
                  value:
                    unknown,
                ) =>
                  typeof value ===
                    'string',
              )
              .map(
                (
                  value:
                    string,
                ) =>
                  value
                    .trim()
                    .toLowerCase(),
              )
              .filter(
                Boolean,
              )
          : [];

      const requestedDomains =
        Array.isArray(
          conditions.emailDomainsAny,
        )
          ? conditions
              .emailDomainsAny
              .filter(
                (
                  value:
                    unknown,
                ) =>
                  typeof value ===
                    'string',
              )
              .map(
                (
                  value:
                    string,
                ) =>
                  value
                    .trim()
                    .toLowerCase()
                    .replace(
                      /^@/,
                      '',
                    ),
              )
              .filter(
                Boolean,
              )
          : [];

      const checks:
        boolean[] =
        [];

      if (
        requestedRoles.length >
          0
      ) {
        checks.push(
          requestedRoles.some(
            role =>
              roleKeys.has(
                role,
              ),
          ),
        );
      }

      if (
        requestedDomains.length >
          0
      ) {
        checks.push(
          requestedDomains.includes(
            emailDomain,
          ),
        );
      }

      const ruleMatches =
        checks.length >
          0 &&
        (
          match ===
            'any'
            ? checks.some(
                Boolean,
              )
            : checks.every(
                Boolean,
              )
        );

      if (
        ruleMatches
      ) {
        allowedRuleApps.add(
          String(
            row.external_app_id,
          ),
        );
      }
    }
  }

  return result.rows
    .filter(
      row =>
        String(
          row.assignment_mode ||
          '',
        ) !==
          'rule' ||
        allowedRuleApps.has(
          String(
            row.id,
          ),
        ),
    )
    .map(
      row => ({
        id:
          String(
            row.id,
          ),
        name:
          String(
            row.name,
          ),
        description:
          row.description
            ? String(
                row.description,
              )
            : null,
        launchUrl:
          String(
            row.launch_url,
          ),
        iconKey:
          row.icon_key
            ? String(
                row.icon_key,
              )
            : null,
        authMode:
          String(
            row.auth_mode,
          ),
      }),
    );
}

export async function getWorkspaceIntegrationAssignableUsers() {
  const context =
    await resolveWorkspaceIntegrationContext(
      'manage',
    );

  const members =
    await queryControl(
      `
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          tu.is_owner
        FROM tenant_users tu
        INNER JOIN users u
          ON u.id =
             tu.user_id
        WHERE tu.tenant_id = $1
          AND tu.deleted_at
              IS NULL
          AND u.deleted_at
              IS NULL
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
          AND LOWER(
                COALESCE(
                  u.status,
                  ''
                )
              ) =
              'active'
        ORDER BY
          tu.is_owner DESC,
          LOWER(
            COALESCE(
              u.first_name,
              ''
            )
          ),
          LOWER(
            COALESCE(
              u.last_name,
              ''
            )
          ),
          LOWER(u.email)
        LIMIT 500
      `,
      [
        context.runtime
          .tenantId,
      ],
    );

  const roleRows =
    await queryControl(
      `
        SELECT
          ur.user_id,
          LOWER(r.key)
            AS role_key
        FROM user_roles ur
        INNER JOIN roles r
          ON r.id =
             ur.role_id
        WHERE ur.tenant_id = $1
          AND ur.deleted_at
              IS NULL
          AND r.deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  r.status,
                  'active'
                )
              ) =
              'active'
      `,
      [
        context.runtime
          .tenantId,
      ],
    );

  const rolesByUser =
    new Map<
      string,
      Set<string>
    >();

  for (
    const row
    of roleRows.rows
  ) {
    const userId =
      String(
        row.user_id,
      );

    const roleKey =
      String(
        row.role_key ||
        '',
      )
        .trim()
        .toLowerCase();

    if (
      !roleKey
    ) {
      continue;
    }

    const set =
      rolesByUser.get(
        userId,
      ) ||
      new Set<string>();

    set.add(
      roleKey,
    );

    rolesByUser.set(
      userId,
      set,
    );
  }

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const candidateIds =
    members.rows.map(
      row =>
        String(
          row.id,
        ),
    );

  const companyAccess =
    candidateIds.length >
      0
      ? await pool.query(
          `
            SELECT user_id
            FROM company_users
            WHERE company_id = $1
              AND user_id =
                  ANY($2::uuid[])
              AND LOWER(
                    COALESCE(
                      status,
                      ''
                    )
                  ) =
                  'active'
          `,
          [
            context.runtime
              .companyId,
            candidateIds,
          ],
        )
      : {
          rows: [],
        };

  const allowed =
    new Set(
      companyAccess.rows.map(
        row =>
          String(
            row.user_id,
          ),
      ),
    );

  return members.rows
    .filter(
      row =>
        row.is_owner ===
          true ||
        allowed.has(
          String(
            row.id,
          ),
        ),
    )
    .map(
      row => ({
        id:
          String(
            row.id,
          ),
        email:
          String(
            row.email,
          ),
        name:
          [
            row.first_name,
            row.last_name,
          ]
            .filter(
              Boolean,
            )
            .join(
              ' ',
            )
            .trim() ||
          String(
            row.email,
          ),
        isOwner:
          row.is_owner ===
            true,
        roleKeys:
          Array.from(
            rolesByUser.get(
              String(
                row.id,
              ),
            ) ||
            [],
          )
            .sort(),
      }),
    );
}

export async function getWorkspaceExternalAppAssignmentState(
  externalAppId:
    unknown,
) {
  const context =
    await resolveWorkspaceIntegrationContext(
      'manage',
    );

  const appId =
    requireUuid(
      externalAppId,
      'external app',
    );

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const app =
    await pool.query(
      `
        SELECT
          id,
          name,
          assignment_mode
        FROM integration_external_apps
        WHERE id = $1
          AND company_id = $2
          AND archived_at
              IS NULL
        LIMIT 1
      `,
      [
        appId,
        context.runtime
          .companyId,
      ],
    );

  if (
    app.rows.length !==
      1
  ) {
    throw new WorkspaceIntegrationError(
      'INTEGRATION_NOT_FOUND',
      'External app could not be found in the current company.',
    );
  }

  const [
    users,
    assignments,
    rules,
  ] =
    await Promise.all([
      getWorkspaceIntegrationAssignableUsers(),
      pool.query(
        `
          SELECT
            user_id,
            assignment_source,
            assigned_by,
            created_at
          FROM integration_external_app_assignments
          WHERE external_app_id = $1
            AND company_id = $2
          ORDER BY
            created_at,
            user_id
        `,
        [
          appId,
          context.runtime
            .companyId,
        ],
      ),

      pool.query(
        `
          SELECT
            id,
            name,
            enabled,
            priority,
            conditions
          FROM integration_assignment_rules
          WHERE external_app_id = $1
            AND company_id = $2
          ORDER BY
            priority,
            created_at,
            id
        `,
        [
          appId,
          context.runtime
            .companyId,
        ],
      ),
    ]);

  const assigned =
    new Set(
      assignments.rows.map(
        row =>
          String(
            row.user_id,
          ),
      ),
    );

  return {
    externalApp: {
      id:
        String(
          app.rows[0]
            .id,
        ),
      name:
        String(
          app.rows[0]
            .name,
        ),
      assignmentMode:
        String(
          app.rows[0]
            .assignment_mode,
        ),
    },

    users:
      users.map(
        user => ({
          ...user,
          assigned:
            assigned.has(
              user.id,
            ),
        }),
      ),

    rules:
      rules.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
          enabled:
            row.enabled ===
              true,
          priority:
            Number(
              row.priority ||
              100,
            ),
          conditions:
            row.conditions &&
            typeof row.conditions ===
              'object' &&
            !Array.isArray(
              row.conditions,
            )
              ? row.conditions
              : {},
        }),
      ),
  };
}


export async function setWorkspaceExternalAppAccessPolicy(
  externalAppId:
    unknown,
  input: {
    mode?:
      unknown;
    userIds?:
      unknown;
    rule?:
      unknown;
  },
) {
  const context =
    await resolveWorkspaceIntegrationContext(
      'manage',
    );

  const appId =
    requireUuid(
      externalAppId,
      'external app',
    );

  const mode =
    input.mode ===
      'all_internal' ||
    input.mode ===
      'rule'
      ? input.mode
      : 'manual';

  const requestedUsers =
    Array.isArray(
      input.userIds,
    )
      ? Array.from(
          new Set(
            input.userIds
              .filter(
                (
                  value:
                    unknown,
                ) =>
                  typeof value ===
                    'string' &&
                  UUID_RE.test(
                    value,
                  ),
              )
              .map(
                (
                  value:
                    string,
                ) =>
                  value
                    .toLowerCase(),
              ),
          ),
        )
          .slice(
            0,
            500,
          )
      : [];

  const ruleSource =
    input.rule &&
    typeof input.rule ===
      'object' &&
    !Array.isArray(
      input.rule,
    )
      ? input.rule as
          Record<
            string,
            unknown
          >
      : {};

  const roleKeysAny =
    Array.isArray(
      ruleSource.roleKeysAny,
    )
      ? Array.from(
          new Set(
            ruleSource
              .roleKeysAny
              .filter(
                (
                  value:
                    unknown,
                ) =>
                  typeof value ===
                    'string',
              )
              .map(
                (
                  value:
                    string,
                ) =>
                  value
                    .trim()
                    .toLowerCase(),
              )
              .filter(
                value =>
                  /^[a-z0-9_.:-]{1,120}$/.test(
                    value,
                  ),
              ),
          ),
        )
          .slice(
            0,
            100,
          )
      : [];

  const emailDomainsAny =
    Array.isArray(
      ruleSource.emailDomainsAny,
    )
      ? Array.from(
          new Set(
            ruleSource
              .emailDomainsAny
              .filter(
                (
                  value:
                    unknown,
                ) =>
                  typeof value ===
                    'string',
              )
              .map(
                (
                  value:
                    string,
                ) =>
                  value
                    .trim()
                    .toLowerCase()
                    .replace(
                      /^@/,
                      '',
                    ),
              )
              .filter(
                value =>
                  /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(
                    value,
                  ),
              ),
          ),
        )
          .slice(
            0,
            100,
          )
      : [];

  const match =
    ruleSource.match ===
      'any'
      ? 'any'
      : 'all';

  if (
    mode ===
      'rule' &&
    roleKeysAny.length ===
      0 &&
    emailDomainsAny.length ===
      0
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'Rule-based access needs at least one role or email domain.',
    );
  }

  const assignable =
    await getWorkspaceIntegrationAssignableUsers();

  const allowedUsers =
    new Set(
      assignable.map(
        user =>
          user.id
            .toLowerCase(),
      ),
    );

  if (
    requestedUsers.some(
      id =>
        !allowedUsers.has(
          id,
        ),
    )
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'One or more selected users do not have access to the current company.',
    );
  }

  const availableRoles =
    new Set(
      assignable.flatMap(
        user =>
          Array.isArray(
            user.roleKeys,
          )
            ? user.roleKeys
            : [],
      ),
    );

  if (
    roleKeysAny.some(
      role =>
        !availableRoles.has(
          role,
        ),
    )
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'One or more selected roles are not active in this workspace.',
    );
  }

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const app =
      await client.query(
        `
          SELECT
            id,
            name
          FROM integration_external_apps
          WHERE id = $1
            AND company_id = $2
            AND archived_at
                IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [
          appId,
          context.runtime
            .companyId,
        ],
      );

    if (
      app.rows.length !==
        1
    ) {
      throw new WorkspaceIntegrationError(
        'INTEGRATION_NOT_FOUND',
        'External app could not be found in the current company.',
      );
    }

    await client.query(
      `
        UPDATE integration_external_apps
        SET
          assignment_mode =
            $3,
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        appId,
        context.runtime
          .companyId,
        mode,
        context.runtime
          .userId,
      ],
    );

    await client.query(
      `
        DELETE FROM integration_external_app_assignments
        WHERE external_app_id = $1
          AND company_id = $2
      `,
      [
        appId,
        context.runtime
          .companyId,
      ],
    );

    await client.query(
      `
        DELETE FROM integration_assignment_rules
        WHERE external_app_id = $1
          AND company_id = $2
      `,
      [
        appId,
        context.runtime
          .companyId,
      ],
    );

    if (
      mode ===
        'manual'
    ) {
      for (
        const userId
        of requestedUsers
      ) {
        await client.query(
          `
            INSERT INTO integration_external_app_assignments (
              external_app_id,
              company_id,
              user_id,
              assignment_source,
              assigned_by
            )
            VALUES (
              $1,
              $2,
              $3,
              'manual',
              $4
            )
          `,
          [
            appId,
            context.runtime
              .companyId,
            userId,
            context.runtime
              .userId,
          ],
        );
      }
    }

    if (
      mode ===
        'rule'
    ) {
      await client.query(
        `
          INSERT INTO integration_assignment_rules (
            external_app_id,
            company_id,
            name,
            enabled,
            priority,
            conditions,
            created_by,
            updated_by
          )
          VALUES (
            $1,
            $2,
            'Launcher access rule',
            TRUE,
            100,
            $3::jsonb,
            $4,
            $4
          )
        `,
        [
          appId,
          context.runtime
            .companyId,
          JSON.stringify({
            match,
            roleKeysAny,
            emailDomainsAny,
          }),
          context.runtime
            .userId,
        ],
      );
    }

    await client.query(
      'COMMIT',
    );

    await auditIntegration(
      context.runtime,
      {
        action:
          'integration.external_app.access_policy.updated',
        resourceId:
          appId,
        summary:
          `Updated external app access policy for "${String(
            app.rows[0]
              .name,
          )}".`,
        metadata: {
          mode,
          assignedUsers:
            mode ===
              'manual'
              ? requestedUsers.length
              : 0,
          roleRules:
            roleKeysAny.length,
          domainRules:
            emailDomainsAny.length,
        },
      },
    );

    return {
      externalAppId:
        appId,
      mode,
      userIds:
        mode ===
          'manual'
          ? requestedUsers
          : [],
      rule:
        mode ===
          'rule'
          ? {
              match,
              roleKeysAny,
              emailDomainsAny,
            }
          : null,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    );

    throw error;
  } finally {
    client.release();
  }
}


export async function setWorkspaceExternalAppAssignments(
  externalAppId:
    unknown,
  userIds:
    unknown,
) {
  const context =
    await resolveWorkspaceIntegrationContext(
      'manage',
    );

  const appId =
    requireUuid(
      externalAppId,
      'external app',
    );

  const requested =
    Array.isArray(
      userIds,
    )
      ? Array.from(
          new Set(
            userIds
              .filter(
                (
                  value:
                    unknown,
                ) =>
                  typeof value ===
                    'string' &&
                  UUID_RE.test(
                    value,
                  ),
              )
              .map(
                (
                  value:
                    string,
                ) =>
                  value
                    .toLowerCase(),
              ),
          ),
        )
          .slice(
            0,
            500,
          )
      : [];

  const assignable =
    await getWorkspaceIntegrationAssignableUsers();

  const allowed =
    new Set(
      assignable.map(
        user =>
          user.id
            .toLowerCase(),
      ),
    );

  if (
    requested.some(
      id =>
        !allowed.has(
          id,
        ),
    )
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'One or more selected users do not have access to the current company.',
    );
  }

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const app =
      await client.query(
        `
          SELECT
            id,
            name
          FROM integration_external_apps
          WHERE id = $1
            AND company_id = $2
            AND archived_at
                IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [
          appId,
          context.runtime
            .companyId,
        ],
      );

    if (
      app.rows.length !==
        1
    ) {
      throw new WorkspaceIntegrationError(
        'INTEGRATION_NOT_FOUND',
        'External app could not be found in the current company.',
      );
    }

    await client.query(
      `
        UPDATE integration_external_apps
        SET
          assignment_mode =
            'manual',
          updated_by =
            $3,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        appId,
        context.runtime
          .companyId,
        context.runtime
          .userId,
      ],
    );

    await client.query(
      `
        DELETE FROM integration_external_app_assignments
        WHERE external_app_id = $1
          AND company_id = $2
          AND NOT (
            user_id =
            ANY($3::uuid[])
          )
      `,
      [
        appId,
        context.runtime
          .companyId,
        requested,
      ],
    );

    for (
      const userId
      of requested
    ) {
      await client.query(
        `
          INSERT INTO integration_external_app_assignments (
            external_app_id,
            company_id,
            user_id,
            assignment_source,
            assigned_by
          )
          VALUES (
            $1,
            $2,
            $3,
            'manual',
            $4
          )
          ON CONFLICT (
            external_app_id,
            user_id
          )
          DO UPDATE SET
            company_id =
              EXCLUDED.company_id,
            assignment_source =
              'manual',
            assigned_by =
              EXCLUDED.assigned_by
        `,
        [
          appId,
          context.runtime
            .companyId,
          userId,
          context.runtime
            .userId,
        ],
      );
    }

    await client.query(
      'COMMIT',
    );

    await auditIntegration(
      context.runtime,
      {
        action:
          'integration.external_app.assignments.updated',
        resourceId:
          appId,
        summary:
          `Updated external app assignments for "${String(
            app.rows[0]
              .name,
          )}".`,
        metadata: {
          assignedUsers:
            requested.length,
        },
      },
    );

    return {
      externalAppId:
        appId,
      userIds:
        requested,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    );

    throw error;
  } finally {
    client.release();
  }
}
