"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import ChatWindow from "../dashboard/ChatWindow";
import Customers from "../dashboard/customers";
import Invoices from "@/app/components/layout/invoices";
import SettingsPanel from "@/app/settings/page";
import { MainSidebar } from "../dashboard/MainSidebar";

import {
Activity,
ArrowLeft,
ArrowUpRight,
BarChart3,
BarChart4,
Bot,
Briefcase,
Calendar,
CalendarClock,
CalendarDays,
CalendarOff,
Car,
CheckCircle2,
ChevronDown,
ChevronRight,
ClipboardCheck,
ClipboardList,
Clock,
FileText,
Folder,
FolderOpen,
Headphones,
History,
LayoutDashboard,
LogOut,
Mail,
MapPin,
Menu,
MessageSquare,
Moon,
Package,
PenTool,
Plus,

Receipt,
Repeat,
Search,
Settings,
Settings2,
  BellRing,
  Palette,
  Shield,
  Database,
  AppWindow,
  UserCog,
ShieldCheck,
ShoppingBag,
ShoppingCart,
Sparkles,
Store,
Sun,
Truck,
UserPlus,
UserRound,
UserSearch,
Users,
Utensils,
Workflow,
Wrench,
X,
Building2,
  CreditCard,
} from "lucide-react";

import {
APP_CATEGORIES,
SAMI_APPS,
type SamiApp,
type SamiAppCategory,
} from "@/lib/sami-apps";

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

type EnabledAppsResponse = {
success: boolean;
businessId?: string;
appKeys?: string[];
apps?: SamiApp[];
error?: string;
};

type ActivePage = string;

const CORE_NAV = [
{
id: "dashboard",
label: "Overview",
icon: LayoutDashboard,
},
{
id: "chat",
label: "AI Workspace",
icon: MessageSquare,
},
];

const SETTINGS_MENU = [
  { id: "general", label: "General", icon: Building2 },
  { id: "account", label: "Account", icon: UserRound },
  { id: "team", label: "Team", icon: Users },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "security", label: "Security", icon: Shield },
  { id: "data", label: "Data & AI", icon: Database },
  { id: "apps", label: "Apps", icon: AppWindow },
];

const ICONS: Record<string, React.ElementType> = {
calculator: BarChart3,
receipt: Receipt,
"file-text": FileText,
"bar-chart": BarChart4,
folder: Folder,
"pen-tool": PenTool,
users: Users,
"shopping-cart": ShoppingCart,
repeat: Repeat,
home: FolderOpen,
store: Store,
utensils: Utensils,
package: Package,
factory: Briefcase,
boxes: Package,
"shopping-bag": ShoppingBag,
wrench: Wrench,
"shield-check": ShieldCheck,
"user-round": UserRound,
car: Car,
"user-plus": UserPlus,
"clipboard-check": ClipboardCheck,
"calendar-off": CalendarOff,
"user-search": UserSearch,
megaphone: Activity,
mail: Mail,
"message-square": MessageSquare,
"calendar-days": CalendarDays,
workflow: Workflow,
"clipboard-list": ClipboardList,
briefcase: Briefcase,
clock: Clock,
"map-pin": MapPin,
headphones: Headphones,
"calendar-clock": CalendarClock,
calendar: Calendar,
};

function getIcon(iconName: string) {
return ICONS[iconName] || Package;
}

function getCategoryName(category: SamiAppCategory) {
return (
APP_CATEGORIES.find(
(item) => item.key === category
)?.name || category
);
}

