import 'server-only';

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
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  getAccessibleAutomationActions,
  getAccessibleAutomationTriggers,
} from '@/lib/automation/registry';

import {
  normalizeAutomationDefinition,
  SamiAutomationDefinitionError,
} from '@/lib/automation/definition';

import type {
  SamiAutomationRuntimeContext,
} from '@/lib/automation/types';

import {
  requireCompanyAccess,
} from '@/lib/services/company-access';

import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceAutomationErrorCode =
  | 'UNAUTHENTICATED'
  | 'WORKSPACE_CONTEXT_CHANGED'
  | 'COMPANY_REQUIRED'
  | 'COMPANY_ACCESS_DENIED'
  | 'AUTOMATION_VIEW_REQUIRED'
  | 'AUTOMATION_MANAGE_REQUIRED'
  | 'INVALID_AUTOMATION'
  | 'AUTOMATION_NOT_FOUND'
  | 'AUTOMATION_VERSION_REQUIRED';

export class WorkspaceAutomationError
  extends Error {
  readonly code:
    WorkspaceAutomationErrorCode;

  constructor(
    code:
      WorkspaceAutomationErrorCode,
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'WorkspaceAutomationError';

    this.code =
      code;
  }
}

type ResolvedAutomationContext = {
  runtime:
    SamiAutomationRuntimeContext;
  canManage:
    boolean;
};

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
    throw new WorkspaceAutomationError(
      'INVALID_AUTOMATION',
      `A valid ${label} ID is required.`,
    );
  }

  return value;
}

function cleanName(
  value:
    unknown,
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
          200,
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

async function resolveAutomationContext(
  required:
    'view' |
    'manage' =
    'view',
): Promise<ResolvedAutomationContext> {
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
    throw new WorkspaceAutomationError(
      'UNAUTHENTICATED',
      'Sign in to use Automation.',
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
    throw new WorkspaceAutomationError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your selected workspace changed. Please try again.',
    );
  }

  const companyId =
    session.currentCompanyId;

  if (
    !companyId
  ) {
    throw new WorkspaceAutomationError(
      'COMPANY_REQUIRED',
      'Select a company before using Automation.',
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
      throw new WorkspaceAutomationError(
        'COMPANY_ACCESS_DENIED',
        'You do not have access to the selected company.',
      );
    }
  }

  const canView =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .AUTOMATION_VIEW,
    ) ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .AUTOMATION_MANAGE,
    );

  const canManage =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .AUTOMATION_MANAGE,
    );

  if (
    !canView
  ) {
    throw new WorkspaceAutomationError(
      'AUTOMATION_VIEW_REQUIRED',
      'You do not have permission to view Automation.',
    );
  }

  if (
    required ===
      'manage' &&
    !canManage
  ) {
    throw new WorkspaceAutomationError(
      'AUTOMATION_MANAGE_REQUIRED',
      'You do not have permission to manage Automation.',
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
      accessibleModuleKeys:
        shell.accessibleModuleKeys,
      permissionSet:
        permissions.permissionSet,
      isOwner:
        permissions.isOwner,
    },
    canManage,
  };
}

async function recordAutomationAudit(
  context:
    SamiAutomationRuntimeContext,
  input: {
    action: string;
    workflowId?: string | null;
    summary: string;
    metadata?:
      Record<string, unknown>;
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
        'automation_workflow',
      resourceId:
        input.workflowId ||
        undefined,
      entityType:
        'automation_workflow',
      entityId:
        input.workflowId ||
        undefined,
      module:
        'automation',
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
      '[SaMi Automation] Audit write failed:',
      error,
    );
  }
}

