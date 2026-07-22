"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  Loader2,
  User,
  Bot,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  RefreshCw,
  MoreVertical,
  FileText,
  Paperclip,
  Mic,
  X,
} from "lucide-react";

type Message = {
  id?: string;
  role: "user" | "ai";
  content: string;
  timestamp?: string;
  feedback?: "like" | "dislike";
};

type Props = {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  onConversationUpdate?: (id: string, title: string) => void;
};

// ==========================================
// SPEECH RECOGNITION TYPES
// ==========================================

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: Event) => void;
  onend: () => void;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

export default function ChatWindow({
  conversationId,
  onConversationCreated,
  onConversationUpdate,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ==========================================
  // SCROLL TO BOTTOM
  // ==========================================

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ==========================================
  // SHOW SCROLL BUTTON
  // ==========================================

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  };

  // ==========================================
  // LOAD MESSAGES
  // ==========================================

  useEffect(() => {
    if (!conversationId) {
      setMessages([
        {
          role: "ai",
          content:
            "👋 Welcome to SaMi Assist! I'm your AI business assistant. Ask me anything about your business, customers, or data.",
          timestamp: new Date().toISOString(),
        },
      ]);
      return;
    }

    loadMessages(conversationId);
  }, [conversationId]);

  async function loadMessages(id: string) {
    try {
      const res = await fetch(`/api/messages/${id}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load conversation.");
      }

      setMessages(data.length > 0 ? data : [
        {
          role: "ai",
          content: "💬 Welcome back! How can I help you today?",
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Load messages error:", error);
      setMessages([
        {
          role: "ai",
          content: "❌ I couldn't load this conversation. Please try refreshing.",
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }

  // ==========================================
  // VOICE RECOGNITION
  // ==========================================

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = "en-US";

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join("");
          
          if (event.results[0].isFinal) {
            setInput(transcript);
            setIsRecording(false);
          }
        };

        recognitionRef.current.onerror = () => {
          setIsRecording(false);
        };

        recognitionRef.current.onend = () => {
          setIsRecording(false);
        };
      }
    }
  }, []);

  const toggleVoiceRecognition = () => {
    if (!recognitionRef.current) {
      alert("Voice recognition is not supported in your browser.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        inputRef.current?.focus();
      } catch (error) {
        console.error("Voice recognition error:", error);
        setIsRecording(false);
      }
    }
  };

  // ==========================================
  // SEND MESSAGE
  // ==========================================

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const prompt = input.trim();
    const userMessage: Message = {
      role: "user",
      content: prompt,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          conversationId,
        }),
      });

      const data = await res.json();
      console.log("Chat API response:", data);

      if (!res.ok) {
        throw new Error(data.error || data.details || "The AI request failed.");
      }

      if (!data.reply) {
        throw new Error("The AI returned an empty response.");
      }

      if (!conversationId && data.conversationId) {
        onConversationCreated(data.conversationId);
      }

      if (!conversationId && data.conversationId && onConversationUpdate) {
        const title = prompt.length > 30 ? prompt.substring(0, 30) + "..." : prompt;
        onConversationUpdate(data.conversationId, title);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: data.reply,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Send message error:", error);
      const errorMessage = error instanceof Error ? error.message : "Something went wrong.";

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `❌ ${errorMessage}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      setIsTyping(false);
    }
  }

  // ==========================================
  // COPY MESSAGE
  // ==========================================

  const copyMessage = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ==========================================
  // FEEDBACK
  // ==========================================

  const giveFeedback = (messageIndex: number, feedback: "like" | "dislike") => {
    setMessages((prev) =>
      prev.map((msg, idx) =>
        idx === messageIndex ? { ...msg, feedback } : msg
      )
    );
  };

  // ==========================================
  // RENDER MESSAGE
  // ==========================================

  const renderMessage = (message: Message, index: number) => {
    const isUser = message.role === "user";
    const isAI = message.role === "ai";
    const messageId = message.id || `${message.role}-${index}`;

    return (
      <div
        key={messageId}
        className={`group flex gap-3 ${isUser ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-2 duration-300`}
      >
        {/* Avatar - AI */}
        {isAI && (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg">
            <Bot size={16} className="text-white" />
          </div>
        )}

        {/* Message bubble */}
        <div className={`flex max-w-[85%] flex-col ${isUser ? "items-end" : "items-start"} sm:max-w-[75%]`}>
          <div
            className={`relative rounded-2xl px-4 py-3 shadow-sm ${
              isUser
                ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white"
                : "bg-white text-gray-900 shadow-md dark:bg-gray-800 dark:text-gray-100"
            }`}
          >
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed sm:text-base">
              {message.content}
            </p>

            {/* Message actions - AI only */}
            {isAI && (
              <div className="absolute -bottom-2 -right-2 flex gap-1 rounded-lg bg-white/90 p-1 shadow-lg opacity-0 transition-opacity group-hover:opacity-100 dark:bg-gray-700/90">
                <button
                  onClick={() => copyMessage(message.content, messageId)}
                  className="rounded p-1 transition hover:bg-gray-100 dark:hover:bg-gray-600"
                  aria-label="Copy message"
                >
                  {copiedId === messageId ? (
                    <Check size={14} className="text-green-500" />
                  ) : (
                    <Copy size={14} className="text-gray-500 dark:text-gray-400" />
                  )}
                </button>
                <button
                  onClick={() => giveFeedback(index, "like")}
                  className={`rounded p-1 transition hover:bg-gray-100 dark:hover:bg-gray-600 ${
                    message.feedback === "like" ? "text-blue-500" : "text-gray-500 dark:text-gray-400"
                  }`}
                  aria-label="Like"
                >
                  <ThumbsUp size={14} />
                </button>
                <button
                  onClick={() => giveFeedback(index, "dislike")}
                  className={`rounded p-1 transition hover:bg-gray-100 dark:hover:bg-gray-600 ${
                    message.feedback === "dislike" ? "text-red-500" : "text-gray-500 dark:text-gray-400"
                  }`}
                  aria-label="Dislike"
                >
                  <ThumbsDown size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Timestamp */}
          {message.timestamp && (
            <span className={`mt-1 text-[10px] text-gray-400 dark:text-gray-500 ${isUser ? "pr-1" : "pl-1"}`}>
              {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {/* Avatar - User */}
        {isUser && (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-600 to-gray-700 shadow-lg">
            <User size={16} className="text-white" />
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="flex h-[85vh] flex-col rounded-2xl border border-gray-200/80 bg-white/80 shadow-2xl backdrop-blur-sm dark:border-gray-800/80 dark:bg-gray-900/80 sm:h-[80vh] md:h-[75vh]">
      
      {/* ====================================
          HEADER
      ==================================== */}

      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 dark:border-gray-700 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white sm:text-xl">
              SaMi AI Assistant
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {loading ? "Thinking..." : isTyping ? "Typing..." : "Online"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => conversationId && loadMessages(conversationId)}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Refresh"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="More options"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* ====================================
          MESSAGES
      ==================================== */}

      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-gray-50/50 px-4 py-4 dark:bg-gray-900/50 sm:px-6"
      >
        <div className="mx-auto max-w-4xl space-y-4">
          {messages.map((message, index) => renderMessage(message, index))}

          {/* Typing indicator */}
          {isTyping && !loading && (
            <div className="flex items-center gap-3 animate-in slide-in-from-bottom-2">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg">
                <Bot size={16} className="text-white" />
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-md dark:bg-gray-800">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <button
            onClick={() => scrollToBottom(true)}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 p-2 text-white shadow-lg transition hover:bg-blue-700 hover:scale-110 active:scale-95"
            aria-label="Scroll to bottom"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}
      </div>

      {/* ====================================
          INPUT
      ==================================== */}

      <div className="border-t border-gray-200 bg-white/50 p-3 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/50 sm:p-4">
        <div className="mx-auto max-w-4xl">
          {/* Attachment preview */}
          {attachment && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
              <FileText size={16} className="text-blue-500" />
              <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
                {attachment.name}
              </span>
              <button
                onClick={() => setAttachment(null)}
                className="rounded p-1 text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Attachment button */}
            <button
              onClick={() => document.getElementById("file-upload")?.click()}
              className="rounded-xl p-3 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              aria-label="Attach file"
            >
              <Paperclip size={20} />
            </button>
            <input
              id="file-upload"
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setAttachment(e.target.files[0]);
                }
              }}
            />

            {/* Input */}
            <div className="flex-1">
              <input
                ref={inputRef}
                type="text"
                value={input}
                disabled={loading}
                placeholder="Ask SaMi Assist anything..."
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !loading) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-blue-400 sm:text-base"
                aria-label="Type your message"
              />
            </div>

            {/* Voice input */}
            <button
              onClick={toggleVoiceRecognition}
              className={`rounded-xl p-3 transition ${
                isRecording
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
              aria-label="Voice input"
            >
              <Mic size={20} />
            </button>

            {/* Send button */}
            <button
              type="button"
              disabled={loading || !input.trim()}
              onClick={sendMessage}
              className="relative rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 p-3 text-white transition hover:shadow-lg hover:shadow-blue-500/25 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 sm:p-4"
              aria-label="Send message"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Send size={20} />
              )}
            </button>
          </div>

          {/* Character count */}
          {input.length > 0 && (
            <div className="mt-1 text-right text-[10px] text-gray-400 dark:text-gray-500">
              {input.length} characters
            </div>
          )}
        </div>
      </div>
    </div>
  );
}