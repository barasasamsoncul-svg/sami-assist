'use client';

import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  AppWindow,
  BarChart3,
  Bell,
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Car,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  Factory,
  FileText,
  Folder,
  Headphones,
  Home,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  Package,
  PenTool,
  Receipt,
  Repeat,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Sun,
  User,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
  UserSearch,
  Utensils,
  Workflow,
  Wrench,
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


/* ============================================================
   TYPES
   ============================================================ */

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

  usersView:
    boolean;

  usersManage:
    boolean;

  rolesView:
    boolean;

  rolesManage:
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

  workspaceManage:
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


type WorkspaceAction = {
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
};


/* ============================================================
   CONSTANTS
   ============================================================ */

const THEME_STORAGE_KEY =
  'sami_theme';


const DISABLED_MODULE_STATUSES =
  new Set([
    'disabled',
    'failed',
    'uninstalled',
    'removed',
    'inactive',
  ]);


const APP_METADATA =
  new Map(
    SAMI_APPS.map(
      app => [
        app.key,
        app,
      ],
    ),
  );


const ICONS:
  Record<string, LucideIcon> = {
  calculator:
    Calculator,

  receipt:
    Receipt,

  'file-text':
    FileText,

  'bar-chart':
    BarChart3,

  folder:
    Folder,

  'pen-tool':
    PenTool,

  users:
    Users,

  'shopping-cart':
    ShoppingCart,

  repeat:
    Repeat,

  home:
    Home,

  store:
    Store,

  utensils:
    Utensils,

  package:
    Package,

  factory:
    Factory,

  boxes:
    Boxes,

  'shopping-bag':
    ShoppingBag,

  wrench:
    Wrench,

  'shield-check':
    ShieldCheck,

  'user-round':
    UserRound,

  car:
    Car,

  'user-plus':
    UserPlus,

  'clipboard-check':
    ClipboardCheck,

  'calendar-off':
    CalendarOff,

  'user-search':
    UserSearch,

  megaphone:
    Megaphone,

  mail:
    Mail,

  'message-square':
    MessageSquare,

  'calendar-days':
    CalendarDays,

  workflow:
    Workflow,

  'clipboard-list':
    ClipboardList,

  briefcase:
    Briefcase,

  clock:
    Clock,

  'map-pin':
    MapPin,

  headphones:
    Headphones,

  'calendar-clock':
    CalendarClock,

  calendar:
    Calendar,
};


const APP_TONES = [
  {
    tile:
      'bg-blue-600',

    ring:
      'group-hover:ring-blue-200 dark:group-hover:ring-blue-900',
  },

  {
    tile:
      'bg-cyan-600',

    ring:
      'group-hover:ring-cyan-200 dark:group-hover:ring-cyan-900',
  },

  {
    tile:
      'bg-emerald-600',

    ring:
      'group-hover:ring-emerald-200 dark:group-hover:ring-emerald-900',
  },

  {
    tile:
      'bg-orange-500',

    ring:
      'group-hover:ring-orange-200 dark:group-hover:ring-orange-900',
  },

  {
    tile:
      'bg-rose-500',

    ring:
      'group-hover:ring-rose-200 dark:group-hover:ring-rose-900',
  },

  {
    tile:
      'bg-indigo-600',

    ring:
      'group-hover:ring-indigo-200 dark:group-hover:ring-indigo-900',
  },

  {
    tile:
      'bg-teal-600',

    ring:
      'group-hover:ring-teal-200 dark:group-hover:ring-teal-900',
  },

  {
    tile:
      'bg-sky-600',

    ring:
      'group-hover:ring-sky-200 dark:group-hover:ring-sky-900',
  },
];


/* ============================================================
   HELPERS
   ============================================================ */

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


  if (
    typeof document !==
    'undefined'
  ) {
    document
      .documentElement
      .classList
      .toggle(
        'dark',
        dark,
      );
  }


  try {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      theme,
    );
  } catch {
    // Local theme cache is optional.
  }


  return dark;
}


