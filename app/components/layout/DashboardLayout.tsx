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
  User,
  Search,
  Moon,
  Sun,
  LogOut,
  Bot,
  Activity,
  FileText,
  Zap,
  Bell,
  ChevronDown,
  Home,
  CreditCard,
  HelpCircle,
  Command,
  ArrowUpRight,
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
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [hoveredNavItem, setHoveredNavItem] = useState<string | null>(null);

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
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ==========================================
  // THEME
  // ==========================================

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const darkMode = savedTheme === "dark" || (!savedTheme && prefersDark);
    setIsDark(darkMode);
    document.documentElement.classList.toggle("dark", darkMode);
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    document.documentElement.classList.toggle("dark", newTheme);
    localStorage.setItem("theme", newTheme ? "dark" : "light");
  };

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed.");
      window.location.href = "/auth/login";
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoggingOut(false);
      alert("Failed to log out. Please try again.");
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
    if (isMobile) setChatSidebarOpen(false);
  }

  function handleSelectConversation(id: string) {
    setSelectedId(id);
    setActivePage("chat");
    if (isMobile) setChatSidebarOpen(false);
  }

  function handleConversationUpdate(id: string, title: string) {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === id ? { ...conversation, title } : conversation
      )
    );
  }

  function handleDeleteConversation(id: string) {
    setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function newChat() {
    setSelectedId(null);
    setActivePage("chat");
    if (isMobile) setChatSidebarOpen(false);
  }

  function handleNavigation(page: ActivePage) {
    setActivePage(page);
    if (page !== "chat") setSelectedId(null);
    if (isMobile) setSidebarOpen(false);
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
    { id: "dashboard", label: "Overview", icon: LayoutDashboard, shortcut: "⌘1" },
    { id: "chat", label: "AI Workspace", icon: MessageSquare, shortcut: "⌘2" },
    { id: "customers", label: "Customers", icon: Users, shortcut: "⌘3" },
    { id: "documents", label: "Documents", icon: FolderOpen, shortcut: "⌘4" },
    { id: "analytics", label: "Analytics", icon: BarChart3, shortcut: "⌘5" },
    { id: "settings", label: "Settings", icon: Settings, shortcut: "⌘6" },
  ] as const;

  // ==========================================
  // MAIN SIDEBAR
  // ==========================================

  const MainSidebar = () => (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50
        flex w-[280px] flex-col
        border-r border-white/5
        bg-gradient-to-b from-[#0a1628] to-[#060d1a]
        text-white
        shadow-2xl shadow-black/50
        transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        lg:relative lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        ${activePage === "chat" ? "lg:hidden" : ""}
      `}
    >
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-600/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-600/5 blur-3xl" />
      </div>

      {isMobile && (
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute right-4 top-4 z-10 rounded-xl p-2 text-gray-400 transition-all hover:bg-white/10 hover:text-white hover:scale-105"
        >
          <X size={20} />
        </button>
      )}

      {/* BRAND */}
      <div className="relative px-6 pb-6 pt-7">
        <div className="flex items-center gap-3">
          <div className="relative group">
            <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 opacity-20 blur-md group-hover:opacity-40 transition-opacity duration-500" />
            <Image
              src="/logo.png"
              alt="SaMi"
              width={44}
              height={44}
              className="relative rounded-xl shadow-lg shadow-blue-500/20"
            />
            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/50">
              <Sparkles size={9} className="text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              SaMi
            </h1>
            <p className="text-[10px] font-medium text-blue-400/60 tracking-widest">
              BUSINESS OS
            </p>
          </div>
        </div>
      </div>

      {/* WORKSPACE LABEL */}
      <div className="relative px-4">
        <div className="mb-3 flex items-center gap-3 px-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/5" />
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Workspace
          </p>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/5" />
        </div>
      </div>

      {/* NAVIGATION */}
      <nav className="relative flex-1 space-y-0.5 px-3 pb-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          const isHovered = hoveredNavItem === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNavigation(item.id)}
              onMouseEnter={() => setHoveredNavItem(item.id)}
              onMouseLeave={() => setHoveredNavItem(null)}
              className={`
                group relative flex w-full items-center
                gap-3 rounded-xl px-3.5 py-2.5
                text-left text-sm font-medium
                transition-all duration-200
                ${isActive
                  ? "bg-gradient-to-r from-blue-600/20 to-indigo-600/20 text-white shadow-lg shadow-blue-600/10"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
                }
              `}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/50" />
              )}

              <Icon
                size={19}
                className={`
                  transition-all duration-200
                  ${isActive
                    ? "text-blue-400"
                    : "text-slate-500 group-hover:text-slate-300"
                  }
                  ${isHovered && !isActive ? "scale-110" : ""}
                `}
              />

              <span className="flex-1">{item.label}</span>

              {item.shortcut && (
                <span className={`
                  text-[9px] font-mono opacity-0 transition-all duration-200
                  ${isActive ? "opacity-40 text-blue-400" : "group-hover:opacity-30"}
                `}>
                  {item.shortcut}
                </span>
              )}

              {isActive && (
                <ChevronRight
                  size={14}
                  className="text-blue-400/60 animate-pulse"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* AI STATUS */}
      <div className="relative mx-3 mb-4 rounded-2xl border border-blue-500/10 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 p-4 backdrop-blur-sm">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/5 to-indigo-500/5" />
        <div className="relative flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/25">
              <Bot size={18} className="text-white" />
            </div>
            <div className="absolute -right-0.5 -top-0.5 h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex h-full w-full rounded-full bg-emerald-400" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-white">SaMi AI</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-slate-400">Ready to assist</span>
            </div>
          </div>
        </div>
      </div>

      {/* PROFILE */}
      <div className="relative border-t border-white/5 p-3">
        <div className="flex items-center gap-3 rounded-xl p-2 transition-all hover:bg-white/5">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-sm font-semibold text-white shadow-lg shadow-blue-500/25">
              {profile?.full_name?.[0]?.toUpperCase() || "S"}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0a1628] bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {loadingProfile ? "Loading..." : profile?.full_name || "SaMi User"}
            </p>
            <p className="truncate text-[10px] text-slate-400">{profile?.email || "Account"}</p>
          </div>
        </div>
      </div>
    </aside>
  );

  // ==========================================
  // CHAT SIDEBAR
  // ==========================================

  const ChatSidebar = () => (
    <div className="flex h-full w-[280px] flex-shrink-0 flex-col border-r border-white/[0.06] bg-gradient-to-b from-[#0a1628] to-[#060d1a] text-white">
      {/* BACK */}
      <div className="relative p-4">
        <button
          onClick={goBackToDashboard}
          className="group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition-all hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft
            size={17}
            className="transition-all duration-200 group-hover:-translate-x-1 group-hover:text-blue-400"
          />
          <span className="font-medium">Back to Overview</span>
        </button>
      </div>

      {/* CHAT HEADER */}
      <div className="border-b border-white/[0.06] px-5 pb-5 pt-2">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/25">
              <Bot size={20} className="text-white" />
            </div>
            <div className="absolute -right-0.5 -top-0.5 h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex h-full w-full rounded-full bg-emerald-400" />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">AI Workspace</h2>
            <p className="text-[9px] font-medium text-blue-400/60 tracking-widest">
              INTELLIGENT ASSISTANT
            </p>
          </div>
        </div>
      </div>

      {/* NEW CHAT */}
      <div className="p-4">
        <button
          onClick={newChat}
          className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-600/30 active:scale-[0.98]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <div className="relative flex items-center justify-center gap-2">
            <Plus size={18} className="transition-transform group-hover:rotate-90 duration-300" />
            New conversation
          </div>
        </button>
      </div>

      {/* HISTORY */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Conversations
          </p>
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/5 px-1.5 text-[10px] font-medium text-slate-400">
            {conversations.length}
          </span>
        </div>

        {conversations.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
              <MessageSquare size={22} className="text-slate-600" />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-300">No conversations yet</p>
            <p className="mt-1 text-xs text-slate-500">Start a new chat with SaMi AI</p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((chat) => (
              <button
                key={chat.id}
                onClick={() => handleSelectConversation(chat.id)}
                className={`
                  group relative flex w-full items-center gap-3
                  rounded-xl px-3 py-2.5
                  text-left text-sm
                  transition-all duration-200
                  ${selectedId === chat.id
                    ? "bg-blue-600/10 text-blue-300 shadow-lg shadow-blue-600/5"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }
                `}
              >
                <MessageSquare
                  size={15}
                  className={`
                    flex-shrink-0 transition-all duration-200
                    ${selectedId === chat.id ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"}
                  `}
                />
                <span className="truncate font-medium">
                  {chat.title || "New conversation"}
                </span>
                {selectedId === chat.id && (
                  <div className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-blue-500 to-indigo-500" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CHAT SIDEBAR PROFILE */}
      <div className="border-t border-white/[0.06] p-4">
        <div className="flex items-center gap-3 rounded-xl p-2 transition-all hover:bg-white/5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-xs font-semibold text-white">
            {profile?.full_name?.[0]?.toUpperCase() || "S"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white">
              {profile?.full_name || "SaMi User"}
            </p>
            <p className="truncate text-[9px] text-slate-500">{profile?.email || ""}</p>
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
          fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden
          transition-opacity duration-300
          ${chatSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}
        `}
        onClick={() => setChatSidebarOpen(false)}
      />
      <div
        className={`
          fixed inset-y-0 left-0 z-50
          transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          lg:hidden
          ${chatSidebarOpen ? "translate-x-0" : "-translate-x-full"}
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
        fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden
        transition-opacity duration-300
        ${sidebarOpen && activePage !== "chat" ? "opacity-100" : "pointer-events-none opacity-0"}
      `}
      onClick={() => setSidebarOpen(false)}
    />
  );

  // ==========================================
  // TOP BAR
  // ==========================================

  const TopBar = () => (
    <header className="relative flex h-[72px] flex-shrink-0 items-center justify-between border-b border-gray-200/50 bg-white/80 px-4 backdrop-blur-xl dark:border-gray-800/50 dark:bg-gray-950/80 lg:px-7">
      {/* Left section */}
      <div className="flex items-center gap-3">
        {activePage === "chat" ? (
          <>
            <button
              onClick={() => setChatSidebarOpen(true)}
              className="rounded-xl p-2.5 text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="lg:hidden">
              <p className="text-sm font-bold text-gray-900 dark:text-white">AI Workspace</p>
              <p className="text-[9px] font-medium text-blue-500/70 tracking-widest">CHAT</p>
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl p-2.5 text-gray-500 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="lg:hidden">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {activePage === "dashboard"
                  ? "Overview"
                  : activePage.charAt(0).toUpperCase() + activePage.slice(1)}
              </p>
              <p className="text-[9px] font-medium text-blue-500/70 tracking-widest">
                {activePage.toUpperCase()}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Center - Search */}
      <div className="hidden flex-1 max-w-md mx-4 md:block">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3.5">
            <Search size={16} className="text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          </div>
          <input
            type="text"
            placeholder="Search workspace..."
            className="w-full rounded-xl border border-gray-200/50 bg-gray-50/50 py-2 pl-10 pr-4 text-sm text-gray-800 outline-none transition-all focus:border-blue-500/50 focus:bg-white focus:shadow-lg focus:shadow-blue-500/5 dark:border-gray-800 dark:bg-gray-900/50 dark:text-white dark:focus:bg-gray-900"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[9px] font-mono text-gray-400 dark:border-gray-800 dark:bg-gray-900">
            <span>⌘</span>
            <span>K</span>
          </kbd>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1.5">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="relative h-10 w-10 rounded-xl text-gray-500 transition-all hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            {isDark ? (
              <Sun size={18} className="transition-transform hover:rotate-90 duration-300" />
            ) : (
              <Moon size={18} className="transition-transform hover:-rotate-12 duration-300" />
            )}
          </div>
        </button>

        {/* Notifications */}
        <button className="relative h-10 w-10 rounded-xl text-gray-500 transition-all hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
          <Bell size={18} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-950" />
        </button>

        {/* Profile dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsProfileOpen((prev) => !prev)}
            className="flex items-center gap-2.5 rounded-xl border border-gray-200/50 bg-white/50 px-2.5 py-1.5 transition-all hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-gray-900/50 dark:hover:border-gray-700"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-xs font-semibold text-white shadow-lg shadow-blue-500/20">
              {profile?.full_name?.[0]?.toUpperCase() || "S"}
            </div>
            <div className="hidden text-left sm:block">
              <p className="max-w-[120px] truncate text-xs font-bold text-gray-900 dark:text-white">
                {profile?.full_name || "SaMi User"}
              </p>
              <p className="text-[9px] text-gray-400">Admin</p>
            </div>
            <ChevronDown
              size={14}
              className={`text-gray-400 transition-transform duration-200 ${
                isProfileOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-gray-200/50 bg-white/95 shadow-2xl shadow-black/10 backdrop-blur-xl dark:border-gray-800/50 dark:bg-gray-950/95">
              <div className="border-b border-gray-100/50 p-4 dark:border-gray-800/50">
                <p className="font-bold text-gray-900 dark:text-white">
                  {profile?.full_name || "SaMi User"}
                </p>
                <p className="mt-1 truncate text-xs text-gray-500">{profile?.email || ""}</p>
              </div>
              <div className="p-2">
                <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                  <User size={17} />
                  Profile
                </button>
                <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                  <HelpCircle size={17} />
                  Help & Support
                </button>
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <LogOut size={17} />
                  {isLoggingOut ? "Signing out..." : "Sign out"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );

  // ==========================================
  // DASHBOARD OVERVIEW
  // ==========================================

  const DashboardHome = () => (
    <div className="h-full overflow-y-auto scroll-smooth">
      <div className="mx-auto max-w-[1600px] p-5 sm:p-7 lg:p-9">
        {/* HEADER */}
        <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-gradient-to-r from-blue-500/10 to-indigo-500/10 px-3.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-blue-600 dark:from-blue-500/20 dark:to-indigo-500/20 dark:text-blue-400">
                Workspace
              </span>
              <span className="flex items-center gap-2 text-[10px] text-gray-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                  <span className="relative inline-flex h-full w-full rounded-full bg-emerald-400" />
                </span>
                All systems operational
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-gray-400">
                <span className="h-3 w-px bg-gray-300 dark:bg-gray-700" />
                v2.0.0
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              Good {new Date().getHours() < 12 ? "morning" : "afternoon"},{" "}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                {profile?.full_name?.split(" ")[0] || "there"}
              </span>
              .
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Your business workspace is ready. Use SaMi AI to work smarter, manage customers,
              and turn information into action.
            </p>
          </div>
          <button
            onClick={() => handleNavigation("chat")}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-600/30 active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            <div className="relative flex items-center gap-2">
              <Sparkles size={17} />
              Open SaMi AI
            </div>
          </button>
        </div>

        {/* STAT CARDS */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "Customers", value: "—", subtitle: "Total customer records", icon: Users, color: "blue" },
            { title: "Conversations", value: conversations.length, subtitle: "AI interactions", icon: MessageSquare, color: "indigo" },
            { title: "Documents", value: "—", subtitle: "Business documents", icon: FileText, color: "emerald" },
            { title: "AI Activity", value: "Active", subtitle: "Workspace status", icon: Activity, color: "purple" },
          ].map((stat, index) => {
            const Icon = stat.icon;
            const colors = {
              blue: "from-blue-500 to-blue-600",
              indigo: "from-indigo-500 to-indigo-600",
              emerald: "from-emerald-500 to-emerald-600",
              purple: "from-purple-500 to-purple-600",
            };
            const colorClasses = colors[stat.color as keyof typeof colors];

            return (
              <div
                key={stat.title}
                className="group relative overflow-hidden rounded-2xl border border-gray-200/50 bg-white/50 p-6 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-xl dark:border-gray-800/50 dark:bg-gray-900/50"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-gray-50/50 dark:to-gray-800/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-start justify-between">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${colorClasses} shadow-lg shadow-${stat.color}-500/20`}>
                    <Icon size={19} className="text-white" />
                  </div>
                  <ArrowUpRight
                    size={16}
                    className="text-gray-300 transition-all group-hover:text-blue-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </div>
                <div className="relative mt-6">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{stat.title}</p>
                  <p className="mt-1.5 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-400">{stat.subtitle}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* MAIN WORKSPACE */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          {/* AI HERO */}
          <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a1628] to-[#060d1a] p-8 text-white shadow-2xl shadow-black/20 sm:p-10">
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl group-hover:bg-blue-600/20 transition-all duration-1000" />
              <div className="absolute -bottom-32 right-20 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl group-hover:bg-indigo-600/20 transition-all duration-1000 delay-200" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />
            </div>
            <div className="relative z-10 max-w-2xl">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/25">
                <Sparkles size={22} />
              </div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-blue-400">
                AI-Powered Workspace
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Work with your business using AI.
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
                Ask questions, explore your business information, manage conversations, and let
                SaMi help you turn everyday work into intelligent action.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => handleNavigation("chat")}
                  className="group/btn relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold transition-all hover:shadow-lg hover:shadow-blue-600/20 active:scale-[0.98]"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700" />
                  <div className="relative flex items-center gap-2">
                    <MessageSquare size={16} />
                    Start chatting
                  </div>
                </button>
                <button
                  onClick={() => handleNavigation("customers")}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-white/10"
                >
                  <Users size={16} />
                  View customers
                </button>
              </div>
            </div>
            <div className="absolute bottom-8 right-8 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
              <Bot size={160} />
            </div>
          </div>

          {/* QUICK ACTIONS */}
          <div className="group relative overflow-hidden rounded-3xl border border-gray-200/50 bg-white/50 p-6 backdrop-blur-sm transition-all hover:shadow-xl dark:border-gray-800/50 dark:bg-gray-900/50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Quick actions</h3>
                <p className="mt-1 text-xs text-gray-400">Jump into your workspace</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
                <Zap size={18} className="text-blue-500" />
              </div>
            </div>

            <div className="mt-6 space-y-1.5">
              {[
                { label: "Start a new AI chat", description: "Ask SaMi anything", icon: MessageSquare, action: () => handleNavigation("chat") },
                { label: "Manage customers", description: "View your customer records", icon: Users, action: () => handleNavigation("customers") },
                { label: "Explore documents", description: "Organize business files", icon: FolderOpen, action: () => handleNavigation("documents") },
                { label: "View analytics", description: "Understand your business", icon: BarChart3, action: () => handleNavigation("analytics") },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={action.action}
                    className="group/action flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all hover:bg-gray-50/80 dark:hover:bg-gray-800/50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100/80 transition-all group-hover/action:bg-gradient-to-br group-hover/action:from-blue-500/10 group-hover/action:to-indigo-500/10 dark:bg-gray-800/50">
                      <Icon
                        size={17}
                        className="text-gray-500 transition-all group-hover/action:text-blue-600 dark:text-gray-400 dark:group-hover/action:text-blue-400"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-800 transition-all group-hover/action:text-blue-600 dark:text-gray-200 dark:group-hover/action:text-blue-400">
                        {action.label}
                      </p>
                      <p className="mt-0.5 text-[10px] text-gray-400">{action.description}</p>
                    </div>
                    <ChevronRight
                      size={15}
                      className="text-gray-300 transition-all group-hover/action:translate-x-1 group-hover/action:text-blue-500"
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
          <div className="flex h-full min-h-0">
            <div className="hidden flex-shrink-0 lg:block">
              <ChatSidebar />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <ChatWindow
                conversationId={selectedId}
                onConversationCreated={handleConversationCreated}
                onConversationUpdate={handleConversationUpdate}
              />
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
          documents: { icon: FolderOpen, title: "Documents", desc: "Organize your business documents and prepare them for AI-powered search." },
          analytics: { icon: BarChart3, title: "Analytics", desc: "Understand your business performance with intelligent analytics and insights." },
          settings: { icon: Settings, title: "Settings", desc: "Manage your SaMi workspace, account, and application preferences." },
        };
        const config = pageConfig[activePage as keyof typeof pageConfig];
        const Icon = config.icon;
        return (
          <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
            <div className="mx-auto max-w-5xl">
              <div className="mb-8">
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
                  Workspace
                </p>
                <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{config.title}</h1>
                <p className="mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">{config.desc}</p>
              </div>
              <div className="group relative overflow-hidden rounded-3xl border border-gray-200/50 bg-white/50 p-12 text-center backdrop-blur-sm transition-all hover:shadow-xl dark:border-gray-800/50 dark:bg-gray-900/50 sm:p-20">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
                  <Icon size={32} className="text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="relative mt-6 text-xl font-bold text-gray-900 dark:text-white">
                  {config.title}
                </h2>
                <p className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  This workspace module is ready for the next stage of development.
                </p>
                <div className="relative mt-8">
                  <button className="rounded-xl border border-gray-200/50 px-6 py-2.5 text-sm font-medium text-gray-600 transition-all hover:bg-gray-100 dark:border-gray-800/50 dark:text-gray-400 dark:hover:bg-gray-800">
                    Coming soon
                  </button>
                </div>
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
    <div className="fixed inset-0 flex overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
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