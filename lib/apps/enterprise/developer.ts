import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  enterpriseModuleTables,
  isEnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';

import {
  getSamiModuleManifest,
} from '@/lib/modules/registry';

import type {
  DeveloperApiContext,
} from '@/lib/developer/auth';


const IDENTIFIER =
  /^[a-z_][a-z0-9_]*$/;

const SENSITIVE_COLUMN =
  /(password|passwd|secret|token|credential|private|otp|verification|salt|hash|api[_-]?key|access[_-]?key|refresh[_-]?key|session[_-]?key|bank[_-]?details|bank[_-]?account|routing[_-]?number)/i;

const HIDDEN_COLUMN =
  new Set([
    'company_id',
    'tenant_id',
    'created_by',
    'updated_by',
    'deleted_at',
    'metadata',
    'settings',
  ]);


export class EnterpriseDeveloperApiError
  extends Error {
  constructor(
    public readonly code:
      | 'APP_NOT_ALLOWED'
      | 'APP_NOT_AVAILABLE'
      | 'TABLE_NOT_ALLOWED'
      | 'TABLE_NOT_READY',
    public readonly status:
      number,
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'EnterpriseDeveloperApiError';
  }
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
    throw new EnterpriseDeveloperApiError(
      'TABLE_NOT_ALLOWED',
      400,
      'The requested business table is invalid.',
    );
  }

  return (
    '"' +
    value +
    '"'
  );
}


function boundedInteger(
  value:
    string |
    null |
    undefined,
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

  return Math.max(
    min,
    Math.min(
      max,
      Math.trunc(
        parsed,
      ),
    ),
  );
}


function allowedModuleTables(
  moduleKey:
    string,
) {
  const manifest =
    getSamiModuleManifest(
      moduleKey,
    );

  const manifestTables =
    manifest
      ?.resources
      .map(
        resource =>
          resource.table,
      )
      .filter(
        (
          table,
        ): table is
          string =>
          typeof table ===
            'string' &&
          IDENTIFIER.test(
            table,
          ),
      ) ||
    [];

  const enterpriseTables =
    isEnterpriseModuleKey(
      moduleKey,
    )
      ? enterpriseModuleTables(
          moduleKey,
        )
      : [];

  return [
    ...new Set([
      ...manifestTables,
      ...enterpriseTables,
    ]),
  ];
}


async function assertInstalled(
  tenantId:
    string,
  moduleKey:
    string,
) {
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
          AND tm.deleted_at
              IS NULL
          AND m.deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  m.status,
                  ''
                )
              ) =
              'active'
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
        tenantId,
        moduleKey,
      ],
    );

  if (
    installed.rows.length !==
      1
  ) {
    throw new EnterpriseDeveloperApiError(
      'APP_NOT_AVAILABLE',
      404,
      'The requested app is not installed in this workspace.',
    );
  }
}


async function assertContext(
  context:
    DeveloperApiContext,
  moduleKeyInput:
    string,
) {
  const moduleKey =
    moduleKeyInput
      .trim()
      .toLowerCase();

  const manifest =
    getSamiModuleManifest(
      moduleKey,
    );

  if (
    !manifest ||
    manifest.extensions
      .apiEndpoints !==
      true
  ) {
    throw new EnterpriseDeveloperApiError(
      'APP_NOT_AVAILABLE',
      404,
      'This app has not enabled developer API access.',
    );
  }

  if (
    !context.allowedAppKeys
      .includes(
        moduleKey,
      )
  ) {
    throw new EnterpriseDeveloperApiError(
      'APP_NOT_ALLOWED',
      403,
      'This API credential is not allowed to access the requested app.',
    );
  }

  const tables =
    allowedModuleTables(
      moduleKey,
    );

  if (
    tables.length ===
      0
  ) {
    throw new EnterpriseDeveloperApiError(
      'APP_NOT_AVAILABLE',
      404,
      'This app has no developer-readable business resources.',
    );
  }

  await assertInstalled(
    context.tenantId,
    moduleKey,
  );

  return {
    moduleKey,
    manifest,
    tables,
  };
}


