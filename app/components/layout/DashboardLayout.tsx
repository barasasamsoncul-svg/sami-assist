"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import ChatWindow from "../dashboard/ChatWindow";
import ChatHistory from "../dashboard/ChatHistory";
import TopBar from "./TopBar";

import {
  LayoutDashboard,
  MessageSquare,
  FolderOpen,
  BarChart3,
  Settings,
} from "lucide-react";

type Conversation = {
  id: string;
  title: string;
  created_at?: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
};

export default function DashboardLayout() {
  const [
    conversations,
    setConversations,
  ] = useState<Conversation[]>([]);

  const [
    selectedId,
    setSelectedId,
  ] = useState<string | null>(null);

  const [
    profile,
    setProfile,
  ] = useState<Profile | null>(null);

  const [
    loadingProfile,
    setLoadingProfile,
  ] = useState(true);

  // Load user profile
  useEffect(() => {
    loadProfile();
    loadConversations();
  }, []);

  async function loadProfile() {
    try {
      const response = await fetch(
        "/api/profile"
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load profile"
        );
      }

      const data =
        await response.json();

      setProfile(data);
    } catch (error) {
      console.error(
        "Profile loading error:",
        error
      );
    } finally {
      setLoadingProfile(false);
    }
  }

  async function loadConversations() {
    try {
      const response = await fetch(
        "/api/conversations"
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load conversations"
        );
      }

      const data =
        await response.json();

      setConversations(data);
    } catch (error) {
      console.error(
        "Conversation loading error:",
        error
      );
    }
  }

  async function newChat() {
    // Start a fresh chat.
    // The conversation will actually
    // be created when the first message
    // is sent.
    setSelectedId(null);
  }

  function handleConversationCreated(
    id: string
  ) {
    setSelectedId(id);

    // Refresh conversation history
    loadConversations();
  }

  function handleSelectConversation(
    id: string
  ) {
    setSelectedId(id);
  }

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* Sidebar */}

      <aside className="flex w-72 flex-col bg-gray-900 p-6 text-white">

        {/* Logo */}

        <div className="mb-10 flex items-center gap-3">

          <Image
            src="/logo.png"
            alt="SaMi Technologies"
            width={45}
            height={45}
            className="rounded-lg"
          />

          <div>
            <h2 className="text-lg font-bold">
              SaMi Assist
            </h2>

            <p className="text-xs text-gray-400">
              AI Workspace
            </p>
          </div>

        </div>

        {/* Navigation */}

        <nav className="space-y-3">

          <button className="flex w-full items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-left font-medium transition hover:bg-blue-700">
            <LayoutDashboard size={20} />
            Dashboard
          </button>

          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-gray-800">
            <MessageSquare size={20} />
            AI Chat
          </button>

          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-gray-800">
            <FolderOpen size={20} />
            Documents
          </button>

          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-gray-800">
            <BarChart3 size={20} />
            Analytics
          </button>

          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-gray-800">
            <Settings size={20} />
            Settings
          </button>

        </nav>

        {/* User Profile */}

        <div className="mt-auto pt-10">

          <div className="rounded-xl bg-gray-800 p-4">

            {loadingProfile ? (
              <>
                <div className="h-5 w-32 animate-pulse rounded bg-gray-700" />

                <div className="mt-2 h-4 w-44 animate-pulse rounded bg-gray-700" />
              </>
            ) : profile ? (
              <>
                <p className="font-semibold">
                  {profile.full_name ||
                    "SaMi Assist User"}
                </p>

                <p className="mt-1 text-sm text-gray-400">
                  {profile.email}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">
                  SaMi Assist User
                </p>

                <p className="text-sm text-gray-400">
                  Account
                </p>
              </>
            )}

          </div>

        </div>

      </aside>

      {/* Main Content */}

      <main className="flex-1 bg-gray-100 p-8">

        <TopBar />

        <div className="mt-6 flex gap-6">

          {/* Chat */}

          <div className="flex-1">

            <ChatWindow
              conversationId={
                selectedId
              }
              onConversationCreated={
                handleConversationCreated
              }
            />

          </div>

          {/* Chat History */}

          <ChatHistory
            conversations={
              conversations
            }
            selectedId={
              selectedId
            }
            onSelect={
              handleSelectConversation
            }
            onNewChat={newChat}
          />

        </div>

      </main>

    </div>
  );
}