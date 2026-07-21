import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { Groq } from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { message, conversationId } =
      await req.json();

    if (!message?.trim()) {
      return NextResponse.json(
        {
          error: "Message is required.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      await createClient();

    // ==========================================
    // 1. GET CURRENT LOGGED-IN USER
    // ==========================================

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    let chatId =
      conversationId;

    // ==========================================
    // 2. CREATE NEW CONVERSATION
    // ==========================================

    if (!chatId) {
      const {
        data: conversation,
        error: conversationError,
      } = await supabase
        .from("conversations")
        .insert({
          title: message.substring(
            0,
            40
          ),
          user_id: user.id,
        })
        .select()
        .single();

      if (conversationError) {
        console.error(
          "Conversation Creation Error:",
          conversationError
        );

        return NextResponse.json(
          {
            error:
              "Failed to create conversation",
          },
          {
            status: 500,
          }
        );
      }

      chatId =
        conversation.id;
    }

    // ==========================================
    // 3. GET PREVIOUS CONVERSATION MESSAGES
    // ==========================================

    const {
      data: previousMessages,
      error: historyError,
    } = await supabase
      .from("messages")
      .select(
        "role, content, created_at"
      )
      .eq(
        "conversation_id",
        chatId
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (historyError) {
      console.error(
        "History Error:",
        historyError
      );

      return NextResponse.json(
        {
          error:
            "Failed to load conversation history",
        },
        {
          status: 500,
        }
      );
    }

    // ==========================================
    // 4. SAVE USER'S NEW MESSAGE
    // ==========================================

    const {
      error: userMessageError,
    } = await supabase
      .from("messages")
      .insert({
        conversation_id:
          chatId,
        role: "user",
        content: message,
      });

    if (userMessageError) {
      console.error(
        "User Message Error:",
        userMessageError
      );

      return NextResponse.json(
        {
          error:
            "Failed to save your message",
        },
        {
          status: 500,
        }
      );
    }

    // ==========================================
    // 5. BUILD AI CONVERSATION HISTORY
    // ==========================================

    const chatMessages = [
      {
        role: "system" as const,
        content:
          "You are SaMi Assist, an intelligent AI business assistant created by SaMi Technologies. You help businesses manage their operations, understand their data, make better decisions, and complete tasks. Be professional, accurate, helpful, and concise. Remember information provided earlier in the current conversation and use it when answering future questions.",
      },

      ...(previousMessages || []).map(
        (msg) => ({
          role:
            msg.role === "user"
              ? ("user" as const)
              : ("assistant" as const),

          content:
            msg.content,
        })
      ),

      {
        role: "user" as const,
        content: message,
      },
    ];

    // ==========================================
    // 6. ASK GROQ
    // ==========================================

    const completion =
      await groq.chat.completions.create(
        {
          model:
            "llama-3.3-70b-versatile",

          messages:
            chatMessages,

          temperature: 0.7,

          max_tokens: 1024,
        }
      );

    const reply =
      completion
        .choices[0]
        ?.message
        ?.content ??
      "Sorry, I couldn't generate a response.";

    // ==========================================
    // 7. SAVE AI RESPONSE
    // ==========================================

    const {
      error: aiMessageError,
    } = await supabase
      .from("messages")
      .insert({
        conversation_id:
          chatId,
        role: "ai",
        content: reply,
      });

    if (aiMessageError) {
      console.error(
        "AI Message Error:",
        aiMessageError
      );

      return NextResponse.json(
        {
          error:
            "Failed to save AI response",
        },
        {
          status: 500,
        }
      );
    }

    // ==========================================
    // 8. RETURN RESPONSE
    // ==========================================

    return NextResponse.json({
      reply,
      conversationId:
        chatId,
    });
  } catch (error) {
    console.error(
      "Chat API Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}