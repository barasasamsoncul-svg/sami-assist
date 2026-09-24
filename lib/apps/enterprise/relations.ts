import 'server-only';

import type {
  Pool,
} from 'pg';

import {
  ENTERPRISE_MODULE_TABLES,
} from '@/lib/apps/enterprise/catalog';


const IDENTIFIER =
  /^[a-z_][a-z0-9_]*$/;


const SAFE_RELATION_TABLES =
  new Set<string>(
    Object.values(
      ENTERPRISE_MODULE_TABLES,
    ).flatMap(
      tables => [
        ...tables,
      ],
    ),
  );


const TEXT_TYPES =
  new Set([
    'character varying',
    'character',
    'text',
    'citext',
  ]);


const LABEL_PRIORITY = [
  'name',
  'title',
  'full_name',
  'display_name',
  'number',
  'code',
  'reference',
  'email',
  'sku',
  'description',
  'subject',
] as const;


type RelationColumn = {
  column_name:
    string;
  data_type:
    string;
};


export type EnterpriseRelationDefinition = {
  field:
    string;
  targetTable:
    string;
  targetColumn:
    string;
  labelColumn:
    string;
  secondaryColumn:
    string |
    null;
  companyScoped:
    boolean;
  softDelete:
    boolean;
  label:
    string;
};


export type EnterpriseRelationOption = {
  value:
    string;
  label:
    string;
  secondary:
    string |
    null;
};


function q(
  value:
    string,
) {
  if (
    !IDENTIFIER.test(
      value,
    )
  ) {
    throw new Error(
      'Unsafe relationship identifier.',
    );
  }

  return (
    '"' +
    value +
    '"'
  );
}


function humanize(
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


function relationLabel(
  table:
    string,
) {
  const words =
    table.split(
      '_',
    );

  const last =
    words[
      words.length -
        1
    ];

  if (
    last &&
    last.length >
      3 &&
    last.endsWith(
      'ies',
    )
  ) {
    words[
      words.length -
        1
    ] =
      last.slice(
        0,
        -3,
      ) +
      'y';
  } else if (
    last &&
    last.length >
      2 &&
    last.endsWith(
      's',
    ) &&
    !last.endsWith(
      'ss',
    )
  ) {
    words[
      words.length -
        1
    ] =
      last.slice(
        0,
        -1,
      );
  }

  return humanize(
    words.join(
      '_',
    ),
  );
}


function chooseLabelColumn(
  columns:
    RelationColumn[],
) {
  const textColumns =
    columns.filter(
      column =>
        TEXT_TYPES.has(
          column.data_type,
        ),
    );

  for (
    const preferred
    of LABEL_PRIORITY
  ) {
    const exact =
      textColumns.find(
        column =>
          column.column_name ===
          preferred,
      );

    if (
      exact
    ) {
      return exact
        .column_name;
    }
  }

  const businessNamed =
    textColumns.find(
      column =>
        /(^|_)(name|title|number|code|reference|email|sku|description|subject)$/.test(
          column.column_name,
        ),
    );

  return businessNamed
    ?.column_name ||
    null;
}


function chooseSecondaryColumn(
  columns:
    RelationColumn[],
  labelColumn:
    string,
) {
  const textColumns =
    columns.filter(
      column =>
        TEXT_TYPES.has(
          column.data_type,
        ) &&
        column.column_name !==
          labelColumn,
    );

  for (
    const preferred
    of [
      'code',
      'number',
      'email',
      'sku',
      'reference',
      'description',
      'name',
      'title',
    ]
  ) {
    const exact =
      textColumns.find(
        column =>
          column.column_name ===
          preferred,
      );

    if (
      exact
    ) {
      return exact
        .column_name;
    }
  }

  return null;
}


export async function getEnterpriseRelationDefinitions(
  pool:
    Pick<
      Pool,
      'query'
    >,
  table:
    string,
) {
  if (
    !IDENTIFIER.test(
      table,
    )
  ) {
    return new Map<
      string,
      EnterpriseRelationDefinition
    >();
  }

  const foreignKeys =
    await pool.query<{
      column_name:
        string;
      foreign_table:
        string;
      foreign_column:
        string;
    }>(
      `
        SELECT
          kcu.column_name,
          ccu.table_name
            AS foreign_table,
          ccu.column_name
            AS foreign_column
        FROM information_schema.table_constraints tc
        INNER JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name =
             kcu.constraint_name
         AND tc.constraint_schema =
             kcu.constraint_schema
        INNER JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name =
             tc.constraint_name
         AND ccu.constraint_schema =
             tc.constraint_schema
        WHERE tc.constraint_type =
              'FOREIGN KEY'
          AND tc.table_schema =
              'public'
          AND tc.table_name =
              $1
      `,
      [
        table,
      ],
    );

  const definitions =
    new Map<
      string,
      EnterpriseRelationDefinition
    >();

  for (
    const foreignKey
    of foreignKeys.rows
  ) {
    if (
      !IDENTIFIER.test(
        foreignKey.column_name,
      ) ||
      !IDENTIFIER.test(
        foreignKey.foreign_table,
      ) ||
      !IDENTIFIER.test(
        foreignKey.foreign_column,
      ) ||
      !SAFE_RELATION_TABLES.has(
        foreignKey.foreign_table,
      )
    ) {
      continue;
    }

    const columnResult =
      await pool.query<
        RelationColumn
      >(
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
          foreignKey.foreign_table,
        ],
      );

    const columnNames =
      new Set(
        columnResult.rows.map(
          column =>
            column.column_name,
        ),
      );

    if (
      !columnNames.has(
        foreignKey.foreign_column,
      )
    ) {
      continue;
    }

    const labelColumn =
      chooseLabelColumn(
        columnResult.rows,
      );

    if (
      !labelColumn
    ) {
      continue;
    }

    definitions.set(
      foreignKey.column_name,
      {
        field:
          foreignKey.column_name,
        targetTable:
          foreignKey.foreign_table,
        targetColumn:
          foreignKey.foreign_column,
        labelColumn,
        secondaryColumn:
          chooseSecondaryColumn(
            columnResult.rows,
            labelColumn,
          ),
        companyScoped:
          columnNames.has(
            'company_id',
          ),
        softDelete:
          columnNames.has(
            'deleted_at',
          ),
        label:
          relationLabel(
            foreignKey.foreign_table,
          ),
      },
    );
  }

  return definitions;
}


