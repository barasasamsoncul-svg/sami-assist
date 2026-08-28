'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import NotificationBell from './components/NotificationBell';
import {
  LayoutDashboard, LogOut, Menu, X, ChevronDown, Settings, Sparkles,
  Calculator, Receipt, FileText, BarChart3, Folder, PenTool, Users,
  ShoppingCart, Repeat, Home, Store, Utensils, Package, Factory, Boxes,
  ShoppingBag, Wrench, ShieldCheck, UserRound, Car, UserPlus, ClipboardCheck,
  CalendarOff, UserSearch, Megaphone, Mail, MessageSquare, CalendarDays,
  Workflow, ClipboardList, Briefcase, Clock, MapPin, Headphones, CalendarClock,
  Calendar, Sun, Moon, ChevronRight, Building2, CreditCard, Key,
  History, AppWindow, User, Shield, Monitor, Globe, AlertTriangle, Check,
} from 'lucide-react';

const APP_ICONS: Record<string, any> = {
  accounting: Calculator, invoicing: Receipt, expenses: FileText,
  spreadsheet: BarChart3, documents: Folder, sign: PenTool, crm: Users,
  sales: ShoppingCart, subscriptions: Repeat, rentals: Home, pos_shop: Store,
  pos_restaurant: Utensils, inventory: Package, manufacturing: Factory,
  plm: Boxes, purchase: ShoppingBag, maintenance: Wrench, quality: ShieldCheck,
  employees: UserRound, fleet: Car, referrals: UserPlus, appraisals: ClipboardCheck,
  time_off: CalendarOff, recruitment: UserSearch, social_marketing: Megaphone,
  email_marketing: Mail, sms_marketing: MessageSquare, events: CalendarDays,
  marketing_automation: Workflow, surveys: ClipboardList, projects: Briefcase,
  timesheets: Clock, field_services: MapPin, helpdesk: Headphones,
  planning: CalendarClock, appointments: Calendar,
};

const SETTINGS_ITEMS = [
  { key: 'profile', name: 'Profile', route: '/dashboard/settings?tab=profile', icon: User, group: 'Account' },
  { key: 'preferences', name: 'Preferences', route: '/dashboard/settings?tab=preferences', icon: Globe, group: 'Account' },
  { key: 'security', name: 'Password & Security', route: '/dashboard/settings?tab=security', icon: Shield, group: 'Security' },
  { key: 'sessions', name: 'Devices & Sessions', route: '/dashboard/settings?tab=sessions', icon: Monitor, group: 'Security' },
  { key: 'audit-logs', name: 'Activity Log', route: '/dashboard/settings?tab=audit-logs', icon: History, group: 'Security' },
  { key: 'business', name: 'Business', route: '/dashboard/settings?tab=business', icon: Building2, group: 'Workspace' },
  { key: 'team', name: 'Team & Permissions', route: '/dashboard/settings?tab=team', icon: Users, group: 'Workspace' },
  { key: 'apps', name: 'Apps', route: '/dashboard/settings?tab=apps', icon: AppWindow, group: 'Workspace' },
  { key: 'ai', name: 'AI Usage', route: '/dashboard/settings?tab=ai', icon: Sparkles, group: 'AI' },
  { key: 'api-keys', name: 'API Keys', route: '/dashboard/settings?tab=api-keys', icon: Key, group: 'Developer' },
  { key: 'subscription', name: 'Billing & Subscription', route: '/dashboard/settings/subscription', icon: CreditCard, group: 'Billing' },
  { key: 'danger', name: 'Danger Zone', route: '/dashboard/settings?tab=danger', icon: AlertTriangle, group: 'Danger Zone' },
];

interface DashboardData {
  user: { id: string; email: string; fullName: string };
  tenants: Array<{ id: string; name: string; slug: string; role: string; isOwner: boolean }>;
  activeTenant: { id: string; name: string; slug: string; role: string; isOwner: boolean };
  installedModules: Array<{ key: string; name: string; category: string }>;
  subscription: { status: string; plan_name: string } | null;
  databaseReady: boolean;
}

function SaMiLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'text-xl', md: 'text-2xl', lg: 'text-4xl' };
  return (
    <span className={`${sizes[size]} font-black italic tracking-[-0.08em] select-none`}>
      <span className="text-blue-700 dark:text-blue-500">Sa</span>
      <span className="text-gray-900 dark:text-white">Mi</span>
    </span>
  );
}

function UserAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm' };
  const initials = name?.trim().split(/\s+/).slice(0, 2).map((w: string) => w.charAt(0)).join('').toUpperCase() || 'S';
  return (
    <div className={`${sizes[size]} shrink-0 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold shadow-sm`}>
      {initials}
    </div>
  );
}

function NavigationItem({ name, route, icon: Icon, active, onClick }: {
  name: string; route: string; icon: any; active: boolean; onClick?: () => void;
}) {
  return (
    <Link href={route} onClick={onClick} className={`group flex items-center gap-3 w-full px-2.5 py-2 rounded-xl text-sm font-medium transition-all ${
      active ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-100'
    }`}>
      <span className={`flex items-center justify-center h-8 w-8 rounded-lg transition-all ${
        active ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 group-hover:bg-white dark:group-hover:bg-gray-700'
      }`}>
        <Icon size={16} strokeWidth={active ? 2.2 : 1.9} />
      </span>
      <span className="flex-1 truncate">{name}</span>
      {active && <ChevronRight size={14} className="text-blue-500" />}
    </Link>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-600">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [businessMenuOpen, setBusinessMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    setDarkMode(shouldUseDark);
    if (shouldUseDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    fetchDashboardData();
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    setBusinessMenuOpen(false);
    setAccountMenuOpen(false);
    if (pathname.startsWith('/dashboard/settings')) setSettingsOpen(true);
    else setSettingsOpen(false);
  }, [pathname, searchParams]);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      if (err instanceof Error && err.message.includes('Not authenticated')) router.push('/auth/login');
    } finally {
      setLoading(false);
    }
  };

  const switchTenant = async (tenantId: string) => {
    try {
      const response = await fetch('/api/auth/switch-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      if (!response.ok) throw new Error('Failed');
      window.location.reload();
    } catch (error) {
      console.error('Switch failed:', error);
    }
  };

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('sami_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('sami_theme', 'light');
    }
  };

  const coreNavItems = [
    { key: 'dashboard', name: 'Dashboard', route: '/dashboard', icon: LayoutDashboard },
    { key: 'ai', name: 'SaMi AI', route: '/dashboard/ai', icon: Sparkles },
  ];

  const appNavItems = useMemo(() => {
    if (!data) return [];
    return data.installedModules.map((module: any) => ({
      key: module.key,
      name: module.name,
      route: `/dashboard/${module.key}`,
      icon: APP_ICONS[module.key] || Boxes,
    }));
  }, [data]);

  const isSettingsPage = pathname.startsWith('/dashboard/settings');
  const activeSettingsTab = searchParams.get('tab');

  const getCurrentTitle = () => {
    if (pathname === '/dashboard') return 'Dashboard';
    if (pathname === '/dashboard/ai') return 'SaMi AI';
    if (pathname === '/dashboard/settings/subscription') return 'Subscription';
    if (isSettingsPage) {
      const setting = SETTINGS_ITEMS.find((item) => item.key === activeSettingsTab);
      return setting?.name || 'Settings';
    }
    const match = appNavItems.find((item: any) => pathname.startsWith(item.route));
    return match?.name || data?.activeTenant.name || 'Dashboard';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center">
          <SaMiLogo size="lg" />
          <div className="mt-7 h-7 w-7 rounded-full border-[3px] border-blue-600/20 border-t-blue-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <SaMiLogo size="lg" />
          <p className="mt-4 text-red-600">{error}</p>
          <button onClick={() => router.push('/auth/login')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">Go to login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-[272px] bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-full flex-col">
          <div className="flex h-[68px] items-center justify-between px-5 border-b border-gray-200 dark:border-gray-800">
            <Link href="/dashboard"><SaMiLogo size="md" /></Link>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><X size={18} /></button>
          </div>

          <div className="px-3 pt-4 relative">
            <button onClick={() => setBusinessMenuOpen(!businessMenuOpen)} className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900 p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  {data.activeTenant.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Workspace</p>
                  <p className="mt-0.5 truncate text-sm font-semibold">{data.activeTenant.name}</p>
                </div>
                <ChevronDown size={15} className={`text-gray-400 transition-transform ${businessMenuOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {businessMenuOpen && (
              <div className="absolute left-3 right-3 mt-2 z-50 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl">
                <div className="p-2">
                  <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Your workspaces</p>
                  {data.tenants.map((tenant) => (
                    <button key={tenant.id} onClick={() => { switchTenant(tenant.id); setBusinessMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-2 py-2.5 text-left transition ${tenant.id === data.activeTenant.id ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${tenant.id === data.activeTenant.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600'}`}>
                        {tenant.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{tenant.name}</p>
                        <p className="text-[11px] capitalize text-gray-400">{tenant.role}</p>
                      </div>
                      {tenant.id === data.activeTenant.id && <Check size={15} className="text-blue-600" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-5">
            <SettingsGroup title="Main">
              {coreNavItems.map((item) => (
                <NavigationItem key={item.key} name={item.name} route={item.route} icon={item.icon} active={pathname === item.route || (item.route !== '/dashboard' && pathname.startsWith(item.route))} onClick={() => setSidebarOpen(false)} />
              ))}
            </SettingsGroup>

            <SettingsGroup title="Applications">
              {appNavItems.length > 0 ? appNavItems.map((item: any) => (
                <NavigationItem key={item.key} name={item.name} route={item.route} icon={item.icon} active={pathname.startsWith(item.route)} onClick={() => setSidebarOpen(false)} />
              )) : <p className="px-3 py-5 text-center text-xs text-gray-400">No apps installed</p>}
            </SettingsGroup>
          </nav>

          <div className="px-3 pb-3">
            <button onClick={() => setSettingsOpen(!settingsOpen)} className={`group flex items-center gap-3 w-full px-2.5 py-2 rounded-xl text-sm font-medium transition-all ${isSettingsPage ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/70'}`}>
              <span className={`flex items-center justify-center h-8 w-8 rounded-lg ${isSettingsPage ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                <Settings size={16} />
              </span>
              <span className="flex-1 truncate text-left">Settings</span>
              <ChevronDown size={14} className={`transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
            </button>
            {settingsOpen && (
              <div className="mt-1 ml-4 pl-3 border-l border-gray-200 dark:border-gray-800 space-y-0.5">
                {SETTINGS_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = searchParams.get('tab') === item.key || (item.key === 'subscription' && pathname === '/dashboard/settings/subscription');
                  return (
                    <Link key={item.key} href={item.route} onClick={() => setSidebarOpen(false)} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/70'}`}>
                      <Icon size={13} />
                      <span className="flex-1 truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative border-t border-gray-200 dark:border-gray-800 p-3">
            <button onClick={() => setAccountMenuOpen(!accountMenuOpen)} className="w-full flex items-center gap-3 rounded-xl p-2 text-left hover:bg-gray-100 dark:hover:bg-gray-900 transition">
              <UserAvatar name={data.user.fullName} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold">{data.user.fullName}</p>
                <p className="truncate text-[11px] text-gray-400">{data.activeTenant.role}</p>
              </div>
              <ChevronDown size={15} className={`text-gray-400 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {accountMenuOpen && (
              <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl">
                <div className="p-3 border-b border-gray-100 dark:border-gray-800">
                  <p className="text-sm font-semibold">{data.user.fullName}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-400">{data.user.email}</p>
                </div>
                <div className="p-1.5">
                  <Link href="/dashboard/settings?tab=profile" onClick={() => setAccountMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <User size={16} /> Profile
                  </Link>
                  <button onClick={() => router.push('/auth/logout')} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-30 h-[68px] border-b border-gray-200 dark:border-gray-800 bg-white/85 dark:bg-gray-950/85 backdrop-blur-xl">
          <div className="flex h-full items-center gap-4 px-4 lg:px-7">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden h-9 w-9 shrink-0 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800"><Menu size={19} /></button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold">{getCurrentTitle()}</h1>
            </div>
            <button onClick={toggleTheme} className="h-9 w-9 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              {darkMode ? <Sun size={17} className="text-yellow-400" /> : <Moon size={17} />}
            </button>
            <NotificationBell />
            <button onClick={() => setAccountMenuOpen(!accountMenuOpen)} className="ml-1 rounded-lg p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              <UserAvatar name={data.user.fullName} size="sm" />
            </button>
          </div>
        </header>

        <main className="min-h-[calc(100vh-68px)]">
          <div className="p-4 sm:p-5 lg:p-7">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950"><SaMiLogo size="lg" /></div>}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}