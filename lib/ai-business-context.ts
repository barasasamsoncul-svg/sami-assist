import type { Pool } from "pg";

type TableInfo = {
  table_name: string;
  columns: string[];
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "about",
  "what",
  "show",
  "tell",
  "me",
  "my",
  "our",
  "business",
  "data",
  "please",
  "can",
  "you",
  "give",
  "get",
  "how",
  "many",
  "much",
  "is",
  "are",
  "was",
  "were",
  "do",
  "does",
  "of",
  "in",
  "on",
  "to",
  "from",
  "with",
  "a",
  "an",
]);

function tokenize(text: string): string[] {
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
  )];
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function scoreTable(
  table: TableInfo,
  words: string[]
): number {
  const tableWords = tokenize(table.table_name.replace(/_/g, " "));

  let score = 0;

  for (const word of words) {
    if (tableWords.includes(word)) {
      score += 10;
    }

    if (
      tableWords.some(
        (tableWord) =>
          tableWord.includes(word) ||
          word.includes(tableWord)
      )
    ) {
      score += 4;
    }

    for (const column of table.columns) {
      const columnWords = tokenize(column.replace(/_/g, " "));

      if (columnWords.includes(word)) {
        score += 3;
      }

      if (
        columnWords.some(
          (columnWord) =>
            columnWord.includes(word) ||
            word.includes(columnWord)
        )
      ) {
        score += 1;
      }
    }
  }

  return score;
}

async function getTenantTables(
  pool: Pool
): Promise<TableInfo[]> {
  const result = await pool.query(`
    SELECT
      c.table_name,
      c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name NOT IN (
        'messages',
        'conversations',
        'ai_memory'
      )
    ORDER BY c.table_name, c.ordinal_position
  `);

  const tables = new Map<string, string[]>();

  for (const row of result.rows) {
    if (!tables.has(row.table_name)) {
      tables.set(row.table_name, []);
    }

    tables.get(row.table_name)!.push(row.column_name);
  }

  return [...tables.entries()].map(
    ([table_name, columns]) => ({
      table_name,
      columns,
    })
  );
}

function cleanValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "string" &&
    value.length > 500
  ) {
    return value.substring(0, 500) + "...";
  }

  if (
    typeof value === "object"
  ) {
    try {
      const json = JSON.stringify(value);

      if (json.length > 1000) {
        return json.substring(0, 1000) + "...";
      }

      return value;
    } catch {
      return String(value);
    }
  }

  return value;
}

async function readTable(
  pool: Pool,
  table: TableInfo,
  limit = 50
) {
  const tableName = quoteIdentifier(table.table_name);

  const result = await pool.query(
    `SELECT * FROM ${tableName} LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => {
    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      cleaned[key] = cleanValue(value);
    }

    return cleaned;
  });
}

export async function getBusinessDataContext(
  pool: Pool,
  userMessage: string
): Promise<string> {
  const tables = await getTenantTables(pool);

  if (tables.length === 0) {
    return "No business application tables are currently available.";
  }

  const words = tokenize(userMessage);

  const scored = tables
    .map((table) => ({
      table,
      score: scoreTable(table, words),
    }))
    .sort((a, b) => b.score - a.score);

  const relevant = scored
    .filter((item) => item.score > 0)
    .slice(0, 6);

  const selected =
    relevant.length > 0
      ? relevant
      : scored.slice(0, 4);

  const sections: string[] = [];

  sections.push(
    "AVAILABLE BUSINESS TABLES:\n" +
      tables
        .map(
          (table) =>
            `- ${table.table_name}: ${table.columns.join(", ")}`
        )
        .join("\n")
  );

  for (const item of selected) {
    try {
      const rows = await readTable(
        pool,
        item.table,
        50
      );

      sections.push(
        `\nTABLE: ${item.table.table_name}\n` +
          `COLUMNS: ${item.table.columns.join(", ")}\n` +
          `ROWS (${rows.length}):\n` +
          JSON.stringify(rows, null, 2)
      );
    } catch (error) {
      console.error(
        `Could not read table ${item.table.table_name}:`,
        error
      );
    }
  }

  return sections.join("\n");
}
