'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Bot, User, Trash2, AlertTriangle, Loader2 } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UsageInfo {
  used: number;
  limit: number;
  remaining: number | string;
}

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I'm SaMi AI. I can help you understand your business data, answer questions, and execute tasks. What would you like to know?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'AI request failed');
      }

      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      if (data.usage) {
        setUsage(data.usage);
      }

      const assistantMessage: Message = {
        id: Date.now().toString() + '-assistant',
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      const errorMessage: Message = {
        id: Date.now().toString() + '-error',
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Sorry, something went wrong.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setError(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "Chat cleared. How can I help you with your business?",
        timestamp: new Date(),
      },
    ]);
    setConversationId(null);
    setError('');
  };

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      {/* Header with usage */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">SaMi AI</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Your business AI teammate</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Usage indicator */}
            {usage && (
              <div className="hidden sm:block text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Queries: {usage.used}/{usage.limit === -1 ? '∞' : usage.limit}
                </p>
                <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full mt-1">
                  <div 
                    className={`h-1.5 rounded-full ${usage.limit !== -1 && usage.used >= usage.limit ? 'bg-red-500' : usage.limit !== -1 && usage.used >= usage.limit * 0.8 ? 'bg-yellow-500' : 'bg-blue-600'}`}
                    style={{ width: usage.limit === -1 ? '100%' : `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <button 
              onClick={handleClearChat} 
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              title="Clear chat"
            >
              <Trash2 size={18} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Error alert */}
        {error && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-600 dark:text-red-400 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* Chat container */}
      <div className="flex-1 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-white" />
                </div>
              )}

              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                <p className={`text-[10px] mt-1 ${message.role === 'user' ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {message.role === 'user' && (
                <div className="h-8 w-8 bg-gray-300 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0">
                  <User size={16} className="text-gray-600 dark:text-gray-300" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Bot size={16} className="text-white" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-4">
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask SaMi about your business data..."
              className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none min-h-[44px] max-h-[120px]"
              rows={1}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}