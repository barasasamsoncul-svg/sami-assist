import type { Pool } from "pg";

export type BusinessTable = { table_name: string; columns: string[] };
export type BusinessForeignKey = {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
};
export type BusinessSchema = {
  tables: BusinessTable[];
  foreignKeys: BusinessForeignKey[];
};

function cleanValue(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && value.length > 1000)
    return value.substring(0, 1000) + "...";
  return value;
}

export async function getBusinessSchema(pool: Pool): Promise<BusinessSchema> {
  const columns = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name NOT IN ('messages','conversations','ai_memory')
    ORDER BY table_name, ordinal_position
  `);

  const fks = await pool.query(`
    SELECT tc.table_name, kcu.column_name,
           ccu.table_name AS foreign_table_name,
           ccu.column_name AS foreign_column_name
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

  const map = new Map<string,string[]>();
  for (const row of columns.rows) {
    if (!map.has(row.table_name)) map.set(row.table_name, []);
    map.get(row.table_name)!.push(row.column_name);
  }

  return {
    tables: [...map.entries()].map(([table_name, columns]) => ({table_name, columns})),
    foreignKeys: fks.rows,
  };
}

export function schemaToPrompt(schema: BusinessSchema): string {
  const tables = schema.tables.length
    ? schema.tables.map(t => `TABLE "${t.table_name}"\nCOLUMNS: ${t.columns.join(", ")}`).join("\n\n")
    : "No business application tables are installed.";

  const relations = schema.foreignKeys.length
    ? schema.foreignKeys.map(f =>
        `"${f.table_name}"."${f.column_name}" -> "${f.foreign_table_name}"."${f.foreign_column_name}"`
      ).join("\n")
    : "No foreign-key relationships found.";

  return `BUSINESS DATABASE SCHEMA\n\n${tables}\n\nFOREIGN-KEY RELATIONSHIPS\n${relations}`;
}

export function validateReadOnlySql(sql: string): string {
  let q = sql.trim()
    .replace(/^```(?:sql)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!q) throw new Error("AI did not produce a SQL query.");
  if (q.includes(";")) throw new Error("Multiple SQL statements are not allowed.");
  if (!/^(SELECT|WITH)\b/i.test(q))
    throw new Error("Only SELECT or WITH queries are allowed.");

  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|VACUUM|CALL|DO|EXECUTE|PREPARE|SET|RESET|PG_SLEEP)\b/i.test(q))
    throw new Error("Unsafe SQL was rejected.");

  if (/\b(pg_catalog|information_schema|pg_toast)\b/i.test(q))
    throw new Error("System catalogs are not allowed.");

  if (q.length > 12000) throw new Error("Generated SQL is too large.");
  return q;
}

export async function executeBusinessQuery(
  pool: Pool, sql: string
): Promise<Record<string,unknown>[]> {
  const safe = validateReadOnlySql(sql);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    await client.query("SET LOCAL lock_timeout = '1000ms'");
    await client.query("SET TRANSACTION READ ONLY");

    const result = await client.query(safe);
    await client.query("ROLLBACK");

    return result.rows.map(row => {
      const clean: Record<string,unknown> = {};
      for (const [k,v] of Object.entries(row)) clean[k] = cleanValue(v);
      return clean;
    });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