export async function listEnterpriseRelationOptions(
  pool:
    Pick<
      Pool,
      'query'
    >,
  definition:
    EnterpriseRelationDefinition,
  companyId:
    string,
  query:
    string,
  selectedValue:
    string |
    null,
  limit =
    30,
): Promise<
  EnterpriseRelationOption[]
> {
  const params:
    unknown[] =
      [];

  const conditions:
    string[] =
      [];

  if (
    definition.companyScoped
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
    definition.softDelete
  ) {
    conditions.push(
      'deleted_at IS NULL',
    );
  }

  const term =
    query
      .trim()
      .slice(
        0,
        100,
      );

  if (
    term
  ) {
    params.push(
      '%' +
      term +
      '%',
    );

    const searchParam =
      '$' +
      params.length;

    const searchable = [
      q(
        definition.labelColumn,
      ) +
      '::text ILIKE ' +
      searchParam,
    ];

    if (
      definition.secondaryColumn
    ) {
      searchable.push(
        q(
          definition.secondaryColumn,
        ) +
        '::text ILIKE ' +
        searchParam,
      );
    }

    conditions.push(
      '(' +
      searchable.join(
        ' OR ',
      ) +
      ')',
    );
  }

  const safeSelected =
    selectedValue
      ?.trim()
      .slice(
        0,
        150,
      ) ||
    null;

  let selectedParam:
    string |
    null =
      null;

  if (
    safeSelected
  ) {
    params.push(
      safeSelected,
    );

    selectedParam =
      '$' +
      params.length;
  }

  params.push(
    Math.max(
      1,
      Math.min(
        50,
        Math.floor(
          limit,
        ),
      ),
    ),
  );

  const limitParam =
    '$' +
    params.length;

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

  const order =
    selectedParam
      ? (
          ' ORDER BY CASE WHEN ' +
          q(
            definition.targetColumn,
          ) +
          '::text = ' +
          selectedParam +
          ' THEN 0 ELSE 1 END, ' +
          q(
            definition.labelColumn,
          ) +
          ' ASC NULLS LAST'
        )
      : (
          ' ORDER BY ' +
          q(
            definition.labelColumn,
          ) +
          ' ASC NULLS LAST'
        );

  const result =
    await pool.query(
      'SELECT ' +
      q(
        definition.targetColumn,
      ) +
      '::text AS value, ' +
      q(
        definition.labelColumn,
      ) +
      '::text AS label, ' +
      (
        definition.secondaryColumn
          ? (
              q(
                definition.secondaryColumn,
              ) +
              '::text'
            )
          : 'NULL::text'
      ) +
      ' AS secondary FROM ' +
      q(
        definition.targetTable,
      ) +
      where +
      order +
      ' LIMIT ' +
      limitParam,
      params,
    );

  return result.rows.map(
    row => ({
      value:
        String(
          row.value,
        ),
      label:
        String(
          row.label ||
          (
            'Unnamed ' +
            definition.label
          ),
        ),
      secondary:
        row.secondary
          ? String(
              row.secondary,
            )
          : null,
    }),
  );
}


export async function validateEnterpriseRelationValues(
  pool:
    Pick<
      Pool,
      'query'
    >,
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
  const definitions =
    await getEnterpriseRelationDefinitions(
      pool,
      table,
    );

  for (
    const [
      field,
      definition,
    ]
    of definitions
  ) {
    if (
      !values.has(
        field,
      )
    ) {
      continue;
    }

    const value =
      values.get(
        field,
      );

    if (
      value ===
        null ||
      value ===
        undefined ||
      value ===
        ''
    ) {
      continue;
    }

    const params:
      unknown[] = [
        String(
          value,
        ),
      ];

    const conditions = [
      q(
        definition.targetColumn,
      ) +
      '::text = $1',
    ];

    if (
      definition.companyScoped
    ) {
      params.push(
        companyId,
      );

      conditions.push(
        'company_id = $2',
      );
    }

    if (
      definition.softDelete
    ) {
      conditions.push(
        'deleted_at IS NULL',
      );
    }

    const result =
      await pool.query(
        'SELECT 1 FROM ' +
        q(
          definition.targetTable,
        ) +
        ' WHERE ' +
        conditions.join(
          ' AND ',
        ) +
        ' LIMIT 1',
        params,
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new Error(
        'Choose a valid ' +
        definition.label +
        ' from the current company.',
      );
    }
  }
}
