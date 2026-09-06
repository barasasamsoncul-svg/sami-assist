'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Database,
  FileText,
  Home,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
  Package,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import SaMiLogo from '@/app/components/SaMiLogo';

type DashboardUser = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
};

type DashboardTenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
} | null;

type DashboardSubscription = {
  id: string;
  status: string;
  billingCycle: string | null;
  currentPeriodEnd: string | null;
  planKey: string | null;
  planName: string | null;
} | null;

type DashboardRole = {
  id: string;
  key: string | null;
  name: string;
} | null;

type DashboardModule = {
  key: string;
  name: string;
  status: string;
};

type DashboardSession = {
  id: string;
  expiresAt: string;
  device: {
    ipAddress: string;
    deviceType: string;
    browser: string;
    operatingSystem: string;
    lastActiveAt: string | null;
  };
};

type DashboardClientProps = {
  user: DashboardUser;
  tenant: DashboardTenant;
  subscription: DashboardSubscription;
  role: DashboardRole;
  modules: DashboardModule[];
  session: DashboardSession;
};

const navigationItems = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    active: true,
  },
  {
    name: 'Invoices',
    href: '/invoices',
    icon: Receipt,
    active: false,
  },
  {
    name: 'Products',
    href: '/products',
    icon: Package,
    active: false,
  },
  {
    name: 'Customers',
    href: '/customers',
    icon: Users,
    active: false,
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: BarChart3,
    active: false,
  },
  {
    name: 'Billing',
    href: '/billing',
    icon: CreditCard,
    active: false,
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    active: false,
  },
];

const quickActions = [
  {
    title: 'Create invoice',
    description:
      'Prepare and send a professional invoice.',
    href: '/invoices/new',
    icon: Receipt,
  },
  {
    title: 'Add customer',
    description:
      'Save customer details for future sales.',
    href: '/customers/new',
    icon: Users,
  },
  {
    title: 'Add product',
    description:
      'Create products and service items.',
    href: '/products/new',
    icon: Package,
  },
  {
    title: 'Open settings',
    description:
      'Manage account, security, and workspace.',
    href: '/settings',
    icon: Settings,
  },
];

function getInitials(user: DashboardUser): string {
  const first =
    user.firstName?.trim()?.[0] || '';

  const last =
    user.lastName?.trim()?.[0] || '';

  const initials = `${first}${last}`.toUpperCase();

  if (initials) {
    return initials;
  }

  return user.email.slice(0, 2).toUpperCase();
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Not available';
  }

  try {
    return new Intl.DateTimeFormat('en-KE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return 'Not available';
  }
}

function normalizeStatus(value?: string | null): string {
  return String(value || 'unknown')
    .replace(/_/g, ' ')
    .trim();
}

function statusBadgeClass(status?: string | null): string {
  const value = String(status || '').toLowerCase();

  if (
    value === 'active' ||
    value === 'trialing' ||
    value === 'installed'
  ) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60';
  }

  if (
    value.includes('pending') ||
    value.includes('provisioning')
  ) {
    return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60';
  }

  if (
    value.includes('failed') ||
    value.includes('suspended') ||
    value.includes('cancelled')
  ) {
    return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60';
  }

  return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
}

