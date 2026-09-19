'use client';

import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  AlertTriangle,
  AppWindow,
  Bell,
  Bot,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  FileText,
  Folder,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  Menu,
  Moon,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
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

import UserAvatar from '@/app/components/account/UserAvatar';

import WorkspaceSidebar from '@/app/components/workspace/WorkspaceSidebar';

import {
  SAMI_APPS,
} from '@/lib/sami-apps';

import {
  resolveUserTheme,
  type UserTheme,
} from '@/lib/account/user-formatting';

import type {
  DashboardAction,
  DashboardAttentionItem,
  DashboardMetric,
  DashboardPriority,
  DashboardRecentItem,
  DashboardTone,
  DashboardViewModel,
  DashboardWorkItem,
} from '@/lib/dashboard/types';


/* ================================================================
   TYPES
   ================================================================ */

type UserData = {
  id:
    string;

  email:
    string;

  fullName:
    string;

  firstName:
    string;

  lastName:
    string;

  avatarFileId:
    string | null;
};


type TenantData =
  | {
      id:
        string;

      name:
        string;

      slug:
        string;

      status:
        string;
    }
  | null;


type MembershipData =
  | {
      accessLevel:
        | 'owner'
        | 'admin'
        | 'member';

      isOwner:
        boolean;

      isAdmin:
        boolean;

      label:
        string;
    }
  | null;


type SubscriptionData =
  | {
      status:
        string;

      planKey:
        string | null;

      planName:
        string | null;
    }
  | null;


type ModuleData = {
  key:
    string;

  name:
    string;

  status:
    string;

  href?:
    string | null;

  description?:
    string | null;
};


type CompanyData =
  | {
      currentCompany: {
        id:
          string;

        name:
          string;

        currency:
          string;

        timezone:
          string;
      };

      selectedCompanyCount:
        number;

      allowedCompanyCount:
        number;
    }
  | null;


type DashboardCapabilities = {
  ai:
    boolean;

  files:
    boolean;

  notifications:
    boolean;


  workspaceView:
    boolean;

  workspaceManage:
    boolean;


  usersView:
    boolean;

  usersManage:
    boolean;


  rolesView:
    boolean;

  rolesManage:
    boolean;


  invitationsView:
    boolean;

  invitationsManage:
    boolean;


  companiesView:
    boolean;

  companiesManage:
    boolean;


  appsView:
    boolean;

  appsManage:
    boolean;


  billingView:
    boolean;

  billingManage:
    boolean;


  settingsView:
    boolean;

  settingsManage:
    boolean;


  auditView:
    boolean;

  usageView:
    boolean;
};


type Props = {
  user:
    UserData;

  tenant:
    TenantData;

  membership:
    MembershipData;

  subscription:
    SubscriptionData;

  modules:
    ModuleData[];

  company:
    CompanyData;

  dashboard:
    DashboardViewModel;

  capabilities:
    DashboardCapabilities;

  unreadNotifications?:
    number;
};


type SearchItem = {
  id:
    string;

  label:
    string;

  description:
    string;

  href:
    string;

  icon:
    LucideIcon;

  keywords:
    string;
};


/* ================================================================
   CONSTANTS
   ================================================================ */

const THEME_STORAGE_KEY =
  'sami_theme';


const APP_METADATA =
  new Map(
    SAMI_APPS.map(
      app => [
        app.key,
        app,
      ],
    ),
  );


/* ================================================================
   HELPERS
   ================================================================ */

function normalizeKey(
  value:
    string,
) {
  return value
    .trim()
    .toLowerCase();
}


function getModuleMetadata(
  module:
    ModuleData,
) {
  return (
    APP_METADATA.get(
      module.key,
    ) ||
    APP_METADATA.get(
      normalizeKey(
        module.key,
      ),
    )
  );
}


function getModuleHref(
  module:
    ModuleData,
) {
  if (
    module.href
      ?.trim()
  ) {
    return module.href;
  }


  const metadata =
    getModuleMetadata(
      module,
    );


  if (
    metadata?.route
  ) {
    return `/${metadata.route.replace(
      /^\/+/,
      '',
    )}`;
  }


  return `/apps/${encodeURIComponent(
    normalizeKey(
      module.key,
    ),
  )}`;
}


function getModuleDescription(
  module:
    ModuleData,
) {
  return (
    module.description ||
    getModuleMetadata(
      module,
    )?.description ||
    `Open ${module.name}.`
  );
}


