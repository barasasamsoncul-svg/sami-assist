import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { Groq } from "groq-sdk";

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
          error:
            "Message is required.",
        },
        {
          status: 400,
        }
      );
    }

    // ==========================================
    // 2. GET SUPABASE CLIENT
    // ==========================================

    const supabase =
      await createClient();

    // ==========================================
    // 3. GET LOGGED-IN USER
    // ==========================================

    const {
      data: { user },
      error: authError,
    } =
      await supabase.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // ==========================================
    // 4. ASK GROQ TO ANALYZE THE MESSAGE
    // ==========================================

    const completion =
      await groq.chat.completions.create(
        {
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
        }
      );

    const rawContent =
      completion
        .choices[0]
        ?.message
        ?.content
        ?.trim();

    if (!rawContent) {
      return NextResponse.json({
        success: true,
        saved: 0,
      });
    }

    // ==========================================
    // 5. CLEAN AI JSON RESPONSE
    // ==========================================

    let cleanedContent =
      rawContent;

    // Remove markdown code fences
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
    // 6. PARSE JSON
    // ==========================================

    let memoryData;

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
    // 7. CHECK IF THERE IS ANYTHING TO REMEMBER
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
    // 8. SAVE EACH MEMORY
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
      // 9. CHECK FOR DUPLICATE MEMORY
      // ========================================

      const {
        data: existingMemory,
        error: duplicateError,
      } = await supabase
        .from("memories")
        .select(
          "id, memory"
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "memory",
          memory
        )
        .maybeSingle();

      if (
        duplicateError
      ) {
        console.error(
          "Duplicate Check Error:",
          duplicateError
        );

        continue;
      }

      // ========================================
      // 10. SKIP DUPLICATES
      // ========================================

      if (
        existingMemory
      ) {
        continue;
      }

      // ========================================
      // 11. SAVE NEW MEMORY
      // ========================================

      const {
        error: insertError,
      } = await supabase
        .from("memories")
        .insert({
          user_id:
            user.id,

          memory,

          category,

          importance,
        });

      if (
        insertError
      ) {
        console.error(
          "Memory Insert Error:",
          insertError
        );

        continue;
      }

      savedCount++;
    }

    // ==========================================
    // 12. RETURN RESULT
    // ==========================================

    return NextResponse.json({
      success: true,
      saved:
        savedCount,
      conversationId:
        conversationId ??
        null,
    });
  } catch (error) {
    console.error(
      "Memory Extraction Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to process memory.",
      },
      {
        status: 500,
      }
    );
  }
}