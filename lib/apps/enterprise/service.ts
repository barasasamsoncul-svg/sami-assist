import 'server-only';

import type {
  Pool,
} from 'pg';

import {
  getPermissionContext,
  type PermissionContext,
} from '@/lib/auth/permission-context';

import {
  requireCompanyContext,
} from '@/lib/auth/company-context';

import {
  getWorkspaceSubscriptionAccessState,
} from '@/lib/billing/access';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  getSamiModuleManifest,
} from '@/lib/modules/registry';

import {
  enterpriseModuleTables,
  isEnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';

import {
  getEnterpriseDomainProfile,
  type EnterpriseDomainProfile,
} from '@/lib/apps/enterprise/domain-profiles';

import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

import {
  dispatchBusinessAutomationEventSafely,
} from '@/lib/automation/business-events';

import {
  getEnterpriseWorkflowTransitions,
} from '@/lib/apps/enterprise/workflow-policy';

import {
  applyEnterpriseDomainSideEffects,
  assertEnterpriseDomainMutationAllowed,
  normalizeEnterpriseDomainValues,
} from '@/lib/apps/enterprise/domain-hooks';

import {
  getEnterpriseRelationDefinitions,
  listEnterpriseRelationOptions,
  validateEnterpriseRelationValues,
} from '@/lib/apps/enterprise/relations';

import {
  EnterpriseIdempotencyConflictError,
  completeEnterpriseCreateRequest,
  hashEnterpriseCreateRequest,
  normalizeEnterpriseIdempotencyKey,
  reserveEnterpriseCreateRequest,
} from '@/lib/apps/enterprise/idempotency';


export type EnterpriseModuleOperation =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'report'
  | 'settings';


export type EnterpriseField = {
  key: string;
  label: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
  hasDefault: boolean;
  generated: boolean;
  required: boolean;
  writable: boolean;
  relation: {
    label: string;
  } | null;
  inputType:
    | 'text'
    | 'textarea'
    | 'number'
    | 'checkbox'
    | 'date'
    | 'datetime'
    | 'json';
};


export type EnterpriseWorkflowField = {
  field: string;
  label: string;
  databaseAllowedValues: string[];
  counts: Record<string, number>;
};

export type EnterpriseTable = {
  key: string;
  label: string;
  companyScoped: boolean;
  settingTable: boolean;
  recordKey: string | null;
  supportsCreate: boolean;
  supportsEdit: boolean;
  supportsDelete: boolean;
  fields: EnterpriseField[];
  displayFields: string[];
  workflows: EnterpriseWorkflowField[];
  count: number;
  records: Array<
    Record<
      string,
      unknown
    >
  >;
};


export type EnterpriseWorkspaceData = {
  module: {
    key: string;
    name: string;
    description: string;
    category: string;
    iconKey: string;
  };
  company: {
    id: string;
    name: string;
  };
  capabilities: {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canReport: boolean;
    canManageSettings: boolean;
  };
  profile: EnterpriseDomainProfile;
  metrics: {
    totalRecords: number;
    tables: number;
    activeTables: number;
    primaryRecords: number;
    attentionRecords: number;
    successRecords: number;
    workflowTrackedRecords: number;
  };
  tables: EnterpriseTable[];
};


export type EnterpriseModuleErrorCode =
  | 'MODULE_NOT_SUPPORTED'
  | 'MODULE_NOT_INSTALLED'
  | 'MODULE_PERMISSION_REQUIRED'
  | 'WORKSPACE_SUSPENDED'
  | 'WORKSPACE_CONTEXT_CHANGED'
  | 'TABLE_NOT_ALLOWED'
  | 'TABLE_NOT_READY'
  | 'RECORD_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'DELETE_NOT_SUPPORTED'
  | 'WORKFLOW_NOT_SUPPORTED'
  | 'WORKFLOW_TRANSITION_INVALID';


export class EnterpriseModuleError
  extends Error {
  readonly code:
    EnterpriseModuleErrorCode;

  readonly details:
    Record<string, unknown>;

  constructor(
    code:
      EnterpriseModuleErrorCode,
    message:
      string,
    details:
      Record<string, unknown> = {},
  ) {
    super(
      message,
    );

    this.name =
      'EnterpriseModuleError';

    this.code =
      code;

    this.details =
      details;
  }
}


const IDENTIFIER =
  /^[a-z_][a-z0-9_]*$/;


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


const DISPLAY_SKIP =
  new Set([
    ...SYSTEM_COLUMNS,
    'metadata',
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
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'SaMi rejected an unsafe database identifier.',
    );
  }

  return (
    '"' +
    value +
    '"'
  );
}


function label(
  value:
    string,
) {
  return value
    .replace(
      /_/g,
      ' ',
    )
    .replace(
      /\b\w/g,
      character =>
        character.toUpperCase(),
    );
}


function inputType(
  dataType:
    string,
  udtName:
    string,
): EnterpriseField[
  'inputType'
] {
  if (
    dataType ===
      'boolean'
  ) {
    return 'checkbox';
  }

  if (
    dataType ===
      'date'
  ) {
    return 'date';
  }

  if (
    dataType.includes(
      'timestamp',
    )
  ) {
    return 'datetime';
  }

  if (
    dataType ===
      'json' ||
    dataType ===
      'jsonb'
  ) {
    return 'json';
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
      dataType,
    ) ||
    [
      'int2',
      'int4',
      'int8',
      'float4',
      'float8',
    ].includes(
      udtName,
    )
  ) {
    return 'number';
  }

  if (
    dataType ===
      'text'
  ) {
    return 'textarea';
  }

  return 'text';
}


function normalizeValue(
  value:
    unknown,
  field:
    EnterpriseField,
) {
  if (
    value ===
      '' &&
    field.nullable
  ) {
    return null;
  }

  if (
    field.inputType ===
      'checkbox'
  ) {
    if (
      value ===
        true ||
      value ===
        'true' ||
      value ===
        'on' ||
      value ===
        1 ||
      value ===
        '1'
    ) {
      return true;
    }

    return false;
  }

  if (
    field.inputType ===
      'number'
  ) {
    if (
      value ===
        '' ||
      value ===
        null ||
      value ===
        undefined
    ) {
      return field.nullable
        ? null
        : value;
    }

    const numeric =
      Number(
        value,
      );

    if (
      !Number.isFinite(
        numeric,
      )
    ) {
      throw new EnterpriseModuleError(
        'INVALID_INPUT',
        field.label +
        ' must be a valid number.',
      );
    }

    return numeric;
  }

  if (
    field.inputType ===
      'json'
  ) {
    if (
      value ===
        null ||
      value ===
        undefined ||
      value ===
        ''
    ) {
      return field.nullable
        ? null
        : {};
    }

    if (
      typeof value ===
        'string'
    ) {
      try {
        JSON.parse(
          value,
        );

        return value;
      } catch {
        throw new EnterpriseModuleError(
          'INVALID_INPUT',
          field.label +
          ' must contain valid JSON.',
        );
      }
    }

    return JSON.stringify(
      value,
    );
  }

  return value;
}


function permissionAllows(
  context:
    PermissionContext,
  moduleKey:
    string,
  operation:
    EnterpriseModuleOperation,
) {
  if (
    context.isOwner
  ) {
    return true;
  }

  const accepted =
    operation ===
      'view'
      ? new Set([
          'view',
          'read',
          'manage',
          'report',
        ])
      : operation ===
          'create'
        ? new Set([
            'create',
            'manage',
          ])
        : operation ===
            'edit'
          ? new Set([
              'edit',
              'update',
              'write',
              'manage',
            ])
          : operation ===
              'delete'
            ? new Set([
                'delete',
                'manage',
              ])
            : operation ===
                'report'
              ? new Set([
                  'report',
                  'view',
                  'read',
                  'manage',
                ])
              : new Set([
                  'settings',
                  'manage',
                  'write',
                ]);

  return context.permissions
    .some(
      permission =>
        normalizeKey(
          permission.moduleKey,
        ) ===
          moduleKey &&
        accepted.has(
          normalizeKey(
            permission.action,
          ),
        ),
    );
}


