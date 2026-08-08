import type { Pool } from "pg";
import { Parser } from "node-sql-parser";

const parser = new Parser();

const BLOCKED = [
  "insert", "update", "delete", "drop", "alter", "truncate",
  "grant", "revoke", "copy", "vacuum", "analyze", "refresh",
  "comment", "call", "do", "execute", "prepare", "set", "reset",
];

function cleanValue(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && value.length > 2000) {
    return `${value.slice(0, 2000)}...`;
  }
  return value;
}

export function validateReadSql(sql: string): string {
 const cleaned = sql.trim().replace(/;+\s*$/, "");

  if (!cleaned) throw new Error("SQL query is empty.");
  if (cleaned.includes(";")) {
    throw new Error("Multiple SQL statements are not allowed.");
  }

  const ast = parser.astify(cleaned);
  const statements = Array.isArray(ast) ? ast : [ast];

  for (const statement of statements) {
    if (statement.type !== "select") {
      throw new Error("Only SELECT statements are allowed for reads.");
    }
  }

  for (const word of BLOCKED) {
    if (new RegExp(`\\b${word}\\b`, "i").test(cleaned)) {
      throw new Error(`Blocked SQL keyword: ${word}`);
    }
  }

  if (/\b(pg_catalog|information_schema|pg_toast)\b/i.test(cleaned)) {
    throw new Error("System catalogs are not allowed.");
  }

  if (/\b(pg_sleep|dblink|lo_import|lo_export)\b/i.test(cleaned)) {
    throw new Error("Unsafe database function rejected.");
  }

  if (cleaned.length > 12000) {
    throw new Error("Generated SQL is too large.");
  }

  return cleaned;
}

export async function executeRead(
  pool: Pool,
  sql: string,
  params: unknown[] = [],
) {
  const safe = validateReadSql(sql);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    await client.query("SET LOCAL lock_timeout = '1000ms'");
    await client.query("SET TRANSACTION READ ONLY");

    const result = await client.query(safe, params);
    await client.query("COMMIT");

    return {
      rows: result.rows.map((row) => {
        const clean: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          clean[key] = cleanValue(value);
        }
        return clean;
      }),
      rowCount: result.rowCount ?? 0,
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function executeWrite(
  pool: Pool,
  sql: string,
  params: unknown[] = [],
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    await client.query("SET LOCAL lock_timeout = '1000ms'");

    const result = await client.query(sql, params);
    await client.query("COMMIT");

    return {
      rows: result.rows.map((row) => {
        const clean: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          clean[key] = cleanValue(value);
        }
        return clean;
      }),
      rowCount: result.rowCount ?? 0,
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
