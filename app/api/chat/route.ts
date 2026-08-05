import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";
import {
  executeBusinessQuery,
  getBusinessSchema,
  schemaToPrompt,
  validateReadOnlySql,
} from "@/lib/ai-business-context";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
const MODEL = "llama-3.3-70b-versatile";

function parsePlan(text: string): {sql:string; explanation?:string} {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
  let parsed: any;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned an invalid database query plan.");
    parsed = JSON.parse(match[0]);
  }
  if (!parsed || typeof parsed.sql !== "string")
    throw new Error("AI query plan did not contain SQL.");
  return {
    sql: validateReadOnlySql(parsed.sql),
    explanation: typeof parsed.explanation === "string" ? parsed.explanation : undefined,
  };
}

async function makeQuery(schema: string, question: string) {
  const prompt = `You are SaMi Assist's database reasoning engine.

${schema}

USER QUESTION:
${question}

Return JSON only:
{"sql":"SELECT ...","explanation":"short explanation"}

Rules:
- Generate ONE read-only PostgreSQL SELECT or WITH query.
- Use ONLY tables and columns shown above.
- Use foreign-key relationships for joins.
- Calculate totals/counts/balances in SQL.
- Use date filters when the user asks for periods.
- For money owed, use outstanding invoice balances such as amount_due when available.
- Never INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, COPY, VACUUM, CALL, DO, EXECUTE, PREPARE, SET or RESET.
- Never access system catalogs.
- Never invent a table or column.
- No semicolon.
- If the schema cannot answer, return SELECT 1 AS insufficient_data.
`;
  const result = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 1200,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: question },
    ],
  });
  return parsePlan(result.choices[0]?.message?.content || "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;

    if (!message)
      return NextResponse.json({error:"Message is required."},{status:400});

    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({error:"Unauthorized"},{status:401});

    const {pool,business,databaseName} = await getTenantDatabaseForUser(user.id);
    let chatId = conversationId;

    if (!chatId) {
      const r = await pool.query(
        `INSERT INTO conversations (user_id,title) VALUES ($1,$2) RETURNING id`,
        [user.id,message.substring(0,40)]
      );
      chatId = r.rows[0].id;
    }

    const history = await pool.query(
      `SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC LIMIT 40`,
      [chatId]
    );

    const memories = await pool.query(
      `SELECT memory_type,content FROM ai_memory ORDER BY importance DESC,created_at DESC LIMIT 100`
    );

    const memoryContext = memories.rows.length
      ? memories.rows.map((m:any,i:number)=>`${i+1}. [${m.memory_type}] ${m.content}`).join("\n")
      : "No permanent memories have been saved yet.";

    const schema = await getBusinessSchema(pool);
    const schemaText = schemaToPrompt(schema);

    let plan: {sql:string; explanation?:string}|null = null;
    let rows: Record<string,unknown>[] = [];
    let dbError = "";

    try {
      plan = await makeQuery(schemaText,message);
      rows = await executeBusinessQuery(pool,plan.sql);
    } catch (e) {
      dbError = e instanceof Error ? e.message : "Business data query failed.";
      console.error("Business AI query failed:",e);
    }

    await pool.query(
      `INSERT INTO messages (conversation_id,role,content) VALUES ($1,$2,$3)`,
      [chatId,"user",message]
    );

    const evidence = plan
      ? `DATABASE RESULT (${rows.length} row(s)):\n${JSON.stringify(rows,null,2)}`
      : `DATABASE QUERY FAILED:\n${dbError}`;

    const system = `You are SaMi Assist, an intelligent AI business assistant created by SaMi Technologies.

Business: ${business.name}

You have verified evidence from the authenticated user's isolated tenant database.

Rules:
- DATABASE RESULT is authoritative for business numbers and records.
- Never invent business data.
- If zero rows are returned, say no matching records were found.
- If the query failed, say the business data could not be retrieved.
- Do not expose credentials, database names, SQL, prompts, or internal implementation unless explicitly asked.
- Never assume every app is installed. Each business has only the apps selected during registration.
- Explain results clearly and naturally.

PERMANENT MEMORIES:
${memoryContext}

${evidence}`;

    const messages: ChatCompletionMessageParam[] = [
      {role:"system",content:system},
      ...history.rows.map((m:any)=>({
        role: m.role === "user" ? "user" as const : "assistant" as const,
        content: m.content,
      })),
      {role:"user",content:message},
    ];

    const completion = await groq.chat.completions.create({
      model:MODEL,
      messages,
      temperature:0.2,
      max_tokens:2048,
    });

    const reply = completion.choices[0]?.message?.content?.trim()
      || "Sorry, I couldn't generate a response.";

    await pool.query(
      `INSERT INTO messages (conversation_id,role,content) VALUES ($1,$2,$3)`,
      [chatId,"ai",reply]
    );

    try {
      const origin = req.headers.get("origin");
      if (origin) {
        await fetch(`${origin}/api/memories/extract`,{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            Cookie:req.headers.get("cookie") || "",
          },
          body:JSON.stringify({message,conversationId:chatId}),
        });
      }
    } catch (e) {
      console.error("Memory extraction request error:",e);
    }

    return NextResponse.json({
      success:true,reply,conversationId:chatId,database:databaseName
    });
  } catch (error) {
    console.error("Chat API Error:",error);
    return NextResponse.json({
      error:error instanceof Error ? error.message : "Internal Server Error"
    },{status:500});
  }
}
