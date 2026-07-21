import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { Groq } from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { message, conversationId } = await req.json();

    if (!message || !message.trim()) {
      return NextResponse.json(
        {
          error: "Message is required.",
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check logged-in user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Supabase Auth Error:", authError);

      return NextResponse.json(
        {
          error: "Authentication error.",
          details: authError.message,
        },
        { status: 401 }
      );
    }

    if (!user) {
      return NextResponse.json(
        {
          error: "You are not logged in.",
        },
        { status: 401 }
      );
    }

    let chatId = conversationId;

    // Create a new conversation
    if (!chatId) {
      const { data: conversation, error: conversationError } =
        await supabase
          .from("conversations")
          .insert({
            title: message.trim().substring(0, 40),
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
            error: "Failed to create conversation.",
            details: conversationError.message,
          },
          { status: 500 }
        );
      }

      chatId = conversation.id;
    }

    // Save user message
    const { error: userMessageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: chatId,
        role: "user",
        content: message.trim(),
      });

    if (userMessageError) {
      console.error(
        "User Message Error:",
        userMessageError
      );

      return NextResponse.json(
        {
          error: "Failed to save your message.",
          details: userMessageError.message,
        },
        { status: 500 }
      );
    }

    // Ask Groq
    const completion =
      await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",

        messages: [
          {
            role: "system",
            content:
              "You are SaMi Assist, an intelligent AI business assistant created by SaMi Technologies. Always be professional, helpful, accurate and concise.",
          },
          {
            role: "user",
            content: message.trim(),
          },
        ],

        temperature: 0.7,
        max_tokens: 1024,
      });

    const reply =
      completion.choices[0]?.message?.content?.trim();

    if (!reply) {
      return NextResponse.json(
        {
          error:
            "The AI did not return a response.",
        },
        { status: 500 }
      );
    }

    // Save AI response
    const { error: aiMessageError } =
      await supabase
        .from("messages")
        .insert({
          conversation_id: chatId,
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
            "AI responded, but the response could not be saved.",
          details: aiMessageError.message,
        },
        { status: 500 }
      );
    }

    // Return successful response
    return NextResponse.json({
      success: true,
      reply,
      conversationId: chatId,
    });
  } catch (error) {
    console.error(
      "Chat API Unexpected Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while processing your message.",
      },
      { status: 500 }
    );
  }
}