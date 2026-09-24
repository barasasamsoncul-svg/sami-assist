import 'server-only';

import type {
  Pool,
  PoolClient,
} from 'pg';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  ENTERPRISE_MODULE_TABLES,
  enterpriseModuleTables,
  type EnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';

import {
  applyEnterpriseDomainSideEffects,
  assertEnterpriseDomainMutationAllowed,
  normalizeEnterpriseDomainValues,
} from '@/lib/apps/enterprise/domain-hooks';

import type {
  SamiAutomationActionDefinition,
  SamiAutomationActionHandler,
  SamiAutomationRuntimeContext,
  SamiAutomationTriggerDefinition,
} from '@/lib/automation/types';

import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';


const IDENTIFIER =
  /^[a-z_][a-z0-9_]*$/;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SENSITIVE_COLUMN =
  /(password|passwd|secret|token|credential|private|otp|verification|salt|hash|api[_-]?key|access[_-]?key|refresh[_-]?key|session[_-]?key)/i;

const SYSTEM_COLUMNS =
  new Set([
    'id',
    'company_id',
    'tenant_id',
    'created_at',
    'updated_at',
    'deleted_at',
    'created_by',
    'updated_by',
  ]);

const COMPUTED_COLUMNS =
  new Set([
    'line_total',
    'subtotal',
    'tax_amount',
    'tax_total',
    'discount_total',
    'total_amount',
    'total_gross',
    'total_deductions',
    'total_net',
    'net_amount',
    'balance',
  ]);


type Column = {
  column_name:
    string;
  data_type:
    string;
  is_nullable:
    string;
  column_default:
    string |
    null;
  is_identity:
    string;
  is_generated:
    string;
};


function normalizeKey(
  value:
    unknown,
) {
  return typeof value ===
    'string'
    ? value
        .trim()
        .toLowerCase()
    : '';
}


function quoteIdentifier(
  value:
    string,
) {
  if (
    !IDENTIFIER.test(
      value,
    )
  ) {
    throw new Error(
      'SaMi rejected an unsafe automation identifier.',
    );
  }

  return (
    '"' +
    value +
    '"'
  );
}


function assertModuleAccess(
  runtime:
    SamiAutomationRuntimeContext,
  moduleKey:
    string,
  permission:
    string,
) {
  if (
    !runtime
      .accessibleModuleKeys
      .map(
        normalizeKey,
      )
      .includes(
        moduleKey,
      )
  ) {
    throw new Error(
      'The automation runner no longer has access to this app.',
    );
  }

  if (
    !runtime.isOwner &&
    !runtime.permissionSet
      .has(
        permission,
      )
  ) {
    throw new Error(
      'The automation runner no longer has the required app permission.',
    );
  }
}


function assertTable(
  moduleKey:
    string,
  tableInput:
    unknown,
) {
  const table =
    normalizeKey(
      tableInput,
    );

  const allowed =
    enterpriseModuleTables(
      moduleKey,
    );

  if (
    !table ||
    !allowed.some(
      candidate =>
        candidate ===
        table,
    )
  ) {
    throw new Error(
      'Choose a record table owned by this app.',
    );
  }

  return table;
}


async function columnsForTable(
  pool:
    Pool,
  table:
    string,
) {
  const result =
    await pool.query<Column>(
      `
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default,
          is_identity,
          is_generated
        FROM information_schema.columns
        WHERE table_schema =
              'public'
          AND table_name =
              $1
        ORDER BY
          ordinal_position
      `,
      [
        table,
      ],
    );

  if (
    result.rows.length ===
      0
  ) {
    throw new Error(
      'This app table is not ready in the workspace database.',
    );
  }

  return result.rows;
}


