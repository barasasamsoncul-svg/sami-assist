"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import ChatWindow from "../dashboard/ChatWindow";
import Customers from "../dashboard/customers";
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
  Search,
  Moon,
  Sun,
  LogOut,
  Bot,
  ArrowUpRight,
  Activity,
  FileText,
  Zap,
  Package,
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
  | "invoices"
  | "inventory"
  | "documents"
  | "analytics"
  | "settings";

export default function DashboardLayout() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activePage, setActivePage] =
    useState<ActivePage>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatSidebarOpen, setChatSidebarOpen] =
    useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isLoggingOut, setIsLoggingOut] =
    useState(false);

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
        setChatSidebarOpen(false);
      }
    };

    checkMobile();

    window.addEventListener(
      "resize",
      checkMobile
    );

    return () =>
      window.removeEventListener(
        "resize",
        checkMobile
      );
  }, []);

  // ==========================================
  // THEME
  // ==========================================

  useEffect(() => {
    const savedTheme =
      localStorage.getItem("theme");

    const prefersDark =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

    const darkMode =
      savedTheme === "dark" ||
      (!savedTheme && prefersDark);

    setIsDark(darkMode);

    document.documentElement.classList.toggle(
      "dark",
      darkMode
    );
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;

    setIsDark(newTheme);

    document.documentElement.classList.toggle(
      "dark",
      newTheme
    );

    localStorage.setItem(
      "theme",
      newTheme ? "dark" : "light"
    );
  };

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      const response = await fetch(
        "/api/auth/logout",
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error("Logout failed.");
      }

      window.location.href =
        "/auth/login";
    } catch (error) {
      console.error(
        "Logout error:",
        error
      );

      setIsLoggingOut(false);

      alert(
        "Failed to log out. Please try again."
      );
    }
  };

  // ==========================================
  // LOAD PROFILE & CONVERSATIONS
  // ==========================================

  useEffect(() => {
    loadProfile();
    loadConversations();
  }, []);

  async function loadProfile() {
    try {
      const response =
        await fetch("/api/profile");

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
      const response =
        await fetch("/api/conversations");

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
  // CONVERSATION HANDLERS
  // ==========================================

  function handleConversationCreated(
    id: string
  ) {
    setSelectedId(id);

    loadConversations();

    if (isMobile) {
      setChatSidebarOpen(false);
    }
  }

  function handleSelectConversation(
    id: string
  ) {
    setSelectedId(id);
    setActivePage("chat");

    if (isMobile) {
      setChatSidebarOpen(false);
    }
  }

  function handleConversationUpdate(
    id: string,
    title: string
  ) {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              title,
            }
          : conversation
      )
    );
  }

  function handleDeleteConversation(
    id: string
  ) {
    setConversations((prev) =>
      prev.filter(
        (conversation) =>
          conversation.id !== id
      )
    );

    if (selectedId === id) {
      setSelectedId(null);
    }
  }

  function newChat() {
    setSelectedId(null);
    setActivePage("chat");

    if (isMobile) {
      setChatSidebarOpen(false);
    }
  }

  function handleNavigation(
    page: ActivePage
  ) {
    setActivePage(page);

    if (page !== "chat") {
      setSelectedId(null);
    }

    if (isMobile) {
      setSidebarOpen(false);
    }
  }

  function goBackToDashboard() {
    setActivePage("dashboard");
    setSelectedId(null);

    if (isMobile) {
      setSidebarOpen(false);
      setChatSidebarOpen(false);
    }
  }

  // ==========================================
  // NAVIGATION
  // ==========================================

  const navItems = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "chat", label: "AI Workspace", icon: MessageSquare },
  { id: "customers", label: "Customers", icon: Users },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "documents", label: "Documents", icon: FolderOpen },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

  // ==========================================
  // MAIN SIDEBAR
  // ==========================================

  const MainSidebar = () => (
  <aside
    className={`
      fixed inset-y-0 left-0 z-50
      flex w-[280px] flex-col
      border-r border-white/10
      bg-[#07111f]
      text-white
      shadow-2xl
      transition-transform duration-300
      lg:relative lg:translate-x-0
      ${
        sidebarOpen
          ? "translate-x-0"
          : "-translate-x-full"
      }
    `}
  >
    {isMobile && (
      <button
        onClick={() => setSidebarOpen(false)}
        className="absolute right-4 top-4 z-10 rounded-xl p-2 text-gray-400 hover:bg-white/10 hover:text-white"
      >
        <X size={20} />
      </button>
    )}

    {/* ===== FIXED HEADER ===== */}
    <div className="flex-shrink-0 px-6 pb-4 pt-7">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Image
            src="/logo.png"
            alt="SaMi"
            width={44}
            height={44}
            className="rounded-xl"
          />
          <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500">
            <Sparkles size={9} className="text-white" />
          </div>
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">SaMi</h1>
          <p className="text-xs text-slate-500">AI Business Workspace</p>
        </div>
      </div>
    </div>

    {/* ===== FIXED SEARCH ===== */}
    <div className="flex-shrink-0 px-4 pb-4">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          type="text"
          placeholder="Search..."
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:bg-white/10"
        />
      </div>
    </div>

    {/* ===== SCROLLABLE NAVIGATION ===== */}
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
        Workspace
      </p>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNavigation(item.id)}
              className={`
                group flex w-full items-center
                gap-3 rounded-xl px-4 py-3
                text-left text-sm font-medium
                transition-all
                ${
                  isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                }
              `}
            >
              <Icon
                size={19}
                className={
                  isActive
                    ? "text-white"
                    : "text-slate-500 group-hover:text-slate-300"
                }
              />
              <span className="flex-1">{item.label}</span>
              {isActive && (
                <ChevronRight size={15} className="text-white/60" />
              )}
            </button>
          );
        })}
      </nav>
    </div>

    {/* ===== FIXED PROFILE ===== */}
    <div className="flex-shrink-0 border-t border-white/[0.06] p-4">
      <div className="flex items-center gap-3 rounded-xl p-2">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
          {profile?.full_name?.[0]?.toUpperCase() || "S"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {loadingProfile ? "Loading..." : profile?.full_name || "SaMi User"}
          </p>
          <p className="truncate text-xs text-slate-500">{profile?.email || "Account"}</p>
        </div>
      </div>
    </div>
  </aside>
);

  // ==========================================
  // CHAT SIDEBAR
  // ==========================================

  const ChatSidebar = () => (
    <div className="flex h-full w-[280px] flex-shrink-0 flex-col border-r border-white/[0.06] bg-[#07111f] text-white">
      {/* BACK */}

      <div className="p-4">
        <button
          onClick={goBackToDashboard}
          className="group flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
        >
          <ArrowLeft
            size={17}
            className="transition-transform group-hover:-translate-x-1"
          />

          <span>Back to Overview</span>
        </button>
      </div>

      {/* CHAT HEADER */}

      <div className="border-b border-white/[0.06] px-5 pb-5 pt-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <Bot
              size={20}
              className="text-white"
            />
          </div>

          <div>
            <h2 className="text-sm font-semibold">
              AI Workspace
            </h2>

            <p className="text-[10px] text-slate-500">
              Your intelligent business assistant
            </p>
          </div>
        </div>
      </div>

      {/* NEW CHAT */}

      <div className="p-4">
        <button
          onClick={newChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-500 active:scale-[0.98]"
        >
          <Plus size={18} />
          New conversation
        </button>
      </div>

      {/* HISTORY */}

      <div className="flex-1 overflow-y-auto px-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">
            Conversations
          </p>

          <span className="text-[10px] text-slate-600">
            {conversations.length}
          </span>
        </div>

        {conversations.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04]">
              <MessageSquare
                size={20}
                className="text-slate-600"
              />
            </div>

            <p className="mt-4 text-sm font-medium text-slate-400">
              No conversations yet
            </p>

            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Start a conversation with
              SaMi AI.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map(
              (chat) => (
                <button
                  key={chat.id}
                  onClick={() =>
                    handleSelectConversation(
                      chat.id
                    )
                  }
                  className={`
                    flex w-full items-center gap-3
                    rounded-xl px-3 py-3
                    text-left text-sm
                    transition
                    ${
                      selectedId ===
                      chat.id
                        ? "bg-blue-600/15 text-blue-300"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                    }
                  `}
                >
                  <MessageSquare
                    size={15}
                    className="flex-shrink-0"
                  />

                  <span className="truncate">
                    {chat.title ||
                      "New conversation"}
                  </span>
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* CHAT SIDEBAR PROFILE */}

      <div className="border-t border-white/[0.06] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/20 text-xs font-semibold text-blue-400">
            {profile?.full_name?.[0]?.toUpperCase() ||
              "S"}
          </div>

          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white">
              {profile?.full_name ||
                "SaMi User"}
            </p>

            <p className="truncate text-[10px] text-slate-600">
              {profile?.email || ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // ==========================================
  // MOBILE CHAT SIDEBAR
  // ==========================================

  const MobileChatSidebar = () => (
    <>
      <div
        className={`
          fixed inset-0 z-40 bg-black/60
          backdrop-blur-sm lg:hidden
          ${
            chatSidebarOpen
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }
        `}
        onClick={() =>
          setChatSidebarOpen(false)
        }
      />

      <div
        className={`
          fixed inset-y-0 left-0 z-50
          transform transition-transform
          duration-300 lg:hidden
          ${
            chatSidebarOpen
              ? "translate-x-0"
              : "-translate-x-full"
          }
        `}
      >
        <ChatSidebar />
      </div>
    </>
  );

  // ==========================================
  // MAIN SIDEBAR OVERLAY
  // ==========================================

  const Overlay = () => (
    <div
      className={`
        fixed inset-0 z-40 bg-black/60
        backdrop-blur-sm lg:hidden
        ${
          sidebarOpen &&
          activePage !== "chat"
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }
      `}
      onClick={() =>
        setSidebarOpen(false)
      }
    />
  );

  // ==========================================
  // TOP BAR
  // ==========================================

 const TopBar = () => (
  <header className="flex h-[72px] flex-shrink-0 items-center justify-between border-b border-gray-200/70 bg-white/90 px-4 backdrop-blur-xl dark:border-gray-800/70 dark:bg-gray-950/90 lg:px-7">
    {/* LEFT - Page Name */}
    <div className="flex items-center gap-3">
      <button
        onClick={() => setSidebarOpen(true)}
        className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
      >
        <Menu size={21} />
      </button>
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          {activePage === "dashboard" ? "Overview" : activePage.charAt(0).toUpperCase() + activePage.slice(1)}
        </h1>
        <p className="text-xs text-gray-400">
          {activePage === "dashboard" ? "Your business workspace" : `Manage your ${activePage}`}
        </p>
      </div>
    </div>

    {/* RIGHT - Theme + Sign Out */}
    <div className="flex items-center gap-2">
      <button
        onClick={toggleTheme}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
      >
        <LogOut size={17} />
        {isLoggingOut ? "Signing out..." : "Sign out"}
      </button>
    </div>
  </header>
);

  // ==========================================
  // DASHBOARD OVERVIEW
  // ==========================================

  const DashboardHome = () => (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1600px] p-5 sm:p-7 lg:p-9">
        {/* HEADER */}

        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                Workspace
              </span>

              <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                All systems operational
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
              Good to see you,{" "}
              {profile?.full_name
                ?.split(" ")[0] ||
                "there"}
              .
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Your business workspace is
              ready. Use SaMi AI to work
              smarter, manage customers,
              and turn information into
              action.
            </p>
          </div>

          <button
            onClick={() =>
              handleNavigation("chat")
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 active:scale-[0.98]"
          >
            <Sparkles size={17} />
            Open SaMi AI
          </button>
        </div>

        {/* STAT CARDS */}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "Customers",
              value: "—",
              subtitle:
                "Customer records",
              icon: Users,
            },
            {
              title: "Conversations",
              value:
                conversations.length,
              subtitle:
                "AI conversations",
              icon: MessageSquare,
            },
            {
              title: "Documents",
              value: "—",
              subtitle:
                "Business documents",
              icon: FileText,
            },
            {
              title: "AI Activity",
              value: "Active",
              subtitle:
                "Workspace status",
              icon: Activity,
            },
          ].map((stat) => {
            const Icon = stat.icon;

            return (
              <div
                key={stat.title}
                className="group rounded-2xl border border-gray-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
                    <Icon
                      size={19}
                      className="text-blue-600 dark:text-blue-400"
                    />
                  </div>

                  <ArrowUpRight
                    size={16}
                    className="text-gray-300 transition group-hover:text-blue-500"
                  />
                </div>

                <p className="mt-5 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {stat.title}
                </p>

                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </p>

                <p className="mt-1 text-[11px] text-gray-400">
                  {stat.subtitle}
                </p>
              </div>
            );
          })}
        </div>

        {/* MAIN WORKSPACE */}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          {/* AI HERO */}

          <div className="relative overflow-hidden rounded-3xl bg-[#07111f] p-7 text-white shadow-xl sm:p-9">
            <div className="relative z-10 max-w-2xl">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600">
                <Sparkles size={21} />
              </div>

              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-400">
                Your AI workspace
              </p>

              <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                Work with your
                business using AI.
              </h2>

              <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
                Ask questions, explore
                your business information,
                manage conversations, and
                let SaMi help you turn
                everyday work into
                intelligent action.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  onClick={() =>
                    handleNavigation(
                      "chat"
                    )
                  }
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold transition hover:bg-blue-500"
                >
                  <MessageSquare
                    size={16}
                  />
                  Start chatting
                </button>

                <button
                  onClick={() =>
                    handleNavigation(
                      "customers"
                    )
                  }
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  <Users size={16} />
                  View customers
                </button>
              </div>
            </div>

            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-600/10 blur-3xl" />

            <div className="absolute -bottom-32 right-20 h-80 w-80 rounded-full bg-indigo-600/10 blur-3xl" />

            <div className="absolute bottom-6 right-7 hidden opacity-10 lg:block">
              <Bot size={150} />
            </div>
          </div>

          {/* QUICK ACTIONS */}

          <div className="rounded-3xl border border-gray-200/70 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Quick actions
                </h3>

                <p className="mt-1 text-xs text-gray-400">
                  Jump into your workspace
                </p>
              </div>

              <Zap
                size={19}
                className="text-blue-500"
              />
            </div>

            <div className="mt-6 space-y-2">
              {[
                {
                  label: "Start a new AI chat",
                  description:
                    "Ask SaMi anything",
                  icon: MessageSquare,
                  action: () =>
                    handleNavigation(
                      "chat"
                    ),
                },
                {
                  label: "Manage customers",
                  description:
                    "View your customer records",
                  icon: Users,
                  action: () =>
                    handleNavigation(
                      "customers"
                    ),
                },
                {
                  label: "Explore documents",
                  description:
                    "Organize business files",
                  icon: FolderOpen,
                  action: () =>
                    handleNavigation(
                      "documents"
                    ),
                },
                {
                  label: "View analytics",
                  description:
                    "Understand your business",
                  icon: BarChart3,
                  action: () =>
                    handleNavigation(
                      "analytics"
                    ),
                },
              ].map((action) => {
                const Icon = action.icon;

                return (
                  <button
                    key={action.label}
                    onClick={action.action}
                    className="group flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 transition group-hover:bg-blue-50 dark:bg-gray-800 dark:group-hover:bg-blue-500/10">
                      <Icon
                        size={17}
                        className="text-gray-500 group-hover:text-blue-600 dark:text-gray-400 dark:group-hover:text-blue-400"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                        {action.label}
                      </p>

                      <p className="mt-0.5 text-[10px] text-gray-400">
                        {action.description}
                      </p>
                    </div>

                    <ChevronRight
                      size={15}
                      className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ==========================================
  // PAGE CONTENT
  // ==========================================

  const renderPageContent = () => {
    switch (activePage) {
      case "dashboard":
        return <DashboardHome />;

    case "chat":
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Desktop conversation sidebar */}
      {!isMobile && (
        <div className="w-[300px] flex-shrink-0 border-r border-white/10">
          <ChatSidebar />
        </div>
      )}

      {/* Chat window */}
      <div className="min-w-0 flex-1 overflow-hidden">
        <ChatWindow
          conversationId={selectedId}
          onConversationCreated={handleConversationCreated}
          onConversationUpdate={handleConversationUpdate}
        />
      </div>
    </div>
  );
  case "invoices":
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-gray-200/70 bg-white p-10 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-16">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/10">
            <FileText size={28} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="mt-6 text-xl font-bold text-gray-900 dark:text-white">Invoices</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
            Invoice management coming soon.
          </p>
        </div>
      </div>
    </div>
  );
case "inventory":
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-gray-200/70 bg-white p-10 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-16">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/10">
            <Package size={28} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="mt-6 text-xl font-bold text-gray-900 dark:text-white">Inventory</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
            Inventory management coming soon.
          </p>
        </div>
      </div>
    </div>
  );
      case "customers":
        return (
          <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
            <Customers />
          </div>
        );

      default:
        const pageConfig = {
          documents: {
            icon: FolderOpen,
            title: "Documents",
            desc: "Organize your business documents and prepare them for AI-powered search.",
          },
          analytics: {
            icon: BarChart3,
            title: "Analytics",
            desc: "Understand your business performance with intelligent analytics and insights.",
          },
          settings: {
            icon: Settings,
            title: "Settings",
            desc: "Manage your SaMi workspace, account, and application preferences.",
          },
        };

        const config =
          pageConfig[
            activePage as keyof typeof pageConfig
          ];

        const Icon = config.icon;

        return (
          <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
            <div className="mx-auto max-w-5xl">
              <div className="mb-8">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-600 dark:text-blue-400">
                  Workspace
                </p>

                <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                  {config.title}
                </h1>

                <p className="mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                  {config.desc}
                </p>
              </div>

              <div className="rounded-3xl border border-gray-200/70 bg-white p-10 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-16">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/10">
                  <Icon
                    size={28}
                    className="text-blue-600 dark:text-blue-400"
                  />
                </div>

                <h2 className="mt-6 text-xl font-bold text-gray-900 dark:text-white">
                  {config.title}
                </h2>

                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  This workspace module
                  is ready for the next
                  stage of development.
                </p>
              </div>
            </div>
          </div>
        );
    }
  };

  // ==========================================
  // MAIN LAYOUT
  // ==========================================

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Overlay />

      <MainSidebar />

      <MobileChatSidebar />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar />

        <div className="min-h-0 flex-1 overflow-hidden">
          {renderPageContent()}
        </div>
      </main>
    </div>
  );
}
