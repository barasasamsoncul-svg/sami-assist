import 'server-only';

import crypto from 'node:crypto';

import {
  getAccessibleAutomationAction,
  getAccessibleAutomationActions,
  getAccessibleAutomationTriggers,
  getAutomationActionHandler,
} from '@/lib/automation/registry';

import {
  normalizeAutomationDefinition,
} from '@/lib/automation/definition';

import type {
  SamiAutomationDefinition,
  SamiAutomationRuntimeContext,
  SamiAutomationTriggerType,
} from '@/lib/automation/types';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

export class AutomationExecutionError
  extends Error {
  constructor(
    public readonly code:
      | 'WORKFLOW_NOT_FOUND'
      | 'WORKFLOW_NOT_ACTIVE'
      | 'TRIGGER_MISMATCH'
      | 'ACTION_UNAVAILABLE'
      | 'ACTION_FAILED'
      | 'RUN_NOT_FOUND'
      | 'RUN_NOT_RETRYABLE',
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'AutomationExecutionError';
  }
}

type AutomationRunResult = {
  runId:
    string;
  status:
    'succeeded' |
    'failed' |
    'waiting_approval' |
    'cancelled';
  matched:
    boolean;
  correlationId:
    string;
  waitingForApproval?:
    string;
  duplicate?:
    boolean;
};

function safePayload(
  value:
    unknown,
) {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(
      value,
    )
  ) {
    return {};
  }

  const serialized =
    JSON.stringify(
      value,
    );

  if (
    Buffer.byteLength(
      serialized,
      'utf8',
    ) >
    32 * 1024
  ) {
    throw new AutomationExecutionError(
      'ACTION_FAILED',
      'Automation input is too large.',
    );
  }

  return JSON.parse(
    serialized,
  ) as
    Record<
      string,
      unknown
    >;
}

function readPath(
  source:
    Record<
      string,
      unknown
    >,
  path:
    string,
): unknown {
  let current:
    unknown =
    source;

  for (
    const segment
    of path.split(
      '.',
    )
  ) {
    if (
      !current ||
      typeof current !==
        'object' ||
      Array.isArray(
        current,
      )
    ) {
      return undefined;
    }

    current =
      (
        current as
          Record<
            string,
            unknown
          >
      )[segment];
  }

  return current;
}

function conditionsMatch(
  payload:
    Record<
      string,
      unknown
    >,
  definition:
    SamiAutomationDefinition,
) {
  return definition.conditions
    .every(
      condition => {
        const actual =
          readPath(
            payload,
            condition.path,
          );

        switch (
          condition.operator
        ) {
          case 'exists':
            return actual !==
              undefined &&
              actual !==
              null;

          case 'not_exists':
            return actual ===
              undefined ||
              actual ===
              null;

          case 'equals':
            return actual ===
              condition.value;

          case 'not_equals':
            return actual !==
              condition.value;

          case 'contains':
            return (
              typeof actual ===
                'string' &&
              typeof condition
                .value ===
                'string' &&
              actual.includes(
                condition.value,
              )
            ) ||
            (
              Array.isArray(
                actual,
              ) &&
              actual.includes(
                condition.value,
              )
            );

          case 'in':
            return (
              Array.isArray(
                condition.value,
              ) &&
              condition.value
                .includes(
                  actual,
                )
            );

          case 'greater_than':
          case 'greater_than_or_equal':
          case 'less_than':
          case 'less_than_or_equal': {
            const left =
              Number(
                actual,
              );

            const right =
              Number(
                condition.value,
              );

            if (
              !Number.isFinite(
                left,
              ) ||
              !Number.isFinite(
                right,
              )
            ) {
              return false;
            }

            if (
              condition.operator ===
                'greater_than'
            ) {
              return left >
                right;
            }

            if (
              condition.operator ===
                'greater_than_or_equal'
            ) {
              return left >=
                right;
            }

            if (
              condition.operator ===
                'less_than'
            ) {
              return left <
                right;
            }

            return left <=
              right;
          }

          default:
            return false;
        }
      },
    );
}

function safeError(
  error:
    unknown,
) {
  return error instanceof
    Error
    ? error.message
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
          800,
        )
    : 'Automation action failed.';
}

