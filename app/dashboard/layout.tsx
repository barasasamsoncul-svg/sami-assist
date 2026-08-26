'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  useRouter,
  usePathname,
  useSearchParams,
} from 'next/navigation';
import Link from 'next/link';
import NotificationBell from './components/NotificationBell';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Settings,
  Sparkles,
  Calculator,
  Receipt,
  FileText,
  BarChart3,
  Folder,
  PenTool,
  Users,
  ShoppingCart,
  Repeat,
  Home,
  Store,
  Utensils,
  Package,
  Factory,
  Boxes,
  ShoppingBag,
  Wrench,
  ShieldCheck,
  UserRound,
  Car,
  UserPlus,
  ClipboardCheck,
  CalendarOff,
  UserSearch,
  Megaphone,
  Mail,
  MessageSquare,
  CalendarDays,
  Workflow,
  ClipboardList,
  Briefcase,
  Clock,
  MapPin,
  Headphones,
  CalendarClock,
  Calendar,
  Sun,
  Moon,
  Bell,
  Search,
  ChevronRight,
  Building2,
  CreditCard,
  Key,
  History,
  AppWindow,
  User,
  Shield,
  Monitor,
  Globe,
  AlertTriangle,
  Plus,
  Check,
  ExternalLink,
} from 'lucide-react';

/* =========================================================
   APP ICONS
========================================================= */

const APP_ICONS: Record<string, any> = {
  accounting: Calculator,
  invoicing: Receipt,
  expenses: FileText,
  spreadsheet: BarChart3,
  documents: Folder,
  sign: PenTool,
  crm: Users,
  sales: ShoppingCart,
  subscriptions: Repeat,
  rentals: Home,
  pos_shop: Store,
  pos_restaurant: Utensils,
  inventory: Package,
  manufacturing: Factory,
  plm: Boxes,
  purchase: ShoppingBag,
  maintenance: Wrench,
  quality: ShieldCheck,
  employees: UserRound,
  fleet: Car,
  referrals: UserPlus,
  appraisals: ClipboardCheck,
  time_off: CalendarOff,
  recruitment: UserSearch,
  social_marketing: Megaphone,
  email_marketing: Mail,
  sms_marketing: MessageSquare,
  events: CalendarDays,
  marketing_automation: Workflow,
  surveys: ClipboardList,
  projects: Briefcase,
  timesheets: Clock,
  field_services: MapPin,
  helpdesk: Headphones,
  planning: CalendarClock,
  appointments: Calendar,
};

/* =========================================================
   SETTINGS
   Kept compatible with your current ?tab= routes.
========================================================= */

const SETTINGS_ITEMS = [
  {
    key: 'profile',
    name: 'Profile',
    description: 'Personal information and account details',
    route: '/dashboard/settings?tab=profile',
    icon: User,
    group: 'Account',
  },
  {
    key: 'preferences',
    name: 'Preferences',
    description: 'Personalize how SaMi works for you',
    route: '/dashboard/settings?tab=preferences',
    icon: Globe,
    group: 'Account',
  },
  {
    key: 'security',
    name: 'Password & Security',
    description: 'Password, two-factor authentication and security',
    route: '/dashboard/settings?tab=security',
    icon: Shield,
    group: 'Security',
  },
  {
    key: 'sessions',
    name: 'Devices & Sessions',
    description: 'Manage devices currently signed into your account',
    route: '/dashboard/settings?tab=sessions',
    icon: Monitor,
    group: 'Security',
  },
  {
    key: 'audit-logs',
    name: 'Activity Log',
    description: 'Review important account and workspace activity',
    route: '/dashboard/settings?tab=audit-logs',
    icon: History,
    group: 'Security',
  },
  {
    key: 'business',
    name: 'Business',
    description: 'Business profile, contact and regional information',
    route: '/dashboard/settings?tab=business',
    icon: Building2,
    group: 'Workspace',
  },
  {
    key: 'team',
    name: 'Team & Permissions',
    description: 'Members, roles and access permissions',
    route: '/dashboard/settings?tab=team',
    icon: Users,
    group: 'Workspace',
  },
  {
    key: 'apps',
    name: 'Apps',
    description: 'Manage your SaMi business applications',
    route: '/dashboard/settings?tab=apps',
    icon: AppWindow,
    group: 'Workspace',
  },
  {
    key: 'ai',
    name: 'AI Usage',
    description: 'Monitor your SaMi AI usage and limits',
    route: '/dashboard/settings?tab=ai',
    icon: Sparkles,
    group: 'AI',
  },
  {
    key: 'api-keys',
    name: 'API Keys',
    description: 'Create and manage developer API access',
    route: '/dashboard/settings?tab=api-keys',
    icon: Key,
    group: 'Developer',
  },
  {
    key: 'subscription',
    name: 'Billing & Subscription',
    description: 'Plan, billing cycle and subscription management',
    route: '/dashboard/settings/subscription',
    icon: CreditCard,
    group: 'Billing',
  },
  {
    key: 'danger',
    name: 'Danger Zone',
    description: 'Account and workspace destructive actions',
    route: '/dashboard/settings?tab=danger',
    icon: AlertTriangle,
    group: 'Danger Zone',
  },
];