function normalizeKey(
  value:
    string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      '-',
    );
}


function getAppMetadata(
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
  const supplied =
    module.href
      ?.trim();


  if (
    supplied
  ) {
    return supplied;
  }


  const metadata =
    getAppMetadata(
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


function getModuleIcon(
  module:
    ModuleData,
): LucideIcon {
  const metadata =
    getAppMetadata(
      module,
    );


  if (
    metadata?.icon &&
    ICONS[
      metadata.icon
    ]
  ) {
    return ICONS[
      metadata.icon
    ];
  }


  return AppWindow;
}


function getModuleDescription(
  module:
    ModuleData,
) {
  return (
    module.description ||
    getAppMetadata(
      module,
    )?.description ||
    `Open ${module.name}.`
  );
}


function appToneIndex(
  value:
    string,
) {
  let total =
    0;


  for (
    const character
    of value
  ) {
    total +=
      character
        .charCodeAt(
          0,
        );
  }


  return (
    total %
    APP_TONES.length
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


  if (
    user.fullName
      ?.trim()
  ) {
    return user.fullName
      .trim()
      .split(
        /\s+/,
      )
      .slice(
        0,
        2,
      )
      .map(
        part =>
          part.charAt(
            0,
          ),
      )
      .join(
        '',
      )
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


function humanize(
  value:
    string | null | undefined,
) {
  if (
    !value
  ) {
    return '';
  }


  return value
    .replace(
      /[_-]+/g,
      ' ',
    )
    .replace(
      /\b\w/g,
      character =>
        character
          .toUpperCase(),
    );
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
  company,
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


  const installedApps =
    useMemo(
      () =>
        modules.filter(
          module =>
            !DISABLED_MODULE_STATUSES
              .has(
                String(
                  module.status ||
                  '',
                )
                  .trim()
                  .toLowerCase(),
              ),
        ),

      [
        modules,
      ],
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
    humanize(
      membership
        ?.accessLevel,
    ) ||
    'Member';


  const planName =
    subscription
      ?.planName ||
    subscription
      ?.planKey ||
    'Free';


  const currentCompanyName =
    company
      ?.currentCompany
      .name ||
    tenant
      ?.name ||
    'Workspace';


  const managementActions =
    useMemo<
      WorkspaceAction[]
    >(
      () => {
        const actions:
          WorkspaceAction[] =
          [];


        if (
          capabilities
            .workspaceManage ||
          capabilities
            .companiesView
        ) {
          actions.push({
            id:
              'workspace',

            label:
              'Workspace',

            description:
              'Company and workspace settings',

            href:
              '/settings?tab=workspace',

            icon:
              Building2,
          });
        }


        if (
          capabilities
            .usersView
        ) {
          actions.push({
            id:
              'users',

            label:
              'Users',

            description:
              capabilities
                .usersManage
                ? 'Manage members and access'
                : 'View workspace members',

            href:
              '/settings/users',

            icon:
              UsersRound,
          });
        }


        if (
          capabilities
            .rolesView
        ) {
          actions.push({
            id:
              'roles',

            label:
              'Roles',

            description:
              capabilities
                .rolesManage
                ? 'Manage roles and permissions'
                : 'View access roles',

            href:
              '/settings/roles',

            icon:
              Shield,
          });
        }


        if (
          capabilities
            .appsView ||
          capabilities
            .appsManage
        ) {
          actions.push({
            id:
              'apps',

            label:
              'Apps',

            description:
              capabilities
                .appsManage
                ? 'Install and manage apps'
                : 'View workspace apps',

            href:
              '/settings?tab=apps',

            icon:
              LayoutGrid,
          });
        }


        if (
          capabilities
            .billingView
        ) {
          actions.push({
            id:
              'billing',

            label:
              'Billing',

            description:
              capabilities
                .billingManage
                ? 'Plan and subscription'
                : 'View subscription',

            href:
              '/settings?tab=billing',

            icon:
              CreditCard,
          });
        }


        return actions;
      },

      [
        capabilities,
      ],
    );


  const quickAccess =
    useMemo<
      WorkspaceAction[]
    >(
      () => {
        const actions:
          WorkspaceAction[] =
          [];


        if (
          capabilities.ai
        ) {
          actions.push({
            id:
              'ai',

            label:
              'SaMi AI',

            description:
              'Ask, analyze and work',

            href:
              '/ai',

            icon:
              Sparkles,
          });
        }


        if (
          capabilities.files
        ) {
          actions.push({
            id:
              'files',

            label:
              'Files',

            description:
              'Workspace documents',

            href:
              '/files',

            icon:
              Folder,
          });
        }


        actions.push({
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
        });


        actions.push({
          id:
            'security',

          label:
            'Security',

          description:
            'Account protection',

          href:
            '/settings?tab=security',

          icon:
            ShieldCheck,
        });


        return actions;
      },

      [
        capabilities.ai,
        capabilities.files,
      ],
    );


  const searchItems =
    useMemo<
      SearchItem[]
    >(
      () => {
        const items:
          SearchItem[] =
          installedApps.map(
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
                getModuleIcon(
                  module,
                ),

              keywords:
                `${module.key} ${module.name} application app module`,
            }),
          );


        for (
          const action
          of quickAccess
        ) {
          items.push({
            ...action,

            keywords:
              `${action.label} ${action.description}`,
          });
        }


        for (
          const action
          of managementActions
        ) {
          items.push({
            ...action,

            keywords:
              `${action.label} ${action.description} workspace management`,
          });
        }


        items.push({
          id:
            'settings',

          label:
            'Settings',

          description:
            'Workspace and account settings',

          href:
            '/settings',

          icon:
            Settings,

          keywords:
            'settings workspace account configuration',
        });


        items.push({
          id:
            'help',

          label:
            'Help',

          description:
            'Help and support',

          href:
            '/help',

          icon:
            CircleHelp,

          keywords:
            'help support assistance',
        });


        return items;
      },

      [
        installedApps,
        managementActions,
        quickAccess,
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
          return searchItems
            .slice(
              0,
              7,
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


  /* ==========================================================
     THEME
     ========================================================== */

  useEffect(
    () => {
      let active =
        true;


      try {
        const saved =
          localStorage.getItem(
            THEME_STORAGE_KEY,
          );


        const localTheme:
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
            localTheme,
          ),
        );
      } catch {
        setDarkMode(
          getSystemPrefersDark(),
        );
      }


      void (
        async () => {
          try {
            const response =
              await fetch(
                '/api/account/preferences',
                {
                  method:
                    'GET',

                  credentials:
                    'same-origin',

                  cache:
                    'no-store',

                  headers: {
                    Accept:
                      'application/json',
                  },
                },
              );


            const data =
              await response.json();


            const theme =
              data
                ?.preferences
                ?.theme;


            if (
              !active ||
              (
                theme !==
                  'light' &&
                theme !==
                  'dark' &&
                theme !==
                  'system'
              )
            ) {
              return;
            }


            setDarkMode(
              applyTheme(
                theme,
              ),
            );
          } catch {
            // Keep local theme.
          }
        }
      )();


      return () => {
        active =
          false;
      };
    },

    [],
  );


  async function toggleTheme() {
    if (
      themeSaving
    ) {
      return;
    }


    const nextTheme:
      UserTheme =
      darkMode
        ? 'light'
        : 'dark';


    const previous =
      darkMode;


    setThemeSaving(
      true,
    );


    setDarkMode(
      applyTheme(
        nextTheme,
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

            cache:
              'no-store',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            body:
              JSON.stringify({
                theme:
                  nextTheme,
              }),
          },
        );


      if (
        !response.ok
      ) {
        throw new Error(
          'Theme could not be saved.',
        );
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


  /* ==========================================================
     PROFILE / KEYBOARD
     ========================================================== */

  useEffect(
    () => {
      function outside(
        event:
          PointerEvent,
      ) {
        if (
          profileRef.current &&
          !profileRef.current
            .contains(
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
          target
            ?.isContentEditable;


        if (
          event.key ===
            '/' &&
          !typing
        ) {
          event.preventDefault();

          searchRef
            .current
            ?.focus();

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


  /* ==========================================================
     LOGOUT
     ========================================================== */

  async function logout() {
    if (
      loggingOut
    ) {
      return;
    }


    setLogoutError(
      null,
    );


    setLoggingOut(
      true,
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

            headers: {
              Accept:
                'application/json',
            },
          },
        );


      if (
        !response.ok
      ) {
        throw new Error(
          'Logout failed.',
        );
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


  function openSearchItem(
    href:
      string,
  ) {
    setSearchOpen(
      false,
    );

    setSearchQuery(
      '',
    );

    router.push(
      href,
    );
  }


  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <main className="min-h-screen bg-[#F6F7F9] text-slate-950 transition-colors dark:bg-[#090B10] dark:text-white">
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

          {/* TOP BAR */}

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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>


              <div className="hidden min-w-0 xl:block">
                <p className="max-w-[180px] truncate text-sm font-semibold">
                  {tenant?.name ||
                    'SaMi Workspace'}
                </p>

                <p className="max-w-[180px] truncate text-[11px] text-slate-400">
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

                  aria-label="Search SaMi"

                  placeholder="Search apps, settings and workspace"

                  onFocus={() =>
                    setSearchOpen(
                      true,
                    )
                  }

                  onChange={
                    event => {
                      setSearchQuery(
                        event
                          .target
                          .value,
                      );

                      setSearchOpen(
                        true,
                      );
                    }
                  }

                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/[0.07] dark:focus:border-blue-500/60 dark:focus:bg-white/[0.07]"
                />

                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 sm:block dark:border-white/10 dark:bg-white/5">
                  /
                </kbd>


                {searchOpen && (
                  <div className="absolute left-0 right-0 top-[46px] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[#15181F]">

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

                                onClick={() =>
                                  openSearchItem(
                                    item.href,
                                  )
                                }

                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-blue-50/60 dark:hover:bg-blue-500/10"
                              >
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
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
                          No matching apps or settings.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>


              {/* CONTROLS */}

              <div className="ml-auto flex shrink-0 items-center gap-1">

                {capabilities.notifications && (
                  <Link
                    href="/notifications"
                    aria-label="Notifications"
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                  >
                    <Bell className="h-[18px] w-[18px]" />

                    {unreadNotifications >
                      0 && (
                      <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white">
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
                  onClick={() =>
                    void toggleTheme()
                  }
                  disabled={
                    themeSaving
                  }
                  aria-label="Change theme"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-slate-400 dark:hover:bg-white/10"
                >
                  {themeSaving ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : darkMode ? (
                    <Sun className="h-[18px] w-[18px]" />
                  ) : (
                    <Moon className="h-[18px] w-[18px]" />
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
                    aria-label="Account menu"
                    onClick={() =>
                      setProfileOpen(
                        current =>
                          !current,
                      )
                    }
                    className="flex h-9 items-center gap-1.5 rounded-lg pl-1 pr-1.5 transition hover:bg-slate-100 dark:hover:bg-white/10"
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

                    <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
                  </button>


                  {profileOpen && (
                    <div className="absolute right-0 top-[44px] z-50 w-[270px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#15181F]">

                      <div className="border-b border-slate-100 px-4 py-3.5 dark:border-white/10">
                        <p className="truncate text-sm font-semibold">
                          {displayName}
                        </p>

                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {user.email}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                            {roleLabel}
                          </span>

                          {(membership?.isOwner ||
                            capabilities.billingView) && (
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
                          onClick={() =>
                            setProfileOpen(
                              false,
                            )
                          }
                        />

                        <ProfileLink
                          href="/settings?tab=security"
                          icon={
                            ShieldCheck
                          }
                          label="Security"
                          onClick={() =>
                            setProfileOpen(
                              false,
                            )
                          }
                        />

                        <ProfileLink
                          href="/help"
                          icon={
                            CircleHelp
                          }
                          label="Help"
                          onClick={() =>
                            setProfileOpen(
                              false,
                            )
                          }
                        />
                      </div>


                      <div className="border-t border-slate-100 p-1.5 dark:border-white/10">
                        <button
                          type="button"
                          disabled={
                            loggingOut
                          }
                          onClick={
                            logout
                          }
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          {loggingOut ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <LogOut className="h-4 w-4" />
                          )}

                          {loggingOut
                            ? 'Signing out…'
                            : 'Sign out'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>


          {searchOpen && (
            <button
              type="button"
              aria-label="Close search"
              onClick={() =>
                setSearchOpen(
                  false,
                )
              }
              className="fixed inset-0 z-20 cursor-default"
            />
          )}


          {/* CONTENT */}

          <div className="relative z-10 mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">

            {logoutError && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                <span>
                  {logoutError}
                </span>

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


            {/* WORKSPACE HEADER */}

            <section className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-white/10 sm:flex-row sm:items-end sm:justify-between">

              <div className="min-w-0">
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  {currentCompanyName}
                </p>

                <h1 className="mt-1 text-2xl font-bold tracking-[-0.03em] sm:text-[28px]">
                  {greeting},{' '}
                  {displayName}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {roleLabel}
                  </span>

                  {company &&
                    company.allowedCompanyCount >
                      1 && (
                    <>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />

                      <span>
                        {
                          company.selectedCompanyCount
                        }{' '}
                        of{' '}
                        {
                          company.allowedCompanyCount
                        }{' '}
                        companies selected
                      </span>
                    </>
                  )}
                </div>
              </div>


              {capabilities.ai && (
                <Link
                  href="/ai"
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-cyan-600"
                >
                  <Sparkles className="h-4 w-4" />

                  Ask SaMi
                </Link>
              )}
            </section>


            {/* APP LAUNCHER */}

            <section className="mt-6">

              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">
                    Apps
                  </h2>

                  <p className="mt-0.5 text-xs text-slate-400">
                    Your workspace applications
                  </p>
                </div>

                {capabilities.appsManage && (
                  <Link
                    href="/settings?tab=apps"
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
                  >
                    Manage apps
                  </Link>
                )}
              </div>


              {installedApps.length >
              0 ? (
                <div className="grid grid-flow-col grid-rows-2 auto-cols-[76px] gap-x-4 gap-y-4 overflow-x-auto pb-2 sm:grid-flow-row sm:grid-rows-none sm:grid-cols-4 sm:auto-cols-auto sm:overflow-visible md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
                  {installedApps.map(
                    module => (
                      <AppLauncherItem
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
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-7 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <AppWindow className="mx-auto h-6 w-6 text-slate-300" />

                  <p className="mt-2 text-sm font-semibold">
                    No business apps available
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    {capabilities.appsManage
                      ? 'Install apps needed by this workspace.'
                      : 'No applications are currently available to this workspace.'}
                  </p>

                  {capabilities.appsManage && (
                    <Link
                      href="/settings?tab=apps"
                      className="mt-4 inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700"
                    >
                      Manage apps
                    </Link>
                  )}
                </div>
              )}
            </section>


            {/* QUICK ACCESS */}

            <section className="mt-7">
              <h2 className="mb-3 text-sm font-semibold">
                Quick access
              </h2>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {quickAccess.map(
                  item => (
                    <CompactAction
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
            </section>


            {/* MANAGEMENT */}

            {managementActions.length >
              0 && (
              <section className="mt-7 rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">

                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10 sm:px-5">
                  <div>
                    <h2 className="text-sm font-semibold">
                      Workspace management
                    </h2>

                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Controls available to your current access
                    </p>
                  </div>

                  {(membership?.isOwner ||
                    capabilities.billingView) && (
                    <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                      {planName}
                    </span>
                  )}
                </div>


                <div className="flex gap-1 overflow-x-auto p-2 sm:grid sm:grid-cols-2 sm:gap-0 sm:p-2 lg:grid-cols-4">
                  {managementActions.map(
                    item => (
                      <ManagementAction
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
              </section>
            )}


            <div className="mt-7 flex items-center justify-between border-t border-slate-200 pt-4 text-[11px] text-slate-400 dark:border-white/10">
              <span>
                {tenant?.name ||
                  'SaMi'}
              </span>

              <Link
                href="/help"
                className="hover:text-blue-600 dark:hover:text-blue-400"
              >
                Help
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}


/* ============================================================
   APP LAUNCHER ITEM
   ============================================================ */

function AppLauncherItem({
  module,
}: {
  module:
    ModuleData;
}) {
  const Icon =
    getModuleIcon(
      module,
    );


  const tone =
    APP_TONES[
      appToneIndex(
        module.key,
      )
    ];


  return (
    <Link
      href={
        getModuleHref(
          module,
        )
      }
      title={
        getModuleDescription(
          module,
        )
      }
      className="group flex min-w-0 flex-col items-center text-center"
    >
      <div
        className={[
          'flex h-12 w-12 items-center justify-center rounded-[13px] text-white shadow-sm ring-4 ring-transparent transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md sm:h-14 sm:w-14 sm:rounded-2xl',
          tone.tile,
          tone.ring,
        ].join(
          ' ',
        )}
      >
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>

      <span className="mt-2 line-clamp-2 w-full text-[11px] font-medium leading-4 text-slate-700 dark:text-slate-300 sm:text-xs">
        {module.name}
      </span>
    </Link>
  );
}


/* ============================================================
   COMPACT ACTION
   ============================================================ */

function CompactAction({
  item,
}: {
  item:
    WorkspaceAction;
}) {
  const Icon =
    item.icon;


  const isAi =
    item.id ===
    'ai';


  return (
    <Link
      href={
        item.href
      }
      className="flex min-w-[155px] shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 transition hover:border-blue-200 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-blue-500/30 dark:hover:bg-white/[0.06]"
    >
      <div
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          isAi
            ? 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white'
            : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
        ].join(
          ' ',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0">
        <p className="truncate text-xs font-semibold">
          {item.label}
        </p>

        <p className="mt-0.5 truncate text-[10px] text-slate-400">
          {item.description}
        </p>
      </div>
    </Link>
  );
}


/* ============================================================
   MANAGEMENT ACTION
   ============================================================ */

function ManagementAction({
  item,
}: {
  item:
    WorkspaceAction;
}) {
  const Icon =
    item.icon;


  return (
    <Link
      href={
        item.href
      }
      className="group flex min-w-[190px] items-center gap-3 rounded-lg px-3 py-3 transition hover:bg-blue-50/60 dark:hover:bg-blue-500/[0.07] sm:min-w-0"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">
          {item.label}
        </p>

        <p className="mt-0.5 truncate text-[10px] text-slate-400">
          {item.description}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
    </Link>
  );
}


/* ============================================================
   PROFILE LINK
   ============================================================ */

function ProfileLink({
  href,
  icon:
    Icon,
  label,
  onClick,
}: {
  href:
    string;

  icon:
    LucideIcon;

  label:
    string;

  onClick:
    () => void;
}) {
  return (
    <Link
      href={
        href
      }
      onClick={
        onClick
      }
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-blue-50/60 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
    >
      <Icon className="h-4 w-4 text-slate-400" />

      {label}
    </Link>
  );
}