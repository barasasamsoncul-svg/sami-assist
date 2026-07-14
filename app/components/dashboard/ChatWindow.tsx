"use client";

import { useState } from "react";
import { Send } from "lucide-react";

type Message = {
  sender: "user" | "ai";
  text: string;
};

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "ai",
      text: "👋 Welcome to SaMi Assist! How can I help you today?",
    },
  ]);

  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const prompt = input;

    // Show the user's message immediately
    setMessages((prev) => [
      ...prev,
      {
        sender: "user",
        text: prompt,
      },
    ]);

    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: prompt,
          conversationId,
        }),
      });

      const data = await response.json();

      // Save conversation ID for future messages
      if (!conversationId && data.conversationId) {
        setConversationId(data.conversationId);
      }

      // Show AI reply
      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: data.reply,
        },
      ]);
    } catch (error) {
      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: "❌ Sorry, I couldn't reach the AI server.",
        },
      ]);
    }
  };

  return (
    <div className="flex h-[75vh] flex-col rounded-3xl bg-white shadow-xl">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-5">
        <h2 className="text-2xl font-bold text-gray-900">
          SaMi AI Assistant
        </h2>

        <p className="text-sm text-gray-500">
          Your intelligent business assistant
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-6">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`max-w-xl rounded-2xl px-5 py-4 ${
              message.sender === "user"
                ? "ml-auto bg-blue-600 text-white"
                : "bg-white text-gray-900 shadow"
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-5">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            placeholder="Ask SaMi AI anything..."
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendMessage();
              }
            }}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600"
          />

          <button
            onClick={sendMessage}
            className="rounded-xl bg-blue-600 p-4 text-white transition hover:bg-blue-700"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}