type Column = {
  column_name:
    string;
  data_type:
    string;
};


async function columnsForTable(
  tenantId:
    string,
  table:
    string,
) {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const result =
    await pool.query<Column>(
      `
        SELECT
          column_name,
          data_type
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
    throw new EnterpriseDeveloperApiError(
      'TABLE_NOT_READY',
      409,
      'The selected app table is not ready in this workspace.',
    );
  }

  const names =
    new Set(
      result.rows.map(
        row =>
          row.column_name,
      ),
    );

  if (
    !names.has(
      'company_id',
    )
  ) {
    throw new EnterpriseDeveloperApiError(
      'TABLE_NOT_READY',
      409,
      'The selected table has not completed company-boundary hardening.',
    );
  }

  const visible =
    result.rows
      .filter(
        row =>
          !HIDDEN_COLUMN.has(
            row.column_name,
          ) &&
          !SENSITIVE_COLUMN.test(
            row.column_name,
          ),
      )
      .map(
        row => ({
          key:
            row.column_name,
          dataType:
            row.data_type,
        }),
      );

  if (
    visible.length ===
      0
  ) {
    throw new EnterpriseDeveloperApiError(
      'TABLE_NOT_READY',
      409,
      'This table has no developer-safe fields.',
    );
  }

  return {
    names,
    visible,
  };
}


export async function listDeveloperAppRecords(
  context:
    DeveloperApiContext,
  input: {
    moduleKey:
      string;
    table?:
      string |
      null;
    limit?:
      string |
      null;
    offset?:
      string |
      null;
  },
) {
  const app =
    await assertContext(
      context,
      input.moduleKey,
    );

  const requestedTable =
    (
      input.table ||
      ''
    )
      .trim()
      .toLowerCase();

  const table =
    requestedTable ||
    app.tables[0];

  if (
    !table ||
    !app.tables.some(
      candidate =>
        candidate ===
        table,
    )
  ) {
    throw new EnterpriseDeveloperApiError(
      'TABLE_NOT_ALLOWED',
      400,
      'Choose a table owned by the requested app.',
    );
  }

  const metadata =
    await columnsForTable(
      context.tenantId,
      table,
    );

  const limit =
    boundedInteger(
      input.limit,
      50,
      1,
      100,
    );

  const offset =
    boundedInteger(
      input.offset,
      0,
      0,
      10_000,
    );

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const fields =
    metadata.visible
      .map(
        field =>
          quoteIdentifier(
            field.key,
          ),
      )
      .join(
        ', ',
      );

  const conditions = [
    'company_id = $1',
  ];

  if (
    metadata.names.has(
      'deleted_at',
    )
  ) {
    conditions.push(
      'deleted_at IS NULL',
    );
  }

  const order =
    metadata.names.has(
      'created_at',
    )
      ? quoteIdentifier(
          'created_at',
        ) +
        ' DESC' +
        (
          metadata.names.has(
            'id',
          )
            ? ', ' +
              quoteIdentifier(
                'id',
              ) +
              ' DESC'
            : ''
        )
      : metadata.names.has(
          'id',
        )
        ? quoteIdentifier(
            'id',
          ) +
          ' DESC'
        : quoteIdentifier(
            metadata.visible[0]
              .key,
          ) +
          ' ASC';

  const result =
    await pool.query(
      'SELECT ' +
      fields +
      ' FROM ' +
      quoteIdentifier(
        table,
      ) +
      ' WHERE ' +
      conditions.join(
        ' AND ',
      ) +
      ' ORDER BY ' +
      order +
      ' LIMIT $2 OFFSET $3',
      [
        context.companyId,
        limit +
          1,
        offset,
      ],
    );

  const hasMore =
    result.rows.length >
      limit;

  return {
    app: {
      key:
        app.moduleKey,
      name:
        app.manifest.name,
    },
    table,
    availableTables:
      app.tables,
    fields:
      metadata.visible,
    records:
      result.rows.slice(
        0,
        limit,
      ),
    pagination: {
      limit,
      offset,
      nextOffset:
        hasMore
          ? offset +
            limit
          : null,
      hasMore,
    },
  };
}
