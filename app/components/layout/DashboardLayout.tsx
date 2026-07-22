"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import ChatWindow from "../dashboard/ChatWindow";
import ChatHistory from "../dashboard/ChatHistory";
import Customers from "../dashboard/Customers";
import TopBar from "./TopBar";

import {
  LayoutDashboard,
  MessageSquare,
  Users,
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

type ActivePage =
  | "dashboard"
  | "chat"
  | "customers"
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
    activePage,
    setActivePage,
  ] = useState<ActivePage>(
    "dashboard"
  );

  // ==========================================
  // LOAD PROFILE & CONVERSATIONS
  // ==========================================

  useEffect(() => {
    loadProfile();
    loadConversations();
  }, []);

  // ==========================================
  // LOAD USER PROFILE
  // ==========================================

  async function loadProfile() {
    try {
      const response =
        await fetch(
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

  // ==========================================
  // LOAD CONVERSATIONS
  // ==========================================

  async function loadConversations() {
    try {
      const response =
        await fetch(
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
  // START NEW CHAT
  // ==========================================

  function newChat() {
    setSelectedId(null);
    setActivePage("chat");
  }

  // ==========================================
  // CONVERSATION CREATED
  // ==========================================

  function handleConversationCreated(
    id: string
  ) {
    setSelectedId(id);

    loadConversations();
  }

  // ==========================================
  // SELECT EXISTING CONVERSATION
  // ==========================================

  function handleSelectConversation(
    id: string
  ) {
    setSelectedId(id);
    setActivePage("chat");
  }

  // ==========================================
  // NAVIGATION
  // ==========================================

  function handleNavigation(
    page: ActivePage
  ) {
    setActivePage(page);

    // When leaving the chat,
    // clear the selected conversation.
    if (page !== "chat") {
      setSelectedId(null);
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* ======================================
          SIDEBAR
      ====================================== */}

      <aside className="flex w-72 flex-col bg-gray-900 p-6 text-white">

        {/* ====================================
            LOGO
        ==================================== */}

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

        {/* ====================================
            NAVIGATION
        ==================================== */}

        <nav className="space-y-3">

          {/* DASHBOARD */}

          <button
            onClick={() =>
              handleNavigation(
                "dashboard"
              )
            }
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
              activePage === "dashboard"
                ? "bg-blue-600 hover:bg-blue-700"
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
              handleNavigation(
                "chat"
              )
            }
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
              activePage === "chat"
                ? "bg-blue-600 hover:bg-blue-700"
                : "hover:bg-gray-800"
            }`}
          >

            <MessageSquare
              size={20}
            />

            AI Chat

          </button>

          {/* CUSTOMERS */}

          <button
            onClick={() =>
              handleNavigation(
                "customers"
              )
            }
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
              activePage === "customers"
                ? "bg-blue-600 hover:bg-blue-700"
                : "hover:bg-gray-800"
            }`}
          >

            <Users
              size={20}
            />

            Customers

          </button>

          {/* DOCUMENTS */}

          <button
            onClick={() =>
              handleNavigation(
                "documents"
              )
            }
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
              activePage === "documents"
                ? "bg-blue-600 hover:bg-blue-700"
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
              handleNavigation(
                "analytics"
              )
            }
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
              activePage === "analytics"
                ? "bg-blue-600 hover:bg-blue-700"
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
              handleNavigation(
                "settings"
              )
            }
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
              activePage === "settings"
                ? "bg-blue-600 hover:bg-blue-700"
                : "hover:bg-gray-800"
            }`}
          >

            <Settings
              size={20}
            />

            Settings

          </button>

        </nav>

        {/* ====================================
            USER PROFILE
        ==================================== */}

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

        {/* ====================================
            TOP BAR
        ==================================== */}

        <TopBar />

        {/* ====================================
            DASHBOARD PAGE
        ==================================== */}

        {activePage ===
          "dashboard" && (
          <div className="mt-8">

            <h1 className="text-3xl font-bold text-gray-900">
              Dashboard
            </h1>

            <p className="mt-2 text-gray-500">
              Welcome back to SaMi Assist.
              Manage your business from one
              AI-powered workspace.
            </p>

            {/* DASHBOARD CARDS */}

            <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">

              <div className="rounded-2xl bg-white p-6 shadow-sm">

                <p className="text-sm text-gray-500">
                  Customers
                </p>

                <p className="mt-2 text-3xl font-bold text-gray-900">
                  —
                </p>

                <p className="mt-2 text-xs text-gray-400">
                  Customer management
                  coming from live data
                </p>

              </div>

              <div className="rounded-2xl bg-white p-6 shadow-sm">

                <p className="text-sm text-gray-500">
                  Invoices
                </p>

                <p className="mt-2 text-3xl font-bold text-gray-900">
                  —
                </p>

                <p className="mt-2 text-xs text-gray-400">
                  Invoice management
                  coming soon
                </p>

              </div>

              <div className="rounded-2xl bg-white p-6 shadow-sm">

                <p className="text-sm text-gray-500">
                  Payments
                </p>

                <p className="mt-2 text-3xl font-bold text-gray-900">
                  —
                </p>

                <p className="mt-2 text-xs text-gray-400">
                  Payment tracking
                  coming soon
                </p>

              </div>

              <div className="rounded-2xl bg-white p-6 shadow-sm">

                <p className="text-sm text-gray-500">
                  Cashflow
                </p>

                <p className="mt-2 text-3xl font-bold text-gray-900">
                  —
                </p>

                <p className="mt-2 text-xs text-gray-400">
                  Cashflow insights
                  coming soon
                </p>

              </div>

            </div>

            {/* WELCOME SECTION */}

            <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm">

              <h2 className="text-xl font-bold text-gray-900">
                Welcome to SaMi Assist
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
                Your AI-powered business workspace.
                Use AI Chat to work with your
                business information, or use the
                Customers module to manage your
                customer relationships.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">

                <button
                  onClick={() =>
                    handleNavigation(
                      "chat"
                    )
                  }
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Open AI Chat
                </button>

                <button
                  onClick={() =>
                    handleNavigation(
                      "customers"
                    )
                  }
                  className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Manage Customers
                </button>

              </div>

            </div>

          </div>
        )}

        {/* ====================================
            AI CHAT PAGE
        ==================================== */}

        {activePage === "chat" && (
          <div className="mt-6 flex gap-6">

            {/* CHAT */}

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

            {/* CHAT HISTORY */}

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
            CUSTOMERS PAGE
        ==================================== */}

        {activePage ===
          "customers" && (
          <Customers />
        )}

        {/* ====================================
            DOCUMENTS PAGE
        ==================================== */}

        {activePage ===
          "documents" && (
          <div className="mt-8">

            <div className="rounded-2xl bg-white p-12 text-center shadow-sm">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">

                <FolderOpen
                  size={28}
                  className="text-gray-400"
                />

              </div>

              <h2 className="mt-5 text-xl font-bold text-gray-900">
                Documents
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                Document management and AI-powered
                document search will be available
                here.
              </p>

            </div>

          </div>
        )}

        {/* ====================================
            ANALYTICS PAGE
        ==================================== */}

        {activePage ===
          "analytics" && (
          <div className="mt-8">

            <div className="rounded-2xl bg-white p-12 text-center shadow-sm">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">

                <BarChart3
                  size={28}
                  className="text-gray-400"
                />

              </div>

              <h2 className="mt-5 text-xl font-bold text-gray-900">
                Analytics
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                Business analytics and AI-powered
                insights will be available here.
              </p>

            </div>

          </div>
        )}

        {/* ====================================
            SETTINGS PAGE
        ==================================== */}

        {activePage ===
          "settings" && (
          <div className="mt-8">

            <div className="rounded-2xl bg-white p-12 text-center shadow-sm">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">

                <Settings
                  size={28}
                  className="text-gray-400"
                />

              </div>

              <h2 className="mt-5 text-xl font-bold text-gray-900">
                Settings
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                Account and workspace settings
                will be available here.
              </p>

            </div>

          </div>
        )}

      </main>

    </div>
  );
}