function writableValues(
  input:
    unknown,
  columns:
    Column[],
) {
  if (
    !input ||
    typeof input !==
      'object' ||
    Array.isArray(
      input,
    )
  ) {
    throw new Error(
      'Automation record values must be an object.',
    );
  }

  const allowed =
    new Map(
      columns.map(
        column => [
          column.column_name,
          column,
        ],
      ),
    );

  const output =
    new Map<
      string,
      unknown
    >();

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      input as
        Record<
          string,
          unknown
        >,
    )
  ) {
    const column =
      allowed.get(
        key,
      );

    if (
      !column ||
      SYSTEM_COLUMNS.has(
        key,
      ) ||
      COMPUTED_COLUMNS.has(
        key,
      ) ||
      SENSITIVE_COLUMN.test(
        key,
      ) ||
      /(^|_)(status|state)$/.test(
        key,
      ) ||
      column.is_identity ===
        'YES' ||
      (
        column.is_generated &&
        column.is_generated !==
          'NEVER'
      )
    ) {
      continue;
    }

    if (
      value ===
        '' &&
      column.is_nullable ===
        'YES'
    ) {
      output.set(
        key,
        null,
      );
      continue;
    }

    if (
      [
        'smallint',
        'integer',
        'bigint',
        'numeric',
        'decimal',
        'real',
        'double precision',
      ].includes(
        column.data_type,
      ) &&
      value !==
        null
    ) {
      const numeric =
        Number(
          value,
        );

      if (
        !Number.isFinite(
          numeric,
        )
      ) {
        throw new Error(
          key +
          ' must be a valid number.',
        );
      }

      output.set(
        key,
        numeric,
      );
      continue;
    }

    if (
      column.data_type ===
        'boolean'
    ) {
      output.set(
        key,
        value ===
          true ||
        value ===
          'true' ||
        value ===
          1 ||
        value ===
          '1',
      );
      continue;
    }

    if (
      column.data_type ===
        'json' ||
      column.data_type ===
        'jsonb'
    ) {
      output.set(
        key,
        typeof value ===
          'string'
          ? JSON.parse(
              value,
            )
          : value,
      );
      continue;
    }

    output.set(
      key,
      value,
    );
  }

  return output;
}


function ensureRequiredForCreate(
  columns:
    Column[],
  values:
    Map<
      string,
      unknown
    >,
) {
  for (
    const column
    of columns
  ) {
    if (
      SYSTEM_COLUMNS.has(
        column.column_name,
      ) ||
      column.is_nullable ===
        'YES' ||
      column.column_default !==
        null ||
      column.is_identity ===
        'YES' ||
      (
        column.is_generated &&
        column.is_generated !==
          'NEVER'
      )
    ) {
      continue;
    }

    if (
      !values.has(
        column.column_name,
      )
    ) {
      throw new Error(
        column.column_name +
        ' is required.',
      );
    }
  }
}


async function auditAutomationMutation(
  runtime:
    SamiAutomationRuntimeContext,
  input: {
    moduleKey:
      string;
    table:
      string;
    recordId:
      string |
      null;
    operation:
      'created' |
      'updated';
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
        input.moduleKey +
        '.automation.record.' +
        input.operation,
      eventType:
        'automation.record.' +
        input.operation,
      category:
        'business',
      severity:
        'info',
      result:
        'success',
      resourceType:
        input.table,
      resourceId:
        input.recordId ||
        undefined,
      entityType:
        input.table,
      entityId:
        input.recordId ||
        undefined,
      module:
        input.moduleKey,
      summary:
        'Automation ' +
        input.operation +
        ' a ' +
        input.moduleKey +
        ' record.',
      metadata: {
        table:
          input.table,
        generatedBy:
          'automation',
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Automation] Business mutation audit failed:',
      error,
    );
  }
}


async function createRecord(
  runtime:
    SamiAutomationRuntimeContext,
  moduleKey:
    string,
  input:
    Record<
      string,
      unknown
    >,
) {
  assertModuleAccess(
    runtime,
    moduleKey,
    moduleKey +
      '.record.create',
  );

  const table =
    assertTable(
      moduleKey,
      input.table,
    );

  assertEnterpriseDomainMutationAllowed(
    moduleKey,
    table,
    'create',
  );

  const pool =
    await getTenantPoolByTenantId(
      runtime.tenantId,
    );

  const columns =
    await columnsForTable(
      pool,
      table,
    );

  const names =
    new Set(
      columns.map(
        column =>
          column.column_name,
      ),
    );

  if (
    !names.has(
      'company_id',
    )
  ) {
    throw new Error(
      'This app table has not completed company-boundary hardening.',
    );
  }

  const values =
    writableValues(
      input.values,
      columns,
    );

  normalizeEnterpriseDomainValues(
    moduleKey,
    table,
    values,
  );

  values.set(
    'company_id',
    runtime.companyId,
  );

  if (
    names.has(
      'created_by',
    )
  ) {
    values.set(
      'created_by',
      runtime.userId,
    );
  }

  if (
    names.has(
      'updated_by',
    )
  ) {
    values.set(
      'updated_by',
      runtime.userId,
    );
  }

  ensureRequiredForCreate(
    columns,
    values,
  );

  const entries =
    [
      ...values.entries(),
    ];

  if (
    entries.length ===
      0
  ) {
    throw new Error(
      'Add at least one record value.',
    );
  }

  const client =
    await pool.connect();

  let row:
    Record<
      string,
      unknown
    > = {};

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        'INSERT INTO ' +
        quoteIdentifier(
          table,
        ) +
        ' (' +
        entries
          .map(
            ([
              key,
            ]) =>
              quoteIdentifier(
                key,
              ),
          )
          .join(
            ', ',
          ) +
        ') VALUES (' +
        entries
          .map(
            (
              _entry,
              index,
            ) =>
              '$' +
              (
                index +
                1
              ),
          )
          .join(
            ', ',
          ) +
        ') RETURNING *',
        entries.map(
          ([
            _key,
            value,
          ]) =>
            value,
        ),
      );

    row =
      result.rows[0] ||
      {};

    await applyEnterpriseDomainSideEffects(
      client,
      {
        moduleKey,
        table,
        companyId:
          runtime.companyId,
        operation:
          'create',
        row,
      },
    );

    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }

  const recordId =
    typeof row.id ===
      'string'
      ? row.id
      : null;

  await auditAutomationMutation(
    runtime,
    {
      moduleKey,
      table,
      recordId,
      operation:
        'created',
    },
  );

  return {
    table,
    recordId,
  };
}