async function recordEnterpriseAudit(
  input:
    Parameters<
      typeof recordWorkspaceAuditEvent
    >[0],
) {
  try {
    await recordWorkspaceAuditEvent(
      input,
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Enterprise App] audit write failed:',
      {
        module:
          input.module,
        action:
          input.action,
        resourceType:
          input.resourceType,
        resourceId:
          input.resourceId,
        error,
      },
    );
  }
}


function applyDomainValueRules(
  moduleKey:
    string,
  table:
    string,
  values:
    Map<
      string,
      unknown
    >,
) {
  try {
    normalizeEnterpriseDomainValues(
      moduleKey,
      table,
      values,
    );
  } catch (
    error
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      error instanceof
        Error
        ? error.message
        : 'This business record violates a module rule.',
    );
  }
}


function assertDomainMutation(
  moduleKey:
    string,
  table:
    string,
  operation:
    'create' |
    'update' |
    'delete',
) {
  try {
    assertEnterpriseDomainMutationAllowed(
      moduleKey,
      table,
      operation,
    );
  } catch (
    error
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      error instanceof
        Error
        ? error.message
        : 'This business record cannot be changed directly.',
    );
  }
}


async function runDomainSideEffects(
  client:
    import('pg').PoolClient,
  input:
    Parameters<
      typeof applyEnterpriseDomainSideEffects
    >[1],
) {
  try {
    await applyEnterpriseDomainSideEffects(
      client,
      input,
    );
  } catch (
    error
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      error instanceof
        Error
        ? error.message
        : 'SaMi could not apply the module business rule.',
    );
  }
}


function enterpriseAutomationRuntime(
  context:
    Awaited<
      ReturnType<
        typeof requireContext
      >
    >,
) {
  return {
    userId:
      context.userId,
    sessionId:
      context.permissions
        .sessionId,
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    accessibleModuleKeys: [
      ...new Set([
        context.moduleKey,
        ...context.permissions
          .permissions
          .map(
            permission =>
              permission.moduleKey
                ?.trim()
                .toLowerCase() ||
              '',
          )
          .filter(
            Boolean,
          ),
      ]),
    ],
    permissionSet:
      context.permissions
        .permissionSet,
    isOwner:
      context.permissions
        .isOwner,
  };
}


async function emitEnterpriseAutomationEvent(
  context:
    Awaited<
      ReturnType<
        typeof requireContext
      >
    >,
  input: {
    triggerKey:
      string;
    table:
      string;
    record:
      Record<
        string,
        unknown
      >;
    idempotencySeed:
      string;
    payload?:
      Record<
        string,
        unknown
      >;
  },
) {
  const recordId =
    typeof input.record.id ===
      'string'
      ? input.record.id
      : null;

  await dispatchBusinessAutomationEventSafely({
    runtime:
      enterpriseAutomationRuntime(
        context,
      ),
    moduleKey:
      context.moduleKey,
    triggerKey:
      input.triggerKey,
    recordType:
      input.table,
    recordId,
    payload: {
      moduleKey:
        context.moduleKey,
      table:
        input.table,
      recordId,
      record:
        rowOutput(
          input.record,
        ),
      ...(
        input.payload ||
        {}
      ),
    },
    idempotencySeed:
      input.idempotencySeed,
  });
}


async function assertRelationValues(
  pool:
    Pool,
  table:
    string,
  companyId:
    string,
  values:
    Map<
      string,
      unknown
    >,
) {
  try {
    await validateEnterpriseRelationValues(
      pool,
      table,
      companyId,
      values,
    );
  } catch (
    error
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      error instanceof
        Error
        ? error.message
        : 'Choose a valid related business record.',
    );
  }
}


async function requireContext(
  moduleKeyInput:
    string,
  operation:
    EnterpriseModuleOperation,
) {
  const moduleKey =
    normalizeKey(
      moduleKeyInput,
    );

  if (
    !isEnterpriseModuleKey(
      moduleKey,
    )
  ) {
    throw new EnterpriseModuleError(
      'MODULE_NOT_SUPPORTED',
      'This app uses a dedicated SaMi workspace or is not part of the enterprise record engine.',
    );
  }

  const manifest =
    getSamiModuleManifest(
      moduleKey,
    );

  if (
    !manifest ||
    !manifest.installable
  ) {
    throw new EnterpriseModuleError(
      'MODULE_NOT_SUPPORTED',
      'This app is not registered in the SaMi module runtime.',
    );
  }

  const [
    permissions,
    company,
  ] =
    await Promise.all([
      getPermissionContext(),
      requireCompanyContext(),
    ]);

  if (
    permissions.tenantId !==
      company.tenantId ||
    permissions.userId !==
      company.userId
  ) {
    throw new EnterpriseModuleError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your workspace context changed. Please try again.',
    );
  }

  const access =
    await getWorkspaceSubscriptionAccessState(
      permissions.tenantId,
    );

  if (
    access.suspended ||
    !access.entitled
  ) {
    throw new EnterpriseModuleError(
      'WORKSPACE_SUSPENDED',
      'This workspace is unavailable until subscription access is restored.',
    );
  }

  const installed =
    await queryControl(
      `
        SELECT 1
        FROM tenant_modules tm
        INNER JOIN modules m
          ON m.id =
             tm.module_id
        WHERE tm.tenant_id = $1
          AND LOWER(
                COALESCE(
                  m.key,
                  ''
                )
              ) = $2
          AND tm.deleted_at IS NULL
          AND m.deleted_at IS NULL
          AND LOWER(
                COALESCE(
                  m.status,
                  ''
                )
              ) = 'active'
          AND LOWER(
                COALESCE(
                  tm.status,
                  ''
                )
              ) IN (
                'installed',
                'active',
                'enabled'
              )
        LIMIT 1
      `,
      [
        permissions.tenantId,
        moduleKey,
      ],
    );

  if (
    installed.rows.length !==
      1
  ) {
    throw new EnterpriseModuleError(
      'MODULE_NOT_INSTALLED',
      manifest.name +
      ' is not installed in this workspace.',
    );
  }

  if (
    !permissionAllows(
      permissions,
      moduleKey,
      operation,
    )
  ) {
    throw new EnterpriseModuleError(
      'MODULE_PERMISSION_REQUIRED',
      'You do not have permission to perform this ' +
      manifest.name +
      ' action.',
    );
  }

  return {
    moduleKey,
    manifest,
    permissions,
    company,
    tenantId:
      permissions.tenantId,
    userId:
      permissions.userId,
    companyId:
      company.currentCompanyId,
    pool:
      await getTenantPoolByTenantId(
        permissions.tenantId,
      ),
  };
}


type RawColumn = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default:
    string | null;
  is_identity: string;
  is_generated: string;
};


