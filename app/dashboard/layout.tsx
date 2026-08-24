'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
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
  ChevronRight
} from 'lucide-react';

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

interface DashboardData {
  user: { id: string; email: string; fullName: string; };
  businesses: Array<{ id: string; name: string; slug: string; role: string; }>;
  activeBusiness: { id: string; name: string; slug: string; role: string; };
  installedApps: Array<{ key: string; name: string; route: string; description: string; }>;
  databaseReady: boolean;
}

function SaMiLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <span className={`${sizes[size]} font-black italic tracking-tighter`}>
      <span className="text-blue-800 dark:text-blue-500 drop-shadow-[2px_2px_0_rgba(0,0,0,0.2)]">Sa</span>
      <span className="text-gray-900 dark:text-gray-100 drop-shadow-[2px_2px_0_rgba(0,0,0,0.2)]">Mi</span>
    </span>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [businessMenuOpen, setBusinessMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    fetchDashboardData();
  }, []);

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('sami_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('sami_theme', 'light');
    }
  };

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load dashboard');
      setData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      if (err instanceof Error && err.message.includes('Not authenticated')) {
        router.push('/auth/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    router.push('/auth/logout');
  };

  const switchBusiness = async (businessId: string) => {
    try {
      await fetch('/api/auth/switch-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId }),
      });
      window.location.reload();
    } catch (error) {
      console.error('Business switch failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <SaMiLogo size="lg" />
          <div className="mt-6 animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Failed to load'}</p>
          <button onClick={() => router.push('/auth/login')} className="text-blue-600 hover:underline">
            Go to login
          </button>
        </div>
      </div>
    );
  }

  const coreNavItems = [
    { key: 'dashboard', name: 'Dashboard', route: '/dashboard', icon: LayoutDashboard },
    { key: 'ai', name: 'SaMi AI', route: '/dashboard/ai', icon: Sparkles },
  ];

  const appNavItems = data.installedApps.map(app => ({
    key: app.key,
    name: app.name,
    route: `/dashboard/${app.route}`,
    icon: APP_ICONS[app.key] || Boxes,
  }));

  const allNavItems = [...coreNavItems, ...appNavItems];

  // Filter nav items by search
  const filteredNavItems = searchQuery
    ? allNavItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allNavItems;

  // Determine current page title
  const getCurrentTitle = () => {
    if (pathname === '/dashboard') {
      return data.activeBusiness.name;
    }
    if (pathname === '/dashboard/ai') {
      return 'SaMi AI';
    }
    if (pathname === '/dashboard/settings') {
      return 'Settings';
    }
    const match = appNavItems.find(item => pathname.startsWith(item.route));
    return match ? match.name : data.activeBusiness.name;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <Link href="/dashboard">
              <SaMiLogo />
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-800">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search apps..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Business Selector */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 relative">
            <button
              onClick={() => setBusinessMenuOpen(!businessMenuOpen)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">
                {data.activeBusiness.name.charAt(0)}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{data.activeBusiness.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{data.activeBusiness.role}</p>
              </div>
              <ChevronDown size={14} className={`text-gray-400 transition-transform ${businessMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {businessMenuOpen && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50">
                <div className="p-1">
                  {data.businesses.map((business) => (
                    <button
                      key={business.id}
                      onClick={() => { switchBusiness(business.id); setBusinessMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition ${
                        business.id === data.activeBusiness.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="flex-1 text-left truncate">{business.name}</span>
                      <span className="text-xs capitalize text-gray-500">{business.role}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.route || (item.route !== '/dashboard' && pathname.startsWith(item.route));
              return (
                <Link
                  key={item.key}
                  href={item.route}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon size={18} />
                  <span className="flex-1">{item.name}</span>
                  {isActive && <ChevronRight size={14} className="opacity-70" />}
                </Link>
              );
            })}

            {searchQuery && filteredNavItems.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-4">No apps found</p>
            )}

            {/* Database Status */}
            <div className="pt-4">
              <div className="px-3 py-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Database</p>
                  <span className={`h-2 w-2 rounded-full ${data.databaseReady ? 'bg-green-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`} />
                </div>
                <p className={`text-xs font-semibold mt-1 ${data.databaseReady ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                  {data.databaseReady ? 'Connected' : 'Provisioning'}
                </p>
              </div>
            </div>
          </nav>

          {/* Footer */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-0.5">
            <Link href="/dashboard/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              <Settings size={18} />
              Settings
            </Link>
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-4 lg:px-6 py-3">
            {/* Mobile: Menu + Title */}
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <Menu size={20} className="text-gray-600 dark:text-gray-400" />
              </button>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                {getCurrentTitle()}
              </h1>
            </div>

            {/* Right: Theme + Notifications */}
            <div className="flex items-center gap-2">
              <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                {darkMode ? <Sun size={18} className="text-gray-600 dark:text-gray-400" /> : <Moon size={18} className="text-gray-600" />}
              </button>
              <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition relative">
                <Bell size={18} className="text-gray-600 dark:text-gray-400" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-blue-600 rounded-full" />
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}