function getInitials(
  user:
    UserData,
) {
  const first =
    user.firstName
      ?.trim()
      .charAt(
        0,
      );


  const last =
    user.lastName
      ?.trim()
      .charAt(
        0,
      );


  const initials =
    `${first || ''}${last || ''}`
      .trim();


  if (
    initials
  ) {
    return initials
      .toUpperCase();
  }


  return user.email
    .charAt(
      0,
    )
    .toUpperCase();
}


function getGreeting() {
  const hour =
    new Date()
      .getHours();


  if (
    hour <
    12
  ) {
    return 'Good morning';
  }


  if (
    hour <
    17
  ) {
    return 'Good afternoon';
  }


  return 'Good evening';
}


function getSystemPrefersDark() {
  if (
    typeof window ===
    'undefined'
  ) {
    return false;
  }


  return (
    window.matchMedia?.(
      '(prefers-color-scheme: dark)',
    ).matches ??
    false
  );
}


function applyTheme(
  theme:
    UserTheme,
) {
  const resolved =
    resolveUserTheme(
      theme,
      getSystemPrefersDark(),
    );


  const dark =
    resolved ===
    'dark';


  document
    .documentElement
    .classList
    .toggle(
      'dark',
      dark,
    );


  try {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      theme,
    );
  } catch {
    // Optional local cache.
  }


  return dark;
}


function priorityLabel(
  priority:
    DashboardPriority,
) {
  switch (
    priority
  ) {
    case 'critical':
      return 'Critical';

    case 'high':
      return 'High';

    case 'low':
      return 'Low';

    default:
      return 'Normal';
  }
}


function priorityClasses(
  priority:
    DashboardPriority,
) {
  switch (
    priority
  ) {
    case 'critical':
      return 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300';

    case 'high':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';

    case 'low':
      return 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400';

    default:
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300';
  }
}


function toneClasses(
  tone:
    DashboardTone,
) {
  switch (
    tone
  ) {
    case 'danger':
      return 'text-red-600 dark:text-red-400';

    case 'warning':
      return 'text-amber-600 dark:text-amber-400';

    case 'success':
      return 'text-emerald-600 dark:text-emerald-400';

    case 'info':
      return 'text-blue-600 dark:text-blue-400';

    default:
      return 'text-slate-950 dark:text-white';
  }
}


function formatDateTime(
  value:
    string | null,
) {
  if (
    !value
  ) {
    return null;
  }


  const date =
    new Date(
      value,
    );


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }


  return new Intl.DateTimeFormat(
    undefined,
    {
      month:
        'short',

      day:
        'numeric',

      hour:
        'numeric',

      minute:
        '2-digit',
    },
  )
    .format(
      date,
    );
}


/* ================================================================
   CLIENT
   ================================================================ */