async function tableMetadata(
  pool:
    Pool,
  allowedTables:
    string[],
) {
  if (
    allowedTables.length ===
      0
  ) {
    return new Map<
      string,
      EnterpriseField[]
    >();
  }

  const result =
    await pool.query(
      `
        SELECT
          table_name,
          column_name,
          data_type,
          udt_name,
          is_nullable,
          column_default,
          is_identity,
          is_generated
        FROM information_schema.columns
        WHERE table_schema =
              'public'
          AND table_name =
              ANY(
                $1::text[]
              )
        ORDER BY
          table_name,
          ordinal_position
      `,
      [
        allowedTables,
      ],
    );

  const byTable =
    new Map<
      string,
      EnterpriseField[]
    >();

  for (
    const row
    of result.rows as
      RawColumn[]
  ) {
    if (
      SENSITIVE_COLUMN.test(
        row.column_name,
      )
    ) {
      continue;
    }

    const generated =
      row.is_identity ===
        'YES' ||
      (
        Boolean(
          row.is_generated,
        ) &&
        row.is_generated !==
          'NEVER'
      );

    const hasDefault =
      Boolean(
        row.column_default,
      );

    const nullable =
      row.is_nullable ===
        'YES';

    const system =
      SYSTEM_COLUMNS.has(
        row.column_name,
      );

    const field:
      EnterpriseField = {
        key:
          row.column_name,
        label:
          label(
            row.column_name,
          ),
        dataType:
          row.data_type,
        udtName:
          row.udt_name,
        nullable,
        hasDefault,
        generated,
        required:
          !nullable &&
          !hasDefault &&
          !generated &&
          !system,
        writable:
          !generated &&
          !system &&
          !COMPUTED_COLUMNS.has(
            row.column_name,
          ) &&
          !/(^|_)(status|state|stage)$/.test(
            row.column_name,
          ),
        relation:
          null,
        inputType:
          inputType(
            row.data_type,
            row.udt_name,
          ),
      };

    const fields =
      byTable.get(
        row.table_name,
      ) ||
      [];

    fields.push(
      field,
    );

    byTable.set(
      row.table_name,
      fields,
    );
  }

  for (
    const table
    of allowedTables
  ) {
    const fields =
      byTable.get(
        table,
      );

    if (
      !fields ||
      fields.length ===
        0
    ) {
      continue;
    }

    const relations =
      await getEnterpriseRelationDefinitions(
        pool,
        table,
      );

    const unsafeRelation =
      [
        ...relations.values(),
      ].find(
        relation =>
          !relation.companyScoped ||
          !relation.softDelete,
      );

    if (
      unsafeRelation
    ) {
      throw new EnterpriseModuleError(
        'TABLE_NOT_READY',
        'A related business table has not completed SaMi enterprise boundary hardening.',
        {
          table,
          relationField:
            unsafeRelation.field,
          relationTable:
            unsafeRelation.targetTable,
        },
      );
    }

    byTable.set(
      table,
      fields.map(
        field => {
          const relation =
            relations.get(
              field.key,
            );

          return relation
            ? {
                ...field,
                label:
                  relation.label,
                relation: {
                  label:
                    relation.label,
                },
              }
            : field;
        },
      ),
    );
  }

  return byTable;
}


function rowOutput(
  row:
    Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries(
      row,
    )
      .filter(
        ([
          key,
        ]) =>
          !SENSITIVE_COLUMN.test(
            key,
          ) &&
          ![
            'tenant_id',
            'company_id',
            'created_by',
            'updated_by',
          ].includes(
            key,
          ),
      )
      .map(
        ([
          key,
          value,
        ]) => [
          key,
          value instanceof
            Date
            ? value
                .toISOString()
            : value,
        ],
      ),
  );
}


async function getDatabaseWorkflowValues(
  pool:
    Pick<
      Pool,
      'query'
    >,
  table:
    string,
  field:
    string,
) {
  const result =
    await pool.query(
      `
        SELECT
          pg_get_constraintdef(
            c.oid
          )
            AS definition
        FROM pg_constraint c
        INNER JOIN pg_class rel
          ON rel.oid =
             c.conrelid
        INNER JOIN pg_namespace ns
          ON ns.oid =
             rel.relnamespace
        WHERE ns.nspname =
              'public'
          AND rel.relname =
              $1
          AND c.contype =
              'c'
      `,
      [
        table,
      ],
    );

  const values =
    new Set<string>();

  for (
    const row
    of result.rows
  ) {
    const definition =
      String(
        row.definition ||
        '',
      );

    if (
      !definition
        .toLowerCase()
        .includes(
          field.toLowerCase(),
        )
    ) {
      continue;
    }

    for (
      const match
      of definition.matchAll(
        /'((?:''|[^'])+)'/g,
      )
    ) {
      const value =
        match[1]
          .replaceAll(
            "''",
            "'",
          )
          .trim()
          .toLowerCase();

      if (
        value
      ) {
        values.add(
          value,
        );
      }
    }
  }

  return [
    ...values,
  ];
}


async function workflowFieldsForTable(
  pool:
    Pool,
  table:
    string,
  fields:
    EnterpriseField[],
  where:
    string,
  params:
    unknown[],
): Promise<
  EnterpriseWorkflowField[]
> {
  const statusFields =
    fields.filter(
      field =>
        /(^|_)(status|state|stage)$/.test(
          field.key,
        ),
    );

  return Promise.all(
    statusFields.map(
      async field => {
        const [
          databaseAllowedValues,
          countsResult,
        ] =
          await Promise.all([
            getDatabaseWorkflowValues(
              pool,
              table,
              field.key,
            ),
            pool.query(
              'SELECT COALESCE(' +
              quoteIdentifier(
                field.key,
              ) +
              "::text, '') AS value, COUNT(*)::int AS count FROM " +
              quoteIdentifier(
                table,
              ) +
              where +
              ' GROUP BY ' +
              quoteIdentifier(
                field.key,
              ),
              params,
            ),
          ]);

        const counts =
          Object.fromEntries(
            countsResult.rows
              .map(
                row => [
                  String(
                    row.value ||
                    '',
                  )
                    .trim()
                    .toLowerCase(),
                  Number(
                    row.count ||
                    0,
                  ),
                ],
              )
              .filter(
                ([
                  value,
                ]) =>
                  Boolean(
                    value,
                  ),
              ),
          );

        return {
          field:
            field.key,
          label:
            field.label,
          databaseAllowedValues,
          counts,
        };
      },
    ),
  );
}


function assertEnterpriseTableBoundaryReady(
  table:
    string,
  fields:
    EnterpriseField[],
) {
  const names =
    new Set(
      fields.map(
        field =>
          field.key,
      ),
    );

  const missing =
    [
      'company_id',
      'deleted_at',
    ].filter(
      column =>
        !names.has(
          column,
        ),
    );

  if (
    missing.length >
      0
  ) {
    throw new EnterpriseModuleError(
      'TABLE_NOT_READY',
      label(
        table,
      ) +
      ' has not completed SaMi enterprise boundary hardening.',
      {
        table,
        missingBoundaryColumns:
          missing,
      },
    );
  }
}


