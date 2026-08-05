import { Pool } from "pg";

type ColumnInfo = {
  column_name: string;
  data_type: string;
};

type TableInfo = {
  table_name: string;
};

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizeIdentifier(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export async function getTenantDatabaseSchema(pool: Pool) {
  const result = await pool.query<TableInfo>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
    `
  );

  const tables: Record<string, ColumnInfo[]> = {};

  for (const table of result.rows) {
    const columns = await pool.query<ColumnInfo>(
      `
      SELECT
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
      `,
      [table.table_name]
    );

    tables[table.table_name] = columns.rows;
  }

  return tables;
}

export async function queryTenantBusinessData(
  pool: Pool,
  args: {
    table: string;
    columns?: string[];
    search?: string;
    limit?: number;
  }
) {
  const table = normalizeIdentifier(args.table);

  if (!table) {
    throw new Error("A table name is required.");
  }

  const schema = await getTenantDatabaseSchema(pool);

  if (!schema[table]) {
    throw new Error(
      `The table "${table}" does not exist in this business database.`
    );
  }

  const availableColumns = schema[table].map(
    (column) => column.column_name
  );

  let selectedColumns =
    Array.isArray(args.columns) && args.columns.length > 0
      ? args.columns
          .map(normalizeIdentifier)
          .filter((column) =>
            availableColumns.includes(column)
          )
      : availableColumns;

  if (selectedColumns.length === 0) {
    selectedColumns = availableColumns;
  }

  const safeLimit = Math.min(
    Math.max(Number(args.limit) || 50, 1),
    100
  );

  const quotedTable = quoteIdentifier(table);

  const quotedColumns = selectedColumns.map(
    quoteIdentifier
  );

  const values: string[] = [];
  let whereClause = "";

  const search = normalizeIdentifier(args.search);

  if (search) {
    const textColumns = schema[table]
      .filter((column) =>
        [
          "character varying",
          "text",
          "character",
        ].includes(column.data_type)
      )
      .map((column) => column.column_name);

    if (textColumns.length > 0) {
      const conditions = textColumns.map(
        (column, index) => {
          values.push(search);
          return `${quoteIdentifier(
            column
          )} ILIKE '%' || $${index + 1} || '%'`;
        }
      );

      whereClause = `WHERE ${conditions.join(" OR ")}`;
    }
  }

  const query = `
    SELECT ${quotedColumns.join(", ")}
    FROM ${quotedTable}
    ${whereClause}
    ORDER BY 1 DESC
    LIMIT ${safeLimit}
  `;

  const result = await pool.query(
    query,
    values
  );

  return {
    table,
    columns: selectedColumns,
    rowCount: result.rowCount || 0,
    rows: result.rows,
  };
}

export function formatSchemaForAI(
  schema: Record<string, ColumnInfo[]>
) {
  const entries = Object.entries(schema);

  if (entries.length === 0) {
    return "No business tables are available.";
  }

  return entries
    .map(
      ([table, columns]) =>
        `${table}: ${columns
          .map(
            (column) =>
              `${column.column_name} (${column.data_type})`
          )
          .join(", ")}`
    )
    .join("\n");
}