async function auditRun(
  runtime:
    SamiAutomationRuntimeContext,
  input: {
    action:
      string;
    workflowId:
      string;
    summary:
      string;
    metadata:
      Record<
        string,
        unknown
      >;
  },
) {
  try {
    await recordWorkspaceAuditEvent({
      tenantId:
        runtime.tenantId,
      companyId:
        runtime.companyId,
      userId:
        runtime.userId,
      actorType:
        runtime.sessionId ===
          'automation-worker'
          ? 'system'
          : 'human',
      action:
        input.action,
      eventType:
        input.action,
      category:
        'activity',
      severity:
        input.action.endsWith(
          '.failed',
        )
          ? 'warning'
          : 'info',
      result:
        input.action.endsWith(
          '.failed',
        )
          ? 'failure'
          : 'success',
      resourceType:
        'automation_workflow',
      resourceId:
        input.workflowId,
      entityType:
        'automation_workflow',
      entityId:
        input.workflowId,
      module:
        'automation',
      summary:
        input.summary,
      metadata:
        input.metadata,
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Automation] Run audit write failed:',
      error,
    );
  }
}

function nextRetryAt(
  definition:
    SamiAutomationDefinition,
  attempt:
    number,
) {
  if (
    attempt >=
    definition.retry
      .maxAttempts
  ) {
    return null;
  }

  return new Date(
    Date.now() +
    definition.retry
      .backoffSeconds *
      1000,
  ).toISOString();
}

async function loadDefinitionForRuntime(
  runtime:
    SamiAutomationRuntimeContext,
  raw:
    unknown,
) {
  return normalizeAutomationDefinition(
    raw,
    {
      triggers:
        getAccessibleAutomationTriggers(
          runtime,
        ),
      actions:
        getAccessibleAutomationActions(
          runtime,
        ),
    },
  );
}

