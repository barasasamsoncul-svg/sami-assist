import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const {
      message,
      conversationId,
    } = await req.json();

    // ==========================================
    // 1. VALIDATE MESSAGE
    // ==========================================

    if (
      !message ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return NextResponse.json(
        {
          error: "Message is required.",
        },
        {
          status: 400,
        }
      );
    }

    // ==========================================
    // 2. GET LOGGED-IN USER
    // ==========================================

    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // ==========================================
    // 3. CONNECT TO USER'S TENANT DATABASE
    // ==========================================

    const { pool } =
      await getTenantDatabaseForUser(
        user.id
      );

    // ==========================================
    // 4. ASK GROQ TO ANALYZE THE MESSAGE
    // ==========================================

    const completion =
      await groq.chat.completions.create({
        model:
          "llama-3.3-70b-versatile",

        temperature: 0,

        max_tokens: 500,

        messages: [
          {
            role: "system",

            content: `
You are the SaMi Assist Memory Engine.

Your job is to identify important, useful, long-term facts that the USER explicitly provides.

Only extract information that could be useful in future conversations.

Good memories include:

- User's name
- User's company name
- User's role or position
- Business information
- Important business facts
- User preferences
- Long-term goals
- Ongoing projects
- Important recurring information

Do NOT save:

- Greetings
- Small talk
- Temporary questions
- General knowledge
- AI-generated information
- Your own assumptions
- Sensitive information unless the user explicitly asks SaMi to remember it

Return ONLY valid JSON.

If there is nothing important to remember, return:

{
  "shouldRemember": false,
  "memories": []
}

If there are important facts, return:

{
  "shouldRemember": true,
  "memories": [
    {
      "memory": "The user's company is SaMi Technologies.",
      "category": "company",
      "importance": 10
    }
  ]
}

Categories should be one of:

personal
company
business
preference
goal
project
other

Importance must be a number from 1 to 10.
`,
          },

          {
            role: "user",

            content: `
User message:

${message}
`,
          },
        ],
      });

    const rawContent =
      completion
        .choices[0]
        ?.message
        ?.content
        ?.trim();

    // ==========================================
    // 5. NO MEMORY FOUND
    // ==========================================

    if (!rawContent) {
      return NextResponse.json({
        success: true,
        saved: 0,
      });
    }

    // ==========================================
    // 6. CLEAN AI JSON RESPONSE
    // ==========================================

    let cleanedContent =
      rawContent;

    cleanedContent =
      cleanedContent
        .replace(
          /^```json/i,
          ""
        )
        .replace(
          /^```/i,
          ""
        )
        .replace(
          /```$/i,
          ""
        )
        .trim();

    // ==========================================
    // 7. PARSE JSON
    // ==========================================

    let memoryData: {
      shouldRemember?: boolean;
      memories?: Array<{
        memory?: string;
        category?: string;
        importance?: number;
      }>;
    };

    try {
      memoryData =
        JSON.parse(
          cleanedContent
        );
    } catch (parseError) {
      console.error(
        "Memory JSON Parse Error:",
        parseError
      );

      console.error(
        "Raw Memory Response:",
        rawContent
      );

      return NextResponse.json({
        success: false,
        saved: 0,
      });
    }

    // ==========================================
    // 8. CHECK IF THERE IS ANYTHING TO REMEMBER
    // ==========================================

    if (
      !memoryData.shouldRemember ||
      !Array.isArray(
        memoryData.memories
      ) ||
      memoryData.memories.length === 0
    ) {
      return NextResponse.json({
        success: true,
        saved: 0,
      });
    }

    // ==========================================
    // 9. SAVE EACH MEMORY
    // ==========================================

    let savedCount = 0;

    for (
      const item of
        memoryData.memories
    ) {
      if (
        !item ||
        !item.memory ||
        typeof item.memory !==
          "string"
      ) {
        continue;
      }

      const memory =
        item.memory.trim();

      if (!memory) {
        continue;
      }

      const category =
        typeof item.category ===
        "string"
          ? item.category
          : "other";

      let importance =
        Number(
          item.importance
        );

      // Keep importance between 1 and 10
      if (
        Number.isNaN(
          importance
        )
      ) {
        importance = 5;
      }

      importance = Math.max(
        1,
        Math.min(
          10,
          importance
        )
      );

      // ========================================
      // 10. CHECK FOR DUPLICATE MEMORY
      //
      // Tenant database already belongs to
      // the authenticated user/business.
      //
      // ai_memory schema uses:
      // memory_type
      // content
      // importance
      //
      // There is NO user_id column.
      // ========================================

      const existingResult =
        await pool.query(
          `
          SELECT id, content
          FROM ai_memory
          WHERE content = $1
          LIMIT 1
          `,
          [
            memory,
          ]
        );

      // ========================================
      // 11. SKIP DUPLICATES
      // ========================================

      if (
        (existingResult.rowCount ?? 0) > 0
      ) {
        continue;
      }

      // ========================================
      // 12. SAVE NEW MEMORY
      // ========================================

      await pool.query(
        `
        INSERT INTO ai_memory
          (
            memory_type,
            content,
            importance
          )
        VALUES
          ($1, $2, $3)
        `,
        [
          category,
          memory,
          importance,
        ]
      );

      savedCount++;
    }

    // ==========================================
    // 13. RETURN RESULT
    // ==========================================

    return NextResponse.json({
      success: true,
      saved: savedCount,
      conversationId:
        conversationId ?? null,
    });
  } catch (error) {
    console.error(
      "Memory Extraction Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process memory.",
      },
      {
        status: 500,
      }
    );
  }
}
