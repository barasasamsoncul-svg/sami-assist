'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Bot, User, Trash2, AlertTriangle, Loader2 } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: "Hello! I'm SaMi AI. I can help you understand your business data, answer questions, and execute tasks.", timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content, conversationId }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      if (data.conversationId) setConversationId(data.conversationId);

      const assistantMessage: Message = { id: Date.now().toString() + '-ai', role: 'assistant', content: data.response, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([{ id: 'welcome', role: 'assistant', content: "Chat cleared. How can I help?", timestamp: new Date() }]);
    setConversationId(null);
    setError('');
  };

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold">SaMi AI</h2>
              <p className="text-xs text-gray-500">Your business AI teammate</p>
            </div>
          </div>
          <button onClick={handleClear} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><Trash2 size={18} className="text-gray-500" /></button>
        </div>
        {error && <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center gap-2"><AlertTriangle size={14} className="text-red-600" /><p className="text-xs text-red-700">{error}</p></div>}
      </div>

      <div className="flex-1 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.role === 'assistant' && <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0"><Bot size={16} className="text-white" /></div>}
              <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className={`text-[10px] mt-1 ${message.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              {message.role === 'user' && <div className="h-8 w-8 bg-gray-300 dark:bg-gray-700 rounded-lg flex items-center justify-center"><User size={16} className="text-gray-600" /></div>}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center"><Bot size={16} className="text-white" /></div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3"><Loader2 size={16} className="animate-spin text-gray-500" /></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 p-4">
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask SaMi about your business..."
              className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm bg-white dark:bg-gray-800 min-h-[44px] max-h-[120px]"
              rows={1}
              disabled={loading}
            />
            <button onClick={handleSend} disabled={loading || !input.trim()} className="px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}