async function executeRemainingSteps(
  input: {
    runtime:
      SamiAutomationRuntimeContext;
    runId:
      string;
    workflowId:
      string;
    workflowName:
      string;
    eventId:
      string | null;
    correlationId:
      string;
    attempt:
      number;
    definition:
      SamiAutomationDefinition;
  },
): Promise<AutomationRunResult> {
  const pool =
    await getTenantPoolByTenantId(
      input.runtime
        .tenantId,
    );

  try {
    for (
      let index =
        0;
      index <
        input.definition
          .actions.length;
      index +=
        1
    ) {
      const step =
        input.definition
          .actions[index];

      const action =
        getAccessibleAutomationAction(
          input.runtime,
          step.actionKey,
        );

      const handler =
        getAutomationActionHandler(
          step.actionKey,
        );

      if (
        !action ||
        !handler
      ) {
        throw new AutomationExecutionError(
          'ACTION_UNAVAILABLE',
          'An automation action is no longer available to the run-as user or workspace.',
        );
      }

      const existing =
        await pool.query(
          `
            SELECT
              s.id,
              s.status,
              s.attempt,
              a.status
                AS approval_status
            FROM automation_run_steps s
            LEFT JOIN automation_approvals a
              ON a.step_id =
                 s.id
            WHERE s.run_id = $1
              AND s.step_key = $2
            LIMIT 1
          `,
          [
            input.runId,
            step.key,
          ],
        );

      let stepId:
        string;

      if (
        existing.rows.length >
          0
      ) {
        const row =
          existing.rows[0];

        stepId =
          String(
            row.id,
          );

        const status =
          String(
            row.status ||
            '',
          );

        if (
          status ===
            'succeeded'
        ) {
          continue;
        }

        if (
          status ===
            'waiting_approval'
        ) {
          const approvalStatus =
            String(
              row.approval_status ||
              'pending',
            );

          if (
            approvalStatus ===
              'pending'
          ) {
            await pool.query(
              `
                UPDATE automation_runs
                SET
                  status =
                    'waiting_approval',
                  completed_at =
                    NULL,
                  lease_until =
                    NULL,
                  lease_token =
                    NULL
                WHERE id = $1
              `,
              [
                input.runId,
              ],
            );

            return {
              runId:
                input.runId,
              status:
                'waiting_approval',
              matched:
                true,
              correlationId:
                input.correlationId,
              waitingForApproval:
                step.key,
              duplicate:
                false,
            };
          }

          if (
            approvalStatus !==
              'approved'
          ) {
            await pool.query(
              `
                UPDATE automation_run_steps
                SET
                  status =
                    'cancelled',
                  completed_at =
                    COALESCE(
                      completed_at,
                      NOW()
                    )
                WHERE id = $1
              `,
              [
                stepId,
              ],
            );

            await pool.query(
              `
                UPDATE automation_runs
                SET
                  status =
                    'cancelled',
                  completed_at =
                    NOW(),
                  next_retry_at =
                    NULL,
                  lease_until =
                    NULL,
                  lease_token =
                    NULL
                WHERE id = $1
              `,
              [
                input.runId,
              ],
            );

            return {
              runId:
                input.runId,
              status:
                'cancelled',
              matched:
                true,
              correlationId:
                input.correlationId,
              duplicate:
                false,
            };
          }
        }

        await pool.query(
          `
            UPDATE automation_run_steps
            SET
              status =
                'running',
              attempt =
                LEAST(
                  max_attempts,
                  attempt + 1
                ),
              error_code =
                NULL,
              error_message =
                NULL,
              started_at =
                NOW(),
              completed_at =
                NULL
            WHERE id = $1
          `,
          [
            stepId,
          ],
        );
      } else if (
        step.requireApproval
      ) {
        const created =
          await pool.query(
            `
              INSERT INTO automation_run_steps (
                run_id,
                step_key,
                sequence,
                action_key,
                action_module,
                operation,
                status,
                attempt,
                max_attempts,
                approval_required,
                input,
                created_at
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                'waiting_approval',
                1,
                $7,
                TRUE,
                $8::jsonb,
                NOW()
              )
              RETURNING id
            `,
            [
              input.runId,
              step.key,
              index,
              action.key,
              action.moduleKey ||
                null,
              action.operation,
              input.definition
                .retry
                .maxAttempts,
              JSON.stringify(
                step.input,
              ),
            ],
          );

        stepId =
          String(
            created.rows[0]
              .id,
          );

        await pool.query(
          `
            INSERT INTO automation_approvals (
              run_id,
              step_id,
              company_id,
              status,
              required_permissions,
              requested_by,
              requested_at,
              expires_at
            )
            VALUES (
              $1,
              $2,
              $3,
              'pending',
              $4::jsonb,
              $5,
              NOW(),
              NOW() +
                INTERVAL '24 hours'
            )
            ON CONFLICT (step_id)
            DO NOTHING
          `,
          [
            input.runId,
            stepId,
            input.runtime
              .companyId,
            JSON.stringify(
              action
                .requiredPermissions,
            ),
            input.runtime
              .userId,
          ],
        );

        await pool.query(
          `
            UPDATE automation_runs
            SET
              status =
                'waiting_approval',
              completed_at =
                NULL
            WHERE id = $1
          `,
          [
            input.runId,
          ],
        );

        return {
          runId:
            input.runId,
          status:
            'waiting_approval',
          matched:
            true,
          correlationId:
            input.correlationId,
          waitingForApproval:
            step.key,
          duplicate:
            false,
        };
      } else {
        const created =
          await pool.query(
            `
              INSERT INTO automation_run_steps (
                run_id,
                step_key,
                sequence,
                action_key,
                action_module,
                operation,
                status,
                attempt,
                max_attempts,
                approval_required,
                input,
                started_at,
                created_at
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                'running',
                1,
                $7,
                FALSE,
                $8::jsonb,
                NOW(),
                NOW()
              )
              RETURNING id
            `,
            [
              input.runId,
              step.key,
              index,
              action.key,
              action.moduleKey ||
                null,
              action.operation,
              input.definition
                .retry
                .maxAttempts,
              JSON.stringify(
                step.input,
              ),
            ],
          );

        stepId =
          String(
            created.rows[0]
              .id,
          );
      }

      try {
        const output =
          await handler(
            input.runtime,
            step.input,
          );

        await pool.query(
          `
            UPDATE automation_run_steps
            SET
              status =
                'succeeded',
              output =
                $2::jsonb,
              error_code =
                NULL,
              error_message =
                NULL,
              completed_at =
                NOW()
            WHERE id = $1
          `,
          [
            stepId,
            JSON.stringify(
              output,
            ),
          ],
        );
      } catch (
        error
      ) {
        const message =
          safeError(
            error,
          );

        await pool.query(
          `
            UPDATE automation_run_steps
            SET
              status =
                'failed',
              error_code =
                'ACTION_FAILED',
              error_message =
                $2,
              completed_at =
                NOW()
            WHERE id = $1
          `,
          [
            stepId,
            message,
          ],
        );

        throw new AutomationExecutionError(
          'ACTION_FAILED',
          message,
        );
      }
    }

    await pool.query(
      `
        UPDATE automation_runs
        SET
          status =
            'succeeded',
          result =
            $2::jsonb,
          error_code =
            NULL,
          error_message =
            NULL,
          next_retry_at =
            NULL,
          completed_at =
            NOW(),
          lease_until =
            NULL,
          lease_token =
            NULL
        WHERE id = $1
      `,
      [
        input.runId,
        JSON.stringify({
          matched:
            true,
          actionsCompleted:
            input.definition
              .actions.length,
        }),
      ],
    );

    if (
      input.eventId
    ) {
      await pool.query(
        `
          UPDATE automation_events
          SET
            status =
              'processed',
            processed_at =
              NOW()
          WHERE id = $1
        `,
        [
          input.eventId,
        ],
      );
    }

    await auditRun(
      input.runtime,
      {
        action:
          'automation.run.succeeded',
        workflowId:
          input.workflowId,
        summary:
          `Ran automation "${input.workflowName}".`,
        metadata: {
          runId:
            input.runId,
          correlationId:
            input.correlationId,
          attempt:
            input.attempt,
          actionCount:
            input.definition
              .actions.length,
        },
      },
    );

    return {
      runId:
        input.runId,
      status:
        'succeeded',
      matched:
        true,
      correlationId:
        input.correlationId,
      duplicate:
        false,
    };
  } catch (
    error
  ) {
    const message =
      safeError(
        error,
      );

    const retryAt =
      nextRetryAt(
        input.definition,
        input.attempt,
      );

    await pool.query(
      `
        UPDATE automation_runs
        SET
          status =
            'failed',
          error_code =
            $2,
          error_message =
            $3,
          next_retry_at =
            $4,
          completed_at =
            NOW(),
          lease_until =
            NULL,
          lease_token =
            NULL
        WHERE id = $1
      `,
      [
        input.runId,
        error instanceof
          AutomationExecutionError
          ? error.code
          : 'ACTION_FAILED',
        message,
        retryAt,
      ],
    );

    if (
      input.eventId
    ) {
      await pool.query(
        `
          UPDATE automation_events
          SET
            status =
              'failed',
            processed_at =
              NOW()
          WHERE id = $1
        `,
        [
          input.eventId,
        ],
      );
    }

    await auditRun(
      input.runtime,
      {
        action:
          'automation.run.failed',
        workflowId:
          input.workflowId,
        summary:
          'Automation run failed.',
        metadata: {
          runId:
            input.runId,
          correlationId:
            input.correlationId,
          attempt:
            input.attempt,
          retryScheduled:
            Boolean(
              retryAt,
            ),
        },
      },
    );

    throw error;
  }
}

