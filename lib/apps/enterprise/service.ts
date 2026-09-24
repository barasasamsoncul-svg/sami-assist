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
  inputType:
    | 'text'
    | 'textarea'
    | 'number'
    | 'checkbox'
    | 'date'
    | 'datetime'
    | 'json';
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
  metrics: {
    totalRecords: number;
    tables: number;
    activeTables: number;
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
  | 'DELETE_NOT_SUPPORTED';


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
      /w/g,
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
        row.is_generated &&
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
          !system,
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
    metrics: {
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

  return {
    ...context,
    table,
    fields,
  };
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
  },
) {
  const context =
    await assertTable(
      moduleKey,
      input.table,
      'create',
    );

  const values =
    writableValues(
      input.values,
      context.fields,
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

  const result =
    await context.pool.query(
      sql,
      entries.map(
        ([
          _key,
          value,
        ]) =>
          value,
      ),
    );

  return rowOutput(
    result.rows[0] ||
    {},
  );
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

  const result =
    await context.pool.query(
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

  return rowOutput(
    result.rows[0],
  );
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

  const result =
    await context.pool.query(
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
      ' RETURNING id',
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

  return {
    deleted:
      true,
    id:
      String(
        result.rows[0].id,
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
