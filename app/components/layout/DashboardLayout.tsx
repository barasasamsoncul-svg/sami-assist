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
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true);
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
  // NAVIGATION HANDLERS
  // ==========================================

  function newChat() {
    setSelectedId(null);
    setActivePage("chat");
    if (isMobile) setSidebarOpen(false);
  }

  function handleConversationCreated(id: string) {
    setSelectedId(id);
    loadConversations();
    if (isMobile) setSidebarOpen(false);
  }

  function handleSelectConversation(id: string) {
    setSelectedId(id);
    setActivePage("chat");
    if (isMobile) setSidebarOpen(false);
  }

  function handleNavigation(page: ActivePage) {
    setActivePage(page);
    if (page !== "chat") setSelectedId(null);
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
  // SIDEBAR COMPONENT
  // ==========================================

  const Sidebar = () => (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-gradient-to-b from-gray-900 to-gray-950 p-6 text-white shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}
    >
      {/* Close button - mobile only */}
      {isMobile && (
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute right-4 top-4 rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white lg:hidden"
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
            className="rounded-xl shadow-lg ring-2 ring-white/10"
          />
          <div className="absolute -right-1 -top-1 rounded-full bg-blue-500 p-1">
            <Sparkles size={12} className="text-white" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
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
  // OVERLAY (mobile)
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

            {/* Stats Grid */}
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

            {/* Welcome Section */}
            <div className="mt-6 lg:mt-8">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 p-8 text-white shadow-lg">
                <div className="relative z-10">
                  <h2 className="text-xl font-bold lg:text-2xl">Welcome to SaMi Assist</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-blue-100 lg:text-base">
                    Your AI-powered business workspace. Use AI Chat to work with your business
                    information, or manage customer relationships.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      onClick={() => handleNavigation("chat")}
                      className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 hover:scale-105 active:scale-95"
                    >
                      Open AI Chat
                    </button>
                    <button
                      onClick={() => handleNavigation("customers")}
                      className="rounded-xl bg-white/20 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30 hover:scale-105 active:scale-95"
                    >
                      Manage Customers
                    </button>
                  </div>
                </div>
                {/* Decorative blobs */}
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
              </div>
            </div>
          </div>
        );

      case "chat":
        return (
          <div className="mt-4 flex flex-col gap-4 lg:mt-6 lg:flex-row lg:gap-6">
            <div className="flex-1 min-h-[500px]">
              <ChatWindow
                conversationId={selectedId}
                onConversationCreated={handleConversationCreated}
              />
            </div>
            <div className="lg:w-80 xl:w-96">
              <ChatHistory
                conversations={conversations}
                selectedId={selectedId}
                onSelect={handleSelectConversation}
                onNewChat={newChat}
              />
            </div>
          </div>
        );

      case "customers":
        return <Customers />;

      default:
        // Documents, Analytics, Settings - placeholder pages
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
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 min-h-screen overflow-x-hidden">
        {/* Top Bar with Hamburger */}
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md dark:bg-gray-900/80">
          <div className="flex items-center justify-between px-4 py-3 lg:px-8 lg:py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
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

        {/* Page Content */}
        <div className="px-4 pb-8 sm:px-6 lg:px-8">
          {renderPageContent()}
        </div>
      </main>
    </div>
  );
}