export async function getWorkspaceAutomationState() {
  const context =
    await resolveAutomationContext(
      'view',
    );

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          w.id,
          w.name,
          w.description,
          w.status,
          w.latest_version,
          w.active_version,
          w.last_activated_at,
          w.created_at,
          w.updated_at,
          v.trigger_key,
          v.trigger_module
        FROM automation_workflows w
        LEFT JOIN automation_workflow_versions v
          ON v.workflow_id =
             w.id
         AND v.version =
             w.latest_version
        WHERE w.company_id = $1
          AND w.archived_at
              IS NULL
        ORDER BY
          w.updated_at DESC,
          w.id DESC
      `,
      [
        context.runtime
          .companyId,
      ],
    );

  return {
    canManage:
      context.canManage,
    triggers:
      getAccessibleAutomationTriggers(
        context.runtime,
      ),
    actions:
      getAccessibleAutomationActions(
        context.runtime,
      ),
    workflows:
      result.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name ||
              'Untitled automation',
            ),
          description:
            row.description
              ? String(
                  row.description,
                )
              : null,
          status:
            String(
              row.status ||
              'draft',
            ),
          latestVersion:
            Number(
              row.latest_version ||
              0,
            ),
          activeVersion:
            row.active_version ===
              null ||
            row.active_version ===
              undefined
              ? null
              : Number(
                  row.active_version,
                ),
          triggerKey:
            row.trigger_key
              ? String(
                  row.trigger_key,
                )
              : null,
          triggerModule:
            row.trigger_module
              ? String(
                  row.trigger_module,
                )
              : null,
          lastActivatedAt:
            row.last_activated_at ||
            null,
          createdAt:
            row.created_at,
          updatedAt:
            row.updated_at,
        }),
      ),
  };
}

export async function createWorkspaceAutomationDraft(
  input: {
    name?: unknown;
    description?: unknown;
  },
) {
  const context =
    await resolveAutomationContext(
      'manage',
    );

  const name =
    cleanName(
      input.name,
    );

  if (
    !name
  ) {
    throw new WorkspaceAutomationError(
      'INVALID_AUTOMATION',
      'Automation name is required.',
    );
  }

  const description =
    cleanDescription(
      input.description,
    );

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const result =
    await pool.query(
      `
        INSERT INTO automation_workflows (
          company_id,
          name,
          description,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,
          $2,
          $3,
          'draft',
          $4,
          $4
        )
        RETURNING
          id,
          name,
          description,
          status,
          latest_version,
          active_version,
          created_at,
          updated_at
      `,
      [
        context.runtime
          .companyId,
        name,
        description ||
          null,
        context.runtime
          .userId,
      ],
    );

  const row =
    result.rows[0];

  await recordAutomationAudit(
    context.runtime,
    {
      action:
        'automation.created',
      workflowId:
        String(
          row.id,
        ),
      summary:
        `Created automation "${name}".`,
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
    status:
      String(
        row.status,
      ),
    latestVersion:
      Number(
        row.latest_version ||
        0,
      ),
    activeVersion:
      null,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}

export async function saveWorkspaceAutomationVersion(
  workflowId:
    unknown,
  definition:
    unknown,
) {
  const context =
    await resolveAutomationContext(
      'manage',
    );

  const id =
    requireUuid(
      workflowId,
      'automation',
    );

  const normalized =
    normalizeAutomationDefinition(
      definition,
      {
        triggers:
          getAccessibleAutomationTriggers(
            context.runtime,
          ),
        actions:
          getAccessibleAutomationActions(
            context.runtime,
          ),
      },
    );

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const client =
    await pool.connect();

  let nextVersion =
    0;

  try {
    await client.query(
      'BEGIN',
    );

    const current =
      await client.query(
        `
          SELECT
            id,
            latest_version
          FROM automation_workflows
          WHERE id = $1
            AND company_id = $2
            AND archived_at
                IS NULL
          FOR UPDATE
        `,
        [
          id,
          context.runtime
            .companyId,
        ],
      );

    if (
      current.rows.length ===
        0
    ) {
      throw new WorkspaceAutomationError(
        'AUTOMATION_NOT_FOUND',
        'Automation could not be found in the current company.',
      );
    }

    nextVersion =
      Number(
        current.rows[0]
          .latest_version ||
        0,
      ) +
      1;

    const trigger =
      getAccessibleAutomationTriggers(
        context.runtime,
      ).find(
        candidate =>
          candidate.key ===
          normalized.trigger
            .key,
      );

    await client.query(
      `
        INSERT INTO automation_workflow_versions (
          workflow_id,
          version,
          trigger_key,
          trigger_module,
          definition,
          created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::jsonb,
          $6
        )
      `,
      [
        id,
        nextVersion,
        normalized.trigger
          .key,
        trigger
          ?.moduleKey ||
        null,
        JSON.stringify(
          normalized,
        ),
        context.runtime
          .userId,
      ],
    );

    await client.query(
      `
        UPDATE automation_workflows
        SET
          latest_version = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        id,
        context.runtime
          .companyId,
        nextVersion,
        context.runtime
          .userId,
      ],
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

    if (
      error instanceof
        WorkspaceAutomationError ||
      error instanceof
        SamiAutomationDefinitionError
    ) {
      throw error;
    }

    throw error;
  } finally {
    client.release();
  }

  await recordAutomationAudit(
    context.runtime,
    {
      action:
        'automation.version.saved',
      workflowId:
        id,
      summary:
        `Saved automation version ${nextVersion}.`,
      metadata: {
        version:
          nextVersion,
        triggerKey:
          normalized.trigger
            .key,
        actionCount:
          normalized.actions
            .length,
      },
    },
  );

  return {
    workflowId:
      id,
    version:
      nextVersion,
    definition:
      normalized,
  };
}