export default function DashboardClient({
  user,
  tenant,
  membership,
  subscription,
  modules,
  company,
  dashboard,
  capabilities,
  unreadNotifications =
    0,
}: Props) {
  const router =
    useRouter();


  const searchRef =
    useRef<
      HTMLInputElement | null
    >(
      null,
    );


  const profileRef =
    useRef<
      HTMLDivElement | null
    >(
      null,
    );


  const [
    sidebarOpen,
    setSidebarOpen,
  ] =
    useState(
      false,
    );


  const [
    profileOpen,
    setProfileOpen,
  ] =
    useState(
      false,
    );


  const [
    searchOpen,
    setSearchOpen,
  ] =
    useState(
      false,
    );


  const [
    searchQuery,
    setSearchQuery,
  ] =
    useState(
      '',
    );


  const [
    darkMode,
    setDarkMode,
  ] =
    useState(
      false,
    );


  const [
    themeSaving,
    setThemeSaving,
  ] =
    useState(
      false,
    );


  const [
    loggingOut,
    setLoggingOut,
  ] =
    useState(
      false,
    );


  const [
    logoutError,
    setLogoutError,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const displayName =
    user.firstName
      ?.trim() ||
    user.fullName
      ?.trim() ||
    user.email;


  const initials =
    getInitials(
      user,
    );


  const greeting =
    getGreeting();


  const roleLabel =
    membership?.label ||
    membership?.accessLevel ||
    'Member';


  const currentCompanyName =
    company
      ?.currentCompany
      .name ||
    tenant
      ?.name ||
    'Workspace';


  const planName =
    subscription
      ? (
          subscription.planName ||
          subscription.planKey ||
          'Subscription'
        )
      : null;


  /* ============================================================
     MANAGEMENT
     ============================================================ */

  const managementActions =
    useMemo<
      SearchItem[]
    >(
      () => {
        const items:
          SearchItem[] =
          [];


        if (
          capabilities.workspaceView ||
          capabilities.workspaceManage
        ) {
          items.push({
            id:
              'management-workspace',

            label:
              'Workspace',

            description:
              'Workspace configuration',

            href:
              '/settings?tab=workspace',

            icon:
              Building2,

            keywords:
              'workspace organization configuration',
          });
        }


        if (
          capabilities.usersView
        ) {
          items.push({
            id:
              'management-users',

            label:
              'Users',

            description:
              'Workspace members',

            href:
              '/settings/users',

            icon:
              UsersRound,

            keywords:
              'users members employees access',
          });
        }


        if (
          capabilities.rolesView
        ) {
          items.push({
            id:
              'management-roles',

            label:
              'Roles & Permissions',

            description:
              'Access control',

            href:
              '/settings/roles',

            icon:
              Shield,

            keywords:
              'roles permissions access security',
          });
        }


        if (
          capabilities.invitationsView
        ) {
          items.push({
            id:
              'management-invitations',

            label:
              'Invitations',

            description:
              'Pending workspace invitations',

            href:
              '/settings/invitations',

            icon:
              Mail,

            keywords:
              'invite invitation user member',
          });
        }


        if (
          capabilities.appsView ||
          capabilities.appsManage
        ) {
          items.push({
            id:
              'management-apps',

            label:
              'Apps',

            description:
              'Workspace applications',

            href:
              '/settings?tab=apps',

            icon:
              LayoutGrid,

            keywords:
              'apps modules install application',
          });
        }


        if (
          capabilities.billingView &&
          subscription
        ) {
          items.push({
            id:
              'management-billing',

            label:
              'Billing',

            description:
              'Subscription and billing',

            href:
              '/settings?tab=billing',

            icon:
              CreditCard,

            keywords:
              'billing subscription plan payment',
          });
        }


        return items;
      },

      [
        capabilities,
        subscription,
      ],
    );


  /* ============================================================
     SEARCH
     ============================================================ */

  const searchItems =
    useMemo<
      SearchItem[]
    >(
      () => {
        const items:
          SearchItem[] =
          modules.map(
            module => ({
              id:
                `app-${module.key}`,

              label:
                module.name,

              description:
                getModuleDescription(
                  module,
                ),

              href:
                getModuleHref(
                  module,
                ),

              icon:
                AppWindow,

              keywords:
                `${module.key} ${module.name}`,
            }),
          );


        for (
          const action
          of managementActions
        ) {
          items.push(
            action,
          );
        }


        for (
          const action
          of dashboard.actions
        ) {
          items.push({
            id:
              `dashboard-${action.id}`,

            label:
              action.label,

            description:
              action.description ||
              'Quick action',

            href:
              action.href,

            icon:
              BriefcaseBusiness,

            keywords:
              `${action.label} ${action.description || ''}`,
          });
        }


        items.push({
          id:
            'account',

          label:
            'My Account',

          description:
            'Profile and preferences',

          href:
            '/settings?tab=personal',

          icon:
            User,

          keywords:
            'account profile preferences',
        });


        return items;
      },

      [
        modules,
        managementActions,
        dashboard.actions,
      ],
    );


  const searchResults =
    useMemo(
      () => {
        const query =
          searchQuery
            .trim()
            .toLowerCase();


        if (
          !query
        ) {
          return searchItems.slice(
            0,
            8,
          );
        }


        return searchItems
          .filter(
            item =>
              `${item.label} ${item.description} ${item.keywords}`
                .toLowerCase()
                .includes(
                  query,
                ),
          )
          .slice(
            0,
            8,
          );
      },

      [
        searchItems,
        searchQuery,
      ],
    );


  /* ============================================================
     THEME
     ============================================================ */

  useEffect(
    () => {
      try {
        const saved =
          localStorage.getItem(
            THEME_STORAGE_KEY,
          );


        const theme:
          UserTheme =
          saved ===
              'light' ||
            saved ===
              'dark' ||
            saved ===
              'system'
            ? saved
            : 'system';


        setDarkMode(
          applyTheme(
            theme,
          ),
        );
      } catch {
        setDarkMode(
          getSystemPrefersDark(),
        );
      }
    },

    [],
  );


  async function toggleTheme() {
    if (
      themeSaving
    ) {
      return;
    }


    const previous =
      darkMode;


    const next:
      UserTheme =
      darkMode
        ? 'light'
        : 'dark';


    setThemeSaving(
      true,
    );


    setDarkMode(
      applyTheme(
        next,
      ),
    );


    try {
      const response =
        await fetch(
          '/api/account/preferences',
          {
            method:
              'PATCH',

            credentials:
              'same-origin',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                theme:
                  next,
              }),
          },
        );


      if (
        !response.ok
      ) {
        throw new Error();
      }
    } catch {
      setDarkMode(
        previous,
      );


      applyTheme(
        previous
          ? 'dark'
          : 'light',
      );
    } finally {
      setThemeSaving(
        false,
      );
    }
  }


  /* ============================================================
     PROFILE
     ============================================================ */

  useEffect(
    () => {
      function outside(
        event:
          PointerEvent,
      ) {
        if (
          profileRef.current &&
          !profileRef.current.contains(
            event.target as Node,
          )
        ) {
          setProfileOpen(
            false,
          );
        }
      }


      window.addEventListener(
        'pointerdown',
        outside,
      );


      return () =>
        window.removeEventListener(
          'pointerdown',
          outside,
        );
    },

    [],
  );


  /* ============================================================
     KEYBOARD
     ============================================================ */

  useEffect(
    () => {
      function keyboard(
        event:
          KeyboardEvent,
      ) {
        const target =
          event.target as
            | HTMLElement
            | null;


        const typing =
          target?.tagName ===
            'INPUT' ||
          target?.tagName ===
            'TEXTAREA' ||
          target?.isContentEditable;


        if (
          event.key ===
            '/' &&
          !typing
        ) {
          event.preventDefault();

          searchRef.current?.focus();

          return;
        }


        if (
          event.key ===
          'Escape'
        ) {
          setSidebarOpen(
            false,
          );

          setProfileOpen(
            false,
          );

          setSearchOpen(
            false,
          );
        }
      }


      window.addEventListener(
        'keydown',
        keyboard,
      );


      return () =>
        window.removeEventListener(
          'keydown',
          keyboard,
        );
    },

    [],
  );


  /* ============================================================
     LOGOUT
     ============================================================ */

  async function logout() {
    if (
      loggingOut
    ) {
      return;
    }


    setLoggingOut(
      true,
    );


    setLogoutError(
      null,
    );


    try {
      const response =
        await fetch(
          '/api/auth/logout',
          {
            method:
              'POST',

            credentials:
              'include',
          },
        );


      if (
        !response.ok
      ) {
        throw new Error();
      }


      router.replace(
        '/login?reason=logged_out',
      );


      router.refresh();
    } catch {
      setLogoutError(
        'SaMi could not sign you out. Please try again.',
      );
    } finally {
      setLoggingOut(
        false,
      );
    }
  }


  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <main className="min-h-screen bg-[#F6F7F9] text-slate-950 dark:bg-[#090B10] dark:text-white">
      <div className="flex min-h-screen">

        <WorkspaceSidebar
          user={
            user
          }

          tenant={
            tenant
          }

          membership={
            membership
          }

          subscription={
            subscription
          }

          modules={
            modules
          }

          capabilities={{
            aiEnabled:
              capabilities.ai,

            filesEnabled:
              capabilities.files,

            notificationsEnabled:
              capabilities.notifications,
          }}

          unreadNotifications={
            unreadNotifications
          }

          open={
            sidebarOpen
          }

          onClose={() =>
            setSidebarOpen(
              false,
            )
          }
        />


        <div className="min-w-0 flex-1 lg:pl-[286px]">

          {/* ==================================================
              TOP BAR
              ================================================== */}

          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0E14]/95">

            <div className="flex h-16 items-center gap-2 px-3 sm:px-5 lg:px-7">

              <button
                type="button"
                aria-label="Open navigation"
                onClick={() =>
                  setSidebarOpen(
                    true,
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>


              <div className="hidden min-w-0 xl:block">
                <p className="max-w-[180px] truncate text-sm font-semibold">
                  {tenant?.name ||
                    'SaMi Workspace'}
                </p>

                <p className="truncate text-[11px] text-slate-400">
                  {currentCompanyName}
                </p>
              </div>


              {/* SEARCH */}

              <div className="relative mx-auto min-w-0 max-w-[650px] flex-1">

                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  ref={
                    searchRef
                  }
                  value={
                    searchQuery
                  }
                  type="search"
                  placeholder="Search your apps and workspace"
                  onFocus={() =>
                    setSearchOpen(
                      true,
                    )
                  }
                  onChange={
                    event => {
                      setSearchQuery(
                        event.target.value,
                      );

                      setSearchOpen(
                        true,
                      );
                    }
                  }
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5"
                />


                {searchOpen && (
                  <div className="absolute left-0 right-0 top-[46px] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#15181F]">

                    <div className="max-h-[360px] overflow-y-auto p-2">

                      {searchResults.length >
                      0 ? (
                        searchResults.map(
                          item => {
                            const Icon =
                              item.icon;


                            return (
                              <button
                                key={
                                  item.id
                                }
                                type="button"
                                onClick={() => {
                                  setSearchOpen(
                                    false,
                                  );

                                  router.push(
                                    item.href,
                                  );
                                }}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-950/30"
                              >
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                                  <Icon className="h-4 w-4" />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold">
                                    {item.label}
                                  </p>

                                  <p className="truncate text-xs text-slate-400">
                                    {item.description}
                                  </p>
                                </div>

                                <ChevronRight className="h-4 w-4 text-slate-300" />
                              </button>
                            );
                          },
                        )
                      ) : (
                        <div className="px-4 py-8 text-center text-sm text-slate-400">
                          No matching accessible result.
                        </div>
                      )}

                    </div>
                  </div>
                )}

              </div>


              <div className="ml-auto flex items-center gap-1">

                {capabilities.notifications && (
                  <Link
                    href="/notifications"
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    <Bell className="h-[18px] w-[18px]" />

                    {unreadNotifications >
                      0 && (
                      <span className="absolute right-0.5 top-0.5 rounded-full bg-red-500 px-1 text-[8px] font-bold text-white">
                        {unreadNotifications >
                        99
                          ? '99+'
                          : unreadNotifications}
                      </span>
                    )}
                  </Link>
                )}


                <button
                  type="button"
                  disabled={
                    themeSaving
                  }
                  onClick={() =>
                    void toggleTheme()
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  {themeSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : darkMode ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </button>


                <div
                  ref={
                    profileRef
                  }
                  className="relative"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setProfileOpen(
                        value =>
                          !value,
                      )
                    }
                    className="flex h-9 items-center gap-1 rounded-lg px-1 hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    <UserAvatar
                      avatarFileId={
                        user.avatarFileId
                      }
                      displayName={
                        displayName
                      }
                      initials={
                        initials
                      }
                      size="sm"
                    />

                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </button>


                  {profileOpen && (
                    <div className="absolute right-0 top-[44px] z-50 w-[270px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#15181F]">

                      <div className="border-b border-slate-100 px-4 py-3.5 dark:border-white/10">

                        <p className="truncate text-sm font-semibold">
                          {displayName}
                        </p>

                        <p className="truncate text-xs text-slate-400">
                          {user.email}
                        </p>


                        <div className="mt-2 flex gap-1.5">

                          <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            {roleLabel}
                          </span>


                          {planName && (
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                              {planName}
                            </span>
                          )}

                        </div>

                      </div>


                      <div className="p-1.5">

                        <ProfileLink
                          href="/settings?tab=personal"
                          icon={
                            User
                          }
                          label="My Account"
                        />

                        <ProfileLink
                          href="/settings?tab=security"
                          icon={
                            ShieldCheck
                          }
                          label="Security"
                        />

                        <ProfileLink
                          href="/help"
                          icon={
                            CircleHelp
                          }
                          label="Help"
                        />

                      </div>


                      <div className="border-t border-slate-100 p-1.5 dark:border-white/10">

                        <button
                          type="button"
                          disabled={
                            loggingOut
                          }
                          onClick={() =>
                            void logout()
                          }
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          {loggingOut ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <LogOut className="h-4 w-4" />
                          )}

                          Sign out
                        </button>

                      </div>

                    </div>
                  )}

                </div>

              </div>

            </div>

          </header>


          {/* ==================================================
              CONTENT
              ================================================== */}

          <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">

            {logoutError && (
              <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {logoutError}

                <button
                  type="button"
                  onClick={() =>
                    setLogoutError(
                      null,
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}


            {/* HEADER */}

            <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

              <div>

                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {currentCompanyName}
                </p>

                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[30px]">
                  {greeting}, {displayName}
                </h1>

                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {roleLabel}
                  {' · '}
                  {dashboard.scope ===
                    'business'
                    ? 'Business overview'
                    : dashboard.scope ===
                        'team'
                      ? 'Team workspace'
                      : 'My workspace'}
                </p>

              </div>


              {capabilities.ai && (
                <Link
                  href="/ai"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-sm font-semibold text-white"
                >
                  <Sparkles className="h-4 w-4" />

                  Ask SaMi
                </Link>
              )}

            </section>


            {/* ==================================================
                SAMI BRIEF
                ================================================== */}

            <section className="mt-6 overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-600 to-cyan-600 text-white shadow-sm dark:border-blue-500/20">

              <div className="p-5 sm:p-6">

                <div className="flex items-start gap-4">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                    <Sparkles className="h-5 w-5" />
                  </div>


                  <div className="min-w-0 flex-1">

                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100">
                      SaMi Brief
                    </p>

                    <h2 className="mt-1 text-lg font-bold">
                      {dashboard.brief.title}
                    </h2>

                    <p className="mt-2 max-w-4xl text-sm leading-6 text-blue-50">
                      {dashboard.brief.message}
                    </p>


                    {dashboard.brief.actions.length >
                      0 && (
                      <div className="mt-4 flex flex-wrap gap-2">

                        {dashboard.brief.actions.map(
                          action => (
                            <Link
                              key={
                                action.id
                              }
                              href={
                                action.href
                              }
                              className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold transition hover:bg-white/25"
                            >
                              {action.label}
                            </Link>
                          ),
                        )}

                      </div>
                    )}

                  </div>

                </div>

              </div>

            </section>


            {/* ==================================================
                ATTENTION + PULSE
                ================================================== */}

            {(dashboard.attention.length >
                0 ||
              dashboard.metrics.length >
                0) && (
              <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_1fr]">

                {dashboard.attention.length >
                  0 && (
                  <DashboardCard
                    title="Needs your attention"
                    description="Prioritized exceptions and work requiring action"
                  >
                    <div className="divide-y divide-slate-100 dark:divide-white/10">

                      {dashboard.attention.map(
                        item => (
                          <AttentionRow
                            key={
                              item.id
                            }
                            item={
                              item
                            }
                          />
                        ),
                      )}

                    </div>
                  </DashboardCard>
                )}


                {dashboard.metrics.length >
                  0 && (
                  <DashboardCard
                    title={
                      dashboard.scope ===
                        'business'
                        ? 'Business pulse'
                        : dashboard.scope ===
                            'team'
                          ? 'Team pulse'
                          : 'My pulse'
                    }
                    description="Relevant indicators from your accessible apps"
                  >

                    <div className="grid gap-3 sm:grid-cols-2">

                      {dashboard.metrics.map(
                        metric => (
                          <MetricCard
                            key={
                              metric.id
                            }
                            metric={
                              metric
                            }
                          />
                        ),
                      )}

                    </div>

                  </DashboardCard>
                )}

              </div>
            )}


            {/* ==================================================
                WORK
                ================================================== */}

            {dashboard.work.length >
              0 && (
              <div className="mt-6">

                <DashboardCard
                  title={
                    dashboard.scope ===
                      'business'
                      ? 'Work overview'
                      : dashboard.scope ===
                          'team'
                        ? 'Team work'
                        : 'My work'
                  }
                  description="Work that is currently relevant to your responsibilities"
                >

                  <div className="divide-y divide-slate-100 dark:divide-white/10">

                    {dashboard.work.map(
                      item => (
                        <WorkRow
                          key={
                            item.id
                          }
                          item={
                            item
                          }
                        />
                      ),
                    )}

                  </div>

                </DashboardCard>

              </div>
            )}


            {/* ==================================================
                QUICK ACTIONS
                ================================================== */}

            {dashboard.actions.length >
              0 && (
              <section className="mt-6">

                <div className="mb-3">

                  <h2 className="text-sm font-semibold">
                    Quick actions
                  </h2>

                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Relevant actions from your current work
                  </p>

                </div>


                <div className="flex gap-2 overflow-x-auto pb-1">

                  {dashboard.actions.map(
                    action => (
                      <ActionCard
                        key={
                          action.id
                        }
                        action={
                          action
                        }
                      />
                    ),
                  )}

                </div>

              </section>
            )}


            {/* ==================================================
                RECENT
                ================================================== */}

            {dashboard.recent.length >
              0 && (
              <div className="mt-6">

                <DashboardCard
                  title="Recent work"
                  description="Recent activity relevant to your permitted work"
                >

                  <div className="divide-y divide-slate-100 dark:divide-white/10">

                    {dashboard.recent.map(
                      item => (
                        <RecentRow
                          key={
                            item.id
                          }
                          item={
                            item
                          }
                        />
                      ),
                    )}

                  </div>

                </DashboardCard>

              </div>
            )}


            {/* ==================================================
                AI CONTEXT
                ================================================== */}

            {capabilities.ai && (
              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.035]">

                <div className="flex items-start gap-4">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white">
                    <Bot className="h-5 w-5" />
                  </div>


                  <div className="min-w-0 flex-1">

                    <div className="flex flex-wrap items-center justify-between gap-3">

                      <div>

                        <h2 className="text-sm font-semibold">
                          SaMi AI
                        </h2>

                        <p className="mt-1 text-xs text-slate-400">
                          AI works only with information your account is allowed to access.
                        </p>

                      </div>


                      <Link
                        href="/ai"
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400"
                      >
                        Open SaMi AI
                      </Link>

                    </div>


                    {dashboard.aiContext.length >
                      0 && (
                      <div className="mt-4 grid gap-2 lg:grid-cols-2">

                        {dashboard.aiContext.map(
                          item => (
                            <div
                              key={
                                item.id
                              }
                              className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/5"
                            >
                              <p className="text-xs font-semibold">
                                {item.title}
                              </p>

                              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                {item.detail}
                              </p>
                            </div>
                          ),
                        )}

                      </div>
                    )}

                  </div>

                </div>

              </section>
            )}


            {/* ==================================================
                MY APPS
                ================================================== */}

            <section className="mt-7">

              <div className="mb-4 flex items-center justify-between">

                <div>

                  <h2 className="text-sm font-semibold">
                    My Apps
                  </h2>

                  <p className="mt-1 text-[11px] text-slate-400">
                    Applications available to your current access
                  </p>

                </div>


                {capabilities.appsManage && (
                  <Link
                    href="/settings?tab=apps"
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400"
                  >
                    Manage apps
                  </Link>
                )}

              </div>


              {modules.length >
                0 ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">

                  {modules.map(
                    module => (
                      <AppItem
                        key={
                          module.key
                        }
                        module={
                          module
                        }
                      />
                    ),
                  )}

                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center dark:border-white/10 dark:bg-white/[0.025]">

                  <AppWindow className="mx-auto h-7 w-7 text-slate-300" />

                  <p className="mt-3 text-sm font-semibold">
                    No applications assigned
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Your workspace administrator has not assigned application access to your role.
                  </p>

                </div>
              )}

            </section>


            {/* ==================================================
                MANAGEMENT
                ================================================== */}

            {managementActions.length >
              0 && (
              <section className="mt-7 border-t border-slate-200 pt-6 dark:border-white/10">

                <div className="mb-3 flex items-center justify-between">

                  <div>

                    <h2 className="text-sm font-semibold">
                      Workspace management
                    </h2>

                    <p className="mt-1 text-[11px] text-slate-400">
                      Administrative areas permitted for your account
                    </p>

                  </div>


                  {planName && (
                    <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {planName}
                    </span>
                  )}

                </div>


                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">

                  {managementActions.map(
                    item => {
                      const Icon =
                        item.icon;


                      return (
                        <Link
                          key={
                            item.id
                          }
                          href={
                            item.href
                          }
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.035]"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                            <Icon className="h-4 w-4" />
                          </div>

                          <div className="min-w-0">

                            <p className="truncate text-xs font-semibold">
                              {item.label}
                            </p>

                            <p className="truncate text-[10px] text-slate-400">
                              {item.description}
                            </p>

                          </div>
                        </Link>
                      );
                    },
                  )}

                </div>

              </section>
            )}


            <footer className="mt-8 flex items-center justify-between border-t border-slate-200 py-5 text-[11px] text-slate-400 dark:border-white/10">

              <span>
                {tenant?.name ||
                  'SaMi'}
              </span>

              <Link
                href="/help"
                className="hover:text-blue-600"
              >
                Help
              </Link>

            </footer>

          </div>

        </div>

      </div>
    </main>
  );
}


