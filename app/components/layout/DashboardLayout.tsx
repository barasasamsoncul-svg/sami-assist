"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import {
  LayoutDashboard,
  MessageSquare,
  FolderOpen,
  BarChart3,
  Settings,
} from "lucide-react";

import ChatWindow from "../dashboard/ChatWindow";
import ChatHistory from "../dashboard/ChatHistory";
import TopBar from "./TopBar";

type Conversation = {
  id: string;
  title: string;
};

export default function DashboardLayout() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load conversations
  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    try {
      const res = await fetch("/api/conversations");

      const data = await res.json();

      setConversations(data);

      if (data.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function createNewChat() {
    setSelectedId(null);
  }

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* Sidebar */}

      <aside className="w-72 bg-gray-900 p-6 text-white flex flex-col">

        <div className="mb-10 flex items-center gap-3">

          <Image
            src="/logo.png"
            alt="SaMi"
            width={45}
            height={45}
            className="rounded-lg"
          />

          <div>
            <h2 className="font-bold text-lg">
              SaMi Assist
            </h2>

            <p className="text-xs text-gray-400">
              AI Workspace
            </p>

          </div>

        </div>

        <nav className="space-y-2">

          <button className="flex w-full items-center gap-3 rounded-xl bg-blue-600 px-4 py-3">
            <LayoutDashboard size={20}/>
            Dashboard
          </button>

          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 hover:bg-gray-800">
            <MessageSquare size={20}/>
            AI Chat
          </button>

          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 hover:bg-gray-800">
            <FolderOpen size={20}/>
            Documents
          </button>

          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 hover:bg-gray-800">
            <BarChart3 size={20}/>
            Analytics
          </button>

          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 hover:bg-gray-800">
            <Settings size={20}/>
            Settings
          </button>

        </nav>

        <div className="mt-auto">

          <div className="rounded-xl bg-gray-800 p-4">

            <p className="font-semibold">
              Samson Barasa
            </p>

            <p className="text-sm text-gray-400">
              Founder · SaMi Technologies
            </p>

          </div>

        </div>

      </aside>

      {/* Main */}

      <main className="flex-1 p-8">

        <TopBar />

        <div className="mt-6 flex gap-6">

          <ChatHistory
            conversations={conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onNewChat={createNewChat}
          />

          <div className="flex-1">

            <ChatWindow
              conversationId={selectedId}
              onConversationCreated={(id) => {
                loadConversations();
                setSelectedId(id);
              }}
            />

          </div>

        </div>

      </main>

    </div>
  );
}