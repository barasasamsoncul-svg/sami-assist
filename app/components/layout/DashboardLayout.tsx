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
  Users,
  FileText,
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  Plus,
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

type View =
  | "dashboard"
  | "chat"
  | "documents"
  | "analytics"
  | "settings";

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

  const [
    activeView,
    setActiveView,
  ] = useState<View>("dashboard");

  // ==========================================
  // LOAD DATA
  // ==========================================

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

  // ==========================================
  // CHAT FUNCTIONS
  // ==========================================

  function newChat() {
    setSelectedId(null);
    setActiveView("chat");
  }

  function handleConversationCreated(
    id: string
  ) {
    setSelectedId(id);

    loadConversations();
  }

  function handleSelectConversation(
    id: string
  ) {
    setSelectedId(id);
    setActiveView("chat");
  }

  // ==========================================
  // NAVIGATION
  // ==========================================

  function navigateTo(
    view: View
  ) {
    setActiveView(view);
  }

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* ======================================
          SIDEBAR
      ====================================== */}

      <aside className="flex w-72 flex-col bg-gray-900 p-6 text-white">

        {/* LOGO */}

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

        {/* NAVIGATION */}

        <nav className="space-y-3">

          {/* DASHBOARD */}

          <button
            onClick={() =>
              navigateTo(
                "dashboard"
              )
            }
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
              activeView ===
              "dashboard"
                ? "bg-blue-600"
                : "hover:bg-gray-800"
            }`}
          >
            <LayoutDashboard
              size={20}
            />

            Dashboard
          </button>

          {/* AI CHAT */}

          <button
            onClick={() =>
              navigateTo("chat")
            }
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
              activeView ===
              "chat"
                ? "bg-blue-600"
                : "hover:bg-gray-800"
            }`}
          >
            <MessageSquare
              size={20}
            />

            AI Chat
          </button>

          {/* DOCUMENTS */}

          <button
            onClick={() =>
              navigateTo(
                "documents"
              )
            }
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
              activeView ===
              "documents"
                ? "bg-blue-600"
                : "hover:bg-gray-800"
            }`}
          >
            <FolderOpen
              size={20}
            />

            Documents
          </button>

          {/* ANALYTICS */}

          <button
            onClick={() =>
              navigateTo(
                "analytics"
              )
            }
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
              activeView ===
              "analytics"
                ? "bg-blue-600"
                : "hover:bg-gray-800"
            }`}
          >
            <BarChart3
              size={20}
            />

            Analytics
          </button>

          {/* SETTINGS */}

          <button
            onClick={() =>
              navigateTo(
                "settings"
              )
            }
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
              activeView ===
              "settings"
                ? "bg-blue-600"
                : "hover:bg-gray-800"
            }`}
          >
            <Settings
              size={20}
            />

            Settings
          </button>

        </nav>

        {/* USER PROFILE */}

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

      {/* ======================================
          MAIN CONTENT
      ====================================== */}

      <main className="flex-1 bg-gray-100 p-8">

        <TopBar />

        {/* ====================================
            OVERVIEW DASHBOARD
        ==================================== */}

        {activeView ===
          "dashboard" && (
          <div className="mt-8">

            {/* WELCOME */}

            <div className="mb-8">

              <h1 className="text-3xl font-bold text-gray-900">

                Welcome back,{" "}

                {profile?.full_name
                  ?.split(" ")[0] ||
                  "there"} 👋

              </h1>

              <p className="mt-2 text-gray-500">

                Here's what's happening
                across your business
                workspace.

              </p>

            </div>

            {/* QUICK STATS */}

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">

              {/* CUSTOMERS */}

              <div className="rounded-2xl bg-white p-6 shadow-sm">

                <div className="flex items-center justify-between">

                  <div className="rounded-xl bg-blue-100 p-3">

                    <Users
                      size={22}
                      className="text-blue-600"
                    />

                  </div>

                  <ArrowUpRight
                    size={18}
                    className="text-gray-400"
                  />

                </div>

                <p className="mt-5 text-sm text-gray-500">
                  Customers
                </p>

                <h3 className="mt-1 text-3xl font-bold text-gray-900">
                  0
                </h3>

                <p className="mt-2 text-xs text-gray-400">
                  No customers added yet
                </p>

              </div>

              {/* INVOICES */}

              <div className="rounded-2xl bg-white p-6 shadow-sm">

                <div className="flex items-center justify-between">

                  <div className="rounded-xl bg-purple-100 p-3">

                    <FileText
                      size={22}
                      className="text-purple-600"
                    />

                  </div>

                  <ArrowUpRight
                    size={18}
                    className="text-gray-400"
                  />

                </div>

                <p className="mt-5 text-sm text-gray-500">
                  Invoices
                </p>

                <h3 className="mt-1 text-3xl font-bold text-gray-900">
                  0
                </h3>

                <p className="mt-2 text-xs text-gray-400">
                  No invoices created yet
                </p>

              </div>

              {/* PAYMENTS */}

              <div className="rounded-2xl bg-white p-6 shadow-sm">

                <div className="flex items-center justify-between">

                  <div className="rounded-xl bg-green-100 p-3">

                    <CreditCard
                      size={22}
                      className="text-green-600"
                    />

                  </div>

                  <ArrowUpRight
                    size={18}
                    className="text-gray-400"
                  />

                </div>

                <p className="mt-5 text-sm text-gray-500">
                  Payments
                </p>

                <h3 className="mt-1 text-3xl font-bold text-gray-900">
                  KSh 0
                </h3>

                <p className="mt-2 text-xs text-gray-400">
                  No payments recorded
                </p>

              </div>

              {/* CASHFLOW */}

              <div className="rounded-2xl bg-white p-6 shadow-sm">

                <div className="flex items-center justify-between">

                  <div className="rounded-xl bg-orange-100 p-3">

                    <TrendingUp
                      size={22}
                      className="text-orange-600"
                    />

                  </div>

                  <ArrowUpRight
                    size={18}
                    className="text-gray-400"
                  />

                </div>

                <p className="mt-5 text-sm text-gray-500">
                  Cashflow
                </p>

                <h3 className="mt-1 text-3xl font-bold text-gray-900">
                  KSh 0
                </h3>

                <p className="mt-2 text-xs text-gray-400">
                  No financial data yet
                </p>

              </div>

            </div>

            {/* LOWER SECTION */}

            <div className="mt-8 grid gap-6 lg:grid-cols-3">

              {/* AI ASSISTANT CARD */}

              <div className="rounded-2xl bg-gray-900 p-7 text-white lg:col-span-2">

                <div className="flex items-start justify-between">

                  <div>

                    <p className="text-sm font-medium text-blue-400">
                      SaMi AI
                    </p>

                    <h2 className="mt-2 text-2xl font-bold">
                      Your business assistant
                    </h2>

                    <p className="mt-3 max-w-xl text-gray-400">

                      Ask SaMi about your
                      business, customers,
                      invoices, payments,
                      documents, and more.

                    </p>

                  </div>

                  <MessageSquare
                    size={32}
                    className="text-blue-400"
                  />

                </div>

                <button
                  onClick={() =>
                    navigateTo("chat")
                  }
                  className="mt-6 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-medium transition hover:bg-blue-700"
                >

                  Open AI Chat

                  <ArrowUpRight
                    size={18}
                  />

                </button>

              </div>

              {/* QUICK ACTIONS */}

              <div className="rounded-2xl bg-white p-7 shadow-sm">

                <h2 className="text-lg font-bold text-gray-900">
                  Quick Actions
                </h2>

                <div className="mt-5 space-y-3">

                  <button
                    onClick={() =>
                      navigateTo(
                        "chat"
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-3 text-left transition hover:bg-gray-50"
                  >

                    <Plus
                      size={18}
                      className="text-blue-600"
                    />

                    <span className="text-sm font-medium">
                      Start new AI chat
                    </span>

                  </button>

                  <button
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-3 text-left transition hover:bg-gray-50"
                  >

                    <Users
                      size={18}
                      className="text-blue-600"
                    />

                    <span className="text-sm font-medium">
                      Add customer
                    </span>

                  </button>

                  <button
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-3 text-left transition hover:bg-gray-50"
                  >

                    <FileText
                      size={18}
                      className="text-blue-600"
                    />

                    <span className="text-sm font-medium">
                      Create invoice
                    </span>

                  </button>

                </div>

              </div>

            </div>

            {/* RECENT ACTIVITY */}

            <div className="mt-8 rounded-2xl bg-white p-7 shadow-sm">

              <div className="flex items-center justify-between">

                <div>

                  <h2 className="text-lg font-bold text-gray-900">
                    Recent Activity
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Your latest workspace activity
                  </p>

                </div>

                <button
                  onClick={() =>
                    navigateTo(
                      "chat"
                    )
                  }
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Open AI Chat
                </button>

              </div>

              <div className="mt-6 rounded-xl border border-dashed border-gray-200 p-8 text-center">

                <MessageSquare
                  size={28}
                  className="mx-auto text-gray-300"
                />

                <p className="mt-3 text-sm font-medium text-gray-600">
                  No recent activity
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  Your business activity will appear here.
                </p>

              </div>

            </div>

          </div>
        )}

        {/* ====================================
            AI CHAT
        ==================================== */}

        {activeView ===
          "chat" && (
          <div className="mt-6 flex gap-6">

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
              onNewChat={
                newChat
              }
            />

          </div>
        )}

        {/* ====================================
            DOCUMENTS
        ==================================== */}

        {activeView ===
          "documents" && (
          <div className="mt-8 rounded-2xl bg-white p-10 shadow-sm">

            <FolderOpen
              size={40}
              className="text-blue-600"
            />

            <h1 className="mt-5 text-2xl font-bold">
              Documents
            </h1>

            <p className="mt-2 text-gray-500">
              Document management will be
              available here.
            </p>

          </div>
        )}

        {/* ====================================
            ANALYTICS
        ==================================== */}

        {activeView ===
          "analytics" && (
          <div className="mt-8 rounded-2xl bg-white p-10 shadow-sm">

            <BarChart3
              size={40}
              className="text-blue-600"
            />

            <h1 className="mt-5 text-2xl font-bold">
              Analytics
            </h1>

            <p className="mt-2 text-gray-500">
              Business analytics and
              reporting will be available
              here.
            </p>

          </div>
        )}

        {/* ====================================
            SETTINGS
        ==================================== */}

        {activeView ===
          "settings" && (
          <div className="mt-8 rounded-2xl bg-white p-10 shadow-sm">

            <Settings
              size={40}
              className="text-blue-600"
            />

            <h1 className="mt-5 text-2xl font-bold">
              Settings
            </h1>

            <p className="mt-2 text-gray-500">
              Workspace and account settings
              will be available here.
            </p>

          </div>
        )}

      </main>

    </div>
  );
}