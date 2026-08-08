import Groq from "groq-sdk";
import type { Pool } from "pg";
import {
  discoverSchema,
  schemaToPrompt,
  getTableColumns,
  hasTable,
} from "./schema";
import { executeRead } from "./executor";
import type { QueryPlan } from "./types";

const groq = new Groq({
  apiKey: process.env.GROQ_AI_API_KEY || process.env.GROQ_API_KEY!,
});

const MODEL =
  process.env.SAMI_AI_MODEL || "llama-3.3-70b-versatile";

function parseJson(text: string): any {
  const cleaned = text
    .trim()
    .replace(/^`(?:json)?\s*/i, "")
    .replace(/\s*`$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("AI returned invalid JSON.");
    }
    return JSON.parse(match[0]);
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function safeValue(value: unknown): unknown {
  if (typeof value === "string" && value.length > 5000) {
    return value.slice(0, 5000);
  }

  return value;
}

function validateWritePlan(
  plan: QueryPlan,
  schema: Awaited<ReturnType<typeof discoverSchema>>,
): void {
  if (!plan.write) {
    throw new Error("Write plan is missing.");
  }

  if (!["create", "update"].includes(plan.write.operation)) {
    throw new Error(
      "Only create and update operations are supported.",
    );
  }

  if (!hasTable(schema, plan.write.table)) {
    throw new Error(
      `Table "${plan.write.table}" does not exist.`,
    );
  }

  const columns = getTableColumns(schema, plan.write.table);
  const values = plan.write.values ?? {};

  if (!Object.keys(values).length) {
    throw new Error("No fields were supplied for the write.");
  }

  for (const key of Object.keys(values)) {
    if (!columns.has(key)) {
      throw new Error(
        `Column "${key}" does not exist on "${plan.write.table}".`,
      );
    }
  }

  if (plan.write.operation === "update") {
    const where = plan.write.where ?? {};

    if (!Object.keys(where).length) {
      throw new Error(
        "Updates require a specific record filter.",
      );
    }

    for (const key of Object.keys(where)) {
      if (!columns.has(key)) {
        throw new Error(
          `Filter column "${key}" does not exist on "${plan.write.table}".`,
        );
      }
    }
  }
}

function buildWriteSql(plan: QueryPlan): {
  sql: string;
  params: unknown[];
} {
  const write = plan.write!;

  const values = Object.entries(write.values ?? {});
  const params: unknown[] = [];

  if (write.operation === "create") {
    const columns = values
      .map(([key]) => quoteIdentifier(key))
      .join(", ");

    const placeholders = values
      .map(([, value], index) => {
        params.push(safeValue(value));
        return `$${index + 1}`;
      })
      .join(", ");

    return {
      sql: `INSERT INTO ${quoteIdentifier(
        write.table,
      )} (${columns}) VALUES (${placeholders}) RETURNING *`,
      params,
    };
  }

  const assignments = values
    .map(([key, value], index) => {
      params.push(safeValue(value));
      return `${quoteIdentifier(key)} = $${index + 1}`;
    })
    .join(", ");

  const filters = Object.entries(write.where ?? {}).map(
    ([key, value]) => {
      params.push(safeValue(value));
      return `${quoteIdentifier(key)} = $${params.length}`;
    },
  );

  return {
    sql: `UPDATE ${quoteIdentifier(
      write.table,
    )} SET ${assignments} WHERE ${filters.join(
      " AND ",
    )} RETURNING *`,
    params,
  };
}

export async function dispatchRead(
  pool: Pool,
  question: string,
): Promise<{
  plan: QueryPlan;
  result: {
    rows: Record<string, unknown>[];
    rowCount: number;
  };
  schema: Awaited<ReturnType<typeof discoverSchema>>;
}> {
  const schema = await discoverSchema(pool);

  const result = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content: `
You generate ONE read-only PostgreSQL SELECT query for SaMi Assist.

Use only the exact tables and columns in the supplied schema.
Never invent schema.
Never modify data.
No semicolons.
No system catalogs.
If the question cannot be answered from the schema, return SELECT 1 AS insufficient_data.

Return JSON only:
{"sql":"SELECT ...","explanation":"short explanation"}

${schemaToPrompt(schema)}
        `.trim(),
      },
      {
        role: "user",
        content: question,
      },
    ],
  });

  const parsed = parseJson(
    result.choices[0]?.message?.content || "",
  );

  if (typeof parsed.sql !== "string") {
    throw new Error("AI did not return a valid read query.");
  }

  const plan: QueryPlan = {
    intent: "read",
    sql: parsed.sql.trim(),
    explanation:
      typeof parsed.explanation === "string"
        ? parsed.explanation
        : "Retrieved verified business data.",
  };

  return {
    plan,
    result: await executeRead(pool, plan.sql!),
    schema,
  };
}

export async function planWrite(
  pool: Pool,
  question: string,
): Promise<{
  plan: QueryPlan;
  sql: string;
  params: unknown[];
  preview: string;
}> {
  const schema = await discoverSchema(pool);

  const result = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 1600,
    messages: [
      {
        role: "system",
        content: `
You are SaMi Assist's business record change planner.

The user wants to CREATE or UPDATE a business record.

Use only the actual schema below.

Return JSON only:
{
  "intent":"write",
  "explanation":"short explanation",
  "write":{
    "operation":"create" | "update",
    "table":"exact_table_name",
    "values":{"exact_column":"value"},
    "where":{"exact_column":"exact_record_identifier"}
  }
}

Rules:

- Never delete records.
- Only create or update.
- Never invent tables or columns.
- UPDATE requires a specific record filter.
- Never change IDs unless explicitly requested.
- Never change created_at unless explicitly requested.
- Never guess an important missing value.
- The plan is NOT executed until the user confirms.

${schemaToPrompt(schema)}
        `.trim(),
      },
      {
        role: "user",
        content: question,
      },
    ],
  });

  const parsed = parseJson(
    result.choices[0]?.message?.content || "",
  );

  const plan = parsed as QueryPlan;

  if (plan.intent !== "write" || !plan.write) {
    throw new Error("AI did not return a valid write plan.");
  }

  validateWritePlan(plan, schema);

  const built = buildWriteSql(plan);

  return {
    plan,
    sql: built.sql,
    params: built.params,
    preview: [
      `Action: ${plan.write.operation.toUpperCase()}`,
      `Table: ${plan.write.table}`,
      `Fields: ${JSON.stringify(plan.write.values ?? {})}`,
      plan.write.where
        ? `Record filter: ${JSON.stringify(plan.write.where)}`
        : "",
      `Reason: ${plan.explanation}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}