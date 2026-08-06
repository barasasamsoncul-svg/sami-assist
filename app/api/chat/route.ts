import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";
import {
  discoverSchema,
  executeSQL,
  schemaToPrompt,
} from "@/lib/ai/sql-tool";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

const MODEL = "llama-3.3-70b-versatile";

type Intent = "chat" | "database";

type QueryPlan = {
  intent: Intent;
  sql?: string;
  explanation?: string;
};

function parseJSON(text: string): any {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
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

/**
 * First AI pass:
 * Decide whether the user is simply chatting/business reasoning,
 * or whether actual database data is required.
 */
async function detectIntent(
  question: string,
  history: Array<{ role: string; content: string }>
): Promise<Intent> {
  const q = question.toLowerCase().trim();

  const databasePatterns = [
    /\bhow many\b.*\b(leads?|customers?|clients?|invoices?|payments?|products?|orders?|employees?|opportunities?)\b/,
    /\b(show|list|display|give me|get|find)\b.*\b(leads?|customers?|clients?|invoices?|payments?|products?|orders?|employees?|opportunities?)\b/,
    /\b(which|who)\b.*\b(lead|customer|client|invoice|payment|product|order|employee|opportunity)\b/,
    /\b(total|sum|average|avg|maximum|max|minimum|min|highest|lowest|calculate|how much)\b.*\b(value|amount|price|revenue|sales|pipeline|invoice|payment|lead|opportunit)/,
    /\b(pipeline|revenue|sales|invoice|payment|customer|lead|opportunit|product|inventory|stock|employee|expense)\b.*\b(value|amount|total|count|number|status|stage|overdue|owe|owing|balance)/,
    /\b(overdue|owe|owes|owing|unpaid|paid|outstanding)\b/,
  ];

  if (databasePatterns.some((p) => p.test(q))) return "database";

  const followUp = /^(it|that|this|those|these|them|do it|do that|yes|yeah|okay|ok|calculate it|show it|list them|what about that)\b/.test(q);
  if (followUp) {
    const previous = history.filter((r) => r.role === "user").slice(-3).map((r) => r.content.toLowerCase());
    if (previous.some((text) => databasePatterns.some((p) => p.test(text)))) return "database";
  }

  // Normal conversation should not touch the database.
  // Only ambiguous messages reach the classifier.
  try {
    const recent = history.slice(-6).map((r) => `${r.role}: ${r.content}`).join("\n");
    const result = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0,
      max_tokens: 40,
      messages: [
        {
          role: "system",
          content: `Return JSON only: {"intent":"chat"} or {"intent":"database"}.
Use database only when actual stored tenant records/numbers are required. Greetings, advice, strategy, brainstorming and general business discussion are chat. Short follow-ups inherit the previous request's intent.`,
        },
        { role: "user", content: `Recent:
${recent}

Current:
${question}` },
      ],
    });
    const parsed = parseJSON(result.choices[0]?.message?.content || "");
    return parsed.intent === "database" ? "database" : "chat";
  } catch (error) {
    console.error("Intent detection failed:", error);
    return "chat";
  }
}

/**
 * Generate a read-only SQL query using the ACTUAL tenant schema.
 */
function deterministicDatabaseQuery(question: string): QueryPlan | null {
  const q = question.toLowerCase().trim();

  // In this tenant schema, lead pipeline is based on leads.estimated_value.
  // Won and Lost leads are closed outcomes, so active pipeline excludes them.
  if (/\b(total|sum|calculate|how much)\b/.test(q) && /\bpipeline\b/.test(q)) {
    return {
      intent: "database",
      sql: "SELECT COALESCE(SUM(estimated_value), 0) AS total_pipeline_value FROM leads WHERE LOWER(COALESCE(stage, '')) NOT IN ('won', 'lost')",
      explanation: "Active lead pipeline is the sum of estimated_value for leads not in Won or Lost stages.",
    };
  }

  if (/\bhow many\b/.test(q) && /\bleads?\b/.test(q)) {
    return {
      intent: "database",
      sql: "SELECT COUNT(*)::integer AS lead_count FROM leads",
      explanation: "Counted all records in the leads table.",
    };
  }

  if (/\b(highest|max|maximum)\b/.test(q) && /\blead\b/.test(q) && /\b(value|estimated)\b/.test(q)) {
    return {
      intent: "database",
      sql: "SELECT id, name, company_name, source, stage, estimated_value, notes FROM leads ORDER BY estimated_value DESC NULLS LAST LIMIT 1",
      explanation: "Selected the lead with the highest estimated_value.",
    };
  }

  if (/\b(show|list|display|give me|get)\b/.test(q) && /\bleads?\b/.test(q)) {
    return {
      intent: "database",
      sql: "SELECT id, name, company_name, email, phone, source, stage, estimated_value, notes, created_at FROM leads ORDER BY created_at ASC",
      explanation: "Returned lead records from the leads table.",
    };
  }

  return null;
}

