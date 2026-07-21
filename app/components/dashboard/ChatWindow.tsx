"use client";

import { useState, useEffect, useRef } from "react";
import { Send } from "lucide-react";

type Message = {
  id?: string;
  role: "user" | "ai";
  content: string;
};

type Props = {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
};

export default function ChatWindow({
  conversationId,
  onConversationCreated,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // Load conversation messages
  useEffect(() => {
    if (!conversationId) {
      setMessages([
        {
          role: "ai",
          content: "👋 Welcome to SaMi Assist! Start a new conversation.",
        },
      ]);
      return;
    }

    loadMessages(conversationId);
  }, [conversationId]);

  async function loadMessages(id: string) {
    try {
      const res = await fetch(`/api/messages/${id}`);

      if (!res.ok) return;

      const data = await res.json();

      setMessages(data);
    } catch (error) {
      console.error(error);
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const prompt = input;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: prompt,
      },
    ]);

    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: prompt,
          conversationId,
        }),
      });

      const data = await res.json();

      if (!conversationId && data.conversationId) {
        onConversationCreated(data.conversationId);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: data.reply,
        },
      ]);
    } catch (error) {
      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: "❌ Sorry, something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

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
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={message.id ?? index}
              className={`max-w-xl rounded-2xl px-5 py-4 ${
                message.role === "user"
                  ? "ml-auto bg-blue-600 text-white"
                  : "bg-white text-gray-900 shadow"
              }`}
            >
              {message.content}
            </div>
          ))}

          {loading && (
            <div className="max-w-xl rounded-2xl bg-white px-5 py-4 shadow">
              <span className="animate-pulse">
                SaMi is thinking...
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-5">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            placeholder="Ask SaMi Assist anything..."
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
            disabled={loading}
            className="rounded-xl bg-blue-600 p-4 text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}