async function readTable(
  pool:
    Pool,
  table:
    string,
  fields:
    EnterpriseField[],
  companyId:
    string,
) {
  const names =
    new Set(
      fields.map(
        field =>
          field.key,
      ),
    );

  assertEnterpriseTableBoundaryReady(
    table,
    fields,
  );

  const companyScoped =
    names.has(
      'company_id',
    );

  const hasDeleted =
    names.has(
      'deleted_at',
    );

  const recordKey =
    names.has(
      'id',
    )
      ? 'id'
      : companyScoped &&
        table.endsWith(
          '_settings',
        )
        ? 'company_id'
        : null;

  const conditions:
    string[] =
      [];

  const params:
    unknown[] =
      [];

  if (
    companyScoped
  ) {
    params.push(
      companyId,
    );

    conditions.push(
      'company_id = $' +
      params.length,
    );
  }

  if (
    hasDeleted
  ) {
    conditions.push(
      'deleted_at IS NULL',
    );
  }

  const where =
    conditions.length >
      0
      ? (
          ' WHERE ' +
          conditions.join(
            ' AND ',
          )
        )
      : '';

  const orderColumn =
    names.has(
      'updated_at',
    )
      ? 'updated_at'
      : names.has(
          'created_at',
        )
        ? 'created_at'
        : recordKey;

  const quotedTable =
    quoteIdentifier(
      table,
    );

  const countResult =
    await pool.query(
      'SELECT COUNT(*)::int AS count FROM ' +
      quotedTable +
      where,
      params,
    );

  const dataResult =
    await pool.query(
      'SELECT * FROM ' +
      quotedTable +
      where +
      (
        orderColumn
          ? (
              ' ORDER BY ' +
              quoteIdentifier(
                orderColumn,
              ) +
              ' DESC NULLS LAST'
            )
          : ''
      ) +
      ' LIMIT 50',
      params,
    );

  const workflows =
    await workflowFieldsForTable(
      pool,
      table,
      fields,
      where,
      params,
    );

  const displayFields =
    fields
      .map(
        field =>
          field.key,
      )
      .filter(
        key =>
          !DISPLAY_SKIP.has(
            key,
          ),
      )
      .slice(
        0,
        8,
      );

  return {
    key:
      table,
    label:
      label(
        table,
      ),
    companyScoped,
    settingTable:
      table.endsWith(
        '_settings',
      ),
    recordKey,
    fields,
    displayFields,
    workflows,
    count:
      Number(
        countResult.rows[0]
          ?.count ||
        0,
      ),
    records:
      dataResult.rows.map(
        rowOutput,
      ),
  };
}


export async function getEnterpriseModuleWorkspace(
  moduleKey:
    string,
): Promise<EnterpriseWorkspaceData> {
  const context =
    await requireContext(
      moduleKey,
      'view',
    );

  const allowedTables =
    enterpriseModuleTables(
      context.moduleKey,
    );

  const metadata =
    await tableMetadata(
      context.pool,
      allowedTables,
    );

  const tableResults =
    await Promise.all(
      allowedTables.map(
        async table => {
          const fields =
            metadata.get(
              table,
            );

          if (
            !fields ||
            fields.length ===
              0
          ) {
            return null;
          }

          return readTable(
            context.pool,
            table,
            fields,
            context.companyId,
          );
        },
      ),
    );

  const tables =
    tableResults.filter(
      (
        table,
      ): table is
        NonNullable<
          typeof table
        > =>
        Boolean(
          table,
        ),
    );

  const profile =
    getEnterpriseDomainProfile(
      context.moduleKey,
    );

  if (
    !profile
  ) {
    throw new EnterpriseModuleError(
      'MODULE_NOT_SUPPORTED',
      'SaMi could not resolve the operating profile for this app.',
    );
  }

  const workflowMetric =
    (
      states:
        string[],
    ) => {
      const accepted =
        new Set(
          states.map(
            state =>
              state.toLowerCase(),
          ),
        );

      return tables.reduce(
        (
          total,
          table,
        ) => {
          const workflow =
            table.workflows[0];

          if (
            !workflow
          ) {
            return total;
          }

          return total +
            Object.entries(
              workflow.counts,
            )
              .filter(
                ([
                  state,
                ]) =>
                  accepted.has(
                    state,
                  ),
              )
              .reduce(
                (
                  subtotal,
                  [
                    _state,
                    count,
                  ],
                ) =>
                  subtotal +
                  count,
                0,
              );
        },
        0,
      );
    };

  const workflowTrackedRecords =
    tables.reduce(
      (
        total,
        table,
      ) => {
        const workflow =
          table.workflows[0];

        return total +
          (
            workflow
              ? Object.values(
                  workflow.counts,
                )
                  .reduce(
                    (
                      subtotal,
                      count,
                    ) =>
                      subtotal +
                      count,
                    0,
                  )
              : 0
          );
      },
      0,
    );

  const primaryRecords =
    tables.find(
      table =>
        table.key ===
          profile.primaryTable,
    )
      ?.count ||
    0;

  const capabilities = {
    canView:
      true,
    canCreate:
      permissionAllows(
        context.permissions,
        context.moduleKey,
        'create',
      ),
    canEdit:
      permissionAllows(
        context.permissions,
        context.moduleKey,
        'edit',
      ),
    canDelete:
      permissionAllows(
        context.permissions,
        context.moduleKey,
        'delete',
      ),
    canReport:
      permissionAllows(
        context.permissions,
        context.moduleKey,
        'report',
      ),
    canManageSettings:
      permissionAllows(
        context.permissions,
        context.moduleKey,
        'settings',
      ),
  };

  return {
    module: {
      key:
        context.moduleKey,
      name:
        context.manifest
          .name,
      description:
        context.manifest
          .description,
      category:
        context.manifest
          .category,
      iconKey:
        context.manifest
          .icon,
    },
    company: {
      id:
        context.companyId,
      name:
        context.company
          .currentCompany
          .name,
    },
    capabilities,
    profile,
    metrics: {
      primaryRecords,
      attentionRecords:
        workflowMetric(
          profile
            .attentionStates,
        ),
      successRecords:
        workflowMetric(
          profile
            .successStates,
        ),
      workflowTrackedRecords,
      totalRecords:
        tables.reduce(
          (
            total,
            table,
          ) =>
            total +
            table.count,
          0,
        ),
      tables:
        tables.length,
      activeTables:
        tables.filter(
          table =>
            table.count >
            0,
        ).length,
    },
    tables:
      tables.map(
        table => ({
          ...table,
          supportsCreate:
            capabilities.canCreate &&
            !(
              table.settingTable &&
              table.count >
                0
            ) &&
            table.fields.some(
              field =>
                field.writable,
            ),
          supportsEdit:
            capabilities.canEdit &&
            Boolean(
              table.recordKey,
            ),
          supportsDelete:
            capabilities.canDelete &&
            Boolean(
              table.recordKey,
            ) &&
            table.fields.some(
              field =>
                field.key ===
                'deleted_at',
            ),
        }),
      ),
  };
}


async function assertTable(
  moduleKey:
    string,
  tableInput:
    unknown,
  operation:
    EnterpriseModuleOperation,
) {
  const context =
    await requireContext(
      moduleKey,
      operation,
    );

  const table =
    normalizeKey(
      tableInput,
    );

  const allowed =
    enterpriseModuleTables(
      context.moduleKey,
    );

  if (
    !table ||
    !allowed.includes(
      table as never,
    )
  ) {
    throw new EnterpriseModuleError(
      'TABLE_NOT_ALLOWED',
      'This record type does not belong to the selected app.',
    );
  }

  const metadata =
    await tableMetadata(
      context.pool,
      [
        table,
      ],
    );

  const fields =
    metadata.get(
      table,
    );

  if (
    !fields ||
    fields.length ===
      0
  ) {
    throw new EnterpriseModuleError(
      'TABLE_NOT_READY',
      'This app record type is not ready in the current workspace.',
    );
  }

  assertEnterpriseTableBoundaryReady(
    table,
    fields,
  );

  return {
    ...context,
    table,
    fields,
  };
}


export async function requireEnterpriseModuleTableContext(
  moduleKey:
    string,
  tableInput:
    unknown,
  operation:
    EnterpriseModuleOperation,
) {
  return assertTable(
    moduleKey,
    tableInput,
    operation,
  );
}