async function updateRecord(
  runtime:
    SamiAutomationRuntimeContext,
  moduleKey:
    string,
  input:
    Record<
      string,
      unknown
    >,
) {
  assertModuleAccess(
    runtime,
    moduleKey,
    moduleKey +
      '.record.edit',
  );

  const table =
    assertTable(
      moduleKey,
      input.table,
    );

  assertEnterpriseDomainMutationAllowed(
    moduleKey,
    table,
    'update',
  );

  const recordId =
    typeof input.recordId ===
      'string' &&
    UUID_RE.test(
      input.recordId,
    )
      ? input.recordId
      : '';

  if (
    !recordId
  ) {
    throw new Error(
      'A valid record ID is required.',
    );
  }

  const pool =
    await getTenantPoolByTenantId(
      runtime.tenantId,
    );

  const columns =
    await columnsForTable(
      pool,
      table,
    );

  const names =
    new Set(
      columns.map(
        column =>
          column.column_name,
      ),
    );

  if (
    !names.has(
      'id',
    ) ||
    !names.has(
      'company_id',
    )
  ) {
    throw new Error(
      'This app table does not support safe automated updates.',
    );
  }

  const values =
    writableValues(
      input.values,
      columns,
    );

  normalizeEnterpriseDomainValues(
    moduleKey,
    table,
    values,
  );

  if (
    names.has(
      'updated_by',
    )
  ) {
    values.set(
      'updated_by',
      runtime.userId,
    );
  }

  const entries =
    [
      ...values.entries(),
    ];

  if (
    entries.length ===
      0
  ) {
    throw new Error(
      'No editable values were supplied.',
    );
  }

  const setters =
    entries.map(
      (
        [
          key,
        ],
        index,
      ) =>
        quoteIdentifier(
          key,
        ) +
        ' = $' +
        (
          index +
          1
        ),
    );

  if (
    names.has(
      'updated_at',
    )
  ) {
    setters.push(
      'updated_at = NOW()',
    );
  }

  const params =
    entries.map(
      ([
        _key,
        value,
      ]) =>
        value,
    );

  params.push(
    recordId,
    runtime.companyId,
  );

  const conditions = [
    'id = $' +
    (
      entries.length +
      1
    ),
    'company_id = $' +
    (
      entries.length +
      2
    ),
  ];

  if (
    names.has(
      'deleted_at',
    )
  ) {
    conditions.push(
      'deleted_at IS NULL',
    );
  }

  const client =
    await pool.connect();

  let row:
    Record<
      string,
      unknown
    > = {};

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        'UPDATE ' +
        quoteIdentifier(
          table,
        ) +
        ' SET ' +
        setters.join(
          ', ',
        ) +
        ' WHERE ' +
        conditions.join(
          ' AND ',
        ) +
        ' RETURNING *',
        params,
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new Error(
        'The record was not found in the automation company boundary.',
      );
    }

    row =
      result.rows[0];

    await applyEnterpriseDomainSideEffects(
      client,
      {
        moduleKey,
        table,
        companyId:
          runtime.companyId,
        operation:
          'update',
        row,
      },
    );

    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }

  await auditAutomationMutation(
    runtime,
    {
      moduleKey,
      table,
      recordId,
      operation:
        'updated',
    },
  );

  return {
    table,
    recordId,
  };
}