export async function activateWorkspaceAutomation(
  workflowId:
    unknown,
) {
  const context =
    await resolveAutomationContext(
      'manage',
    );

  const id =
    requireUuid(
      workflowId,
      'automation',
    );

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const client =
    await pool.connect();

  let version =
    0;

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            w.latest_version,
            v.definition
          FROM automation_workflows w
          LEFT JOIN automation_workflow_versions v
            ON v.workflow_id =
               w.id
           AND v.version =
               w.latest_version
          WHERE w.id = $1
            AND w.company_id = $2
            AND w.archived_at
                IS NULL
          FOR UPDATE OF w
        `,
        [
          id,
          context.runtime
            .companyId,
        ],
      );

    if (
      result.rows.length ===
        0
    ) {
      throw new WorkspaceAutomationError(
        'AUTOMATION_NOT_FOUND',
        'Automation could not be found in the current company.',
      );
    }

    version =
      Number(
        result.rows[0]
          .latest_version ||
        0,
      );

    if (
      version <
        1 ||
      !result.rows[0]
        .definition
    ) {
      throw new WorkspaceAutomationError(
        'AUTOMATION_VERSION_REQUIRED',
        'Save an automation version before activating it.',
      );
    }

    normalizeAutomationDefinition(
      result.rows[0]
        .definition,
      {
        triggers:
          getAccessibleAutomationTriggers(
            context.runtime,
          ),
        actions:
          getAccessibleAutomationActions(
            context.runtime,
          ),
      },
    );

    await client.query(
      `
        UPDATE automation_workflows
        SET
          status = 'active',
          active_version = $3,
          updated_by = $4,
          last_activated_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        id,
        context.runtime
          .companyId,
        version,
        context.runtime
          .userId,
      ],
    );

    await client.query(
      `
        UPDATE automation_workflow_versions
        SET published_at =
              COALESCE(
                published_at,
                NOW()
              )
        WHERE workflow_id = $1
          AND version = $2
      `,
      [
        id,
        version,
      ],
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

    if (
      error instanceof
        WorkspaceAutomationError ||
      error instanceof
        SamiAutomationDefinitionError
    ) {
      throw error;
    }

    throw error;
  } finally {
    client.release();
  }

  await recordAutomationAudit(
    context.runtime,
    {
      action:
        'automation.activated',
      workflowId:
        id,
      summary:
        `Activated automation version ${version}.`,
      metadata: {
        version,
      },
    },
  );

  return {
    workflowId:
      id,
    status:
      'active',
    activeVersion:
      version,
  };
}

export async function pauseWorkspaceAutomation(
  workflowId:
    unknown,
) {
  const context =
    await resolveAutomationContext(
      'manage',
    );

  const id =
    requireUuid(
      workflowId,
      'automation',
    );

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const result =
    await pool.query(
      `
        UPDATE automation_workflows
        SET
          status = 'paused',
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND archived_at
              IS NULL
        RETURNING
          active_version
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
    throw new WorkspaceAutomationError(
      'AUTOMATION_NOT_FOUND',
      'Automation could not be found in the current company.',
    );
  }

  await recordAutomationAudit(
    context.runtime,
    {
      action:
        'automation.paused',
      workflowId:
        id,
      summary:
        'Paused automation.',
    },
  );

  return {
    workflowId:
      id,
    status:
      'paused',
    activeVersion:
      result.rows[0]
        .active_version ===
        null
        ? null
        : Number(
            result.rows[0]
              .active_version,
          ),
  };
}