function writableValues(
  input:
    unknown,
  fields:
    EnterpriseField[],
) {
  if (
    !input ||
    typeof input !==
      'object' ||
    Array.isArray(
      input,
    )
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'A valid record payload is required.',
    );
  }

  const source =
    input as
      Record<string, unknown>;

  const fieldMap =
    new Map(
      fields.map(
        field => [
          field.key,
          field,
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
      source,
    )
  ) {
    const field =
      fieldMap.get(
        key,
      );

    if (
      !field ||
      !field.writable ||
      SENSITIVE_COLUMN.test(
        key,
      )
    ) {
      continue;
    }

    output.set(
      key,
      normalizeValue(
        value,
        field,
      ),
    );
  }

  return output;
}


export async function createEnterpriseModuleRecord(
  moduleKey:
    string,
  input: {
    table?: unknown;
    values?: unknown;
    idempotencyKey?: unknown;
  },
) {
  const context =
    await assertTable(
      moduleKey,
      input.table,
      'create',
    );

  assertDomainMutation(
    context.moduleKey,
    context.table,
    'create',
  );

  const values =
    writableValues(
      input.values,
      context.fields,
    );

  applyDomainValueRules(
    context.moduleKey,
    context.table,
    values,
  );

  await assertRelationValues(
    context.pool,
    context.table,
    context.companyId,
    values,
  );

  const fieldNames =
    new Set(
      context.fields.map(
        field =>
          field.key,
      ),
    );

  if (
    fieldNames.has(
      'company_id',
    )
  ) {
    values.set(
      'company_id',
      context.companyId,
    );
  }

  if (
    fieldNames.has(
      'created_by',
    )
  ) {
    values.set(
      'created_by',
      context.userId,
    );
  }

  if (
    fieldNames.has(
      'updated_by',
    )
  ) {
    values.set(
      'updated_by',
      context.userId,
    );
  }

  for (
    const field
    of context.fields
  ) {
    if (
      field.required &&
      !values.has(
        field.key,
      )
    ) {
      throw new EnterpriseModuleError(
        'INVALID_INPUT',
        field.label +
        ' is required.',
      );
    }
  }

  if (
    values.size ===
      0
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Add at least one record value.',
    );
  }

  const idempotencyKey =
    normalizeEnterpriseIdempotencyKey(
      input.idempotencyKey,
    );

  if (
    !idempotencyKey
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'A valid create request key is required.',
    );
  }

  const requestHash =
    hashEnterpriseCreateRequest(
      context.moduleKey,
      context.table,
      values,
    );

  const entries =
    [
      ...values.entries(),
    ];

  const sql =
    'INSERT INTO ' +
    quoteIdentifier(
      context.table,
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
    ') RETURNING *';

  const client =
    await context.pool.connect();

  let createdRow:
    Record<
      string,
      unknown
    > = {};

  let replayed =
    false;

  try {
    await client.query(
      'BEGIN',
    );

    let reservation:
      Awaited<
        ReturnType<
          typeof reserveEnterpriseCreateRequest
        >
      >;

    try {
      reservation =
        await reserveEnterpriseCreateRequest(
          client,
          {
            companyId:
              context.companyId,
            userId:
              context.userId,
            moduleKey:
              context.moduleKey,
            table:
              context.table,
            idempotencyKey,
            requestHash,
          },
        );
    } catch (
      error
    ) {
      if (
        error instanceof
          EnterpriseIdempotencyConflictError
      ) {
        throw new EnterpriseModuleError(
          'INVALID_INPUT',
          error.message,
        );
      }

      throw error;
    }

    if (
      reservation.replayed
    ) {
      createdRow =
        reservation.response ||
        {};

      replayed =
        true;

      await client.query(
        'COMMIT',
      );
    } else {
      const result =
        await client.query(
        sql,
        entries.map(
          ([
            _key,
            value,
          ]) =>
            value,
        ),
      );

      createdRow =
        result.rows[0] ||
        {};

      await runDomainSideEffects(
        client,
        {
          moduleKey:
            context.moduleKey,
          table:
            context.table,
          companyId:
            context.companyId,
          operation:
            'create',
          row:
            createdRow,
        },
      );

      const response =
        rowOutput(
          createdRow,
        );

      try {
        await completeEnterpriseCreateRequest(
          client,
          {
            companyId:
              context.companyId,
            idempotencyKey,
            recordKey:
              createdRow.id
                ? String(
                    createdRow.id,
                  )
                : createdRow.company_id
                  ? String(
                      createdRow.company_id,
                    )
                  : null,
            response,
          },
        );
      } catch (
        error
      ) {
        if (
          error instanceof
            EnterpriseIdempotencyConflictError
        ) {
          throw new EnterpriseModuleError(
            'INVALID_INPUT',
            error.message,
          );
        }

        throw error;
      }

      await client.query(
        'COMMIT',
      );
    }
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

  const created =
    replayed
      ? createdRow
      : rowOutput(
          createdRow,
        );

  if (
    replayed
  ) {
    return created;
  }

  await recordEnterpriseAudit({
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    userId:
      context.userId,
    action:
      context.moduleKey +
      '.record.created',
    eventType:
      'record.created',
    category:
      'business',
    severity:
      'info',
    summary:
      context.manifest.name +
      ' record created.',
    resourceType:
      context.table,
    resourceId:
      typeof createdRow
        .id ===
        'string'
        ? String(
            createdRow.id,
          )
        : null,
    entityType:
      context.table,
    entityId:
      typeof createdRow
        .id ===
        'string'
        ? String(
            createdRow.id,
          )
        : null,
    module:
      context.moduleKey,
    result:
      'success',
    metadata: {
      table:
        context.table,
    },
  });

  await emitEnterpriseAutomationEvent(
    context,
    {
      triggerKey:
        context.moduleKey +
        '.record.created',
      table:
        context.table,
      record:
        createdRow,
      idempotencySeed:
        String(
          createdRow.created_at ||
          createdRow.id ||
          Date.now(),
        ),
    },
  );

  return created;
}


export async function updateEnterpriseModuleRecord(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordId?: unknown;
    values?: unknown;
  },
) {
  const context =
    await assertTable(
      moduleKey,
      input.table,
      'edit',
    );

  assertDomainMutation(
    context.moduleKey,
    context.table,
    'update',
  );

  const fieldNames =
    new Set(
      context.fields.map(
        field =>
          field.key,
      ),
    );

  const recordKey =
    fieldNames.has(
      'id',
    )
      ? 'id'
      : fieldNames.has(
          'company_id',
        ) &&
        context.table.endsWith(
          '_settings',
        )
        ? 'company_id'
        : null;

  if (
    !recordKey
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'This record type does not support direct editing.',
    );
  }

  const recordId =
    recordKey ===
      'company_id'
      ? context.companyId
      : String(
          input.recordId ||
          '',
        )
          .trim();

  if (
    !recordId
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Choose a record to edit.',
    );
  }

  const values =
    writableValues(
      input.values,
      context.fields,
    );

  applyDomainValueRules(
    context.moduleKey,
    context.table,
    values,
  );

  await assertRelationValues(
    context.pool,
    context.table,
    context.companyId,
    values,
  );

  if (
    fieldNames.has(
      'updated_by',
    )
  ) {
    values.set(
      'updated_by',
      context.userId,
    );
  }

  if (
    values.size ===
      0
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'No editable values were supplied.',
    );
  }

  const entries =
    [
      ...values.entries(),
    ];

  const conditions = [
    quoteIdentifier(
      recordKey,
    ) +
    ' = $' +
    (
      entries.length +
      1
    ),
  ];

  const params:
    unknown[] =
      entries.map(
        ([
          _key,
          value,
        ]) =>
          value,
      );

  params.push(
    recordId,
  );

  if (
    fieldNames.has(
      'company_id',
    ) &&
    recordKey !==
      'company_id'
  ) {
    conditions.push(
      'company_id = $' +
      (
        params.length +
        1
      ),
    );

    params.push(
      context.companyId,
    );
  }

  if (
    fieldNames.has(
      'deleted_at',
    )
  ) {
    conditions.push(
      'deleted_at IS NULL',
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
    fieldNames.has(
      'updated_at',
    )
  ) {
    setters.push(
      'updated_at = NOW()',
    );
  }

  const client =
    await context.pool.connect();

  let updatedRow:
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
        context.table,
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
      throw new EnterpriseModuleError(
        'RECORD_NOT_FOUND',
        'The record was not found in the current company.',
      );
    }

    updatedRow =
      result.rows[0];

    await runDomainSideEffects(
      client,
      {
        moduleKey:
          context.moduleKey,
        table:
          context.table,
        companyId:
          context.companyId,
        operation:
          'update',
        row:
          updatedRow,
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

  const updated =
    rowOutput(
      updatedRow,
    );

  await recordEnterpriseAudit({
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    userId:
      context.userId,
    action:
      context.moduleKey +
      '.record.updated',
    eventType:
      'record.updated',
    category:
      'business',
    severity:
      'info',
    summary:
      context.manifest.name +
      ' record updated.',
    resourceType:
      context.table,
    resourceId:
      String(
        updatedRow
          .id ||
        recordId,
      ),
    entityType:
      context.table,
    entityId:
      String(
        updatedRow
          .id ||
        recordId,
      ),
    module:
      context.moduleKey,
    result:
      'success',
    metadata: {
      table:
        context.table,
    },
    changes:
      Object.fromEntries(
        entries.map(
          ([
            key,
            value,
          ]) => [
            key,
            {
              to:
                value,
            },
          ],
        ),
      ),
  });

  await emitEnterpriseAutomationEvent(
    context,
    {
      triggerKey:
        context.moduleKey +
        '.record.updated',
      table:
        context.table,
      record:
        updatedRow,
      idempotencySeed:
        String(
          updatedRow.updated_at ||
          updatedRow.id ||
          Date.now(),
        ),
      payload: {
        changedFields:
          entries.map(
            ([
              key,
            ]) =>
              key,
          ),
      },
    },
  );

  return updated;
}


export async function deleteEnterpriseModuleRecord(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordId?: unknown;
  },
) {
  const context =
    await assertTable(
      moduleKey,
      input.table,
      'delete',
    );

  assertDomainMutation(
    context.moduleKey,
    context.table,
    'delete',
  );

  const names =
    new Set(
      context.fields.map(
        field =>
          field.key,
      ),
    );

  if (
    !names.has(
      'id',
    ) ||
    !names.has(
      'deleted_at',
    )
  ) {
    throw new EnterpriseModuleError(
      'DELETE_NOT_SUPPORTED',
      'This record type does not support safe deletion. Use its business workflow instead.',
    );
  }

  const recordId =
    String(
      input.recordId ||
      '',
    )
      .trim();

  if (
    !recordId
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Choose a record to delete.',
    );
  }

  const params:
    unknown[] = [
      recordId,
    ];

  const conditions = [
    'id = $1',
    'deleted_at IS NULL',
  ];

  if (
    names.has(
      'company_id',
    )
  ) {
    params.push(
      context.companyId,
    );

    conditions.push(
      'company_id = $2',
    );
  }

  const setters = [
    'deleted_at = NOW()',
  ];

  if (
    names.has(
      'updated_at',
    )
  ) {
    setters.push(
      'updated_at = NOW()',
    );
  }

  if (
    names.has(
      'updated_by',
    )
  ) {
    params.push(
      context.userId,
    );

    setters.push(
      'updated_by = $' +
      params.length,
    );
  }

  const client =
    await context.pool.connect();

  let deletedRow:
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
        context.table,
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
      throw new EnterpriseModuleError(
        'RECORD_NOT_FOUND',
        'The record was not found in the current company.',
      );
    }

    deletedRow =
      result.rows[0];

    await runDomainSideEffects(
      client,
      {
        moduleKey:
          context.moduleKey,
        table:
          context.table,
        companyId:
          context.companyId,
        operation:
          'delete',
        row:
          deletedRow,
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

  const deletedId =
    String(
      deletedRow.id,
    );

  await recordEnterpriseAudit({
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    userId:
      context.userId,
    action:
      context.moduleKey +
      '.record.deleted',
    eventType:
      'record.deleted',
    category:
      'business',
    severity:
      'warning',
    summary:
      context.manifest.name +
      ' record deleted.',
    resourceType:
      context.table,
    resourceId:
      deletedId,
    entityType:
      context.table,
    entityId:
      deletedId,
    module:
      context.moduleKey,
    result:
      'success',
    metadata: {
      table:
        context.table,
      softDelete:
        true,
    },
  });

  await emitEnterpriseAutomationEvent(
    context,
    {
      triggerKey:
        context.moduleKey +
        '.record.deleted',
      table:
        context.table,
      record:
        deletedRow,
      idempotencySeed:
        String(
          deletedRow.deleted_at ||
          deletedRow.updated_at ||
          deletedId,
        ),
    },
  );

  return {
    deleted:
      true,
    id:
      deletedId,
  };
}


async function validateEnterpriseTransition(
  client:
    import('pg').PoolClient,
  context: {
    moduleKey: string;
    companyId: string;
  },
  table:
    string,
  recordId:
    string,
  next:
    string,
) {
  if (
    context.moduleKey ===
      'accounting' &&
    table ===
      'journals' &&
    next ===
      'posted'
  ) {
    const balance =
      await client.query(
        `
          SELECT
            COUNT(*)::int
              AS line_count,
            COALESCE(
              SUM(debit),
              0
            )
              AS debit_total,
            COALESCE(
              SUM(credit),
              0
            )
              AS credit_total
          FROM journal_lines
          WHERE journal_id =
                $1
            AND company_id =
                $2
            AND deleted_at
                IS NULL
        `,
        [
          recordId,
          context.companyId,
        ],
      );

    const row =
      balance.rows[0] ||
      {};

    const debit =
      Number(
        row.debit_total ||
        0,
      );

    const credit =
      Number(
        row.credit_total ||
        0,
      );

    if (
      Number(
        row.line_count ||
        0,
      ) ===
        0 ||
      debit <=
        0 ||
      Math.abs(
        debit -
        credit,
      ) >
        0.005
    ) {
      throw new EnterpriseModuleError(
        'WORKFLOW_TRANSITION_INVALID',
        'A journal can only be posted when it has balanced debit and credit lines.',
      );
    }
  }

  if (
    context.moduleKey ===
      'purchase' &&
    table ===
      'purchase_orders' &&
    [
      'confirmed',
      'received',
      'closed',
    ].includes(
      next,
    )
  ) {
    await client.query(
      `
        UPDATE purchase_orders po
        SET
          total_amount =
            COALESCE(
              (
                SELECT
                  SUM(
                    quantity *
                    unit_cost
                  )
                FROM purchase_order_items i
                WHERE i.purchase_order_id =
                      po.id
                  AND i.company_id =
                      po.company_id
                  AND i.deleted_at
                      IS NULL
              ),
              0
            ),
          updated_at =
            NOW()
        WHERE po.id =
              $1
          AND po.company_id =
              $2
      `,
      [
        recordId,
        context.companyId,
      ],
    );
  }

  if (
    context.moduleKey ===
      'manufacturing' &&
    table ===
      'manufacturing_orders' &&
    next ===
      'completed'
  ) {
    const quantity =
      await client.query(
        `
          SELECT
            planned_quantity,
            produced_quantity
          FROM manufacturing_orders
          WHERE id = $1
            AND company_id = $2
            AND deleted_at
                IS NULL
          FOR UPDATE
        `,
        [
          recordId,
          context.companyId,
        ],
      );

    if (
      quantity.rows.length !==
        1 ||
      Number(
        quantity.rows[0]
          .produced_quantity ||
        0,
      ) <=
        0
    ) {
      throw new EnterpriseModuleError(
        'WORKFLOW_TRANSITION_INVALID',
        'Record produced quantity before completing a manufacturing order.',
      );
    }
  }
}


export async function transitionEnterpriseModuleRecord(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordId?: unknown;
    statusField?: unknown;
    nextStatus?: unknown;
  },
) {
  const context =
    await assertTable(
      moduleKey,
      input.table,
      'edit',
    );

  const field =
    normalizeKey(
      input.statusField,
    );

  const nextStatus =
    normalizeKey(
      input.nextStatus,
    );

  const recordId =
    String(
      input.recordId ||
      '',
    )
      .trim();

  if (
    !recordId ||
    !field ||
    !nextStatus
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Choose a record and workflow action.',
    );
  }

  const names =
    new Set(
      context.fields.map(
        item =>
          item.key,
      ),
    );

  if (
    !names.has(
      'id',
    ) ||
    !names.has(
      field,
    ) ||
    !/(^|_)(status|state|stage)$/.test(
      field,
    )
  ) {
    throw new EnterpriseModuleError(
      'WORKFLOW_NOT_SUPPORTED',
      'This record does not expose a managed SaMi workflow state.',
    );
  }

  const databaseAllowedValues =
    await getDatabaseWorkflowValues(
      context.pool,
      context.table,
      field,
    );

  const client =
    await context.pool.connect();

  let currentStatus =
    '';

  try {
    await client.query(
      'BEGIN',
    );

    const conditions = [
      'id = $1',
    ];

    const params:
      unknown[] = [
        recordId,
      ];

    if (
      names.has(
        'company_id',
      )
    ) {
      params.push(
        context.companyId,
      );

      conditions.push(
        'company_id = $2',
      );
    }

    if (
      names.has(
        'deleted_at',
      )
    ) {
      conditions.push(
        'deleted_at IS NULL',
      );
    }

    const current =
      await client.query(
        'SELECT ' +
        quoteIdentifier(
          field,
        ) +
        ' AS workflow_state FROM ' +
        quoteIdentifier(
          context.table,
        ) +
        ' WHERE ' +
        conditions.join(
          ' AND ',
        ) +
        ' FOR UPDATE',
        params,
      );

    if (
      current.rows.length !==
        1
    ) {
      throw new EnterpriseModuleError(
        'RECORD_NOT_FOUND',
        'The record was not found in the current company.',
      );
    }

    currentStatus =
      normalizeKey(
        current.rows[0]
          .workflow_state,
      );

    const transitions =
      getEnterpriseWorkflowTransitions(
        context.moduleKey,
        context.table,
        currentStatus,
        databaseAllowedValues,
      );

    if (
      !transitions.some(
        transition =>
          transition.value ===
          nextStatus,
      )
    ) {
      throw new EnterpriseModuleError(
        'WORKFLOW_TRANSITION_INVALID',
        'That workflow transition is not allowed from the current state.',
        {
          currentStatus,
          allowedTransitions:
            transitions.map(
              transition =>
                transition.value,
            ),
        },
      );
    }

    await validateEnterpriseTransition(
      client,
      context,
      context.table,
      recordId,
      nextStatus,
    );

    const setters = [
      quoteIdentifier(
        field,
      ) +
      ' = $' +
      (
        params.length +
        1
      ),
    ];

    params.push(
      nextStatus,
    );

    if (
      names.has(
        'updated_by',
      )
    ) {
      params.push(
        context.userId,
      );

      setters.push(
        'updated_by = $' +
        params.length,
      );
    }

    if (
      names.has(
        'updated_at',
      )
    ) {
      setters.push(
        'updated_at = NOW()',
      );
    }

    if (
      context.moduleKey ===
        'time_off' &&
      context.table ===
        'leave_requests' &&
      field ===
        'status' &&
      nextStatus ===
        'approved' &&
      names.has(
        'approved_at',
      )
    ) {
      setters.push(
        'approved_at = NOW()',
      );
    }

    if (
      context.moduleKey ===
        'manufacturing' &&
      context.table ===
        'manufacturing_orders'
    ) {
      if (
        nextStatus ===
          'in_progress' &&
        names.has(
          'actual_start_date',
        )
      ) {
        setters.push(
          'actual_start_date = COALESCE(actual_start_date, CURRENT_DATE)',
        );
      }

      if (
        nextStatus ===
          'completed' &&
        names.has(
          'actual_end_date',
        )
      ) {
        setters.push(
          'actual_end_date = CURRENT_DATE',
        );
      }
    }

    const changed =
      await client.query(
        'UPDATE ' +
        quoteIdentifier(
          context.table,
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

    await client.query(
      'COMMIT',
    );

    const output =
      rowOutput(
        changed.rows[0],
      );

    await recordEnterpriseAudit({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        context.moduleKey +
        '.workflow.transitioned',
      eventType:
        'workflow.transitioned',
      category:
        'business',
      severity:
        [
          'cancelled',
          'rejected',
          'failed',
          'void',
        ].includes(
          nextStatus,
        )
          ? 'warning'
          : 'info',
      summary:
        context.manifest.name +
        ' workflow moved from ' +
        currentStatus +
        ' to ' +
        nextStatus +
        '.',
      resourceType:
        context.table,
      resourceId:
        recordId,
      entityType:
        context.table,
      entityId:
        recordId,
      module:
        context.moduleKey,
      result:
        'success',
      metadata: {
        table:
          context.table,
        statusField:
          field,
      },
      changes: {
        [
          field
        ]: {
          from:
            currentStatus,
          to:
            nextStatus,
        },
      },
    });

    await emitEnterpriseAutomationEvent(
      context,
      {
        triggerKey:
          context.moduleKey +
          '.workflow.transitioned',
        table:
          context.table,
        record:
          changed.rows[0],
        idempotencySeed:
          String(
            changed.rows[0]
              ?.updated_at ||
            recordId +
              ':' +
              nextStatus,
          ),
        payload: {
          statusField:
            field,
          previousStatus:
            currentStatus,
          currentStatus:
            nextStatus,
        },
      },
    );

    return {
      record:
        output,
      currentStatus:
        nextStatus,
    };
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
}


export async function getEnterpriseModuleRelationOptions(
  moduleKey:
    string,
  input: {
    table?: unknown;
    field?: unknown;
    query?: unknown;
    selected?: unknown;
  },
) {
  const context =
    await assertTable(
      moduleKey,
      input.table,
      'view',
    );

  const field =
    normalizeKey(
      input.field,
    );

  if (
    !field
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Choose a related field.',
    );
  }

  const definitions =
    await getEnterpriseRelationDefinitions(
      context.pool,
      context.table,
    );

  const definition =
    definitions.get(
      field,
    );

  if (
    !definition
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'This field does not expose a selectable business relationship.',
    );
  }

  const query =
    typeof input.query ===
      'string'
      ? input.query
      : '';

  const selected =
    typeof input.selected ===
      'string'
      ? input.selected
      : null;

  return {
    field,
    label:
      definition.label,
    options:
      await listEnterpriseRelationOptions(
        context.pool,
        definition,
        context.companyId,
        query,
        selected,
        30,
      ),
  };
}


