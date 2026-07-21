import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { Groq } from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { message, conversationId } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get logged in user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    let chatId = conversationId;

    // Create a conversation if this is the first message
    if (!chatId) {
      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({
          title: message.substring(0, 40),
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      chatId = conversation.id;
    }

    // Save user's message
    const { error: userMessageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: chatId,
        role: "user",
        content: message,
      });

    if (userMessageError) throw userMessageError;

    // Ask Groq
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are SaMi Assist, an intelligent AI business assistant created by SaMi Technologies. Always be professional, accurate and concise.",
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply =
      completion.choices[0]?.message?.content ??
      "Sorry, I couldn't generate a response.";

    // Save AI reply
    const { error: aiMessageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: chatId,
        role: "ai",
        content: reply,
      });

    if (aiMessageError) throw aiMessageError;

    return NextResponse.json({
      reply,
      conversationId: chatId,
    });
  } catch (error) {
    console.error("Chat API Error:", error);

    return NextResponse.json(
      {
        error: "Internal Server Error",
      },
      { status: 500 }
    );
  }
}