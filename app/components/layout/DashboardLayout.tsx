"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import ChatWindow from "../dashboard/ChatWindow";
import ChatHistory from "../dashboard/ChatHistory";
import Customers from "../dashboard/customers";
import TopBar from "./TopBar";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  FolderOpen,
  BarChart3,
  Settings,
  Menu,
  X,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  Plus,
  User,
} from "lucide-react";

type Conversation = {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  pinned?: boolean;
  archived?: boolean;
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // ==========================================
  // DETECT MOBILE
  // ==========================================

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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
      const response = await fetch("/api/profile");
      if (!response.ok) throw new Error("Failed to load profile");
      const data = await response.json();
      setProfile(data);
    } catch (error) {
      console.error("Profile loading error:", error);
    } finally {
      setLoadingProfile(false);
    }
  }

  // ==========================================
  // LOAD CONVERSATIONS
  // ==========================================

  async function loadConversations() {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) throw new Error("Failed to load conversations");
      const data = await response.json();
      setConversations(data);
    } catch (error) {
      console.error("Conversation loading error:", error);
    }
  }

  // ==========================================
  // CONVERSATION HANDLERS
  // ==========================================

  function handleConversationCreated(id: string) {
    setSelectedId(id);
    loadConversations();
  }

  function handleSelectConversation(id: string) {
    setSelectedId(id);
    setActivePage("chat");
    if (isMobile) setSidebarOpen(false);
  }

  function handleConversationUpdate(id: string, title: string) {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === id ? { ...conv, title } : conv
      )
    );
  }

  function handleDeleteConversation(id: string) {
    setConversations((prev) => prev.filter((conv) => conv.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handlePinConversation(id: string) {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === id ? { ...conv, pinned: !conv.pinned } : conv
      )
    );
  }

  function handleArchiveConversation(id: string) {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === id ? { ...conv, archived: !conv.archived } : conv
      )
    );
  }

  function handleRenameConversation(id: string, newTitle: string) {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === id ? { ...conv, title: newTitle } : conv
      )
    );
  }

  function newChat() {
    setSelectedId(null);
    setActivePage("chat");
    if (isMobile) setSidebarOpen(false);
  }

  function handleNavigation(page: ActivePage) {
    setActivePage(page);
    if (page !== "chat") setSelectedId(null);
    if (isMobile) setSidebarOpen(false);
  }

  function goBackToDashboard() {
    setActivePage("dashboard");
    setSelectedId(null);
    if (isMobile) setSidebarOpen(false);
  }

  // ==========================================
  // SIDEBAR NAV ITEMS
  // ==========================================

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "chat", label: "AI Chat", icon: MessageSquare },
    { id: "customers", label: "Customers", icon: Users },
    { id: "documents", label: "Documents", icon: FolderOpen },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "settings", label: "Settings", icon: Settings },
  ] as const;

  // ==========================================
  // MAIN SIDEBAR (Dashboard Navigation)
  // ==========================================

  const MainSidebar = () => (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-gradient-to-b from-[#0a1628] to-[#1a2a4a] p-6 text-white shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}
    >
      {isMobile && (
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute right-4 top-4 rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
          aria-label="Close sidebar"
        >
          <X size={24} />
        </button>
      )}

      {/* Logo */}
      <div className="mb-10 flex items-center gap-3">
        <div className="relative">
          <Image
            src="/logo.png"
            alt="SaMi Technologies"
            width={48}
            height={48}
            className="rounded-xl shadow-lg ring-2 ring-blue-500/30"
          />
          <div className="absolute -right-1 -top-1 rounded-full bg-blue-500 p-1">
            <Sparkles size={12} className="text-white" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
            SaMi Assist
          </h2>
          <p className="text-xs text-gray-400">AI Workspace</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNavigation(item.id)}
              className={`
                group relative flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left font-medium transition-all duration-200
                ${
                  isActive
                    ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/25"
                    : "text-gray-300 hover:bg-white/10 hover:text-white"
                }
              `}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={20} className={isActive ? "text-white" : "text-gray-400 group-hover:text-white"} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight size={16} className="text-white/60" />}
            </button>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="mt-auto pt-6 border-t border-white/10">
        <div className="rounded-2xl bg-white/5 p-4 backdrop-blur-sm transition hover:bg-white/10">
          {loadingProfile ? (
            <div className="space-y-2">
              <div className="h-5 w-32 animate-pulse rounded-lg bg-white/10" />
              <div className="h-4 w-44 animate-pulse rounded-lg bg-white/10" />
            </div>
          ) : profile ? (
            <>
              <p className="font-semibold text-white">
                {profile.full_name || "SaMi Assist User"}
              </p>
              <p className="mt-1 text-sm text-gray-400 truncate">{profile.email}</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-white">SaMi Assist User</p>
              <p className="text-sm text-gray-400">Account</p>
            </>
          )}
        </div>
      </div>
    </aside>
  );

  // ==========================================
  // CHAT SIDEBAR (Inside Chat Panel)
  // ==========================================

  const ChatSidebar = () => (
    <div className="flex h-full w-72 flex-col bg-gradient-to-b from-[#0a1628] to-[#1a2a4a] p-4 text-white shadow-xl">
      {/* Back Button */}
      <button
        onClick={goBackToDashboard}
        className="group mb-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-1" />
        <span>Back to Dashboard</span>
      </button>

      {/* Logo & Brand */}
      <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-6">
        <div className="relative">
          <Image
            src="/logo.png"
            alt="SaMi Technologies"
            width={40}
            height={40}
            className="rounded-lg shadow-lg ring-2 ring-blue-500/30"
          />
        </div>
        <div>
          <h3 className="text-base font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
            SaMi Assist
          </h3>
          <p className="text-[10px] text-gray-400">INNOVATE • SOLVE • EMPOWER</p>
        </div>
      </div>

      {/* New Chat Button */}
      <button
        onClick={newChat}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-2.5 font-medium text-white transition hover:shadow-lg hover:shadow-blue-500/25 hover:scale-[1.02] active:scale-95"
      >
        <Plus size={18} />
        <span>New Chat</span>
      </button>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Recent Conversations
        </h4>
        <div className="space-y-1">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare size={28} className="text-gray-600" />
              <p className="mt-2 text-sm text-gray-400">No conversations yet</p>
              <p className="text-xs text-gray-500">Start a new chat to begin</p>
            </div>
          ) : (
            conversations.map((chat) => (
              <button
                key={chat.id}
                onClick={() => handleSelectConversation(chat.id)}
                className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  selectedId === chat.id
                    ? "bg-blue-600/20 text-blue-300"
                    : "text-gray-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="flex-shrink-0 text-gray-500" />
                  <span className="truncate">{chat.title}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* User Profile at Bottom */}
      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="rounded-xl bg-white/5 p-3 backdrop-blur-sm transition hover:bg-white/10">
          {loadingProfile ? (
            <div className="space-y-1.5">
              <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-36 animate-pulse rounded bg-white/10" />
            </div>
          ) : profile ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/30">
                  <User size={14} className="text-blue-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {profile.full_name || "SaMi Assist User"}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{profile.email}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-white">SaMi Assist User</p>
              <p className="text-xs text-gray-400">Account</p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ==========================================
  // OVERLAY (Mobile)
  // ==========================================

  const Overlay = () => (
    <div
      className={`
        fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden
        ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}
      `}
      onClick={() => setSidebarOpen(false)}
      aria-hidden="true"
    />
  );

  // ==========================================
  // RENDER PAGE CONTENT
  // ==========================================

  const renderPageContent = () => {
    switch (activePage) {
      case "dashboard":
        return (
          <div className="mt-6 lg:mt-8">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white lg:text-3xl">
                Dashboard
              </h1>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                Welcome back to SaMi Assist. Manage your business from one AI-powered workspace.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:gap-6 xl:grid-cols-4">
              {["Customers", "Invoices", "Payments", "Cashflow"].map((title) => (
                <div
                  key={title}
                  className="group rounded-2xl bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all hover:shadow-xl dark:bg-gray-800/80"
                >
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">—</p>
                  <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    Data coming soon
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 lg:mt-8">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a1628] to-[#1a2a4a] p-8 text-white shadow-lg">
                <div className="relative z-10">
                  <h2 className="text-xl font-bold lg:text-2xl">Welcome to SaMi Assist</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-blue-100 lg:text-base">
                    Your AI-powered business workspace. Use AI Chat to work with your business
                    information, or manage customer relationships.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      onClick={() => handleNavigation("chat")}
                      className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 hover:scale-105 active:scale-95"
                    >
                      Open AI Chat
                    </button>
                    <button
                      onClick={() => handleNavigation("customers")}
                      className="rounded-xl bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 hover:scale-105 active:scale-95"
                    >
                      Manage Customers
                    </button>
                  </div>
                </div>
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl" />
              </div>
            </div>
          </div>
        );

      case "chat":
        return (
          <div className="mt-4 lg:mt-6">
            <div className="flex flex-col gap-4 lg:flex-row">
              {/* Chat Sidebar - Left */}
              <div className="hidden lg:block flex-shrink-0">
                <ChatSidebar />
              </div>

              {/* Chat Window - Right */}
              <div className="flex-1 min-w-0">
                {/* Mobile: Chat header with back and new chat */}
                <div className="mb-3 flex items-center gap-2 lg:hidden">
                  <button
                    onClick={goBackToDashboard}
                    className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                  <button
                    onClick={newChat}
                    className="ml-auto rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    + New Chat
                  </button>
                </div>

                <ChatWindow
                  conversationId={selectedId}
                  onConversationCreated={handleConversationCreated}
                  onConversationUpdate={handleConversationUpdate}
                />
              </div>
            </div>
          </div>
        );

      case "customers":
        return <Customers />;

      default:
        const pageConfig = {
          documents: { icon: FolderOpen, title: "Documents", desc: "Document management and AI-powered search" },
          analytics: { icon: BarChart3, title: "Analytics", desc: "Business analytics and AI-powered insights" },
          settings: { icon: Settings, title: "Settings", desc: "Account and workspace settings" },
        };

        const config = pageConfig[activePage as keyof typeof pageConfig];
        const Icon = config.icon;

        return (
          <div className="mt-6 lg:mt-8">
            <div className="rounded-2xl bg-white/80 p-8 text-center shadow-sm backdrop-blur-sm dark:bg-gray-800/80 lg:p-12">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                <Icon size={28} className="text-gray-400 dark:text-gray-500" />
              </div>
              <h2 className="mt-5 text-xl font-bold text-gray-900 dark:text-white lg:text-2xl">
                {config.title}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
                {config.desc} will be available here.
              </p>
            </div>
          </div>
        );
    }
  };

  // ==========================================
  // MAIN RETURN
  // ==========================================

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <Overlay />

      {/* Main Sidebar */}
      <MainSidebar />

      {/* Main Content */}
      <main className="flex-1 min-h-screen overflow-x-hidden">
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md dark:bg-gray-900/80">
          <div className="flex items-center justify-between px-4 py-3 lg:px-8 lg:py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                aria-label="Open sidebar"
              >
                <Menu size={24} />
              </button>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 lg:hidden">
                {activePage.charAt(0).toUpperCase() + activePage.slice(1)}
              </span>
            </div>
            <TopBar />
          </div>
        </div>

        <div className="px-4 pb-8 sm:px-6 lg:px-8">
          {renderPageContent()}
        </div>
      </main>
    </div>
  );
}