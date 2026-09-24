import 'server-only';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  loadActiveAutomationWorkflow,
  startAutomationRun,
} from '@/lib/automation/execution-engine';

import type {
  SamiAutomationRuntimeContext,
} from '@/lib/automation/types';


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


export async function dispatchBusinessAutomationEvent(
  input: {
    runtime:
      SamiAutomationRuntimeContext;
    moduleKey:
      string;
    triggerKey:
      string;
    recordType:
      string;
    recordId?:
      string |
      null;
    payload:
      Record<
        string,
        unknown
      >;
    idempotencySeed:
      string;
  },
) {
  const moduleKey =
    input.moduleKey
      .trim()
      .toLowerCase();

  if (
    !moduleKey ||
    !input.runtime
      .accessibleModuleKeys
      .map(
        key =>
          key
            .trim()
            .toLowerCase(),
      )
      .includes(
        moduleKey,
      )
  ) {
    return {
      matched:
        0,
      started:
        0,
      failed:
        0,
    };
  }

  const pool =
    await getTenantPoolByTenantId(
      input.runtime
        .tenantId,
    );

  const workflows =
    await pool.query(
      `
        SELECT
          w.id
        FROM automation_workflows w
        INNER JOIN automation_workflow_versions v
          ON v.workflow_id =
             w.id
         AND v.version =
             w.active_version
        WHERE w.company_id =
              $1
          AND w.status =
              'active'
          AND w.archived_at
              IS NULL
          AND v.trigger_key =
              $2
          AND LOWER(
                COALESCE(
                  v.trigger_module,
                  ''
                )
              ) =
              $3
        ORDER BY
          w.id
        LIMIT 100
      `,
      [
        input.runtime
          .companyId,
        input.triggerKey,
        moduleKey,
      ],
    );

  let started =
    0;

  let failed =
    0;

  for (
    const row
    of workflows.rows
  ) {
    const workflowId =
      String(
        row.id,
      );

    try {
      const active =
        await loadActiveAutomationWorkflow({
          runtime:
            input.runtime,
          workflowId,
          expectedTrigger:
            input.triggerKey,
        });

      await startAutomationRun({
        runtime:
          input.runtime,
        workflowId:
          active.workflowId,
        workflowName:
          active.workflowName,
        workflowVersionId:
          active.workflowVersionId,
        definition:
          active.definition,
        sourceType:
          'event',
        triggerKey:
          input.triggerKey,
        sourceModule:
          moduleKey,
        sourceRecordType:
          input.recordType,
        sourceRecordId:
          input.recordId &&
          UUID_RE.test(
            input.recordId,
          )
            ? input.recordId
            : null,
        payload:
          input.payload,
        idempotencyKey:
          [
            'business',
            moduleKey,
            input.triggerKey,
            input.idempotencySeed,
            workflowId,
          ]
            .join(
              ':',
            )
            .slice(
              0,
              255,
            ),
        initiatedBy:
          input.runtime
            .userId,
      });

      started +=
        1;
    } catch (
      error
    ) {
      failed +=
        1;

      console.error(
        '[SaMi Automation] Business event workflow failed:',
        {
          moduleKey,
          triggerKey:
            input.triggerKey,
          workflowId,
          error,
        },
      );
    }
  }

  return {
    matched:
      workflows.rows
        .length,
    started,
    failed,
  };
}


export async function dispatchBusinessAutomationEventSafely(
  input:
    Parameters<
      typeof dispatchBusinessAutomationEvent
    >[0],
) {
  try {
    return await dispatchBusinessAutomationEvent(
      input,
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Automation] Business event dispatch failed:',
      {
        moduleKey:
          input.moduleKey,
        triggerKey:
          input.triggerKey,
        recordType:
          input.recordType,
        recordId:
          input.recordId,
        error,
      },
    );

    return {
      matched:
        0,
      started:
        0,
      failed:
        1,
    };
  }
}
