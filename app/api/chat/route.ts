import { supabase } from "@/lib/supabase";
import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { message, conversationId } = await req.json();

    let chatId = conversationId;

    // Create a new conversation if one doesn't exist
    if (!chatId) {
      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({
          title: message.substring(0, 40),
        })
        .select()
        .single();

      if (error) throw error;

      chatId = conversation.id;
    }

    // Save the user's message
    await supabase.from("messages").insert({
      conversation_id: chatId,
      role: "user",
      content: message,
    });

    // Ask Groq
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are SaMi Assist, an intelligent AI business assistant created by SaMi Technologies.",
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    const reply =
      completion.choices[0]?.message?.content ??
      "Sorry, I couldn't generate a response.";

    // Save AI reply
    await supabase.from("messages").insert({
      conversation_id: chatId,
      role: "ai",
      content: reply,
    });

    return NextResponse.json({
      reply,
      conversationId: chatId,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { reply: "Something went wrong." },
      { status: 500 }
    );
  }
}