export async function searchEnterpriseModuleRecords(
  moduleKey:
    string,
  query:
    string,
  limit =
    12,
) {
  const context =
    await requireContext(
      moduleKey,
      'view',
    );

  const term =
    query
      .trim()
      .slice(
        0,
        120,
      );

  if (
    !term
  ) {
    return [];
  }

  const tables =
    enterpriseModuleTables(
      context.moduleKey,
    )
      .slice(
        0,
        6,
      );

  const metadata =
    await tableMetadata(
      context.pool,
      tables,
    );

  const results:
    Array<{
      table: string;
      id: string;
      title: string;
      subtitle: string | null;
    }> =
      [];

  for (
    const table
    of tables
  ) {
    const fields =
      metadata.get(
        table,
      ) ||
      [];

    if (
      fields.length ===
        0
    ) {
      continue;
    }

    assertEnterpriseTableBoundaryReady(
      table,
      fields,
    );

    const names =
      new Set(
        fields.map(
          field =>
            field.key,
        ),
      );

    if (
      !names.has(
        'id',
      )
    ) {
      continue;
    }

    const searchable =
      fields
        .filter(
          field =>
            !DISPLAY_SKIP.has(
              field.key,
            ) &&
            !SENSITIVE_COLUMN.test(
              field.key,
            ) &&
            (
              field.inputType ===
                'text' ||
              field.inputType ===
                'textarea'
            ),
        )
        .slice(
          0,
          6,
        );

    if (
      searchable.length ===
        0
    ) {
      continue;
    }

    const params:
      unknown[] =
        [];

    const conditions:
      string[] =
        [];

    if (
      names.has(
        'company_id',
      )
    ) {
      params.push(
        context.companyId,
      );

      conditions.push(
        'company_id = $' +
        params.length,
      );
    }

    if (
      names.has(
        'deleted_at',
      )
    ) {
      conditions.push(
        'deleted_at IS NULL',
      );
    }

    params.push(
      '%' +
      term +
      '%',
    );

    const searchIndex =
      params.length;

    conditions.push(
      '(' +
      searchable
        .map(
          field =>
            quoteIdentifier(
              field.key,
            ) +
            '::text ILIKE $' +
            searchIndex,
        )
        .join(
          ' OR ',
        ) +
      ')',
    );

    params.push(
      Math.max(
        1,
        Math.min(
          8,
          Math.floor(
            limit,
          ),
        ),
      ),
    );

    const titleField =
      searchable.find(
        field =>
          /(^|_)(name|title|subject|number|code)$/.test(
            field.key,
          ),
      ) ||
      searchable[0];

    const subtitleField =
      searchable.find(
        field =>
          field.key !==
            titleField.key,
      );

    const data =
      await context.pool.query(
        'SELECT id, ' +
        quoteIdentifier(
          titleField.key,
        ) +
        ' AS title' +
        (
          subtitleField
            ? (
                ', ' +
                quoteIdentifier(
                  subtitleField.key,
                ) +
                ' AS subtitle'
              )
            : (
                ', NULL::text AS subtitle'
              )
        ) +
        ' FROM ' +
        quoteIdentifier(
          table,
        ) +
        ' WHERE ' +
        conditions.join(
          ' AND ',
        ) +
        ' LIMIT $' +
        params.length,
        params,
      );

    for (
      const row
      of data.rows
    ) {
      results.push({
        table,
        id:
          String(
            row.id,
          ),
        title:
          String(
            row.title ||
            label(
              table,
            ),
          ),
        subtitle:
          row.subtitle
            ? String(
                row.subtitle,
              )
            : null,
      });

      if (
        results.length >=
          limit
      ) {
        return results;
      }
    }
  }

  return results;
}