export default function DashboardClient({
  user,
  tenant,
  subscription,
  role,
  modules,
  session,
}: DashboardClientProps) {
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const installedModules = useMemo(
    () =>
      modules.filter(
        (module) =>
          module.status.toLowerCase() ===
          'installed'
      ),
    [modules]
  );

  const pendingModules = useMemo(
    () =>
      modules.filter(
        (module) =>
          module.status.toLowerCase() !==
          'installed'
      ),
    [modules]
  );

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error(
        '[Dashboard] Logout failed:',
        error
      );
    } finally {
      router.replace('/login?reason=logged_out');
      router.refresh();
    }
  }

  const displayName =
    user.firstName ||
    user.fullName ||
    user.email;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="flex min-h-screen">
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar overlay"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          />
        )}

        <aside
          className={[
            'fixed inset-y-0 left-0 z-50 w-72 transform border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0',
            sidebarOpen
              ? 'translate-x-0'
              : '-translate-x-full',
          ].join(' ')}
        >
          <div className="flex h-full flex-col">
            <div className="flex h-20 items-center justify-between px-5">
              <Link
                href="/dashboard"
                className="flex items-center gap-3"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                  <SaMiLogo />
                </div>

                <div>
                  <p className="text-sm font-black">
                    SaMi
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Business Workspace
                  </p>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white dark:bg-white dark:text-slate-950">
                    {getInitials(user)}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">
                      {displayName}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {user.email}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <span
                    className={[
                      'inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1',
                      statusBadgeClass(
                        tenant?.status
                      ),
                    ].join(' ')}
                  >
                    {normalizeStatus(
                      tenant?.status
                    )}
                  </span>

                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {role?.name || 'Member'}
                  </span>
                </div>
              </div>
            </div>

            <nav className="mt-6 flex-1 space-y-1 px-4">
              {navigationItems.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={[
                      'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition',
                      item.active
                        ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/10 dark:bg-white dark:text-slate-950'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                    ].join(' ')}
                  >
                    <Icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {loggingOut ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <LogOut className="h-5 w-5" />
                )}
                Logout
              </button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85">
            <div className="flex h-20 items-center gap-4 px-4 sm:px-6 lg:px-8">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  Dashboard
                </p>

                <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">
                  Welcome back, {displayName}
                </h1>
              </div>

              <div className="hidden min-w-0 max-w-md flex-1 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-900 md:flex">
                <Search className="h-5 w-5 text-slate-400" />
                <input
                  placeholder="Search SaMi..."
                  className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none placeholder:text-slate-400"
                />
              </div>

              <button
                type="button"
                className="relative rounded-2xl border border-slate-200 bg-white p-3 text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-blue-500" />
              </button>
            </div>
          </header>

          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <section className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
              <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 ring-1 ring-white/10">
                      <Sparkles className="h-4 w-4" />
                      AI-powered business workspace
                    </div>

                    <h2 className="mt-6 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
                      {tenant?.name
                        ? `${tenant.name} is ready.`
                        : 'Your workspace is ready.'}
                    </h2>

                    <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">
                      Manage your apps, billing, security,
                      invoices, customers, reports, and future
                      AI tools from one SaMi account.
                    </p>
                  </div>

                  <Link
                    href="/settings"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-slate-200"
                  >
                    Workspace settings
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </div>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <ShieldCheck className="h-6 w-6" />
                  </div>

                  <div>
                    <p className="text-sm font-black">
                      Secure session
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {session.device.browser} on{' '}
                      {
                        session.device
                          .operatingSystem
                      }
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">
                      Device
                    </span>
                    <span className="font-bold capitalize">
                      {session.device.deviceType}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">
                      Last active
                    </span>
                    <span className="font-bold">
                      {formatDate(
                        session.device.lastActiveAt
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">
                      Expires
                    </span>
                    <span className="font-bold">
                      {formatDate(
                        session.expiresAt
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <span
                    className={[
                      'rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1',
                      statusBadgeClass(
                        tenant?.status
                      ),
                    ].join(' ')}
                  >
                    {normalizeStatus(
                      tenant?.status
                    )}
                  </span>
                </div>

                <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                  Workspace
                </p>
                <p className="mt-1 truncate text-2xl font-black">
                  {tenant?.name || 'No workspace'}
                </p>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <span
                    className={[
                      'rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1',
                      statusBadgeClass(
                        subscription?.status
                      ),
                    ].join(' ')}
                  >
                    {normalizeStatus(
                      subscription?.status
                    )}
                  </span>
                </div>

                <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                  Plan
                </p>
                <p className="mt-1 truncate text-2xl font-black">
                  {subscription?.planName ||
                    subscription?.planKey ||
                    'Free'}
                </p>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300">
                  <Database className="h-6 w-6" />
                </div>

                <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                  Installed apps
                </p>
                <p className="mt-1 text-2xl font-black">
                  {installedModules.length}
                </p>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                  <Activity className="h-6 w-6" />
                </div>

                <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                  Pending items
                </p>
                <p className="mt-1 text-2xl font-black">
                  {pendingModules.length}
                </p>
              </div>
            </section>

            <section className="mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-black">
                      Quick actions
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Start common business tasks.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {quickActions.map((action) => {
                    const Icon = action.icon;

                    return (
                      <Link
                        key={action.title}
                        href={action.href}
                        className="group rounded-3xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-lg dark:border-slate-800 dark:hover:bg-slate-950"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          <Icon className="h-5 w-5" />
                        </div>

                        <p className="mt-4 text-sm font-black">
                          {action.title}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {action.description}
                        </p>

                        <div className="mt-4 flex items-center gap-1 text-xs font-black text-blue-600 dark:text-blue-400">
                          Open
                          <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-black">
                      Installed apps
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Apps enabled for this workspace.
                    </p>
                  </div>

                  <Link
                    href="/apps"
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950"
                  >
                    Manage apps
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

                <div className="mt-6 space-y-3">
                  {modules.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                      <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
                      <p className="mt-3 text-sm font-black">
                        No apps found
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Your workspace has no enabled apps yet.
                      </p>
                    </div>
                  ) : (
                    modules.map((module) => (
                      <div
                        key={module.key}
                        className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 p-4 dark:border-slate-800"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <FileText className="h-5 w-5" />
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-black">
                              {module.name}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {module.key}
                            </p>
                          </div>
                        </div>

                        <span
                          className={[
                            'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1',
                            statusBadgeClass(
                              module.status
                            ),
                          ].join(' ')}
                        >
                          {normalizeStatus(
                            module.status
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-5 lg:grid-cols-3">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <Home className="h-5 w-5 text-slate-400" />
                  <h3 className="font-black">
                    Workspace
                  </h3>
                </div>

                <dl className="mt-5 space-y-4 text-sm">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Name
                    </dt>
                    <dd className="mt-1 font-bold">
                      {tenant?.name || 'Not available'}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Slug
                    </dt>
                    <dd className="mt-1 font-bold">
                      {tenant?.slug || 'Not available'}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Role
                    </dt>
                    <dd className="mt-1 font-bold">
                      {role?.name || 'Member'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-slate-400" />
                  <h3 className="font-black">
                    Subscription
                  </h3>
                </div>

                <dl className="mt-5 space-y-4 text-sm">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Status
                    </dt>
                    <dd className="mt-1 font-bold capitalize">
                      {normalizeStatus(
                        subscription?.status
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Billing cycle
                    </dt>
                    <dd className="mt-1 font-bold capitalize">
                      {subscription?.billingCycle ||
                        'Not available'}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Current period end
                    </dt>
                    <dd className="mt-1 font-bold">
                      {formatDate(
                        subscription?.currentPeriodEnd ||
                          null
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <LockKeyhole className="h-5 w-5 text-slate-400" />
                  <h3 className="font-black">
                    Security
                  </h3>
                </div>

                <dl className="mt-5 space-y-4 text-sm">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Browser
                    </dt>
                    <dd className="mt-1 font-bold">
                      {session.device.browser}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Operating system
                    </dt>
                    <dd className="mt-1 font-bold">
                      {
                        session.device
                          .operatingSystem
                      }
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      IP address
                    </dt>
                    <dd className="mt-1 font-bold">
                      {session.device.ipAddress}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

            <div className="mt-8 rounded-[2rem] border border-blue-200 bg-blue-50 p-5 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-black">
                    Dashboard connected to authentication
                  </p>
                  <p className="mt-1 text-sm leading-6 opacity-80">
                    Login, session, logout, workspace context,
                    subscription context, role context, and
                    installed modules are now flowing into the
                    dashboard.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}