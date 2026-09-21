import 'server-only';

import crypto from 'node:crypto';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  getAccessibleAutomationActions,
  getAccessibleAutomationTriggers,
} from '@/lib/automation/registry';

import {
  normalizeAutomationDefinition,
} from '@/lib/automation/definition';

import {
  loadActiveAutomationWorkflow,
  resumeAutomationRun,
  startAutomationRun,
} from '@/lib/automation/execution-engine';

import {
  AutomationWorkerContextError,
  resolveAutomationWorkerRuntime,
} from '@/lib/automation/worker-context';

const DEFAULT_TENANT_BATCH =
  100;

const DEFAULT_ITEM_BATCH =
  25;

const LEASE_SECONDS =
  300;

function boundedInteger(
  value:
    unknown,
  fallback:
    number,
  min:
    number,
  max:
    number,
) {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(
      min,
      Math.floor(
        parsed,
      ),
    ),
  );
}

function tenantBatchSize() {
  return boundedInteger(
    process.env
      .SAMI_AUTOMATION_WORKER_TENANT_BATCH,
    DEFAULT_TENANT_BATCH,
    1,
    500,
  );
}

function itemBatchSize() {
  return boundedInteger(
    process.env
      .SAMI_AUTOMATION_WORKER_ITEM_BATCH,
    DEFAULT_ITEM_BATCH,
    1,
    100,
  );
}

async function listActiveTenantIds() {
  const countResult =
    await queryControl(
      `
        SELECT
          COUNT(*)::int
            AS count
        FROM tenant_databases td
        INNER JOIN tenants t
          ON t.id =
             td.tenant_id
        WHERE LOWER(
                COALESCE(
                  td.status,
                  ''
                )
              ) =
              'active'
          AND LOWER(
                COALESCE(
                  t.status,
                  ''
                )
              ) =
              'active'
          AND t.deleted_at
              IS NULL
      `,
    );

  const count =
    Number(
      countResult.rows[0]
        ?.count ||
      0,
    );

  if (
    count <=
      0
  ) {
    return [];
  }

  const batch =
    Math.min(
      tenantBatchSize(),
      count,
    );

  const windowNumber =
    Math.floor(
      Date.now() /
      (
        5 *
        60 *
        1000
      ),
    );

  const offset =
    (
      windowNumber *
      batch
    ) %
    count;

  const load =
    async (
      start:
        number,
      limit:
        number,
    ) => {
      if (
        limit <=
          0
      ) {
        return [];
      }

      const result =
        await queryControl(
          `
            SELECT
              td.tenant_id
            FROM tenant_databases td
            INNER JOIN tenants t
              ON t.id =
                 td.tenant_id
            WHERE LOWER(
                    COALESCE(
                      td.status,
                      ''
                    )
                  ) =
                  'active'
              AND LOWER(
                    COALESCE(
                      t.status,
                      ''
                    )
                  ) =
                  'active'
              AND t.deleted_at
                  IS NULL
            ORDER BY
              td.tenant_id
            OFFSET $1
            LIMIT $2
          `,
          [
            start,
            limit,
          ],
        );

      return result.rows
        .map(
          row =>
            String(
              row.tenant_id ||
              '',
            ),
        )
        .filter(
          Boolean,
        );
    };

  const first =
    await load(
      offset,
      batch,
    );

  if (
    first.length >=
      batch
  ) {
    return first;
  }

  const remainder =
    await load(
      0,
      batch -
        first.length,
    );

  return [
    ...first,
    ...remainder,
  ];
}

async function pauseBrokenSchedule(
  input: {
    tenantId:
      string;
    workflowId:
      string;
    companyId:
      string;
    reason:
      string;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );

  await pool.query(
    `
      UPDATE automation_schedules
      SET
        status =
          'paused',
        lease_until =
          NULL,
        lease_token =
          NULL,
        updated_at =
          NOW()
      WHERE workflow_id = $1
        AND company_id = $2
    `,
    [
      input.workflowId,
      input.companyId,
    ],
  );

  await pool.query(
    `
      UPDATE automation_workflows
      SET
        status =
          'paused',
        metadata =
          COALESCE(
            metadata,
            '{}'::jsonb
          ) ||
          jsonb_build_object(
            'workerPausedAt',
            NOW(),
            'workerPauseReason',
            $3
          ),
        updated_at =
          NOW()
      WHERE id = $1
        AND company_id = $2
        AND archived_at
            IS NULL
    `,
    [
      input.workflowId,
      input.companyId,
      input.reason
        .slice(
          0,
          500,
        ),
    ],
  );
}

