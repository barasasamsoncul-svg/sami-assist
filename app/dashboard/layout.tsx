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
  ChevronRight,
  Bell,
  Search,
  HelpCircle
} from 'lucide-react';

// Map app keys to icons
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

// SaMi Logo Component
function SaMiLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <div className="flex items-center select-none">
      <span className={`${sizes[size]} font-extrabold italic tracking-tight`}>
        <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 bg-clip-text text-transparent">
          Sa
        </span>
        <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
          Mi
        </span>
      </span>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [businessMenuOpen, setBusinessMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load dashboard');
      }

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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/auth/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <SaMiLogo size="lg" />
          <div className="mt-6 animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <SaMiLogo size="lg" />
          <p className="text-red-600 mb-4 mt-6">{error || 'Failed to load'}</p>
          <button
            onClick={() => router.push('/auth/login')}
            className="text-blue-600 hover:underline font-medium"
          >
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-2 group">
                <SaMiLogo />
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-gray-400 hover:text-white transition p-1 rounded-lg hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Business Selector */}
          <div className="p-4 border-b border-white/10 relative">
            <button
              onClick={() => setBusinessMenuOpen(!businessMenuOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition group"
            >
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-sm shrink-0">
                {data.activeBusiness.name.charAt(0)}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold truncate">
                  {data.activeBusiness.name}
                </p>
                <p className="text-xs text-gray-400 capitalize">
                  {data.activeBusiness.role}
                </p>
              </div>
              <ChevronDown 
                size={16} 
                className={`text-gray-400 transition-transform ${businessMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Business Dropdown */}
            {businessMenuOpen && (
              <div className="absolute left-4 right-4 top-full mt-2 bg-gray-900 rounded-xl shadow-2xl border border-white/10 z-50 overflow-hidden">
                <div className="p-2">
                  <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Switch Business
                  </p>
                  {data.businesses.map((business) => (
                    <button
                      key={business.id}
                      onClick={() => {
                        switchBusiness(business.id);
                        setBusinessMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                        business.id === data.activeBusiness.id
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      <div className="h-7 w-7 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold">
                        {business.name.charAt(0)}
                      </div>
                      <span className="flex-1 text-left truncate">{business.name}</span>
                      <span className="text-xs capitalize text-gray-500">{business.role}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {/* Core Items */}
            {coreNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.route;
              return (
                <Link
                  key={item.key}
                  href={item.route}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                      : 'text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon size={18} className={isActive ? '' : 'group-hover:scale-110 transition-transform'} />
                  <span className="flex-1">{item.name}</span>
                  {isActive && <ChevronRight size={14} className="opacity-70" />}
                </Link>
              );
            })}

            {/* Separator */}
            {appNavItems.length > 0 && (
              <div className="pt-5 pb-2">
                <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Your Apps
                </p>
              </div>
            )}

            {/* App Items */}
            {appNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.route);
              return (
                <Link
                  key={item.key}
                  href={item.route}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20'
                      : 'text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon size={18} className={isActive ? '' : 'group-hover:scale-110 transition-transform'} />
                  <span className="flex-1">{item.name}</span>
                </Link>
              );
            })}

            {/* Database Status */}
            <div className="pt-5">
              <div className="px-3 py-3 rounded-xl bg-white/5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">Database</p>
                  <span className={`h-2 w-2 rounded-full ${data.databaseReady ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-pulse'}`} />
                </div>
                <p className={`text-xs font-semibold mt-1.5 ${data.databaseReady ? 'text-green-400' : 'text-yellow-400'}`}>
                  {data.databaseReady ? 'Connected' : 'Provisioning'}
                </p>
              </div>
            </div>
          </nav>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-white/10 space-y-1">
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:bg-white/10 hover:text-white transition"
            >
              <Settings size={18} />
              Settings
            </Link>
            <Link
              href="/dashboard/help"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:bg-white/10 hover:text-white transition"
            >
              <HelpCircle size={18} />
              Help & Support
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:bg-red-600/20 hover:text-red-400 transition"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-72">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-gray-200">
          {/* Mobile Header */}
          <div className="lg:hidden px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-gray-100 transition"
              >
                <Menu size={20} />
              </button>
              <SaMiLogo size="sm" />
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 rounded-lg hover:bg-gray-100 transition">
                <Bell size={18} className="text-gray-600" />
              </button>
              <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                {data.user.fullName.charAt(0)}
              </div>
            </div>
          </div>

          {/* Desktop Header */}
          <div className="hidden lg:flex items-center justify-between px-8 py-3">
            <div className="flex items-center gap-4">
              {/* Search Bar */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-64 pl-10 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button className="p-2 rounded-lg hover:bg-gray-100 transition relative">
                <Bell size={18} className="text-gray-600" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
              </button>
              
              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-100 transition"
                >
                  <div className="h-9 w-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-lg shadow-blue-600/20">
                    {data.user.fullName.charAt(0)}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">
                      {data.user.fullName}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {data.activeBusiness.role}
                    </p>
                  </div>
                  <ChevronDown size={14} className="text-gray-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900">{data.user.fullName}</p>
                      <p className="text-xs text-gray-500">{data.user.email}</p>
                    </div>
                    <div className="p-2">
                      <Link
                        href="/dashboard/settings"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition"
                      >
                        <Settings size={16} />
                        Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition"
                      >
                        <LogOut size={16} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}