export async function startAutomationRun(
  input: {
    runtime:
      SamiAutomationRuntimeContext;
    workflowId:
      string;
    workflowName:
      string;
    workflowVersionId:
      string;
    definition:
      SamiAutomationDefinition;
    sourceType:
      SamiAutomationTriggerType;
    triggerKey:
      string;
    payload?:
      unknown;
    idempotencyKey:
      string;
    initiatedBy:
      string | null;
  },
): Promise<AutomationRunResult> {
  if (
    input.definition
      .trigger.key !==
    input.triggerKey
  ) {
    throw new AutomationExecutionError(
      'TRIGGER_MISMATCH',
      'The active workflow version does not match the requested trigger.',
    );
  }

  const payload =
    safePayload(
      input.payload,
    );

  const pool =
    await getTenantPoolByTenantId(
      input.runtime
        .tenantId,
    );

  const client =
    await pool.connect();

  const eventId =
    crypto.randomUUID();

  const runId =
    crypto.randomUUID();

  const correlationId =
    crypto.randomUUID();

  try {
    await client.query(
      'BEGIN',
    );

    const event =
      await client.query(
        `
          INSERT INTO automation_events (
            id,
            company_id,
            source_type,
            trigger_key,
            idempotency_key,
            payload,
            status,
            occurred_at,
            created_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::jsonb,
            'pending',
            NOW(),
            NOW()
          )
          ON CONFLICT (
            company_id,
            idempotency_key
          )
          DO NOTHING
          RETURNING id
        `,
        [
          eventId,
          input.runtime
            .companyId,
          input.sourceType,
          input.triggerKey,
          input.idempotencyKey,
          JSON.stringify(
            payload,
          ),
        ],
      );

    if (
      event.rows.length ===
        0
    ) {
      const existing =
        await client.query(
          `
            SELECT
              id,
              status,
              correlation_id
            FROM automation_runs
            WHERE company_id = $1
              AND idempotency_key = $2
            LIMIT 1
          `,
          [
            input.runtime
              .companyId,
            input.idempotencyKey,
          ],
        );

      await client.query(
        'COMMIT',
      );

      if (
        existing.rows.length ===
          1
      ) {
        return {
          runId:
            String(
              existing.rows[0]
                .id,
            ),
          status:
            String(
              existing.rows[0]
                .status,
            ) as
              AutomationRunResult['status'],
          matched:
            true,
          correlationId:
            String(
              existing.rows[0]
                .correlation_id,
            ),
          duplicate:
            true,
        };
      }

      throw new AutomationExecutionError(
        'ACTION_FAILED',
        'Automation event was already claimed but its run could not be resolved.',
      );
    }

    await client.query(
      `
        INSERT INTO automation_runs (
          id,
          workflow_id,
          workflow_version_id,
          event_id,
          company_id,
          initiated_by,
          status,
          attempt,
          max_attempts,
          idempotency_key,
          correlation_id,
          input_context,
          started_at,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'running',
          1,
          $7,
          $8,
          $9,
          $10::jsonb,
          NOW(),
          NOW()
        )
      `,
      [
        runId,
        input.workflowId,
        input.workflowVersionId,
        eventId,
        input.runtime
          .companyId,
        input.initiatedBy,
        input.definition
          .retry.maxAttempts,
        input.idempotencyKey,
        correlationId,
        JSON.stringify(
          payload,
        ),
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

    throw error;
  } finally {
    client.release();
  }

  if (
    !conditionsMatch(
      payload,
      input.definition,
    )
  ) {
    await pool.query(
      `
        UPDATE automation_runs
        SET
          status =
            'succeeded',
          result =
            $2::jsonb,
          completed_at =
            NOW(),
          lease_until =
            NULL,
          lease_token =
            NULL
        WHERE id = $1
      `,
      [
        runId,
        JSON.stringify({
          matched:
            false,
          reason:
            'conditions_not_met',
        }),
      ],
    );

    await pool.query(
      `
        UPDATE automation_events
        SET
          status =
            'ignored',
          processed_at =
            NOW()
        WHERE id = $1
      `,
      [
        eventId,
      ],
    );

    return {
      runId,
      status:
        'succeeded',
      matched:
        false,
      correlationId,
      duplicate:
        false,
    };
  }

  return executeRemainingSteps({
    runtime:
      input.runtime,
    runId,
    workflowId:
      input.workflowId,
    workflowName:
      input.workflowName,
    eventId,
    correlationId,
    attempt:
      1,
    definition:
      input.definition,
  });
}

export async function resumeAutomationRun(
  input: {
    runtime:
      SamiAutomationRuntimeContext;
    runId:
      string;
    allowRetry?:
      boolean;
  },
): Promise<AutomationRunResult> {
  const pool =
    await getTenantPoolByTenantId(
      input.runtime
        .tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          r.id,
          r.workflow_id,
          r.workflow_version_id,
          r.event_id,
          r.status,
          r.attempt,
          r.max_attempts,
          r.correlation_id,
          r.input_context,
          r.next_retry_at,
          w.name
            AS workflow_name,
          w.status
            AS workflow_status,
          w.active_version,
          v.version,
          v.definition
        FROM automation_runs r
        INNER JOIN automation_workflows w
          ON w.id =
             r.workflow_id
        INNER JOIN automation_workflow_versions v
          ON v.id =
             r.workflow_version_id
        WHERE r.id = $1
          AND r.company_id = $2
          AND w.company_id = $2
          AND w.archived_at
              IS NULL
        LIMIT 1
      `,
      [
        input.runId,
        input.runtime
          .companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new AutomationExecutionError(
      'RUN_NOT_FOUND',
      'Automation run could not be found in the current company.',
    );
  }

  const row =
    result.rows[0];

  if (
    row.workflow_status !==
      'active'
  ) {
    throw new AutomationExecutionError(
      'WORKFLOW_NOT_ACTIVE',
      'The workflow is no longer active.',
    );
  }

  const currentStatus =
    String(
      row.status,
    );

  if (
    currentStatus ===
      'succeeded' ||
    currentStatus ===
      'cancelled'
  ) {
    return {
      runId:
        String(
          row.id,
        ),
      status:
        currentStatus as
          AutomationRunResult['status'],
      matched:
        true,
      correlationId:
        String(
          row.correlation_id,
        ),
      duplicate:
        true,
    };
  }

  let attempt =
    Number(
      row.attempt ||
      1,
    );

  if (
    currentStatus ===
      'failed'
  ) {
    if (
      input.allowRetry !==
        true ||
      attempt >=
        Number(
          row.max_attempts ||
          1,
        )
    ) {
      throw new AutomationExecutionError(
        'RUN_NOT_RETRYABLE',
        'This automation run is not eligible for another retry.',
      );
    }

    attempt +=
      1;

    await pool.query(
      `
        UPDATE automation_runs
        SET
          status =
            'running',
          attempt =
            $2,
          error_code =
            NULL,
          error_message =
            NULL,
          next_retry_at =
            NULL,
          completed_at =
            NULL
        WHERE id = $1
      `,
      [
        input.runId,
        attempt,
      ],
    );
  } else {
    await pool.query(
      `
        UPDATE automation_runs
        SET
          status =
            'running',
          completed_at =
            NULL
        WHERE id = $1
      `,
      [
        input.runId,
      ],
    );
  }

  const definition =
    await loadDefinitionForRuntime(
      input.runtime,
      row.definition,
    );

  return executeRemainingSteps({
    runtime:
      input.runtime,
    runId:
      String(
        row.id,
      ),
    workflowId:
      String(
        row.workflow_id,
      ),
    workflowName:
      String(
        row.workflow_name ||
        'Automation',
      ),
    eventId:
      row.event_id
        ? String(
            row.event_id,
          )
        : null,
    correlationId:
      String(
        row.correlation_id,
      ),
    attempt,
    definition,
  });
}

export async function loadActiveAutomationWorkflow(
  input: {
    runtime:
      SamiAutomationRuntimeContext;
    workflowId:
      string;
    expectedTrigger:
      string;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.runtime
        .tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          w.id,
          w.name,
          w.status,
          w.active_version,
          v.id
            AS workflow_version_id,
          v.definition
        FROM automation_workflows w
        INNER JOIN automation_workflow_versions v
          ON v.workflow_id =
             w.id
         AND v.version =
             w.active_version
        WHERE w.id = $1
          AND w.company_id = $2
          AND w.status =
              'active'
          AND w.archived_at
              IS NULL
        LIMIT 1
      `,
      [
        input.workflowId,
        input.runtime
          .companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new AutomationExecutionError(
      'WORKFLOW_NOT_ACTIVE',
      'Automation is not active in the current company.',
    );
  }

  const row =
    result.rows[0];

  const definition =
    await loadDefinitionForRuntime(
      input.runtime,
      row.definition,
    );

  if (
    definition.trigger
      .key !==
    input.expectedTrigger
  ) {
    throw new AutomationExecutionError(
      'TRIGGER_MISMATCH',
      'The active automation version no longer matches this trigger.',
    );
  }

  return {
    workflowId:
      String(
        row.id,
      ),
    workflowName:
      String(
        row.name ||
        'Automation',
      ),
    workflowVersionId:
      String(
        row.workflow_version_id,
      ),
    definition,
  };
}
