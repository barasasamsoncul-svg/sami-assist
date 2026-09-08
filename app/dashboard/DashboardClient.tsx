'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AppWindow,
  Bell,
  Bot,
  Boxes,
  Calculator,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ContactRound,
  Folder,
  FolderKanban,
  Home,
  LayoutGrid,
  Loader2,
  LogOut,
  Menu,
  Moon,
  PackageSearch,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Sun,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';

/* ============================================================
   TYPES
   ============================================================ */

type UserData = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
};

type TenantData =
  | {
      id: string;
      name: string;
      slug: string;
      status: string;
    }
  | null;

type MembershipData =
  | {
      accessLevel: 'owner' | 'admin' | 'member';
      isOwner: boolean;
      isAdmin: boolean;
      label: string;
    }
  | null;

type SubscriptionData =
  | {
      status: string;
      planKey: string | null;
      planName: string | null;
    }
  | null;

type ModuleData = {
  key: string;
  name: string;
  status: string;

  /**
   * Optional module route supplied by the app registry.
   * This is the preferred route when available.
   */
  href?: string | null;

  description?: string | null;
};

export type DashboardActivityItem = {
  id: string;
  title: string;
  description?: string | null;
  createdAt?: string | null;
  href?: string | null;
};

export type DashboardPlatformCapabilities = {
  aiEnabled?: boolean;
  filesEnabled?: boolean;
  notificationsEnabled?: boolean;
  activityEnabled?: boolean;
};

