import type { Pool } from "pg";
import { Parser } from "node-sql-parser";

const parser = new Parser();

export async function discoverSchema(pool: Pool) {
  const tables = await pool.query(`
    SELECT
      t.table_name,
      c.column_name,
      c.data_type
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON c.table_name=t.table_name
     AND c.table_schema=t.table_schema
    WHERE t.table_schema='public'
      AND t.table_type='BASE TABLE'
    ORDER BY t.table_name,c.ordinal_position
  `);

  const foreignKeys = await pool.query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name=kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name=tc.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY'
      AND tc.table_schema='public'
  `);

  return {
    tables: tables.rows,
    relationships: foreignKeys.rows,
  };
}

export function validateSQL(sql: string) {
  const ast = parser.astify(sql);

  const list = Array.isArray(ast) ? ast : [ast];

  for (const stmt of list) {
    if (stmt.type !== "select") {
      throw new Error("Only SELECT statements are allowed.");
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
  ];

  const lower = sql.toLowerCase();

  for (const word of blocked) {
    if (lower.includes(word)) {
      throw new Error(`Blocked SQL keyword: ${word}`);
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