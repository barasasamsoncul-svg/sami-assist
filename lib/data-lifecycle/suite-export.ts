import 'server-only';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  ENTERPRISE_MODULE_TABLES,
  type EnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';

import type {
  SamiDataLifecycleContext,
  SamiDataLifecycleHandler,
  SamiModuleDataExportResult,
} from '@/lib/data-lifecycle/registry';


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

const DEDICATED_EXPORT_TABLES = {
  invoicing: [
    'invoicing_payment_terms',
    'invoicing_tax_rates',
    'invoicing_customers',
    'invoicing_catalog_items',
    'invoicing_templates',
    'invoicing_sequences',
    'invoicing_settings',
    'invoicing_invoices',
    'invoicing_invoice_items',
    'invoicing_status_history',
    'invoicing_payments',
    'invoicing_payment_allocations',
    'invoicing_credit_notes',
    'invoicing_credit_note_items',
    'invoicing_recurring_templates',
    'invoicing_reminders',
    'invoicing_delivery_log',
    'invoicing_events',
  ],
  sales: [
    'sales_settings',
    'sales_sequences',
    'sales_quote_templates',
    'sales_quotes',
    'sales_quote_items',
    'sales_orders_v2',
    'sales_order_items_v2',
    'sales_order_invoice_batches',
    'sales_quote_approval_history',
    'sales_quote_status_history',
    'sales_order_status_history',
    'sales_delivery_log',
  ],
} as const;


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
  if (
    moduleKey ===
      'invoicing'
  ) {
    return [
      ...DEDICATED_EXPORT_TABLES
        .invoicing,
    ];
  }

  if (
    moduleKey ===
      'sales'
  ) {
    return [
      ...DEDICATED_EXPORT_TABLES
        .sales,
    ];
  }

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        ENTERPRISE_MODULE_TABLES,
        moduleKey,
      )
  ) {
    return [
      ...ENTERPRISE_MODULE_TABLES[
        moduleKey as
          EnterpriseModuleKey
      ],
    ];
  }

  return [];
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


const MODULE_KEYS = [
  ...Object.keys(
    ENTERPRISE_MODULE_TABLES,
  ),
  'invoicing',
  'sales',
] as const;


export const SUITE_DATA_LIFECYCLE_HANDLERS:
  readonly SamiDataLifecycleHandler[] =
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