const MODULE_KEYS =
  Object.keys(
    ENTERPRISE_MODULE_TABLES,
  ) as
    EnterpriseModuleKey[];


export const ENTERPRISE_AUTOMATION_TRIGGERS:
  SamiAutomationTriggerDefinition[] =
  MODULE_KEYS.flatMap(
    moduleKey => [
      {
        key:
          moduleKey +
          '.record.created',
        name:
          moduleKey +
          ' record created',
        description:
          'Run when a ' +
          moduleKey +
          ' record is created in the current company.',
        type:
          'event',
        moduleKey,
        resourceKey:
          'record',
        requiredPermissions: [
          moduleKey +
          '.record.view',
        ],
        companyScoped:
          true,
      },
      {
        key:
          moduleKey +
          '.record.updated',
        name:
          moduleKey +
          ' record updated',
        description:
          'Run when a ' +
          moduleKey +
          ' record is updated in the current company.',
        type:
          'event',
        moduleKey,
        resourceKey:
          'record',
        requiredPermissions: [
          moduleKey +
          '.record.view',
        ],
        companyScoped:
          true,
      },
      {
        key:
          moduleKey +
          '.record.deleted',
        name:
          moduleKey +
          ' record deleted',
        description:
          'Run when a ' +
          moduleKey +
          ' record is safely deleted in the current company.',
        type:
          'event',
        moduleKey,
        resourceKey:
          'record',
        requiredPermissions: [
          moduleKey +
          '.record.view',
        ],
        companyScoped:
          true,
      },
      {
        key:
          moduleKey +
          '.workflow.transitioned',
        name:
          moduleKey +
          ' workflow changed',
        description:
          'Run after a controlled ' +
          moduleKey +
          ' workflow transition.',
        type:
          'event',
        moduleKey,
        resourceKey:
          'record',
        requiredPermissions: [
          moduleKey +
          '.record.view',
        ],
        companyScoped:
          true,
      },
    ],
  );


export const ENTERPRISE_AUTOMATION_ACTIONS:
  SamiAutomationActionDefinition[] =
  MODULE_KEYS.flatMap(
    moduleKey => [
      {
        key:
          moduleKey +
          '.record.create',
        name:
          'Create ' +
          moduleKey +
          ' record',
        description:
          'Create a company-scoped ' +
          moduleKey +
          ' record through SaMi business rules.',
        moduleKey,
        operation:
          'write',
        resourceKey:
          'record',
        requiredPermissions: [
          moduleKey +
          '.record.create',
        ],
        approvalPolicy:
          'always',
        inputSchema: {
          type:
            'object',
          additionalProperties:
            false,
          properties: {
            table: {
              type:
                'string',
            },
            values: {
              type:
                'object',
            },
          },
          required: [
            'table',
            'values',
          ],
        },
      },
      {
        key:
          moduleKey +
          '.record.update',
        name:
          'Update ' +
          moduleKey +
          ' record',
        description:
          'Update editable fields on a company-scoped ' +
          moduleKey +
          ' record through SaMi business rules.',
        moduleKey,
        operation:
          'write',
        resourceKey:
          'record',
        requiredPermissions: [
          moduleKey +
          '.record.edit',
        ],
        approvalPolicy:
          'always',
        inputSchema: {
          type:
            'object',
          additionalProperties:
            false,
          properties: {
            table: {
              type:
                'string',
            },
            recordId: {
              type:
                'string',
            },
            values: {
              type:
                'object',
            },
          },
          required: [
            'table',
            'recordId',
            'values',
          ],
        },
      },
    ],
  );


export const ENTERPRISE_AUTOMATION_ACTION_HANDLERS =
  new Map<
    string,
    SamiAutomationActionHandler
  >(
    MODULE_KEYS.flatMap(
      moduleKey => [
        [
          moduleKey +
          '.record.create',
          (
            runtime:
              SamiAutomationRuntimeContext,
            input:
              Record<
                string,
                unknown
              >,
          ) =>
            createRecord(
              runtime,
              moduleKey,
              input,
            ),
        ] as const,
        [
          moduleKey +
          '.record.update',
          (
            runtime:
              SamiAutomationRuntimeContext,
            input:
              Record<
                string,
                unknown
              >,
          ) =>
            updateRecord(
              runtime,
              moduleKey,
              input,
            ),
        ] as const,
      ],
    ),
  );
