import 'server-only';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  getAdditionalModuleDataTables,
} from '@/lib/apps/runtime-data-tables';

import {
  getSamiModuleManifest,
  getSamiModuleManifests,
} from '@/lib/modules/registry';

import type {
  SamiDataLifecycleContext,
  SamiModuleDataLifecycleHandler,
  SamiModuleDataExportResult,
} from '@/lib/data-lifecycle/types';


const IDENTIFIER =
  /^[a-z_][a-z0-9_]*$/;

const SECRET_COLUMN =
  /(password|passwd|secret|token|credential|private|otp|verification|salt|hash|api[_-]?key|access[_-]?key|refresh[_-]?key|session[_-]?key)/i;

const HIDDEN_COLUMN =
  new Set([
    'tenant_id',
    'company_id',
    'created_by',
    'updated_by',
    'metadata',
  ]);

const MAX_ROWS_PER_TABLE =
  10_000;

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
      'Unsafe SaMi export identifier.',
    );
  }

  return (
    '"' +
    value +
    '"'
  );
}


function tablesForModule(
  moduleKey:
    string,
) {
  const manifest =
    getSamiModuleManifest(
      moduleKey,
    );

  if (
    !manifest
  ) {
    return [];
  }

  return [
    ...new Set([
      ...manifest.resources
        .map(
          resource =>
            resource.table,
        )
        .filter(
          (
            table,
          ): table is string =>
            typeof table ===
              'string' &&
            IDENTIFIER.test(
              table,
            ),
        ),
      ...getAdditionalModuleDataTables(
        moduleKey,
      ),
    ]),
  ];
}


async function exportTable(
  context:
    SamiDataLifecycleContext,
  table:
    string,
) {
  if (
    !context.companyId
  ) {
    return {
      table,
      records:
        [],
      recordCount:
        0,
      truncated:
        false,
      omitted:
        'company_not_selected',
    };
  }

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const columns =
    await pool.query<{
      column_name:
        string;
    }>(
      `
        SELECT
          column_name
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
    columns.rows.length ===
      0
  ) {
    return {
      table,
      records:
        [],
      recordCount:
        0,
      truncated:
        false,
      omitted:
        'table_not_installed',
    };
  }

  const names =
    new Set(
      columns.rows.map(
        row =>
          row.column_name,
      ),
    );

  if (
    !names.has(
      'company_id',
    )
  ) {
    return {
      table,
      records:
        [],
      recordCount:
        0,
      truncated:
        false,
      omitted:
        'company_boundary_not_ready',
    };
  }

  const visibleColumns =
    columns.rows
      .map(
        row =>
          row.column_name,
      )
      .filter(
        column =>
          !HIDDEN_COLUMN.has(
            column,
          ) &&
          !SECRET_COLUMN.test(
            column,
          ),
      );

  if (
    visibleColumns.length ===
      0
  ) {
    return {
      table,
      records:
        [],
      recordCount:
        0,
      truncated:
        false,
      omitted:
        'no_exportable_fields',
    };
  }

  const conditions = [
    'company_id = $1',
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

  const orderBy =
    names.has(
      'created_at',
    )
      ? quoteIdentifier(
          'created_at',
        ) +
        ' ASC' +
        (
          names.has(
            'id',
          )
            ? ', ' +
              quoteIdentifier(
                'id',
              ) +
              ' ASC'
            : ''
        )
      : names.has(
          'id',
        )
        ? quoteIdentifier(
            'id',
          ) +
          ' ASC'
        : quoteIdentifier(
            visibleColumns[0],
          ) +
          ' ASC';

  const result =
    await pool.query(
      'SELECT ' +
      visibleColumns
        .map(
          quoteIdentifier,
        )
        .join(
          ', ',
        ) +
      ' FROM ' +
      quoteIdentifier(
        table,
      ) +
      ' WHERE ' +
      conditions.join(
        ' AND ',
      ) +
      ' ORDER BY ' +
      orderBy +
      ' LIMIT $2',
      [
        context.companyId,
        MAX_ROWS_PER_TABLE +
          1,
      ],
    );

  const truncated =
    result.rows.length >
      MAX_ROWS_PER_TABLE;

  return {
    table,
    records:
      result.rows
        .slice(
          0,
          MAX_ROWS_PER_TABLE,
        )
        .map(
          row =>
            Object.fromEntries(
              Object.entries(
                row,
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
            ),
        ),
    recordCount:
      Math.min(
        result.rows.length,
        MAX_ROWS_PER_TABLE,
      ),
    truncated,
    omitted:
      null,
  };
}


async function exportModule(
  moduleKey:
    string,
  context:
    SamiDataLifecycleContext,
): Promise<
  SamiModuleDataExportResult
> {
  if (
    !context
      .accessibleModuleKeys
      .includes(
        moduleKey,
      )
  ) {
    throw new Error(
      'Module export is outside the current workspace access boundary.',
    );
  }

  const tables =
    tablesForModule(
      moduleKey,
    );

  const data =
    [];

  for (
    const table
    of tables
  ) {
    data.push(
      await exportTable(
        context,
        table,
      ),
    );
  }

  return {
    moduleKey,
    version:
      '1.0',
    generatedAt:
      new Date()
        .toISOString(),
    data: {
      companyId:
        context.companyId,
      maxRowsPerTable:
        MAX_ROWS_PER_TABLE,
      tables:
        data,
    },
  };
}


const MODULE_KEYS =
  getSamiModuleManifests()
    .filter(
      manifest =>
        manifest.installable &&
        manifest.extensions
          .dataExport,
    )
    .map(
      manifest =>
        manifest.key,
    );


export const SUITE_DATA_LIFECYCLE_HANDLERS:
  readonly SamiModuleDataLifecycleHandler[] =
  MODULE_KEYS.map(
    moduleKey => ({
      moduleKey,
      exportData:
        context =>
          exportModule(
            moduleKey,
            context,
          ),
    }),
  );