/* =========================================================
   TYPES
========================================================= */

interface DashboardData {
  user: {
    id: string;
    email: string;
    fullName: string;
  };

  businesses: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;

  activeBusiness: {
    id: string;
    name: string;
    slug: string;
    role: string;
  };

  installedApps: Array<{
    key: string;
    name: string;
    route: string;
    description: string;
  }>;

  databaseReady: boolean;
}

/* =========================================================
   LOGO
========================================================= */

function SaMiLogo({
  size = 'md',
}: {
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <span
      className={`${sizes[size]} font-black italic tracking-[-0.08em] select-none`}
    >
      <span className="text-blue-700 dark:text-blue-500">
        Sa
      </span>

      <span className="text-gray-900 dark:text-white">
        Mi
      </span>
    </span>
  );
}

/* =========================================================
   AVATAR
========================================================= */

function UserAvatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-11 w-11 text-sm',
  };

  const initials =
    name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase() || 'S';

  return (
    <div
      className={`
        ${sizes[size]}
        shrink-0
        rounded-xl
        bg-gradient-to-br
        from-blue-600
        via-indigo-600
        to-violet-600
        flex
        items-center
        justify-center
        text-white
        font-bold
        shadow-sm
      `}
    >
      {initials}
    </div>
  );
}

/* =========================================================
   NAV ITEM
========================================================= */

function NavigationItem({
  name,
  route,
  icon: Icon,
  active,
  onClick,
}: {
  name: string;
  route: string;
  icon: any;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={route}
      onClick={onClick}
      className={`
        group
        flex
        items-center
        gap-3
        w-full
        px-2.5
        py-2
        rounded-xl
        text-sm
        font-medium
        transition-all
        duration-150
        ${
          active
            ? `
              bg-blue-50
              text-blue-700
              dark:bg-blue-500/10
              dark:text-blue-400
            `
            : `
              text-gray-600
              dark:text-gray-400
              hover:bg-gray-100
              dark:hover:bg-gray-800/70
              hover:text-gray-900
              dark:hover:text-gray-100
            `
        }
      `}
    >
      <span
        className={`
          flex
          items-center
          justify-center
          h-8
          w-8
          rounded-lg
          transition-all
          ${
            active
              ? `
                bg-blue-600
                text-white
                shadow-sm
              `
              : `
                bg-gray-100
                dark:bg-gray-800
                text-gray-500
                dark:text-gray-400
                group-hover:bg-white
                dark:group-hover:bg-gray-700
              `
          }
        `}
      >
        <Icon size={16} strokeWidth={active ? 2.2 : 1.9} />
      </span>

      <span className="flex-1 truncate">
        {name}
      </span>

      {active && (
        <ChevronRight
          size={14}
          className="text-blue-500 dark:text-blue-400"
        />
      )}
    </Link>
  );
}