type Props = {
  user: UserData;
  tenant: TenantData;
  membership: MembershipData;
  subscription: SubscriptionData;
  modules: ModuleData[];

  /**
   * Optional platform capabilities allow the dashboard to stay
   * compatible while SaMi Core categories are completed.
   *
   * Disabled capabilities are not exposed as dead navigation.
   */
  platform?: DashboardPlatformCapabilities;

  /**
   * Real activity can be passed by the server page once available.
   * An empty array is treated as a legitimate empty state.
   */
  activity?: DashboardActivityItem[];

  unreadNotifications?: number;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const THEME_STORAGE_KEY = 'sami_theme';

const DISABLED_MODULE_STATUSES = new Set([
  'disabled',
  'failed',
  'uninstalled',
  'removed',
  'inactive',
]);

const APP_ROUTE_ALIASES: Record<string, string> = {
  invoice: '/invoices',
  invoices: '/invoices',
  invoicing: '/invoices',

  accounting: '/accounting',
  finance: '/accounting',

  crm: '/crm',

  sale: '/sales',
  sales: '/sales',

  pos: '/pos',
  'point-of-sale': '/pos',
  point_of_sale: '/pos',

  inventory: '/inventory',
  stock: '/inventory',

  hr: '/hr',
  human_resources: '/hr',
  'human-resources': '/hr',

  project: '/projects',
  projects: '/projects',

  ecommerce: '/ecommerce',
  'e-commerce': '/ecommerce',
  e_commerce: '/ecommerce',
};

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function getModuleHref(module: ModuleData) {
  const suppliedHref = module.href?.trim();

  if (suppliedHref) {
    return suppliedHref;
  }

  const normalized = normalizeKey(module.key);

  if (APP_ROUTE_ALIASES[normalized]) {
    return APP_ROUTE_ALIASES[normalized];
  }

  /**
   * Platform app framework fallback.
   *
   * As modules are registered, their registry should preferably
   * provide href. This keeps dashboard routing module-agnostic.
   */
  return `/apps/${encodeURIComponent(normalized)}`;
}

function getModuleIcon(key: string): LucideIcon {
  const normalized = normalizeKey(key);

  if (
    normalized === 'invoice' ||
    normalized === 'invoices' ||
    normalized === 'invoicing'
  ) {
    return ReceiptText;
  }

  if (
    normalized === 'accounting' ||
    normalized === 'finance'
  ) {
    return Calculator;
  }

  if (normalized === 'crm') {
    return ContactRound;
  }

  if (
    normalized === 'sale' ||
    normalized === 'sales'
  ) {
    return ShoppingCart;
  }

  if (
    normalized === 'inventory' ||
    normalized === 'stock'
  ) {
    return Boxes;
  }

  if (
    normalized === 'hr' ||
    normalized === 'human-resources' ||
    normalized === 'human_resources'
  ) {
    return UsersRound;
  }

  if (
    normalized === 'project' ||
    normalized === 'projects'
  ) {
    return FolderKanban;
  }

  if (
    normalized === 'ecommerce' ||
    normalized === 'e-commerce' ||
    normalized === 'e_commerce'
  ) {
    return Store;
  }

  if (
    normalized === 'pos' ||
    normalized === 'point-of-sale' ||
    normalized === 'point_of_sale'
  ) {
    return PackageSearch;
  }

  return AppWindow;
}

function getInitials(user: UserData) {
  const first = user.firstName?.trim()?.charAt(0);
  const last = user.lastName?.trim()?.charAt(0);

  const initials = `${first || ''}${last || ''}`.trim();

  if (initials) {
    return initials.toUpperCase();
  }

  if (user.fullName?.trim()) {
    return user.fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  return user.email.charAt(0).toUpperCase();
}

function humanizeStatus(value?: string | null) {
  if (!value) {
    return 'Unknown';
  }

  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatActivityDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/* ============================================================
   DASHBOARD
   ============================================================ */

export default function DashboardClient({
  user,
  tenant,
  membership,
  subscription,
  modules,
  platform,
  activity = [],
  unreadNotifications = 0,
}: Props) {
  const router = useRouter();

  const searchInputRef =
    useRef<HTMLInputElement | null>(null);

  const profileMenuRef =
    useRef<HTMLDivElement | null>(null);

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [profileOpen, setProfileOpen] =
    useState(false);

  const [searchFocused, setSearchFocused] =
    useState(false);

  const [searchQuery, setSearchQuery] =
    useState('');

  const [loggingOut, setLoggingOut] =
    useState(false);

  const [logoutError, setLogoutError] =
    useState<string | null>(null);

  const [darkMode, setDarkMode] =
    useState(false);

  const capabilities = {
    aiEnabled: platform?.aiEnabled ?? false,
    filesEnabled: platform?.filesEnabled ?? false,
    notificationsEnabled:
      platform?.notificationsEnabled ?? false,
    activityEnabled:
      platform?.activityEnabled ?? false,
  };

  const installedApps = useMemo(() => {
    return modules.filter((module) => {
      const status = String(
        module.status || ''
      ).toLowerCase();

      return !DISABLED_MODULE_STATUSES.has(status);
    });
  }, [modules]);

  const displayName =
    user.firstName?.trim() ||
    user.fullName?.trim() ||
    user.email;

  const initials = getInitials(user);

  const canManageWorkspace =
    Boolean(
      membership?.isOwner ||
        membership?.isAdmin
    );

  const planName =
    subscription?.planName ||
    subscription?.planKey ||
    'Free';

  const subscriptionStatus =
    humanizeStatus(subscription?.status);

  const roleName =
    membership?.label ||
    humanizeStatus(
      membership?.accessLevel || 'member'
    );

  /* ==========================================================
     THEME
     ========================================================== */

  useEffect(() => {
    try {
      const stored =
        localStorage.getItem(
          THEME_STORAGE_KEY
        );

      const systemDark =
        window.matchMedia?.(
          '(prefers-color-scheme: dark)'
        ).matches ?? false;

      const useDark =
        stored === 'dark' ||
        (!stored && systemDark);

      setDarkMode(useDark);

      document.documentElement.classList.toggle(
        'dark',
        useDark
      );
    } catch {
      // Theme remains usable even when storage is unavailable.
    }
  }, []);

  function toggleTheme() {
    const next = !darkMode;

    setDarkMode(next);

    document.documentElement.classList.toggle(
      'dark',
      next
    );

    try {
      localStorage.setItem(
        THEME_STORAGE_KEY,
        next ? 'dark' : 'light'
      );
    } catch {
      // Ignore storage errors.
    }
  }

  /* ==========================================================
     PROFILE MENU
     ========================================================== */

  useEffect(() => {
    function handlePointerDown(
      event: PointerEvent
    ) {
      const target =
        event.target as Node | null;

      if (
        profileMenuRef.current &&
        target &&
        !profileMenuRef.current.contains(
          target
        )
      ) {
        setProfileOpen(false);
      }
    }

    window.addEventListener(
      'pointerdown',
      handlePointerDown
    );

    return () => {
      window.removeEventListener(
        'pointerdown',
        handlePointerDown
      );
    };
  }, []);

  /* ==========================================================
     KEYBOARD
     ========================================================== */

  useEffect(() => {
    function handleKeyboard(
      event: KeyboardEvent
    ) {
      const target =
        event.target as HTMLElement | null;

      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (
        event.key === '/' &&
        !isTyping
      ) {
        event.preventDefault();

        searchInputRef.current?.focus();
        return;
      }

      if (event.key === 'Escape') {
        setSidebarOpen(false);
        setProfileOpen(false);
        setSearchFocused(false);
      }
    }

    window.addEventListener(
      'keydown',
      handleKeyboard
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyboard
      );
    };
  }, []);

  /* ==========================================================
     LOGOUT
     ========================================================== */

  async function logout() {
    if (loggingOut) {
      return;
    }

    setLogoutError(null);
    setLoggingOut(true);

    try {
      const response = await fetch(
        '/api/auth/logout',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          'Logout request failed.'
        );
      }

      router.replace(
        '/login?reason=logged_out'
      );

      router.refresh();
    } catch {
      setLogoutError(
        'SaMi could not sign you out. Please try again.'
      );
    } finally {
      setLoggingOut(false);
    }
  }

  /* ==========================================================
     SEARCH
     ========================================================== */

  const searchItems = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      description: string;
      href: string;
      icon: LucideIcon;
      keywords: string;
    }> = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        description:
          'Return to your workspace home.',
        href: '/dashboard',
        icon: Home,
        keywords:
          'dashboard workspace home',
      },

      {
        id: 'settings',
        label: 'Settings',
        description:
          'Manage your SaMi account and workspace.',
        href: '/settings',
        icon: Settings,
        keywords:
          'settings account workspace profile',
      },

      {
        id: 'security',
        label: 'Security',
        description:
          'Password and security settings.',
        href: '/settings?tab=security',
        icon: ShieldCheck,
        keywords:
          'security password two factor 2fa',
      },

      {
        id: 'sessions',
        label: 'Sessions & devices',
        description:
          'Review your signed-in sessions.',
        href: '/settings?tab=sessions',
        icon: UserRound,
        keywords:
          'sessions devices login security',
      },

      {
        id: 'help',
        label: 'Help',
        description:
          'Get help using SaMi.',
        href: '/help',
        icon: CircleHelp,
        keywords:
          'help support assistance',
      },
    ];

    if (canManageWorkspace) {
      items.push({
        id: 'manage-apps',
        label: 'Manage apps',
        description:
          'Install or manage workspace apps.',
        href: '/settings?tab=apps',
        icon: LayoutGrid,
        keywords:
          'apps modules install manage',
      });
    }

    if (capabilities.aiEnabled) {
      items.push({
        id: 'sami-ai',
        label: 'SaMi AI',
        description:
          'Open the SaMi AI workspace.',
        href: '/ai',
        icon: Bot,
        keywords:
          'ai assistant sami artificial intelligence',
      });
    }

    if (capabilities.filesEnabled) {
      items.push({
        id: 'files',
        label: 'Files',
        description:
          'Open workspace files.',
        href: '/files',
        icon: Folder,
        keywords:
          'files documents storage',
      });
    }

    if (
      capabilities.notificationsEnabled
    ) {
      items.push({
        id: 'notifications',
        label: 'Notifications',
        description:
          'Review workspace notifications.',
        href: '/notifications',
        icon: Bell,
        keywords:
          'notifications alerts messages',
      });
    }

    installedApps.forEach((module) => {
      items.push({
        id: `app-${module.key}`,
        label: module.name,
        description:
          module.description ||
          'Open this SaMi app.',
        href: getModuleHref(module),
        icon: getModuleIcon(module.key),
        keywords: `${module.key} ${module.name} app module`,
      });
    });

    return items;
  }, [
    installedApps,
    capabilities.aiEnabled,
    capabilities.filesEnabled,
    capabilities.notificationsEnabled,
    canManageWorkspace,
  ]);

  const searchResults = useMemo(() => {
    const query =
      searchQuery
        .trim()
        .toLowerCase();

    if (!query) {
      return searchItems.slice(0, 7);
    }

    return searchItems
      .filter((item) => {
        return `${item.label} ${item.description} ${item.keywords}`
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 8);
  }, [
    searchItems,
    searchQuery,
  ]);

  function navigateFromSearch(
    href: string
  ) {
    setSearchFocused(false);
    setSearchQuery('');

    router.push(href);
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950 transition-colors dark:bg-[#080b12] dark:text-white">
      <div className="flex min-h-screen">

        {/* ====================================================
            MOBILE SIDEBAR BACKDROP
           ==================================================== */}

        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() =>
              setSidebarOpen(false)
            }
            className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[2px] lg:hidden"
          />
        )}

        {/* ====================================================
            SIDEBAR
           ==================================================== */}

        <aside
          aria-label="SaMi navigation"
          className={`
            fixed inset-y-0 left-0 z-50
            flex w-[286px] flex-col
            border-r border-slate-200/80
            bg-white
            shadow-[12px_0_35px_rgba(15,23,42,0.03)]
            transition-transform duration-300
            dark:border-slate-800/90
            dark:bg-[#0b0f18]
            dark:shadow-none
            lg:translate-x-0
            ${
              sidebarOpen
                ? 'translate-x-0'
                : '-translate-x-full'
            }
          `}
        >
          {/* Brand */}

          <div className="flex min-h-[88px] items-center justify-between border-b border-slate-100 px-5 dark:border-slate-800/80">
            <Link
              href="/dashboard"
              aria-label="SaMi dashboard"
              onClick={() =>
                setSidebarOpen(false)
              }
              className="min-w-0"
            >
              {/* FULL APPROVED LOGO — SIZE ONLY */}
              <SaMiLogo size="sm" />
            </Link>

            <button
              type="button"
              aria-label="Close navigation"
              onClick={() =>
                setSidebarOpen(false)
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Workspace identity */}

          <div className="px-4 pt-5">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Workspace
              </p>

              <p className="mt-1 truncate text-sm font-extrabold text-slate-900 dark:text-white">
                {tenant?.name ||
                  'SaMi Workspace'}
              </p>

              <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  {roleName}
                </span>

                <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />

                <span>
                  {planName}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation */}

          <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-6">
            <NavSectionLabel>
              Workspace
            </NavSectionLabel>

            <div className="mt-2 space-y-1">
              <NavLink
                href="/dashboard"
                icon={Home}
                label="Dashboard"
                active
                onNavigate={() =>
                  setSidebarOpen(false)
                }
              />

              {capabilities.aiEnabled && (
                <NavLink
                  href="/ai"
                  icon={Bot}
                  label="SaMi AI"
                  onNavigate={() =>
                    setSidebarOpen(false)
                  }
                />
              )}
            </div>

            <NavSectionLabel className="mt-7">
              Apps
            </NavSectionLabel>

            <div className="mt-2 space-y-1">
              {installedApps.length > 0 ? (
                installedApps
                  .slice(0, 10)
                  .map((module) => {
                    const Icon =
                      getModuleIcon(
                        module.key
                      );

                    return (
                      <NavLink
                        key={module.key}
                        href={getModuleHref(
                          module
                        )}
                        icon={Icon}
                        label={module.name}
                        onNavigate={() =>
                          setSidebarOpen(
                            false
                          )
                        }
                      />
                    );
                  })
              ) : (
                <div className="mx-1 rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No apps are installed in this workspace.
                </div>
              )}

              {canManageWorkspace && (
                <NavLink
                  href="/settings?tab=apps"
                  icon={LayoutGrid}
                  label="Manage apps"
                  onNavigate={() =>
                    setSidebarOpen(false)
                  }
                />
              )}
            </div>

            {(capabilities.filesEnabled ||
              capabilities.notificationsEnabled) && (
              <>
                <NavSectionLabel className="mt-7">
                  Core
                </NavSectionLabel>

                <div className="mt-2 space-y-1">
                  {capabilities.filesEnabled && (
                    <NavLink
                      href="/files"
                      icon={Folder}
                      label="Files"
                      onNavigate={() =>
                        setSidebarOpen(
                          false
                        )
                      }
                    />
                  )}

                  {capabilities.notificationsEnabled && (
                    <NavLink
                      href="/notifications"
                      icon={Bell}
                      label="Notifications"
                      badge={
                        unreadNotifications >
                        0
                          ? unreadNotifications
                          : undefined
                      }
                      onNavigate={() =>
                        setSidebarOpen(
                          false
                        )
                      }
                    />
                  )}
                </div>
              </>
            )}

            <NavSectionLabel className="mt-7">
              Account
            </NavSectionLabel>

            <div className="mt-2 space-y-1">
              <NavLink
                href="/settings"
                icon={Settings}
                label="Settings"
                onNavigate={() =>
                  setSidebarOpen(false)
                }
              />

              <NavLink
                href="/help"
                icon={CircleHelp}
                label="Help"
                onNavigate={() =>
                  setSidebarOpen(false)
                }
              />
            </div>
          </nav>

          {/* Sidebar user */}

          <div className="border-t border-slate-200/80 p-4 dark:border-slate-800">
            <div className="flex items-center gap-3 rounded-2xl px-2 py-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-xs font-black text-white shadow-sm">
                {initials}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {displayName}
                </p>

                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {user.email}
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* ====================================================
            MAIN AREA
           ==================================================== */}

        <div className="min-w-0 flex-1 lg:pl-[286px]">

          {/* ==================================================
              TOP BAR
             ================================================== */}

          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800/90 dark:bg-[#080b12]/88">
            <div className="flex h-[76px] items-center gap-3 px-4 sm:px-6 lg:px-8">

              <button
                type="button"
                aria-label="Open navigation"
                onClick={() =>
                  setSidebarOpen(true)
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Search */}

              <div className="relative min-w-0 max-w-2xl flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(
                      event.target.value
                    )
                  }
                  onFocus={() =>
                    setSearchFocused(true)
                  }
                  placeholder="Search SaMi"
                  aria-label="Search SaMi"
                  className="
                    h-11 w-full rounded-2xl
                    border border-slate-200
                    bg-slate-50
                    pl-11 pr-16
                    text-sm
                    text-slate-900
                    outline-none
                    transition
                    placeholder:text-slate-400
                    focus:border-blue-500
                    focus:bg-white
                    focus:ring-4
                    focus:ring-blue-500/10
                    dark:border-slate-800
                    dark:bg-slate-900
                    dark:text-white
                    dark:focus:border-blue-500
                    dark:focus:bg-slate-900
                  "
                />

                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-400 shadow-sm sm:block dark:border-slate-700 dark:bg-slate-800">
                  /
                </kbd>

                {searchFocused && (
                  <>
                    <button
                      type="button"
                      aria-label="Close search"
                      className="fixed inset-0 z-[-1]"
                      onClick={() =>
                        setSearchFocused(
                          false
                        )
                      }
                    />

                    <div className="absolute left-0 right-0 top-[52px] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.15)] dark:border-slate-800 dark:bg-slate-900">
                      <div className="border-b border-slate-100 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:border-slate-800">
                        {searchQuery.trim()
                          ? 'Search results'
                          : 'Quick access'}
                      </div>

                      {searchResults.length >
                      0 ? (
                        <div className="max-h-[380px] overflow-y-auto p-2">
                          {searchResults.map(
                            (item) => {
                              const Icon =
                                item.icon;

                              return (
                                <button
                                  key={
                                    item.id
                                  }
                                  type="button"
                                  onClick={() =>
                                    navigateFromSearch(
                                      item.href
                                    )
                                  }
                                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    <Icon className="h-4 w-4" />
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold">
                                      {
                                        item.label
                                      }
                                    </p>

                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                      {
                                        item.description
                                      }
                                    </p>
                                  </div>

                                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                                </button>
                              );
                            }
                          )}
                        </div>
                      ) : (
                        <div className="px-5 py-8 text-center">
                          <Search className="mx-auto h-6 w-6 text-slate-300" />

                          <p className="mt-3 text-sm font-bold">
                            No matches found
                          </p>

                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Try a different app or setting.
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Header controls */}

              <div className="ml-auto flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  aria-label={
                    darkMode
                      ? 'Use light theme'
                      : 'Use dark theme'
                  }
                  onClick={toggleTheme}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  {darkMode ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                </button>

                <Link
                  href="/help"
                  aria-label="Help"
                  className="hidden h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white sm:flex"
                >
                  <CircleHelp className="h-5 w-5" />
                </Link>

                {capabilities.notificationsEnabled && (
                  <Link
                    href="/notifications"
                    aria-label="Notifications"
                    className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    <Bell className="h-5 w-5" />

                    {unreadNotifications >
                      0 && (
                      <span className="absolute right-1.5 top-1.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white dark:ring-[#080b12]">
                        {unreadNotifications >
                        99
                          ? '99+'
                          : unreadNotifications}
                      </span>
                    )}
                  </Link>
                )}

                {/* Profile */}

                <div
                  ref={profileMenuRef}
                  className="relative"
                >
                  <button
                    type="button"
                    aria-label="Open account menu"
                    aria-expanded={
                      profileOpen
                    }
                    onClick={() =>
                      setProfileOpen(
                        (current) =>
                          !current
                      )
                    }
                    className="flex h-10 items-center gap-2 rounded-xl pl-1 pr-2 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-xs font-black text-white shadow-sm">
                      {initials}
                    </span>

                    <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 top-[48px] z-50 w-[270px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.16)] dark:border-slate-800 dark:bg-slate-900">
                      <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
                        <p className="truncate text-sm font-extrabold">
                          {displayName}
                        </p>

                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {user.email}
                        </p>

                        <div className="mt-3 flex gap-2">
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            {roleName}
                          </span>

                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {planName}
                          </span>
                        </div>
                      </div>

                      <div className="p-2">
                        <MenuItem
                          href="/settings"
                          icon={Settings}
                          label="Settings"
                          onNavigate={() =>
                            setProfileOpen(
                              false
                            )
                          }
                        />

                        <MenuItem
                          href="/settings?tab=security"
                          icon={ShieldCheck}
                          label="Security"
                          onNavigate={() =>
                            setProfileOpen(
                              false
                            )
                          }
                        />

                        <MenuItem
                          href="/help"
                          icon={CircleHelp}
                          label="Help"
                          onNavigate={() =>
                            setProfileOpen(
                              false
                            )
                          }
                        />
                      </div>

                      <div className="border-t border-slate-100 p-2 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={logout}
                          disabled={
                            loggingOut
                          }
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          {loggingOut ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <LogOut className="h-4 w-4" />
                          )}

                          {loggingOut
                            ? 'Signing out...'
                            : 'Sign out'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* ==================================================
              PAGE
             ================================================== */}

          <div className="mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">

            {/* Logout error */}

            {logoutError && (
              <div
                role="alert"
                className="mb-6 flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
              >
                <span>
                  {logoutError}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setLogoutError(null)
                  }
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Welcome */}

            <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />

                  <p className="truncate text-sm font-bold text-slate-500 dark:text-slate-400">
                    {tenant?.name ||
                      'SaMi Workspace'}
                  </p>
                </div>

                <h1 className="mt-2 text-[30px] font-black tracking-[-0.035em] text-slate-950 sm:text-[36px] dark:text-white">
                  Welcome, {displayName}
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Everything you need to work across your SaMi workspace.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {canManageWorkspace && (
                  <Link
                    href="/settings?tab=apps"
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Manage apps
                  </Link>
                )}

                {capabilities.aiEnabled && (
                  <Link
                    href="/ai"
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    <Sparkles className="h-4 w-4" />
                    Ask SaMi AI
                  </Link>
                )}
              </div>
            </section>

            {/* ==================================================
                APP LAUNCHER
               ================================================== */}

            <section className="mt-9">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight">
                    Apps
                  </h2>

                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Open your installed business apps.
                  </p>
                </div>

                {canManageWorkspace && (
                  <Link
                    href="/settings?tab=apps"
                    className="text-sm font-bold text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Manage
                  </Link>
                )}
              </div>

              {installedApps.length > 0 ? (
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {installedApps.map(
                    (module) => (
                      <AppCard
                        key={module.key}
                        module={module}
                      />
                    )
                  )}
                </div>
              ) : (
                <div className="mt-5 rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <LayoutGrid className="h-5 w-5" />
                  </div>

                  <h3 className="mt-4 text-sm font-extrabold">
                    No apps installed
                  </h3>

                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                    This workspace currently has no active business apps.
                  </p>

                  {canManageWorkspace && (
                    <Link
                      href="/settings?tab=apps"
                      className="mt-5 inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
                    >
                      Manage apps
                    </Link>
                  )}
                </div>
              )}
            </section>

            {/* ==================================================
                WORKSPACE OVERVIEW
               ================================================== */}

            <div className="mt-8 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">

              {/* Your work */}

              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.04)] sm:p-6 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                    <Sparkles className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-extrabold">
                      Your workspace
                    </h2>

                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                      Account and workspace controls.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <QuickAction
                    href="/settings"
                    icon={Settings}
                    label="Settings"
                    description="Account and workspace"
                  />

                  <QuickAction
                    href="/settings?tab=security"
                    icon={ShieldCheck}
                    label="Security"
                    description="Password and protection"
                  />

                  <QuickAction
                    href="/settings?tab=sessions"
                    icon={UserRound}
                    label="Sessions"
                    description="Signed-in devices"
                  />

                  <QuickAction
                    href="/help"
                    icon={CircleHelp}
                    label="Help"
                    description="Support and guidance"
                  />
                </div>
              </section>

              {/* Workspace status */}

              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.04)] sm:p-6 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <Activity className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-extrabold">
                      Workspace status
                    </h2>

                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                      Your current access.
                    </p>
                  </div>
                </div>

                <dl className="mt-6 divide-y divide-slate-100 dark:divide-slate-800">
                  <StatusRow
                    label="Plan"
                    value={planName}
                  />

                  <StatusRow
                    label="Subscription"
                    value={
                      subscriptionStatus
                    }
                  />

                  <StatusRow
                    label="Access"
                    value={roleName}
                  />

                  <StatusRow
                    label="Installed apps"
                    value={String(
                      installedApps.length
                    )}
                  />
                </dl>
              </section>
            </div>

            {/* ==================================================
                AI
               ================================================== */}

            {capabilities.aiEnabled && (
              <section className="relative mt-8 overflow-hidden rounded-[30px] bg-gradient-to-br from-[#09101f] via-[#0d1b38] to-[#172b65] px-6 py-7 text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)] sm:px-8">
                <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />

                <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
                      <Bot className="h-5 w-5" />
                    </div>

                    <h2 className="mt-5 text-xl font-black tracking-tight">
                      SaMi AI
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Ask questions and work with the AI tools available in your workspace and installed apps.
                    </p>
                  </div>

                  <Link
                    href="/ai"
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-slate-100 lg:self-auto"
                  >
                    Open SaMi AI
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </section>
            )}

            {/* ==================================================
                REAL ACTIVITY
               ================================================== */}

            {(capabilities.activityEnabled ||
              activity.length > 0) && (
              <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.04)] sm:p-6 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                <div>
                  <h2 className="font-extrabold">
                    Activity
                  </h2>

                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Recent workspace activity.
                  </p>
                </div>

                {activity.length > 0 ? (
                  <div className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">
                    {activity
                      .slice(0, 8)
                      .map((item) => (
                        <ActivityRow
                          key={item.id}
                          item={item}
                        />
                      ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl bg-slate-50 px-5 py-7 text-center dark:bg-slate-950/60">
                    <Activity className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-700" />

                    <p className="mt-3 text-sm font-bold">
                      No recent activity
                    </p>

                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      New workspace activity will be shown here.
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ============================================================
   COMPONENTS
   ============================================================ */

function NavSectionLabel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 ${className}`}
    >
      {children}
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active = false,
  badge,
  onNavigate,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`
        group flex min-h-11 items-center gap-3
        rounded-xl px-3
        text-sm font-semibold
        transition
        ${
          active
            ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
        }
      `}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${
          active
            ? ''
            : 'text-slate-400 transition group-hover:text-slate-600 dark:group-hover:text-slate-200'
        }`}
      />

      <span className="min-w-0 flex-1 truncate">
        {label}
      </span>

      {badge !== undefined &&
        badge > 0 && (
          <span className="flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[9px] font-black text-white">
            {badge > 99
              ? '99+'
              : badge}
          </span>
        )}
    </Link>
  );
}

function AppCard({
  module,
}: {
  module: ModuleData;
}) {
  const Icon = getModuleIcon(module.key);

  return (
    <Link
      href={getModuleHref(module)}
      className="
        group relative overflow-hidden
        rounded-[24px]
        border border-slate-200
        bg-white
        p-5
        shadow-[0_8px_28px_rgba(15,23,42,0.04)]
        transition duration-200
        hover:-translate-y-0.5
        hover:border-slate-300
        hover:shadow-[0_14px_38px_rgba(15,23,42,0.08)]
        dark:border-slate-800
        dark:bg-slate-900
        dark:hover:border-slate-700
        dark:hover:shadow-none
      "
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 dark:from-blue-950/50 dark:to-indigo-950/40 dark:text-blue-300">
          <Icon className="h-5 w-5" />
        </div>

        <ChevronRight className="mt-1 h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-700 dark:group-hover:text-slate-400" />
      </div>

      <h3 className="mt-5 truncate text-[15px] font-extrabold">
        {module.name}
      </h3>

      <p className="mt-1 line-clamp-2 min-h-[36px] text-xs leading-[18px] text-slate-500 dark:text-slate-400">
        {module.description ||
          `Open ${module.name} in your SaMi workspace.`}
      </p>
    </Link>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-950"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-[18px] w-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {label}
        </p>

        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 dark:text-slate-700" />
    </Link>
  );
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-5 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-slate-500 dark:text-slate-400">
        {label}
      </dt>

      <dd className="max-w-[55%] truncate text-right text-sm font-bold">
        {value}
      </dd>
    </div>
  );
}

function ActivityRow({
  item,
}: {
  item: DashboardActivityItem;
}) {
  const formattedDate =
    formatActivityDate(
      item.createdAt
    );

  const content = (
    <div className="flex items-start gap-3 py-4">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Activity className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">
          {item.title}
        </p>

        {item.description && (
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {item.description}
          </p>
        )}

        {formattedDate && (
          <p className="mt-1.5 text-[11px] text-slate-400">
            {formattedDate}
          </p>
        )}
      </div>

      {item.href && (
        <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300" />
      )}
    </div>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className="block rounded-xl transition hover:bg-slate-50 dark:hover:bg-slate-950"
      >
        {content}
      </Link>
    );
  }

  return content;
}

function MenuItem({
  href,
  icon: Icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
    >
      <Icon className="h-4 w-4 text-slate-400" />
      {label}
    </Link>
  );
}