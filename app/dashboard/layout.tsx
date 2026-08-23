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
  Calendar
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Failed to load'}</p>
          <button
            onClick={() => router.push('/auth/login')}
            className="text-blue-600 hover:underline"
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
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-950 text-white transform transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-2">
                <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">
                  S
                </div>
                <span className="font-bold text-lg">SaMi</span>
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Business Selector */}
          <div className="p-3 border-b border-white/10 relative">
            <button
              onClick={() => setBusinessMenuOpen(!businessMenuOpen)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition"
            >
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
              <div className="absolute left-3 right-3 top-full mt-1 bg-gray-900 rounded-lg shadow-xl border border-white/10 z-50">
                {data.businesses.map((business) => (
                  <button
                    key={business.id}
                    onClick={() => {
                      switchBusiness(business.id);
                      setBusinessMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition hover:bg-white/10 ${
                      business.id === data.activeBusiness.id
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'text-gray-300'
                    }`}
                  >
                    <span className="truncate">{business.name}</span>
                    <span className="text-xs capitalize">{business.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {/* Core Items */}
            {coreNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.route;
              return (
                <Link
                  key={item.key}
                  href={item.route}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  {item.name}
                </Link>
              );
            })}

            {/* Separator */}
            {appNavItems.length > 0 && (
              <div className="pt-4 pb-2">
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
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  {item.name}
                </Link>
              );
            })}

            {/* Database Status */}
            <div className="pt-4">
              <div className="px-3 py-2 rounded-lg bg-white/5">
                <p className="text-xs text-gray-400">Database Status</p>
                <p className={`text-xs font-semibold mt-1 ${data.databaseReady ? 'text-green-400' : 'text-yellow-400'}`}>
                  {data.databaseReady ? '✓ Ready' : '⚠ Provisioning'}
                </p>
              </div>
            </div>
          </nav>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-white/10 space-y-1">
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-white/10 hover:text-white"
            >
              <Settings size={18} />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-white/10 hover:text-white"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <Menu size={20} />
              </button>
              <span className="font-bold">SaMi</span>
            </div>
            <div className="text-sm text-gray-600">
              {data.user.fullName}
            </div>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden lg:block sticky top-0 z-30 bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {data.activeBusiness.name}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                {data.user.fullName}
              </span>
              <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                {data.user.fullName.charAt(0)}
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