async function claimDueSchedules(
  tenantId:
    string,
) {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const client =
    await pool.connect();

  const leaseToken =
    crypto.randomUUID();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          WITH due AS (
            SELECT
              workflow_id
            FROM automation_schedules
            WHERE status =
                  'active'
              AND next_run_at
                  IS NOT NULL
              AND next_run_at <=
                  NOW()
              AND (
                lease_until
                  IS NULL
                OR lease_until <
                   NOW()
              )
            ORDER BY
              next_run_at,
              workflow_id
            LIMIT $1
            FOR UPDATE
            SKIP LOCKED
          )
          UPDATE automation_schedules s
          SET
            lease_token =
              $2,
            lease_until =
              NOW() +
              ($3 * INTERVAL '1 second'),
            updated_at =
              NOW()
          FROM due
          WHERE s.workflow_id =
                due.workflow_id
          RETURNING
            s.workflow_id,
            s.company_id,
            s.run_as_user_id,
            s.interval_seconds,
            s.timezone,
            s.next_run_at,
            s.lease_token
        `,
        [
          itemBatchSize(),
          leaseToken,
          LEASE_SECONDS,
        ],
      );

    await client.query(
      'COMMIT',
    );

    return result.rows;
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

async function finishScheduleLease(
  input: {
    tenantId:
      string;
    workflowId:
      string;
    companyId:
      string;
    leaseToken:
      string;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );

  await pool.query(
    `
      UPDATE automation_schedules
      SET
        last_run_at =
          NOW(),
        next_run_at =
          NOW() +
          (
            interval_seconds *
            INTERVAL '1 second'
          ),
        lease_until =
          NULL,
        lease_token =
          NULL,
        updated_at =
          NOW()
      WHERE workflow_id = $1
        AND company_id = $2
        AND lease_token = $3
    `,
    [
      input.workflowId,
      input.companyId,
      input.leaseToken,
    ],
  );
}

async function runDueSchedulesForTenant(
  tenantId:
    string,
) {
  const claimed =
    await claimDueSchedules(
      tenantId,
    );

  let succeeded =
    0;

  let failed =
    0;

  let paused =
    0;

  for (
    const row
    of claimed
  ) {
    const workflowId =
      String(
        row.workflow_id,
      );

    const companyId =
      String(
        row.company_id,
      );

    const runAsUserId =
      String(
        row.run_as_user_id,
      );

    const leaseToken =
      String(
        row.lease_token,
      );

    const scheduledFor =
      new Date(
        row.next_run_at,
      )
        .toISOString();

    try {
      const runtime =
        await resolveAutomationWorkerRuntime({
          tenantId,
          userId:
            runAsUserId,
          companyId,
        });

      const active =
        await loadActiveAutomationWorkflow({
          runtime,
          workflowId,
          expectedTrigger:
            'core.schedule',
        });

      await startAutomationRun({
        runtime,
        workflowId:
          active.workflowId,
        workflowName:
          active.workflowName,
        workflowVersionId:
          active.workflowVersionId,
        definition:
          active.definition,
        sourceType:
          'schedule',
        triggerKey:
          'core.schedule',
        payload: {
          scheduledFor,
          timezone:
            String(
              row.timezone ||
              '',
            ),
        },
        idempotencyKey:
          `schedule:${workflowId}:${scheduledFor}`,
        initiatedBy:
          runAsUserId,
      });

      succeeded +=
        1;
    } catch (
      error
    ) {
      failed +=
        1;

      if (
        error instanceof
          AutomationWorkerContextError
      ) {
        paused +=
          1;

        await pauseBrokenSchedule({
          tenantId,
          workflowId,
          companyId,
          reason:
            error.code,
        });
      } else {
        console.error(
          '[SaMi Automation] Scheduled run failed:',
          error,
        );
      }
    } finally {
      await finishScheduleLease({
        tenantId,
        workflowId,
        companyId,
        leaseToken,
      });
    }
  }

  return {
    claimed:
      claimed.length,
    succeeded,
    failed,
    paused,
  };
}

async function claimDueRetries(
  tenantId:
    string,
) {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const leaseToken =
    crypto.randomUUID();

  const result =
    await pool.query(
      `
        WITH due AS (
          SELECT
            id
          FROM automation_runs
          WHERE status =
                'failed'
            AND next_retry_at
                IS NOT NULL
            AND next_retry_at <=
                NOW()
            AND attempt <
                max_attempts
            AND (
              lease_until
                IS NULL
              OR lease_until <
                 NOW()
            )
          ORDER BY
            next_retry_at,
            id
          LIMIT $1
          FOR UPDATE
          SKIP LOCKED
        )
        UPDATE automation_runs r
        SET
          lease_token =
            $2,
          lease_until =
            NOW() +
            ($3 * INTERVAL '1 second')
        FROM due
        WHERE r.id =
              due.id
        RETURNING
          r.id,
          r.company_id,
          r.initiated_by,
          r.lease_token
      `,
      [
        itemBatchSize(),
        leaseToken,
        LEASE_SECONDS,
      ],
    );

  return result.rows;
}

async function clearRunLease(
  input: {
    tenantId:
      string;
    runId:
      string;
    leaseToken:
      string;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );

  await pool.query(
    `
      UPDATE automation_runs
      SET
        lease_until =
          NULL,
        lease_token =
          NULL
      WHERE id = $1
        AND lease_token = $2
    `,
    [
      input.runId,
      input.leaseToken,
    ],
  );
}

async function failClosedRetry(
  input: {
    tenantId:
      string;
    runId:
      string;
    leaseToken:
      string;
    code:
      string;
    message:
      string;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );

  await pool.query(
    `
      UPDATE automation_runs
      SET
        error_code =
          $3,
        error_message =
          $4,
        next_retry_at =
          NULL,
        lease_until =
          NULL,
        lease_token =
          NULL,
        completed_at =
          NOW()
      WHERE id = $1
        AND lease_token = $2
    `,
    [
      input.runId,
      input.leaseToken,
      input.code
        .slice(
          0,
          120,
        ),
      input.message
        .slice(
          0,
          800,
        ),
    ],
  );
}

async function runDueRetriesForTenant(
  tenantId:
    string,
) {
  const claimed =
    await claimDueRetries(
      tenantId,
    );

  let resumed =
    0;

  let failed =
    0;

  for (
    const row
    of claimed
  ) {
    const runId =
      String(
        row.id,
      );

    const companyId =
      String(
        row.company_id,
      );

    const runAsUserId =
      row.initiated_by
        ? String(
            row.initiated_by,
          )
        : '';

    const leaseToken =
      String(
        row.lease_token,
      );

    try {
      if (
        !runAsUserId
      ) {
        throw new AutomationWorkerContextError(
          'RUN_AS_USER_UNAVAILABLE',
          'Retryable automation run has no run-as user.',
        );
      }

      const runtime =
        await resolveAutomationWorkerRuntime({
          tenantId,
          userId:
            runAsUserId,
          companyId,
        });

      await resumeAutomationRun({
        runtime,
        runId,
        allowRetry:
          true,
      });

      resumed +=
        1;
    } catch (
      error
    ) {
      failed +=
        1;

      if (
        error instanceof
          AutomationWorkerContextError
      ) {
        await failClosedRetry({
          tenantId,
          runId,
          leaseToken,
          code:
            error.code,
          message:
            error.message,
        });
      } else {
        console.error(
          '[SaMi Automation] Retry failed:',
          error,
        );
      }
    } finally {
      await clearRunLease({
        tenantId,
        runId,
        leaseToken,
      });
    }
  }

  return {
    claimed:
      claimed.length,
    resumed,
    failed,
  };
}

function missingAutomationTables(
  error:
    unknown,
) {
  return Boolean(
    error &&
    typeof error ===
      'object' &&
    'code' in error &&
    (
      error as
        {
          code?:
            string;
        }
    ).code ===
      '42P01',
  );
}

export async function runAutomationWorkerTick() {
  const tenantIds =
    await listActiveTenantIds();

  const summary = {
    tenants:
      tenantIds.length,
    schedules: {
      claimed:
        0,
      succeeded:
        0,
      failed:
        0,
      paused:
        0,
    },
    retries: {
      claimed:
        0,
      resumed:
        0,
      failed:
        0,
    },
  };

  for (
    const tenantId
    of tenantIds
  ) {
    try {
      const schedules =
        await runDueSchedulesForTenant(
          tenantId,
        );

      summary.schedules
        .claimed +=
        schedules.claimed;

      summary.schedules
        .succeeded +=
        schedules.succeeded;

      summary.schedules
        .failed +=
        schedules.failed;

      summary.schedules
        .paused +=
        schedules.paused;

      const retries =
        await runDueRetriesForTenant(
          tenantId,
        );

      summary.retries
        .claimed +=
        retries.claimed;

      summary.retries
        .resumed +=
        retries.resumed;

      summary.retries
        .failed +=
        retries.failed;
    } catch (
      error
    ) {
      if (
        missingAutomationTables(
          error,
        )
      ) {
        continue;
      }

      console.error(
        '[SaMi Automation] Worker tenant tick failed:',
        error,
      );
    }
  }

  return summary;
}