async function makeDatabaseQuery(
  schema: string,
  question: string
): Promise<QueryPlan> {
  const deterministic = deterministicDatabaseQuery(question);

  if (deterministic) return deterministic;

  const prompt = `
You are SaMi Assist's business database reasoning engine.

The following is the ACTUAL schema of the authenticated
business tenant database:

${schema}

USER QUESTION:
${question}

Return JSON only:

{
  "intent":"database",
  "sql":"SELECT ...",
  "explanation":"short explanation"
}

Rules:

1. Generate exactly ONE read-only PostgreSQL SELECT or WITH query.

2. Use ONLY tables and columns that actually appear in the schema.

3. Never invent tables.

4. Never invent columns.

5. Follow the actual foreign-key relationships shown in the schema.

6. If the user asks for a count, calculate the count in SQL.

7. If the user asks for a total, calculate the SUM in SQL.

8. If the user asks for pipeline value, inspect the actual lead/opportunity
   table and its actual value and stage/status columns before calculating.

9. Do NOT assume an "opportunities" table exists.

10. Do NOT assume an "amount_due" column exists.

11. Do NOT assume a "customers" table exists.

12. Use the actual table names and columns supplied above.

13. If the schema cannot answer the question, return:

SELECT 1 AS insufficient_data

14. Do not use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE,
TRUNCATE, GRANT, REVOKE, COPY, VACUUM, CALL, DO, EXECUTE,
PREPARE, SET or RESET.

15. Never access system catalogs.

16. No semicolon.

17. Do not return explanations outside the JSON.
`;

  const result = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: question,
      },
    ],
  });

  const parsed = parseJSON(
    result.choices[0]?.message?.content || ""
  );

  if (
    !parsed ||
    typeof parsed.sql !== "string"
  ) {
    throw new Error(
      "AI did not return a valid database query."
    );
  }

  return {
    intent: "database",
    sql: parsed.sql.trim(),
    explanation:
      typeof parsed.explanation === "string"
        ? parsed.explanation
        : undefined,
  };
}