/* =========================================================
   SETTINGS GROUP
========================================================= */

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-600">
        {title}
      </p>

      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  );
}
/* =========================================================
   MAIN LAYOUT
========================================================= */

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [businessMenuOpen, setBusinessMenuOpen] =
    useState(false);

  const [accountMenuOpen, setAccountMenuOpen] =
    useState(false);

  const [darkMode, setDarkMode] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const [settingsOpen, setSettingsOpen] = useState(false);

  /* =======================================================
     THEME
  ======================================================= */

  useEffect(() => {
    const savedTheme =
      localStorage.getItem('sami_theme');

    const prefersDark =
      window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches;

    const shouldUseDark =
      savedTheme === 'dark' ||
      (!savedTheme && prefersDark);

    setDarkMode(shouldUseDark);

    if (shouldUseDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    fetchDashboardData();
  }, []);

  /* =======================================================
     CLOSE MENUS WHEN ROUTE CHANGES
  ======================================================= */
  /* =======================================================
     KEYBOARD SEARCH
  ======================================================= */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isShortcut =
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k';

      if (isShortcut) {
        event.preventDefault();

        const searchInput =
          document.getElementById(
            'sami-global-search'
          ) as HTMLInputElement | null;

        searchInput?.focus();
      }

      if (event.key === 'Escape') {
        setSearchQuery('');
        setBusinessMenuOpen(false);
        setAccountMenuOpen(false);
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, []);

  useEffect(() => {
  setSidebarOpen(false);
  setBusinessMenuOpen(false);
  setAccountMenuOpen(false);
  setSettingsOpen(false);
  // Auto-expand settings if on settings page
  if (pathname.startsWith('/dashboard/settings')) {
    setSettingsOpen(true);
  } else {
    setSettingsOpen(false);
  }
}, [pathname, searchParams]);

  /* =======================================================
     FETCH DASHBOARD
  ======================================================= */

  const fetchDashboardData = async () => {
    try {
      const response =
        await fetch('/api/dashboard');

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            'Failed to load dashboard'
        );
      }

      setData(result);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Something went wrong';

      setError(message);

      if (
        err instanceof Error &&
        err.message.includes(
          'Not authenticated'
        )
      ) {
        router.push('/auth/login');
      }
    } finally {
      setLoading(false);
    }
  };

  /* =======================================================
     LOGOUT
  ======================================================= */

  const handleLogout = () => {
    setAccountMenuOpen(false);
    router.push('/auth/logout');
  };

  /* =======================================================
     SWITCH BUSINESS
  ======================================================= */

  const switchBusiness = async (
    businessId: string
  ) => {
    try {
      const response = await fetch(
        '/api/auth/switch-business',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            businessId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          'Business switch failed'
        );
      }

      window.location.reload();
    } catch (error) {
      console.error(
        'Business switch failed:',
        error
      );
    }
  };

  /* =======================================================
     NAVIGATION
  ======================================================= */

  const coreNavItems = [
    {
      key: 'dashboard',
      name: 'Dashboard',
      route: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      key: 'ai',
      name: 'SaMi AI',
      route: '/dashboard/ai',
      icon: Sparkles,
    },
  ];

  const appNavItems = useMemo(() => {
    if (!data) return [];

    return data.installedApps.map((app) => ({
      key: app.key,
      name: app.name,
      route: `/dashboard/${app.route}`,
      icon:
        APP_ICONS[app.key] || Boxes,
    }));
  }, [data]);

  const filteredAppItems = searchQuery.trim()
    ? appNavItems.filter((item) =>
        item.name
          .toLowerCase()
          .includes(
            searchQuery.toLowerCase()
          )
      )
    : appNavItems;

  /* =======================================================
     ACTIVE SETTINGS TAB
  ======================================================= */

  const activeSettingsTab =
    searchParams.get('tab');

  const isSettingsPage =
    pathname.startsWith(
      '/dashboard/settings'
    );

  /* =======================================================
     PAGE TITLE
  ======================================================= */

  const getCurrentTitle = () => {
    if (pathname === '/dashboard') {
      return 'Dashboard';
    }

    if (pathname === '/dashboard/ai') {
      return 'SaMi AI';
    }

    if (
      pathname ===
      '/dashboard/settings/subscription'
    ) {
      return 'Subscription';
    }

    if (isSettingsPage) {
      if (activeSettingsTab) {
        const setting =
          SETTINGS_ITEMS.find(
            (item) =>
              item.key ===
              activeSettingsTab
          );

        if (setting) {
          return setting.name;
        }
      }

      return 'Settings';
    }

    const match =
      appNavItems.find((item) =>
        pathname.startsWith(item.route)
      );

    return (
      match?.name ||
      data?.activeBusiness.name ||
      'Dashboard'
    );
  };

  /* =======================================================
     PAGE DESCRIPTION
  ======================================================= */

  const getCurrentDescription = () => {
    if (pathname === '/dashboard') {
      return 'Everything happening across your workspace';
    }

    if (pathname === '/dashboard/ai') {
      return 'Your intelligent business assistant';
    }

    if (
      pathname ===
      '/dashboard/settings/subscription'
    ) {
      return 'Manage your SaMi subscription';
    }

    if (isSettingsPage) {
      if (activeSettingsTab) {
        const setting =
          SETTINGS_ITEMS.find(
            (item) =>
              item.key ===
              activeSettingsTab
          );

        if (setting) {
          return setting.description;
        }
      }

      return 'Manage your account and workspace';
    }

    return '';
  };

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center">
          <SaMiLogo size="lg" />

          <div className="mt-7 h-7 w-7 rounded-full border-[3px] border-blue-600/20 border-t-blue-600 animate-spin" />

          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Loading your workspace...
          </p>
        </div>
      </div>
    );
  }

  /* =======================================================
     ERROR
  ======================================================= */

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-6">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center">
            <SaMiLogo size="lg" />
          </div>

          <div className="mt-8 rounded-2xl border border-red-200 dark:border-red-900/40 bg-white dark:bg-gray-900 p-7 shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-red-500/10">
              <AlertTriangle
                size={22}
                className="text-red-600 dark:text-red-400"
              />
            </div>

            <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
              Unable to load SaMi
            </h2>

            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {error ||
                'Something went wrong while loading your workspace.'}
            </p>

            <button
              onClick={() =>
                router.push('/auth/login')
              }
              className="
                mt-6
                w-full
                rounded-xl
                bg-gray-900
                dark:bg-white
                px-4
                py-2.5
                text-sm
                font-semibold
                text-white
                dark:text-gray-900
                hover:opacity-90
                transition
              "
            >
              Return to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* ===================================================
          MOBILE OVERLAY
      =================================================== */}

      {sidebarOpen && (
        <div
          className="
            fixed
            inset-0
            z-40
            bg-black/50
            backdrop-blur-sm
            lg:hidden
          "
          onClick={() =>
            setSidebarOpen(false)
          }
        />
      )}

      {/* ===================================================
          SIDEBAR
      =================================================== */}

      <aside
        className={`
          fixed
          inset-y-0
          left-0
          z-50
          w-[272px]
          bg-white
          dark:bg-gray-950
          border-r
          border-gray-200
          dark:border-gray-800
          transform
          transition-transform
          duration-300
          ease-out
          lg:translate-x-0
          ${
            sidebarOpen
              ? 'translate-x-0'
              : '-translate-x-full'
          }
        `}
      >
        <div className="flex h-full flex-col">
          {/* =================================================
              LOGO HEADER
          ================================================= */}

          <div className="flex h-[68px] items-center justify-between px-5 border-b border-gray-200 dark:border-gray-800">
            <Link
              href="/dashboard"
              className="flex items-center"
            >
              <SaMiLogo size="md" />
            </Link>

            <button
              onClick={() =>
                setSidebarOpen(false)
              }
              className="
                lg:hidden
                h-8
                w-8
                flex
                items-center
                justify-center
                rounded-lg
                text-gray-500
                hover:bg-gray-100
                dark:hover:bg-gray-800
              "
            >
              <X size={18} />
            </button>
          </div>

          {/* =================================================
              WORKSPACE SWITCHER
          ================================================= */}

          <div className="px-3 pt-4">
            <button
              onClick={() =>
                setBusinessMenuOpen(
                  !businessMenuOpen
                )
              }
              className="
                w-full
                rounded-xl
                border
                border-gray-200
                dark:border-gray-800
                bg-gray-50/80
                dark:bg-gray-900
                p-2.5
                hover:bg-gray-100
                dark:hover:bg-gray-800
                transition
              "
            >
              <div className="flex items-center gap-3">
                <div
                  className="
                    h-9
                    w-9
                    shrink-0
                    rounded-lg
                    bg-gradient-to-br
                    from-blue-600
                    to-indigo-600
                    flex
                    items-center
                    justify-center
                    text-white
                    font-bold
                    text-sm
                    shadow-sm
                  "
                >
                  {data.activeBusiness.name
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Workspace
                  </p>

                  <p className="mt-0.5 truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {data.activeBusiness.name}
                  </p>
                </div>

                <ChevronDown
                  size={15}
                  className={`
                    text-gray-400
                    transition-transform
                    ${
                      businessMenuOpen
                        ? 'rotate-180'
                        : ''
                    }
                  `}
                />
              </div>
            </button>

            {/* BUSINESS MENU */}

            {businessMenuOpen && (
              <div
                className="
                  absolute
                  left-3
                  right-3
                  mt-2
                  z-50
                  overflow-hidden
                  rounded-xl
                  border
                  border-gray-200
                  dark:border-gray-800
                  bg-white
                  dark:bg-gray-900
                  shadow-xl
                "
              >
                <div className="p-2">
                  <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Your workspaces
                  </p>

                  {data.businesses.map(
                    (business) => {
                      const active =
                        business.id ===
                        data.activeBusiness.id;

                      return (
                        <button
                          key={business.id}
                          onClick={() => {
                            switchBusiness(
                              business.id
                            );

                            setBusinessMenuOpen(
                              false
                            );
                          }}
                          className={`
                            w-full
                            flex
                            items-center
                            gap-3
                            rounded-lg
                            px-2
                            py-2.5
                            text-left
                            transition
                            ${
                              active
                                ? 'bg-blue-50 dark:bg-blue-500/10'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                            }
                          `}
                        >
                          <div
                            className={`
                              h-8
                              w-8
                              rounded-lg
                              flex
                              items-center
                              justify-center
                              text-xs
                              font-bold
                              ${
                                active
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                              }
                            `}
                          >
                            {business.name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                              {business.name}
                            </p>

                            <p className="text-[11px] capitalize text-gray-400">
                              {business.role}
                            </p>
                          </div>

                          {active && (
                            <Check
                              size={15}
                              className="text-blue-600"
                            />
                          )}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            )}
          </div>

          {/* =================================================
              SEARCH
          ================================================= */}

          <div className="px-3 pt-4">
            <div className="relative">
              <Search
                size={15}
                className="
                  absolute
                  left-3
                  top-1/2
                  -translate-y-1/2
                  text-gray-400
                "
              />

              <input
                id="sami-sidebar-search"
                type="text"
                placeholder="Search apps..."
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(
                    event.target.value
                  )
                }
                className="
                  h-9
                  w-full
                  rounded-lg
                  border
                  border-gray-200
                  dark:border-gray-800
                  bg-gray-50
                  dark:bg-gray-900
                  pl-9
                  pr-3
                  text-xs
                  text-gray-900
                  dark:text-white
                  placeholder:text-gray-400
                  outline-none
                  transition
                  focus:border-blue-500
                  focus:ring-2
                  focus:ring-blue-500/10
                "
              />
            </div>
          </div>

          {/* =================================================
              NAVIGATION
          ================================================= */}

          <nav className="flex-1 overflow-y-auto px-3 py-5 scrollbar-thin">
            {/* MAIN */}

            <SettingsGroup title="Main">
              {coreNavItems.map((item) => (
                <NavigationItem
                  key={item.key}
                  name={item.name}
                  route={item.route}
                  icon={item.icon}
                  active={
                    pathname === item.route ||
                    (
                      item.route !==
                        '/dashboard' &&
                      pathname.startsWith(
                        item.route
                      )
                    )
                  }
                  onClick={() =>
                    setSidebarOpen(false)
                  }
                />
              ))}
            </SettingsGroup>

            {/* APPLICATIONS */}

            <SettingsGroup title="Applications">
              {filteredAppItems.length > 0 ? (
                filteredAppItems.map(
                  (item) => (
                    <NavigationItem
                      key={item.key}
                      name={item.name}
                      route={item.route}
                      icon={item.icon}
                      active={pathname.startsWith(
                        item.route
                      )}
                      onClick={() =>
                        setSidebarOpen(false)
                      }
                    />
                  )
                )
              ) : (
                <div className="px-3 py-5 text-center">
                  <p className="text-xs text-gray-400">
                    No applications found
                  </p>
                </div>
              )}
            </SettingsGroup>
          </nav>


         {/* SETTINGS */}
<div className="px-3 pb-3">
  <button
    onClick={() => setSettingsOpen(!settingsOpen)}
    className={`
      group
      flex
      items-center
      gap-3
      w-full
      px-2.5
      py-2
      rounded-xl
      text-sm
      font-medium
      transition-all
      duration-150
      ${
        isSettingsPage
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-100'
      }
    `}
  >
    <span
      className={`
        flex
        items-center
        justify-center
        h-8
        w-8
        rounded-lg
        transition-all
        ${
          isSettingsPage
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 group-hover:bg-white dark:group-hover:bg-gray-700'
        }
      `}
    >
      <Settings size={16} strokeWidth={isSettingsPage ? 2.2 : 1.9} />
    </span>

    <span className="flex-1 truncate text-left">Settings</span>

    <ChevronDown
      size={14}
      className={`
        transition-transform
        ${settingsOpen ? 'rotate-180' : ''}
      `}
    />
  </button>

  {/* Settings Dropdown */}
  {settingsOpen && (
    <div className="mt-1 ml-4 pl-3 border-l border-gray-200 dark:border-gray-800 space-y-0.5">
      {SETTINGS_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = searchParams.get('tab') === item.key || 
          (item.key === 'subscription' && pathname === '/dashboard/settings/subscription');

        return (
          <Link
            key={item.key}
            href={item.route}
            onClick={() => setSidebarOpen(false)}
            className={`
              flex
              items-center
              gap-2.5
              px-2.5
              py-1.5
              rounded-lg
              text-xs
              font-medium
              transition-all
              ${
                isActive
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-100'
              }
            `}
          >
            <Icon size={13} strokeWidth={isActive ? 2.2 : 1.8} />
            <span className="flex-1 truncate">{item.name}</span>
          </Link>
        );
      })}
    </div>
  )}
</div>
          {/* =================================================
              USER ACCOUNT
          ================================================= */}

          <div className="relative border-t border-gray-200 dark:border-gray-800 p-3">
            <button
              onClick={() =>
                setAccountMenuOpen(
                  !accountMenuOpen
                )
              }
              className="
                w-full
                flex
                items-center
                gap-3
                rounded-xl
                p-2
                text-left
                hover:bg-gray-100
                dark:hover:bg-gray-900
                transition
              "
            >
              <UserAvatar
                name={data.user.fullName}
              />

              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {data.user.fullName}
                </p>

                <p className="truncate text-[11px] text-gray-400">
                  {data.activeBusiness.role}
                </p>
              </div>

              <ChevronDown
                size={15}
                className={`
                  text-gray-400
                  transition-transform
                  ${
                    accountMenuOpen
                      ? 'rotate-180'
                      : ''
                  }
                `}
              />
            </button>

            {/* ACCOUNT MENU */}

            {accountMenuOpen && (
              <div
                className="
                  absolute
                  bottom-full
                  left-3
                  right-3
                  mb-2
                  overflow-hidden
                  rounded-xl
                  border
                  border-gray-200
                  dark:border-gray-800
                  bg-white
                  dark:bg-gray-900
                  shadow-2xl
                "
              >
                <div className="p-3 border-b border-gray-100 dark:border-gray-800">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {data.user.fullName}
                  </p>

                  <p className="mt-0.5 truncate text-xs text-gray-400">
                    {data.user.email}
                  </p>
                </div>

                <div className="p-1.5">
                  <Link
                    href="/dashboard/settings?tab=profile"
                    onClick={() =>
                      setAccountMenuOpen(false)
                    }
                    className="
                      flex
                      items-center
                      gap-3
                      rounded-lg
                      px-3
                      py-2.5
                      text-sm
                      text-gray-700
                      dark:text-gray-300
                      hover:bg-gray-100
                      dark:hover:bg-gray-800
                    "
                  >
                    <User size={16} />
                    Profile
                  </Link>

                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

                  <button
                    onClick={handleLogout}
                    className="
                      w-full
                      flex
                      items-center
                      gap-3
                      rounded-lg
                      px-3
                      py-2.5
                      text-sm
                      text-red-600
                      dark:text-red-400
                      hover:bg-red-50
                      dark:hover:bg-red-500/10
                    "
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* =====================================================
          MAIN AREA
      ===================================================== */}

      <div className="lg:pl-[272px]">
        {/* ===================================================
            TOP HEADER
        =================================================== */}

        <header
          className="
            sticky
            top-0
            z-30
            h-[68px]
            border-b
            border-gray-200
            dark:border-gray-800
            bg-white/85
            dark:bg-gray-950/85
            backdrop-blur-xl
          "
        >
          <div className="flex h-full items-center gap-4 px-4 lg:px-7">
            {/* MOBILE MENU */}

            <button
              onClick={() =>
                setSidebarOpen(true)
              }
              className="
                lg:hidden
                h-9
                w-9
                shrink-0
                rounded-lg
                flex
                items-center
                justify-center
                hover:bg-gray-100
                dark:hover:bg-gray-800
              "
            >
              <Menu size={19} />
            </button>

            {/* PAGE TITLE */}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-bold text-gray-900 dark:text-white">
                  {getCurrentTitle()}
                </h1>

                {pathname !==
                  '/dashboard' &&
                  !isSettingsPage && (
                    <ChevronRight
                      size={14}
                      className="hidden sm:block text-gray-300 dark:text-gray-700"
                    />
                  )}
              </div>

              <p className="hidden sm:block truncate text-xs text-gray-400">
                {getCurrentDescription()}
              </p>
            </div>

            {/* GLOBAL SEARCH */}

            <div className="hidden md:flex w-full max-w-[360px]">
              <div
                className="
                  group
                  relative
                  flex
                  h-9
                  w-full
                  items-center
                  rounded-xl
                  border
                  border-gray-200
                  dark:border-gray-800
                  bg-gray-50
                  dark:bg-gray-900
                  transition
                  focus-within:border-blue-500
                  focus-within:ring-2
                  focus-within:ring-blue-500/10
                "
              >
                <Search
                  size={15}
                  className="
                    ml-3
                    shrink-0
                    text-gray-400
                  "
                />

                <input
                  id="sami-global-search"
                  type="text"
                  placeholder="Search anything..."
                  className="
                    min-w-0
                    flex-1
                    bg-transparent
                    border-0
                    outline-none
                    px-2
                    text-xs
                    text-gray-900
                    dark:text-white
                    placeholder:text-gray-400
                  "
                />

                <kbd
                  className="
                    mr-2
                    hidden
                    lg:inline-flex
                    items-center
                    rounded-md
                    border
                    border-gray-200
                    dark:border-gray-700
                    bg-white
                    dark:bg-gray-800
                    px-1.5
                    py-0.5
                    text-[9px]
                    font-medium
                    text-gray-400
                  "
                >
                  ⌘ K
                </kbd>
              </div>
            </div>

            {/* ACTIONS */}

            <div className="flex items-center gap-1 shrink-0">
              {/* THEME */}

              <button
                onClick={() => {
                  const next =
                    !darkMode;

                  setDarkMode(next);

                  if (next) {
                    document.documentElement.classList.add(
                      'dark'
                    );

                    localStorage.setItem(
                      'sami_theme',
                      'dark'
                    );
                  } else {
                    document.documentElement.classList.remove(
                      'dark'
                    );

                    localStorage.setItem(
                      'sami_theme',
                      'light'
                    );
                  }
                }}
                title={
                  darkMode
                    ? 'Switch to light mode'
                    : 'Switch to dark mode'
                }
                className="
                  h-9
                  w-9
                  rounded-lg
                  flex
                  items-center
                  justify-center
                  text-gray-500
                  dark:text-gray-400
                  hover:bg-gray-100
                  dark:hover:bg-gray-800
                  transition
                "
              >
                {darkMode ? (
                  <Sun size={17} />
                ) : (
                  <Moon size={17} />
                )}
              </button>

              {/* NOTIFICATIONS */}

              <NotificationBell />

              {/* PROFILE */}

              <button
                onClick={() =>
                  setAccountMenuOpen(
                    !accountMenuOpen
                  )
                }
                className="
                  ml-1
                  rounded-lg
                  p-0.5
                  hover:bg-gray-100
                  dark:hover:bg-gray-800
                  transition
                "
              >
                <UserAvatar
                  name={data.user.fullName}
                  size="sm"
                />
              </button>
            </div>
          </div>
        </header>

        {/* ===================================================
            PAGE CONTENT
        =================================================== */}

        <main className="min-h-[calc(100vh-68px)]">
          <div className="p-4 sm:p-5 lg:p-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/* =========================================================
   SUSPENSE WRAPPER
   Required because useSearchParams() is used above.
========================================================= */

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
          <div className="flex flex-col items-center">
            <SaMiLogo size="lg" />

            <div className="mt-7 h-7 w-7 rounded-full border-[3px] border-blue-600/20 border-t-blue-600 animate-spin" />
          </div>
        </div>
      }
    >
      <DashboardLayoutContent>
        {children}
      </DashboardLayoutContent>
    </Suspense>
  );
}