/* ================================================================
   CARD
   ================================================================ */

function DashboardCard({
  title,
  description,
  children,
}: {
  title:
    string;

  description:
    string;

  children:
    React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">

      <div className="border-b border-slate-100 px-4 py-3.5 dark:border-white/10 sm:px-5">

        <h2 className="text-sm font-semibold">
          {title}
        </h2>

        <p className="mt-0.5 text-[11px] text-slate-400">
          {description}
        </p>

      </div>

      {children}

    </section>
  );
}


/* ================================================================
   ATTENTION
   ================================================================ */

function AttentionRow({
  item,
}: {
  item:
    DashboardAttentionItem;
}) {
  const content =
    (
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">

        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
        </div>


        <div className="min-w-0 flex-1">

          <div className="flex items-start justify-between gap-3">

            <div className="min-w-0">

              <p className="truncate text-xs font-semibold">
                {item.title}
              </p>

              {item.description && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  {item.description}
                </p>
              )}

            </div>


            <span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-semibold ${priorityClasses(item.priority)}`}>
              {priorityLabel(
                item.priority,
              )}
            </span>

          </div>


          {item.dueAt && (
            <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
              <Clock3 className="h-3 w-3" />

              {formatDateTime(
                item.dueAt,
              )}
            </p>
          )}

        </div>

      </div>
    );


  return item.href ? (
    <Link
      href={
        item.href
      }
      className="block transition hover:bg-slate-50 dark:hover:bg-white/[0.03]"
    >
      {content}
    </Link>
  ) : content;
}


/* ================================================================
   METRIC
   ================================================================ */

function MetricCard({
  metric,
}: {
  metric:
    DashboardMetric;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">

      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {metric.label}
      </p>

      <p className={`mt-2 text-xl font-bold ${toneClasses(metric.tone)}`}>
        {metric.value}
      </p>

      {metric.description && (
        <p className="mt-1 text-[10px] leading-4 text-slate-400">
          {metric.description}
        </p>
      )}

    </div>
  );
}


/* ================================================================
   WORK
   ================================================================ */

function WorkRow({
  item,
}: {
  item:
    DashboardWorkItem;
}) {
  const content =
    (
      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300">
          <BriefcaseBusiness className="h-4 w-4" />
        </div>


        <div className="min-w-0 flex-1">

          <p className="truncate text-xs font-semibold">
            {item.title}
          </p>

          <p className="mt-1 truncate text-[10px] text-slate-400">
            {item.description ||
              item.status ||
              item.moduleKey}
          </p>

        </div>


        {item.dueAt && (
          <span className="hidden shrink-0 text-[10px] text-slate-400 sm:block">
            {formatDateTime(
              item.dueAt,
            )}
          </span>
        )}


        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />

      </div>
    );


  return item.href ? (
    <Link
      href={
        item.href
      }
      className="block hover:bg-slate-50 dark:hover:bg-white/[0.03]"
    >
      {content}
    </Link>
  ) : content;
}


/* ================================================================
   RECENT
   ================================================================ */

function RecentRow({
  item,
}: {
  item:
    DashboardRecentItem;
}) {
  const content =
    (
      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
          <FileText className="h-4 w-4" />
        </div>


        <div className="min-w-0 flex-1">

          <p className="truncate text-xs font-semibold">
            {item.title}
          </p>

          <p className="mt-1 truncate text-[10px] text-slate-400">
            {item.description ||
              item.moduleKey}
          </p>

        </div>


        <span className="hidden text-[10px] text-slate-400 sm:block">
          {formatDateTime(
            item.occurredAt,
          )}
        </span>

      </div>
    );


  return item.href ? (
    <Link
      href={
        item.href
      }
      className="block hover:bg-slate-50 dark:hover:bg-white/[0.03]"
    >
      {content}
    </Link>
  ) : content;
}


/* ================================================================
   ACTION
   ================================================================ */

function ActionCard({
  action,
}: {
  action:
    DashboardAction;
}) {
  return (
    <Link
      href={
        action.href
      }
      className="min-w-[180px] shrink-0 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.035]"
    >

      <div className="flex items-center gap-2">

        <CheckCircle2 className="h-4 w-4 text-blue-600" />

        <p className="truncate text-xs font-semibold">
          {action.label}
        </p>

      </div>


      {action.description && (
        <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-slate-400">
          {action.description}
        </p>
      )}

    </Link>
  );
}


/* ================================================================
   APP
   ================================================================ */

function AppItem({
  module,
}: {
  module:
    ModuleData;
}) {
  return (
    <Link
      href={
        getModuleHref(
          module,
        )
      }
      className="group flex min-w-0 flex-col items-center rounded-xl p-2 text-center transition hover:bg-white dark:hover:bg-white/5"
    >

      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md">
        <AppWindow className="h-5 w-5" />
      </div>

      <span className="mt-2 line-clamp-2 text-[11px] font-medium">
        {module.name}
      </span>

    </Link>
  );
}


/* ================================================================
   PROFILE
   ================================================================ */

function ProfileLink({
  href,
  icon:
    Icon,
  label,
}: {
  href:
    string;

  icon:
    LucideIcon;

  label:
    string;
}) {
  return (
    <Link
      href={
        href
      }
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-950/30"
    >
      <Icon className="h-4 w-4 text-slate-400" />

      {label}
    </Link>
  );
}