import type { Pool } from "pg";

export type ColumnInfo = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

export type ForeignKeyInfo = {
  table_name: string;
  column_name: string;
  foreign_table: string;
  foreign_column: string;
};

export type BusinessSchema = {
  tables: ColumnInfo[];
  relationships: ForeignKeyInfo[];
};

const INTERNAL_TABLES = new Set([
  "messages",
  "conversations",
  "ai_memory",
  "ai_actions",
]);

export async function discoverSchema(pool: Pool): Promise<BusinessSchema> {
  const tables = await pool.query<ColumnInfo>(`
    SELECT c.table_name, c.column_name, c.data_type,
           c.is_nullable, c.column_default
    FROM information_schema.columns c
    INNER JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `);

  const relationships = await pool.query<ForeignKeyInfo>(`
    SELECT tc.table_name, kcu.column_name,
           ccu.table_name AS foreign_table,
           ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
  `);

  return {
    tables: tables.rows.filter((x) => !INTERNAL_TABLES.has(x.table_name)),
    relationships: relationships.rows.filter(
      (x) =>
        !INTERNAL_TABLES.has(x.table_name) &&
        !INTERNAL_TABLES.has(x.foreign_table),
    ),
  };
}

export function schemaToPrompt(schema: BusinessSchema): string {
  const grouped = new Map<string, ColumnInfo[]>();

  for (const column of schema.tables) {
    const list = grouped.get(column.table_name) ?? [];
    list.push(column);
    grouped.set(column.table_name, list);
  }

  const tables = [...grouped.entries()]
    .map(([table, columns]) => {
      const fields = columns
        .map(
          (c) =>
            `  - ${c.column_name} (${c.data_type}, nullable=${c.is_nullable}, default=${c.column_default ?? "none"})`,
        )
        .join("\n");
      return `TABLE: ${table}\n${fields}`;
    })
    .join("\n\n");

  const relationships = schema.relationships.length
    ? schema.relationships
        .map(
          (r) =>
            `- ${r.table_name}.${r.column_name} -> ${r.foreign_table}.${r.foreign_column}`,
        )
        .join("\n")
    : "No foreign-key relationships.";

  return `BUSINESS DATABASE SCHEMA\n\n${tables || "No business tables."}\n\nRELATIONSHIPS\n${relationships}`;
}

export function getTableColumns(
  schema: BusinessSchema,
  table: string,
): Set<string> {
  return new Set(
    schema.tables
      .filter((x) => x.table_name === table)
      .map((x) => x.column_name),
  );
}

export function hasTable(schema: BusinessSchema, table: string): boolean {
  return schema.tables.some((x) => x.table_name === table);
}
