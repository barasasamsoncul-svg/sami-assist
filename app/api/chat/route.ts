import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

import {
  discoverSchema,
  executeSQL,
  validateSQL,
} from "@/lib/ai/sql-tool";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

const MODEL = "llama-3.3-70b-versatile";

type QueryPlan = {
  sql: string;
  explanation?: string;
};

function parsePlan(text: string): { sql: string; explanation?: string } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: any;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("AI returned an invalid database query plan.");
    }

    parsed = JSON.parse(match[0]);
  }

  if (!parsed || typeof parsed.sql !== "string") {
    throw new Error("AI query plan did not contain SQL.");
  }

  validateSQL(parsed.sql);

  return {
    sql: parsed.sql,
    explanation:
      typeof parsed.explanation === "string"
        ? parsed.explanation
        : undefined,
  };
}

async function createSqlPlan(
  schema: string,
  question: string
): Promise<QueryPlan> {
  const prompt = `
You are SaMi Assist's SQL planner.

DATABASE SCHEMA

${schema}

USER QUESTION

${question}

Return ONLY valid JSON.

Example:

{
  "sql":"SELECT COUNT(*) FROM customers",
  "explanation":"Count customers"
}

Rules

- PostgreSQL only.
- Use ONLY tables and columns shown in the schema.
- Generate ONE SELECT or WITH query.
- Never modify data.
- Never use INSERT.
- Never use UPDATE.
- Never use DELETE.
- Never use DROP.
- Never use ALTER.
- Never use CREATE.
- Never use TRUNCATE.
- Never invent columns.
- Never invent tables.
- No semicolon.
`;

  const completion =
    await groq.chat.completions.create({
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

  return parsePlan(
    completion.choices[0]?.message?.content ?? ""
  );
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
      const created = await pool.query(
        `
        INSERT INTO conversations
        (
          user_id,
          title
        )
        VALUES
        ($1,$2)
        RETURNING id
        `,
        [
          user.id,
          message.substring(0, 40),
        ]
      );

      chatId = created.rows[0].id;
    }

    const history = await pool.query(
      `
      SELECT
        role,
        content
      FROM messages
      WHERE conversation_id=$1
      ORDER BY created_at ASC
      LIMIT 40
      `,
      [chatId]
    );

    const memories = await pool.query(
      `
      SELECT
        memory_type,
        content
      FROM ai_memory
      ORDER BY importance DESC,
               created_at DESC
      LIMIT 100
      `
    );

    const memoryContext =
      memories.rows.length > 0
        ? memories.rows
            .map(
              (m: any, i: number) =>
                `${i + 1}. [${m.memory_type}] ${m.content}`
            )
            .join("\n")
        : "No permanent memories.";

    const schema = await discoverSchema(pool);

    let evidence = "";
    let sqlExplanation = "";

    try {
        // createSqlPlan expects a string representation of the schema
        const plan = await createSqlPlan(
          typeof schema === "string" ? schema : JSON.stringify(schema),
          message
        );

      sqlExplanation =
        plan.explanation ?? "";

      const rows = await executeSQL(
        pool,
        plan.sql
      );

      evidence = JSON.stringify(
        rows,
        null,
        2
      );
    } catch (err) {
      evidence =
        "Business data unavailable.\n\n" +
        (err instanceof Error
          ? err.message
          : "Unknown error");
    }

    await pool.query(
      `
      INSERT INTO messages
      (
        conversation_id,
        role,
        content
      )
      VALUES
      ($1,$2,$3)
      `,
      [
        chatId,
        "user",
        message,
      ]
    );

    const systemPrompt = `
You are SaMi Assist.

Business:
${business.name}

You have live access to the authenticated user's tenant database.

The SQL query has already been executed.

Explain ONLY the returned data.

Never invent records.

If zero rows were returned,
say no matching records exist.

Do not mention SQL.

Explanation:
${sqlExplanation}

Permanent memories:

${memoryContext}

Database result:

${evidence}
`;

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt,
      },

      ...history.rows.map(
        (m: any) =>
          ({
            role:
              m.role === "user"
                ? "user"
                : "assistant",
            content: m.content,
          }) as ChatCompletionMessageParam
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
      completion.choices[0]?.message?.content?.trim() ??
      "Sorry, I couldn't generate a response.";

    await pool.query(
      `
      INSERT INTO messages
      (
        conversation_id,
        role,
        content
      )
      VALUES
      ($1,$2,$3)
      `,
      [
        chatId,
        "assistant",
        reply,
      ]
    );

    return NextResponse.json({
      success: true,
      reply,
      conversationId: chatId,
      database: databaseName,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}