export default function DashboardLayout() {
const [conversations, setConversations] = useState<
Conversation[]

> ([]);

const [selectedId, setSelectedId] =
useState<string | null>(null);

const [profile, setProfile] =
useState<Profile | null>(null);

const [loadingProfile, setLoadingProfile] =
useState(true);

const [enabledApps, setEnabledApps] =
useState<SamiApp[]>([]);

const [loadingApps, setLoadingApps] =
useState(true);

const [appsError, setAppsError] =
useState("");

const [activePage, setActivePage] =
  useState<ActivePage>("dashboard");

const [activePageLoaded, setActivePageLoaded] =
  useState(false);

useEffect(() => {
  const savedPage =
    localStorage.getItem("sami-active-page");

  if (savedPage) {
    setActivePage(savedPage);
  }

  setActivePageLoaded(true);
}, []);

useEffect(() => {
  if (!activePageLoaded) return;

  localStorage.setItem(
    "sami-active-page",
    activePage
  );
}, [activePage, activePageLoaded]);

const [sidebarOpen, setSidebarOpen] =
useState(false);

const [chatSidebarOpen, setChatSidebarOpen] =
useState(false);

const [isMobile, setIsMobile] =
useState(false);

const [isDark, setIsDark] =
useState(false);

const [isLoggingOut, setIsLoggingOut] =
useState(false);

const [isHistoryOpen, setIsHistoryOpen] =
useState(false);

const [expandedCategories, setExpandedCategories] =
useState<Record<string, boolean>>({});
const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
const [isInvoicingMenuOpen, setIsInvoicingMenuOpen] =
  useState(false);
const [settingsSection, setSettingsSection] = useState("general");
/*

* =====================================================
* MOBILE
* =====================================================
  */

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

/*

* =====================================================
* THEME
* =====================================================
  */

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

/*

* =====================================================
* PROFILE
* =====================================================
  */

async function loadProfile() {
try {
setLoadingProfile(true);

  const response =
    await fetch("/api/profile");

  if (!response.ok) {
    throw new Error(
      "Failed to load profile."
    );
  }

  const data =
    await response.json();

  if (data.profile) {
    setProfile(data.profile);
  } else if (data.user) {
    setProfile(data.user);
  }
} catch (error) {
  console.error(
    "Profile loading error:",
    error
  );
} finally {
  setLoadingProfile(false);
}

}

/*

* =====================================================
* ENABLED SAMI APPS
* =====================================================
  */

async function loadEnabledApps() {
try {
setLoadingApps(true);
setAppsError("");

  const response =
    await fetch("/api/apps", {
      cache: "no-store",
    });

  const data =
    (await response.json()) as EnabledAppsResponse;

  if (!response.ok || !data.success) {
    throw new Error(
      data.error ||
        "Unable to load workspace apps."
    );
  }

  setEnabledApps(
    Array.isArray(data.apps)
      ? data.apps
      : []
  );
} catch (error) {
  console.error(
    "SaMi apps loading error:",
    error
  );

  setAppsError(
    error instanceof Error
      ? error.message
      : "Unable to load workspace apps."
  );

  setEnabledApps([]);
} finally {
  setLoadingApps(false);
}

}

useEffect(() => {
  loadProfile();
  loadEnabledApps();

  const onAppsUpdated = () => loadEnabledApps();
  window.addEventListener("sami:apps-updated", onAppsUpdated);
  return () => window.removeEventListener("sami:apps-updated", onAppsUpdated);
}, []);

/*

* =====================================================
* CONVERSATIONS
* =====================================================
  */

async function loadConversations() {
try {
const response =
await fetch(
"/api/conversations",
{
cache: "no-store",
}
);

  if (!response.ok) {
    return;
  }

  const data =
    await response.json();

  const list =
    Array.isArray(data)
      ? data
      : Array.isArray(data.conversations)
      ? data.conversations
      : [];

  const processed =
    list.map(
      (conversation: Conversation) => {
        if (
          conversation.title &&
          conversation.title.length > 45
        ) {
          return {
            ...conversation,
            title:
              conversation.title.substring(
                0,
                42
              ) + "...",
          };
        }

        return conversation;
      }
    );

  setConversations(processed);
} catch (error) {
  console.error(
    "Conversation loading error:",
    error
  );
}

}

useEffect(() => {
loadConversations();
}, []);

/*

* =====================================================
* NAVIGATION
* =====================================================
  */

const appNavItems = useMemo(() => {
return enabledApps.map((app) => ({
id: app.key,
label: app.name,
icon: getIcon(app.icon),
category: app.category,
description: app.description,
}));
}, [enabledApps]);

const appsByCategory = useMemo(() => {
const grouped =
new Map<
SamiAppCategory,
SamiApp[]
>();

for (const category of APP_CATEGORIES) {
  grouped.set(
    category.key,
    []
  );
}

for (const app of enabledApps) {
  const list =
    grouped.get(app.category);

  if (list) {
    list.push(app);
  }
}

return grouped;

}, [enabledApps]);

function handleNavigation(page: ActivePage) {
setActivePage(page);
if (page !== "settings") { setIsSettingsMenuOpen(false); }
if (page !== "chat") {
  setSelectedId(null);
}

if (isMobile) {
  setSidebarOpen(false);
}

}

function openSettings(section: string) {
  setSettingsSection(section);
  setActivePage("settings");
  setIsSettingsMenuOpen(false);
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

function toggleCategory(
category: SamiAppCategory
) {
setExpandedCategories(
(current) => ({
...current,
[category]:
current[category] === undefined
? false
: !current[category],
})
);
}

/*

* =====================================================
* CHAT
* =====================================================
  */

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
setConversations(
(previous) =>
previous.map(
(conversation) =>
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
setConversations(
(previous) =>
previous.filter(
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

function toggleHistory() {
setIsHistoryOpen(
(current) => !current
);
}

/*

* =====================================================
* LOGOUT
* =====================================================
  */

async function handleLogout() {
try {
setIsLoggingOut(true);

  await fetch(
    "/api/auth/logout",
    {
      method: "POST",
    }
  );

  window.location.href =
    "/auth/login";
} catch (error) {
  console.error(
    "Logout error:",
    error
  );

  setIsLoggingOut(false);
}

}

/*

* =====================================================
* MAIN SIDEBAR
* =====================================================
  */

/*
=====================================================
HISTORY SIDEBAR
=====================================================
*/

const HistorySidebar = () => (
  <>
<div
className={`           fixed inset-0 z-40 bg-black/60 backdrop-blur-sm
          transition-opacity duration-300
          ${
            isHistoryOpen
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }
        `}
onClick={() =>
setIsHistoryOpen(false)
}
/>

  <aside
    className={`
      fixed right-0 top-0 z-50 h-full w-[340px]
      border-l border-white/10
      bg-[#07111f]
      text-white
      shadow-2xl
      transition-transform duration-300
      ${
        isHistoryOpen
          ? "translate-x-0"
          : "translate-x-full"
      }
    `}
  >
    <div className="flex h-full flex-col">

      <div className="flex items-center justify-between border-b border-white/[0.06] p-5">
        <div>
          <p className="text-sm font-bold">
            Conversation History
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Your AI workspace conversations
          </p>
        </div>

        <button
          onClick={() =>
            setIsHistoryOpen(false)
          }
          className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">

        {conversations.length ===
        0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5">
              <History
                size={22}
                className="text-slate-500"
              />
            </div>

            <p className="mt-4 text-sm font-medium text-slate-300">
              No conversations yet
            </p>

            <p className="mt-1 max-w-[220px] text-xs leading-5 text-slate-600">
              Start a conversation
              with SaMi AI and it
              will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map(
              (conversation) => (
                <button
                  key={
                    conversation.id
                  }
                  onClick={() => {
                    handleSelectConversation(
                      conversation.id
                    );

                    setIsHistoryOpen(
                      false
                    );
                  }}
                  className={`
                    flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition
                    ${
                      selectedId ===
                      conversation.id
                        ? "bg-blue-600/15 text-blue-300"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                    }
                  `}
                >
                  <MessageSquare
                    size={15}
                    className="flex-shrink-0"
                  />

                  <span className="truncate text-sm font-medium">
                    {conversation.title ||
                      "New conversation"}
                  </span>
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  </aside>
</>

);

/*

* =====================================================
* OVERLAY
* =====================================================
  */

const Overlay = () => (
<div
className={`         fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden
        ${
          sidebarOpen
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }
      `}
onClick={() =>
setSidebarOpen(false)
}
/>
);

/*

* =====================================================
* TOP BAR
* =====================================================
  */

const currentApp =
enabledApps.find(
(app) =>
app.key === activePage
);

const currentPageTitle =
activePage === "dashboard"
? "Overview"
: activePage === "chat"
? "SaMi AI"
: activePage === "settings"
? "Settings"
: currentApp?.name ||
activePage;

const TopBar = () => ( <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-gray-200/70 bg-white/90 px-4 backdrop-blur-xl dark:border-gray-800/70 dark:bg-gray-950/90 lg:px-7">

  <div className="flex items-center gap-3">

    <button
      onClick={() =>
        setSidebarOpen(true)
      }
      className="rounded-xl p-1.5 text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
    >
      <Menu size={18} />
    </button>

    {activePage !==
      "dashboard" &&
      activePage !==
        "chat" && (
        <button
          onClick={
            goBackToDashboard
          }
          className="hidden rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 sm:block"
          title="Back to Overview"
        >
          <ArrowLeft
            size={16}
          />
        </button>
      )}

    <div className="flex items-center gap-2">
      <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
        {currentPageTitle}
      </h1>

      {activePage ===
        "chat" && (
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

          <span className="text-[10px] text-gray-400">
            Online
          </span>
        </span>
      )}
    </div>
  </div>

  <div className="flex items-center gap-1.5">

    {activePage ===
    "chat" ? (
      <>
        <button
          onClick={newChat}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
        >
          <Plus size={14} />
          New
        </button>

        <button
          onClick={
            toggleHistory
          }
          className="rounded-xl p-1.5 text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Conversation history"
        >
          <History
            size={18}
          />
        </button>
      </>
    ) : (
      <>
        <button
          onClick={
            toggleTheme
          }
          className="rounded-xl p-1.5 text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Toggle theme"
        >
          {isDark ? (
            <Sun
              size={16}
            />
          ) : (
            <Moon
              size={16}
            />
          )}
        </button>

        <button
          onClick={
            handleLogout
          }
          disabled={
            isLoggingOut
          }
          className="flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
        >
          <LogOut
            size={14}
          />

          {isLoggingOut
            ? "Signing out..."
            : "Sign out"}
        </button>
      </>
    )}

  </div>
</header>

);

/*

* =====================================================
* DASHBOARD HOME
* =====================================================
  */

const DashboardHome = () => ( <div className="h-full overflow-y-auto">

  <div className="mx-auto max-w-[1600px] p-5 sm:p-7 lg:p-9">

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
          Your SaMi workspace
          is powered by AI and
          contains the business
          tools you selected.
        </p>
      </div>

      <button
        onClick={() =>
          handleNavigation(
            "chat"
          )
        }
        className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
      >
        <Sparkles size={17} />
        Ask SaMi AI
      </button>
    </div>

    {/* APP SUMMARY */}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

      {[
        {
          title: "Enabled Apps",
          value:
            enabledApps.length,
          subtitle:
            "Business modules",
          icon: Package,
        },
        {
          title: "AI Workspace",
          value: "Active",
          subtitle:
            "Your AI teammate",
          icon: Bot,
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
          title: "AI Activity",
          value: "Ready",
          subtitle:
            "Workspace status",
          icon: Activity,
        },
      ].map((stat) => {
        const Icon =
          stat.icon;

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

    {/* AI HERO */}

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">

      <div className="relative overflow-hidden rounded-3xl bg-[#07111f] p-7 text-white shadow-xl sm:p-9">

        <div className="relative z-10 max-w-2xl">

          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600">
            <Sparkles size={21} />
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-400">
            Your AI workspace
          </p>

          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            Run your business
            with AI at the
            center.
          </h2>

          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
            SaMi AI is designed
            to work across your
            business applications.
            Ask questions, analyze
            information and
            eventually perform
            actions across your
            workspace.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">

            <button
              onClick={() =>
                handleNavigation(
                  "chat"
                )
              }
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              <Sparkles size={16} />
              Open AI Workspace
            </button>

            <button
              onClick={() =>
                setIsHistoryOpen(
                  true
                )
              }
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <History size={16} />
              History
            </button>

          </div>
        </div>
      </div>

      {/* ENABLED APPS */}

      <div className="rounded-3xl border border-gray-200/70 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">

        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
              Your workspace
            </p>

            <h3 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
              Enabled apps
            </h3>
          </div>

          <Package
            size={19}
            className="text-blue-500"
          />
        </div>

        {enabledApps.length ===
        0 ? (
          <div className="rounded-2xl bg-gray-50 p-5 text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
            No apps have been
            enabled yet.
          </div>
        ) : (
          <div className="space-y-2">
            {enabledApps
              .slice(0, 7)
              .map((app) => {
                const Icon =
                  getIcon(
                    app.icon
                  );

                return (
                  <button
                    key={
                      app.key
                    }
                    onClick={() =>
                      handleNavigation(
                        app.key
                      )
                    }
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
                        {app.name}
                      </p>

                      <p className="mt-0.5 truncate text-[10px] text-gray-400">
                        {getCategoryName(
                          app.category
                        )}
                      </p>
                    </div>

                    <ChevronRight
                      size={15}
                      className="text-gray-300 transition group-hover:text-blue-500"
                    />
                  </button>
                );
              })}

            {enabledApps.length >
              7 && (
              <p className="px-3 pt-2 text-[11px] text-gray-400">
                +
                {enabledApps.length -
                  7}{" "}
                more apps in your
                sidebar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
</div>

);

/*

* =====================================================
* GENERIC APP PAGE
* =====================================================
  */

function AppPlaceholder({
app,
}: {
app: SamiApp;
}) {
const Icon =
getIcon(app.icon);

return (
  <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">

    <div className="mx-auto max-w-6xl">

      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-600 dark:text-blue-400">
          {getCategoryName(
            app.category
          )}
        </p>

        <div className="mt-2 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
            <Icon
              size={21}
              className="text-blue-600 dark:text-blue-400"
            />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {app.name}
          </h1>
        </div>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {app.description}
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
          {app.name}
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          The {app.name}
          module is enabled in
          this workspace. Its
          full business functionality
          will be built on top of
          this module.
        </p>

        <div className="mx-auto mt-6 flex max-w-sm items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
          <Sparkles size={14} />
          SaMi AI will work with
          this module.
        </div>

      </div>
    </div>
  </div>
);

}

/*

* =====================================================
* PAGE CONTENT
* =====================================================
  */

const renderPageContent =
() => {
switch (activePage) {

    case "dashboard":
      return (
        <DashboardHome />
      );

    case "chat":
      return (
        <div className="flex h-full min-h-0">

          <div className="flex min-h-0 flex-1 flex-col">

            {!selectedId ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">

                <div className="mx-auto w-full max-w-3xl">

                  <div className="mb-8 text-center">

                    <div className="mb-4 flex justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/25">
                        <Sparkles
                          size={28}
                          className="text-white"
                        />
                      </div>
                    </div>

                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      What can I help
                      with?
                    </h2>

                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                      Ask SaMi anything
                      about your business.
                    </p>

                  </div>

                  <div className="w-full">
                    <ChatWindow
                      conversationId={
                        null
                      }
                      onConversationCreated={
                        handleConversationCreated
                      }
                      onConversationUpdate={
                        handleConversationUpdate
                      }
                    />
                  </div>

                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <ChatWindow
                  conversationId={
                    selectedId
                  }
                  onConversationCreated={
                    handleConversationCreated
                  }
                  onConversationUpdate={
                    handleConversationUpdate
                  }
                />
              </div>
            )}

          </div>
        </div>
      );

    case "customers":
      return (
        <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
          <Customers />
        </div>
      );

      case "invoice-overview":
case "invoicing":
case "invoices":
case "create-invoice":
case "invoice-customers":
case "invoice-payments":
case "invoice-products":
case "invoice-settings":
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
      <div className="mx-auto max-w-7xl">
        <Invoices activePage={activePage} />
      </div>
    </div>
  );

    case "inventory":
      return (
        <AppPlaceholder
          app={
            enabledApps.find(
              (item) =>
                item.key ===
                "inventory"
            ) || {
              key: "inventory",
              name: "Inventory",
              category:
                "supply_chain",
              description:
                "Manage products, stock, warehouses and movements.",
              icon: "package",
              route: "inventory",
            }
          }
        />
      );

    case "settings":
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
      <div className="mx-auto max-w-5xl">
        <SettingsPanel initialSection={settingsSection} />
      </div>
    </div>
  );

case "general":
case "account":
case "team":
case "billing":
case "appearance":
case "notifications":
case "security":
case "data":
case "apps":
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-7 lg:p-9">
      <div className="mx-auto max-w-5xl">
        <SettingsPanel initialSection={activePage} />
      </div>
    </div>
  );

    default: {
      const app =
        enabledApps.find(
          (item) =>
            item.key ===
            activePage
        );

      if (app) {
        return (
          <AppPlaceholder
            app={app}
          />
        );
      }

      return (
        <DashboardHome />
      );
    }
  }
};

/*

* =====================================================
* MAIN LAYOUT
* =====================================================
  */

return ( <div className="fixed inset-0 flex overflow-hidden bg-gray-50 dark:bg-gray-950">

  <Overlay />

  <MainSidebar
  activePage={activePage}
  enabledApps={enabledApps}
  loadingApps={loadingApps}
  appsError={appsError}
  profile={profile}
  loadingProfile={loadingProfile}
  isMobile={isMobile}
  expandedCategories={expandedCategories}
  isSettingsMenuOpen={isSettingsMenuOpen}
  isInvoicingMenuOpen={isInvoicingMenuOpen}
  appsByCategory={appsByCategory}
  sidebarOpen={sidebarOpen}
  onNavigation={handleNavigation}
 onSettingsSectionChange={setSettingsSection}
  onSettingsMenuChange={setIsSettingsMenuOpen}
  onInvoicingMenuChange={setIsInvoicingMenuOpen}
  onSidebarChange={setSidebarOpen}
  onCategoryToggle={toggleCategory}
/>

  <HistorySidebar />

  <main className="flex min-h-0 min-w-0 flex-1 flex-col">

    <TopBar />

    <div className="min-h-0 flex-1 overflow-hidden">
      {renderPageContent()}
    </div>

  </main>
</div>

);
}

