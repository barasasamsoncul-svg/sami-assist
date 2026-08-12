import Image from "next/image";

import {
  Activity,
  BarChart3,
  Briefcase,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Car,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Folder,
  FolderOpen,
  Headphones,
  Mail,
  MapPin,
  Package,
  PenTool,
  Receipt,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  UserPlus,
  UserRound,
  UserSearch,
  Users,
  Utensils,
  Wrench,
  X,
  LayoutDashboard,
MessageSquare,
Workflow,
} from "lucide-react";

import {
  APP_CATEGORIES,
  type SamiApp,
  type SamiAppCategory,
} from "@/lib/sami-apps";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
};
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
  { id: "general", label: "General", icon: Settings },
  { id: "account", label: "Account", icon: UserRound },
  { id: "team", label: "Team", icon: Users },
  { id: "billing", label: "Billing", icon: Receipt },
  { id: "appearance", label: "Appearance", icon: Sparkles },
  { id: "notifications", label: "Notifications", icon: Mail },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "data", label: "Data & Privacy", icon: Folder },
  { id: "apps", label: "Apps", icon: Package },
];

const ICONS: Record<string, React.ElementType> = {
  calculator: BarChart3,
  receipt: Receipt,
  "file-text": FileText,
  "bar-chart": BarChart3,
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

type MainSidebarProps = {
  activePage: string;
  enabledApps: SamiApp[];
  loadingApps: boolean;
  appsError: string;
  profile: Profile | null;
  loadingProfile: boolean;
  isMobile: boolean;
  expandedCategories: Record<string, boolean>;
  isSettingsMenuOpen: boolean;
  appsByCategory: Map<SamiAppCategory, SamiApp[]>;
  sidebarOpen: boolean;

  onNavigation: (page: string) => void;
  onSettingsSectionChange: (section: string) => void;
  onSettingsMenuChange: (open: boolean) => void;
  onSidebarChange: (open: boolean) => void;
  onCategoryToggle: (category: SamiAppCategory) => void;
};
export const MainSidebar = ({
  activePage,
  enabledApps,
  loadingApps,
  appsError,
  profile,
  loadingProfile,
  isMobile,
  expandedCategories,
  isSettingsMenuOpen,
  appsByCategory,
  onNavigation,
  onSettingsSectionChange,
  onSettingsMenuChange,
  onSidebarChange,
  onCategoryToggle,
  sidebarOpen,
}: MainSidebarProps) => (
<aside
className={`         fixed inset-y-0 left-0 z-50
        flex w-[285px] flex-col
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
onClick={() =>
onSidebarChange(true)
}
className="absolute right-4 top-4 z-10 rounded-xl p-2 text-gray-400 hover:bg-white/10 hover:text-white"
> <X size={20} /> </button>
)}

  {/* HEADER */}

  <div className="flex-shrink-0 px-6 pb-4 pt-7">
    <div className="flex items-center gap-3">
      <div className="relative">
        <Image
          src="/logo2.png"
          alt="SaMi"
          width={44}
          height={44}
          className="rounded-xl"
        />

        <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500">
          <Sparkles
            size={9}
            className="text-white"
          />
        </div>
      </div>

      <div>
        <h1 className="text-lg font-bold tracking-tight">
          SaMi
        </h1>

        <p className="text-xs text-slate-500">
          AI Business Workspace
        </p>
      </div>
    </div>
  </div>

  {/* SEARCH */}

  <div className="flex-shrink-0 px-4 pb-4">
    <div className="relative">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
      />

      <input
        type="text"
        placeholder="Search workspace..."
        className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:bg-white/10"
      />
    </div>
  </div>

  {/* NAVIGATION */}

  <div className="flex-1 overflow-y-auto px-4 pb-4">

    {/* CORE */}

    <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
      SaMi Core
    </p>

    <nav className="space-y-1">
      {CORE_NAV.map((item) => {
        const Icon = item.icon;

        const isActive =
          activePage === item.id;

        return (
          <button
            key={item.id}
            onClick={() =>
              onNavigation(
           item.id
             )
            }
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

            <span className="flex-1">
              {item.label}
            </span>

            {isActive && (
              <ChevronRight
                size={15}
                className="text-white/60"
              />
            )}
          </button>
        );
      })}
    </nav>

    {/* APP AREA */}

    <div className="mt-7">
      <div className="mb-3 flex items-center justify-between px-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          My Apps
        </p>

        {!loadingApps && (
          <span className="text-[10px] text-slate-600">
            {enabledApps.length}
          </span>
        )}
      </div>

      {loadingApps ? (
        <div className="space-y-2 px-2">
          {[1, 2, 3, 4].map(
            (item) => (
              <div
                key={item}
                className="h-10 animate-pulse rounded-xl bg-white/5"
              />
            )
          )}
        </div>
      ) : appsError ? (
        <div className="mx-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
          Unable to load your
          apps.
        </div>
      ) : enabledApps.length ===
        0 ? (
        <div className="mx-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-slate-500">
          No business apps have
          been enabled yet.
        </div>
      ) : (
        <div className="space-y-5">
          {APP_CATEGORIES.map(
            (category) => {
              const apps =
                appsByCategory.get(
                  category.key
                ) || [];

              if (apps.length === 0) {
                return null;
              }

              const isExpanded =
                expandedCategories[
                  category.key
                ] !== false;

              return (
                <div
                  key={
                    category.key
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      onCategoryToggle(
                       category.key
                     )
                    }
                    className="mb-1 flex w-full items-center justify-between px-3 py-1 text-left"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      {category.name}
                    </span>

                    {isExpanded ? (
                      <ChevronDown
                        size={13}
                        className="text-slate-600"
                      />
                    ) : (
                      <ChevronRight
                        size={13}
                        className="text-slate-600"
                      />
                    )}
                  </button>

                  {isExpanded && (
                    <nav className="space-y-1">
                      {apps.map(
                        (app) => {
                          const Icon =
                            getIcon(
                              app.icon
                            );

                          const isActive =
                            activePage ===
                            app.key;

                          return (
                            <button
                              key={
                                app.key
                              }
                              onClick={() =>
                                onNavigation(
                                  app.key
                                )
                              }
                              title={
                                app.description
                              }
                              className={`
                                group flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-all
                                ${
                                  isActive
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                                    : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                                }
                              `}
                            >
                              <Icon
                                size={
                                  18
                                }
                                className={
                                  isActive
                                    ? "text-white"
                                    : "text-slate-500 group-hover:text-slate-300"
                                }
                              />

                              <span className="min-w-0 flex-1 truncate">
                                {
                                  app.name
                                }
                              </span>

                              {isActive && (
                                <ChevronRight
                                  size={
                                    14
                                  }
                                  className="text-white/60"
                                />
                              )}
                            </button>
                          );
                        }
                      )}
                    </nav>
                  )}
                </div>
              );
            }
          )}
        </div>
      )}
    </div>

 {/* SETTINGS DROPDOWN */}
<div className="mt-7 border-t border-white/[0.06] pt-4">
  <button
    onClick={() => onSettingsMenuChange(!isSettingsMenuOpen)}
    className={`group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-all ${
      isSettingsMenuOpen || activePage === "settings" 
        ? "bg-blue-600 text-white" 
        : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
    }`}
  >
    <Settings size={19} className={isSettingsMenuOpen || activePage === "settings" ? "text-white" : "text-slate-500"} />
    <span className="flex-1">Settings</span>
    <ChevronDown size={16} className={`transition-transform ${isSettingsMenuOpen ? "rotate-180" : ""}`} />
  </button>

  {isSettingsMenuOpen && (
    <div className="mt-2 space-y-1 pl-4">
      {SETTINGS_MENU.map((item) => {
        const Icon = item.icon;
        const isActive = activePage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              onSettingsSectionChange(item.id);
              onNavigation(item.id);
              onSettingsMenuChange(false);
              if (isMobile) onSidebarChange(false);
            }}
            className={`group flex w-full items-center gap-3 rounded-xl px-4 py-2 text-left text-sm font-medium transition-all ${
              isActive
                ? "bg-blue-600/20 text-blue-400"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  )}
</div>
  {/* PROFILE */}

  <div className="flex-shrink-0 border-t border-white/[0.06] p-4">
    <div className="flex items-center gap-3 rounded-xl p-2">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
        {profile?.full_name?.[0]?.toUpperCase() ||
          "S"}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {loadingProfile
            ? "Loading..."
            : profile?.full_name ||
              "SaMi User"}
        </p>

        <p className="truncate text-xs text-slate-500">
          {profile?.email ||
            "Account"}
        </p>
      </div>
    </div>
  </div>
    </div>
</aside>

);