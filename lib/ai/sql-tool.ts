import type { Pool } from "pg";
import { Parser } from "node-sql-parser";

const parser = new Parser();

export type DatabaseSchema = {
  tables: {
    table_name: string;
    column_name: string;
    data_type: string;
  }[];
  relationships: {
    table_name: string;
    column_name: string;
    foreign_table: string;
    foreign_column: string;
  }[];
};

export async function discoverSchema(
  pool: Pool
): Promise<DatabaseSchema> {
  const tables = await pool.query(`
    SELECT
      t.table_name,
      c.column_name,
      c.data_type
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON c.table_name = t.table_name
      AND c.table_schema = t.table_schema
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name, c.ordinal_position
  `);

  const foreignKeys = await pool.query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
  `);

  return {
    tables: tables.rows,
    relationships: foreignKeys.rows,
  };
}

/**
 * Converts the actual database schema into a format
 * the AI can reason about.
 */
export function schemaToPrompt(
  schema: DatabaseSchema
): string {
  const grouped = new Map<
    string,
    { column_name: string; data_type: string }[]
  >();

  for (const column of schema.tables) {
    if (!grouped.has(column.table_name)) {
      grouped.set(column.table_name, []);
    }

    grouped.get(column.table_name)!.push({
      column_name: column.column_name,
      data_type: column.data_type,
    });
  }

  const tableText = [...grouped.entries()]
    .map(([tableName, columns]) => {
      const columnText = columns
        .map(
          (column) =>
            `  - ${column.column_name} (${column.data_type})`
        )
        .join("\n");

      return `TABLE: ${tableName}\n${columnText}`;
    })
    .join("\n\n");

  const relationshipText =
    schema.relationships.length > 0
      ? schema.relationships
          .map(
            (relationship) =>
              `- ${relationship.table_name}.${relationship.column_name} -> ${relationship.foreign_table}.${relationship.foreign_column}`
          )
          .join("\n")
      : "No foreign-key relationships were found.";

  return `
DATABASE SCHEMA

${tableText}

RELATIONSHIPS

${relationshipText}
`;
}

/**
 * Strict read-only SQL validation.
 */
export function validateSQL(sql: string): true {
  const cleaned = sql.trim();

  if (!cleaned) {
    throw new Error("SQL query is empty.");
  }

  if (cleaned.includes(";")) {
    throw new Error("Multiple SQL statements are not allowed.");
  }

  const ast = parser.astify(cleaned);
  const statements = Array.isArray(ast) ? ast : [ast];

  for (const statement of statements) {
    if (statement.type !== "select") {
      throw new Error(
        "Only SELECT statements are allowed."
      );
    }
  }

  const blocked = [
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "truncate",
    "grant",
    "revoke",
    "create",
    "replace",
    "merge",
    "call",
    "execute",
    "prepare",
    "vacuum",
    "analyze",
    "refresh",
    "comment",
  ];

  const lower = cleaned.toLowerCase();

  for (const word of blocked) {
    const pattern = new RegExp(
      `\\b${word}\\b`,
      "i"
    );

    if (pattern.test(lower)) {
      throw new Error(
        `Blocked SQL keyword: ${word}`
      );
    }
  }

  return true;
}

export async function executeSQL(
  pool: Pool,
  sql: string
) {
  validateSQL(sql);

  const result = await pool.query(sql);

  return result.rows;
}