const ENTERPRISE_BULK_LIMIT =
  50;


function bulkItems(
  value:
    unknown,
) {
  if (
    !Array.isArray(
      value,
    ) ||
    value.length ===
      0
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Add at least one record to the bulk action.',
    );
  }

  if (
    value.length >
      ENTERPRISE_BULK_LIMIT
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Bulk actions are limited to ' +
      ENTERPRISE_BULK_LIMIT +
      ' records at a time.',
    );
  }

  return value;
}


export async function bulkCreateEnterpriseModuleRecords(
  moduleKey:
    string,
  input: {
    table?: unknown;
    rows?: unknown;
  },
) {
  const rows =
    bulkItems(
      input.rows,
    );

  const results:
    Array<
      {
        index: number;
        success: boolean;
        record?: Record<string, unknown>;
        error?: string;
      }
    > =
    [];

  for (
    let index =
      0;
    index <
      rows.length;
    index +=
      1
  ) {
    const row =
      rows[index];

    if (
      !row ||
      typeof row !==
        'object' ||
      Array.isArray(
        row,
      )
    ) {
      results.push({
        index,
        success:
          false,
        error:
          'Row must be a record object.',
      });
      continue;
    }

    const candidate =
      row as
        Record<
          string,
          unknown
        >;

    try {
      const record =
        await createEnterpriseModuleRecord(
          moduleKey,
          {
            table:
              input.table,
            values:
              candidate.values,
            idempotencyKey:
              candidate.idempotencyKey,
          },
        );

      results.push({
        index,
        success:
          true,
        record:
          record as
            Record<
              string,
              unknown
            >,
      });
    } catch (
      error
    ) {
      results.push({
        index,
        success:
          false,
        error:
          error instanceof
            Error
            ? error.message
            : 'SaMi could not create this imported row.',
      });
    }
  }

  return {
    total:
      results.length,
    succeeded:
      results.filter(
        item =>
          item.success,
      ).length,
    failed:
      results.filter(
        item =>
          !item.success,
      ).length,
    results,
  };
}