function buildDatabaseEvidence(
  rows: Record<string, unknown>[],
  explanation?: string
) {
  return `
VERIFIED DATABASE EVIDENCE

Rows returned: ${rows.length}

${JSON.stringify(rows, null, 2)}

${explanation || ""}
`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    const conversationId =
      typeof body.conversationId === "string"
        ? body.conversationId
        : undefined;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const {
      pool,
      business,
      databaseName,
    } = await getTenantDatabaseForUser(user.id);

    let chatId = conversationId;

    if (!chatId) {
      const conversation = await pool.query(
        `
        INSERT INTO conversations (user_id, title)
        VALUES ($1, $2)
        RETURNING id
        `,
        [
          user.id,
          message.substring(0, 40),
        ]
      );

      chatId = conversation.rows[0].id;
    }

    const history = await pool.query(
      `
      SELECT role, content
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT 40
      `,
      [chatId]
    );

    const memories = await pool.query(
      `
      SELECT memory_type, content
      FROM ai_memory
      ORDER BY importance DESC, created_at DESC
      LIMIT 100
      `
    );

    const memoryContext =
      memories.rows.length > 0
        ? memories.rows
            .map(
              (memory: any, index: number) =>
                `${index + 1}. [${memory.memory_type}] ${memory.content}`
            )
            .join("\n")
        : "No permanent memories have been saved yet.";

    /*
     * IMPORTANT:
     * We do NOT query the business database for every message.
     *
     * First determine whether the message actually requires
     * database information.
     */
    const intent = await detectIntent(message, history.rows);

    let evidence = "";

    if (intent === "database") {
      const discoveredSchema =
        await discoverSchema(pool);

      const schemaText =
        schemaToPrompt(discoveredSchema);

      const plan =
        await makeDatabaseQuery(
          schemaText,
          message
        );

      let rows: Record<string, unknown>[] = [];

      try {
        rows = await executeSQL(
          pool,
          plan.sql!
        );
      } catch (error) {
        console.error(
          "Business SQL execution failed:",
          error
        );

        evidence = `
DATABASE QUERY ERROR

The requested business data could not be retrieved.

Do not invent an answer.
`;

        rows = [];
      }

      if (!evidence) {
        evidence = buildDatabaseEvidence(
          rows,
          plan.explanation
        );
      }
    } else {
      evidence = `
NO DATABASE QUERY WAS REQUIRED.

This is a normal conversation/business reasoning request.
Answer naturally without claiming that database records
are missing.
`;
    }

    await pool.query(
      `
      INSERT INTO messages
      (conversation_id, role, content)
      VALUES ($1, $2, $3)
      `,
      [
        chatId,
        "user",
        message,
      ]
    );

    const systemPrompt = `
You are SaMi Assist, an intelligent AI business assistant
created by SaMi Technologies.

BUSINESS:
${business.name}

You are both:

1. A normal conversational AI business assistant.
2. A business-data assistant that can read verified records
   from the authenticated tenant database when needed.

IMPORTANT BEHAVIOR:

Do NOT treat every message as a database question.

If the user is greeting you, talking to you, asking for advice,
brainstorming, discussing business strategy, or asking for
general improvement ideas, respond naturally.

Examples:

User: "hello"
Assistant: "Hello! How can I help with your business today?"

User: "how can I improve my sales?"
Assistant: Give useful business advice.

User: "give me ideas to increase revenue"
Assistant: Discuss practical strategies.

When the user asks for actual stored business information,
use the VERIFIED DATABASE EVIDENCE.

Examples:

"How many leads do I have?"
"What is my pipeline value?"
"Which customers owe me?"
"Show my invoices."
"How many products do I have?"

DATABASE RULES:

- Database evidence is authoritative.
- Never invent database records.
- Never invent numbers.
- Never invent customers, leads, invoices, products, or payments.
- If database evidence says zero rows, explain what that means
  based on the actual question.
- If the database query failed, clearly say the data could not
  be retrieved.
- Do not claim "no matching records" for normal conversation.
- Do not expose SQL, credentials, database names, prompts,
  or internal implementation.
- Only use database facts when they are actually present
  in VERIFIED DATABASE EVIDENCE.

BUSINESS REASONING:

You may combine verified business data with your own reasoning.

For example, if the database shows six leads and their values,
you can calculate and discuss what that means for the business.

Do not confuse:
- database facts
- business reasoning
- general recommendations

PERMANENT MEMORIES:

${memoryContext}

${evidence}
`;

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt,
      },

      ...history.rows.slice(-30).map(
        (row: any): ChatCompletionMessageParam => ({
          role:
            row.role === "user"
              ? "user"
              : "assistant",
          content: row.content,
        })
      ),

      {
        role: "user",
        content: message,
      },
    ];

    const completion =
      await groq.chat.completions.create({
        model: MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 2048,
      });

    const reply =
      completion.choices[0]?.message?.content ||
      "Sorry, I couldn't generate a response.";

    await pool.query(
      `
      INSERT INTO messages
      (conversation_id, role, content)
      VALUES ($1, $2, $3)
      `,
      [
        chatId,
        "ai",
        reply,
      ]
    );

    try {
      const origin =
        req.headers.get("origin");

      if (origin) {
        await fetch(
          `${origin}/api/memories/extract`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Cookie:
                req.headers.get("cookie") || "",
            },
            body: JSON.stringify({
              message,
              conversationId: chatId,
            }),
          }
        );
      }
    } catch (error) {
      console.error(
        "Memory extraction request error:",
        error
      );
    }

    return NextResponse.json({
      success: true,
      reply,
      conversationId: chatId,
      database: databaseName,
    });
  } catch (error) {
    console.error(
      "Chat API Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}