export async function bulkDeleteEnterpriseModuleRecords(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordIds?: unknown;
  },
) {
  const recordIds =
    bulkItems(
      input.recordIds,
    );

  const results:
    Array<
      {
        recordId: string;
        success: boolean;
        error?: string;
      }
    > =
    [];

  for (
    const raw
    of recordIds
  ) {
    const recordId =
      String(
        raw ||
        '',
      )
        .trim();

    if (
      !recordId
    ) {
      continue;
    }

    try {
      await deleteEnterpriseModuleRecord(
        moduleKey,
        {
          table:
            input.table,
          recordId,
        },
      );

      results.push({
        recordId,
        success:
          true,
      });
    } catch (
      error
    ) {
      results.push({
        recordId,
        success:
          false,
        error:
          error instanceof
            Error
            ? error.message
            : 'SaMi could not delete this record.',
      });
    }
  }

  return {
    total:
      results.length,
    succeeded:
      results.filter(
        item =>
          item.success,
      ).length,
    failed:
      results.filter(
        item =>
          !item.success,
      ).length,
    results,
  };
}


export async function bulkTransitionEnterpriseModuleRecords(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordIds?: unknown;
    statusField?: unknown;
    nextStatus?: unknown;
  },
) {
  const recordIds =
    bulkItems(
      input.recordIds,
    );

  const results:
    Array<
      {
        recordId: string;
        success: boolean;
        error?: string;
      }
    > =
    [];

  for (
    const raw
    of recordIds
  ) {
    const recordId =
      String(
        raw ||
        '',
      )
        .trim();

    if (
      !recordId
    ) {
      continue;
    }

    try {
      await transitionEnterpriseModuleRecord(
        moduleKey,
        {
          table:
            input.table,
          recordId,
          statusField:
            input.statusField,
          nextStatus:
            input.nextStatus,
        },
      );

      results.push({
        recordId,
        success:
          true,
      });
    } catch (
      error
    ) {
      results.push({
        recordId,
        success:
          false,
        error:
          error instanceof
            Error
            ? error.message
            : 'SaMi could not transition this record.',
      });
    }
  }

  return {
    total:
      results.length,
    succeeded:
      results.filter(
        item =>
          item.success,
      ).length,
    failed:
      results.filter(
        item =>
          !item.success,
      ).length,
    results,
  };
}
