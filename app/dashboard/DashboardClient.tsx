'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AppWindow,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Crown,
  FileText,
  Folder,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  X,
  type LucideIcon,
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

type DashboardOwner = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  roleKey: string | null;
  roleName: string | null;
} | null;

type DashboardMembership = {
  userId: string;
  tenantId: string;
  accessLevel: 'owner' | 'admin' | 'member';
  isOwner: boolean;
  isAdmin: boolean;
  label: string;
} | null;

type DashboardSubscription = {
  id: string;
  status: string;
  billingCycle: string | null;
  currentPeriodEnd: string | null;
  planKey: string | null;
  planName: string | null;
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
    deviceType: string;
    browser: string;
    operatingSystem: string;
    lastActiveAt: string | null;
  };
};

type DashboardClientProps = {
  user: DashboardUser;
  tenant: DashboardTenant;
  owner: DashboardOwner;
  membership: DashboardMembership;
  subscription: DashboardSubscription;
  modules: DashboardModule[];
  session: DashboardSession;
};

type PlatformCategory = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: 'ready' | 'coming-soon';
  ownerOnly?: boolean;
  adminOnly?: boolean;
};

const platformCategories: PlatformCategory[] = [
  {
    title: 'Workspace',
    description:
      'Manage business profile, workspace details, and company identity.',
    href: '/settings/workspace',
    icon: Building2,
    status: 'ready',
  },
  {
    title: 'Apps',
    description:
      'View selected modules enabled for this workspace.',
    href: '/apps',
    icon: AppWindow,
    status: 'ready',
  },
  {
    title: 'Team & Access',
    description:
      'Invite members, manage roles, and control permissions.',
    href: '/team',
    icon: Users,
    status: 'coming-soon',
    adminOnly: true,
  },
  {
    title: 'Billing',
    description:
      'Manage plan, subscription, payments, and billing status.',
    href: '/billing',
    icon: CreditCard,
    status: 'coming-soon',
    ownerOnly: true,
  },
  {
    title: 'Security',
    description:
      'Manage sessions, password, login activity, and account safety.',
    href: '/settings/security',
    icon: ShieldCheck,
    status: 'ready',
  },
  {
    title: 'AI Workspace',
    description:
      'SaMi AI assistant, memory, automation, and smart workspace tools.',
    href: '/ai',
    icon: Bot,
    status: 'coming-soon',
  },
  {
    title: 'Files',
    description:
      'Documents, uploads, attachments, and workspace storage.',
    href: '/files',
    icon: Folder,
    status: 'coming-soon',
  },
  {
    title: 'Communications',
    description:
      'Email, SMS, WhatsApp, notifications, and customer messages.',
    href: '/communications',
    icon: Mail,
    status: 'coming-soon',
  },
  {
    title: 'Integrations',
    description:
      'Connect payment gateways, Google, Microsoft, APIs, and webhooks.',
    href: '/integrations',
    icon: Plug,
    status: 'coming-soon',
  },
  {
    title: 'Reports',
    description:
      'Workspace summaries, performance insights, and exports.',
    href: '/reports',
    icon: BarChart3,
    status: 'coming-soon',
  },
  {
    title: 'Settings',
    description:
      'Account preferences, profile, appearance, and platform settings.',
    href: '/settings',
    icon: Settings,
    status: 'ready',
  },
];

const sidebarItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Workspace',
    href: '/settings/workspace',
    icon: Building2,
  },
  {
    title: 'Apps',
    href: '/apps',
    icon: AppWindow,
  },
  {
    title: 'Security',
    href: '/settings/security',
    icon: ShieldCheck,
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
  },
];

function getDisplayName(user: DashboardUser): string {
  return user.firstName || user.fullName || user.email;
}

function getInitials(user: DashboardUser): string {
  const first = user.firstName?.trim()?.[0] || '';
  const last = user.lastName?.trim()?.[0] || '';
  const initials = `${first}${last}`.toUpperCase();

  return initials || user.email.slice(0, 2).toUpperCase();
}

function getOwnerName(owner: DashboardOwner): string {
  if (!owner) {
    return 'Not assigned';
  }

  return owner.firstName || owner.fullName || owner.email;
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
    value === 'installed' ||
    value === 'ready'
  ) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60';
  }

  if (
    value.includes('pending') ||
    value.includes('provisioning') ||
    value.includes('soon')
  ) {
    return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60';
  }

  if (
    value.includes('failed') ||
    value.includes('suspended') ||
    value.includes('cancelled') ||
    value.includes('expired')
  ) {
    return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60';
  }

  return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
}

function accessBadgeClass(accessLevel?: string | null): string {
  if (accessLevel === 'owner') {
    return 'bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:ring-yellow-900/60';
  }

  if (accessLevel === 'admin') {
    return 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60';
  }

  return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
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

function buildModuleHref(moduleKey: string): string {
  const params = new URLSearchParams();
  params.set('module', moduleKey);

  return `/apps?${params.toString()}`;
}

function getAccessIcon(accessLevel?: string | null): LucideIcon {
  if (accessLevel === 'owner') {
    return Crown;
  }

  if (accessLevel === 'admin') {
    return UserCog;
  }

  return Users;
}

export default function DashboardClient({
  user,
  tenant,
  owner,
  membership,
  subscription,
  modules,
  session,
}: DashboardClientProps) {
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const displayName = getDisplayName(user);

  const AccessIcon = getAccessIcon(
    membership?.accessLevel
  );

  const installedModules = useMemo(
    () =>
      modules.filter(
        (module) =>
          module.status.toLowerCase() === 'installed'
      ),
    [modules]
  );

  const visibleCategories = useMemo(
    () =>
      platformCategories.filter((category) => {
        if (category.ownerOnly && !membership?.isOwner) {
          return false;
        }

        if (category.adminOnly && !membership?.isAdmin) {
          return false;
        }

        return true;
      }),
    [membership]
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
      console.error('[Dashboard] Logout failed:', error);
    } finally {
      router.replace('/login?reason=logged_out');
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="flex min-h-screen">
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
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
                    Workspace
                  </p>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
                aria-label="Close sidebar"
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

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1',
                      accessBadgeClass(
                        membership?.accessLevel
                      ),
                    ].join(' ')}
                  >
                    <AccessIcon className="h-3.5 w-3.5" />
                    {membership?.accessLevel || 'member'}
                  </span>

                  <span
                    className={[
                      'inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1',
                      statusBadgeClass(tenant?.status),
                    ].join(' ')}
                  >
                    {normalizeStatus(tenant?.status)}
                  </span>
                </div>
              </div>
            </div>

            <nav className="mt-6 flex-1 space-y-1 px-4">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const active = item.href === '/dashboard';

                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    className={[
                      'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition',
                      active
                        ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/10 dark:bg-white dark:text-slate-950'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                    ].join(' ')}
                  >
                    <Icon className="h-5 w-5" />
                    {item.title}
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
                aria-label="Open sidebar"
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
                  placeholder="Search workspace..."
                  className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none placeholder:text-slate-400"
                />
              </div>

              <button
                type="button"
                className="relative rounded-2xl border border-slate-200 bg-white p-3 text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 ring-1 ring-white/10">
                      <Sparkles className="h-4 w-4" />
                      SaMi business workspace
                    </div>

                    <h2 className="mt-6 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
                      {tenant?.name
                        ? `${tenant.name} is ready.`
                        : 'Your workspace is ready.'}
                    </h2>

                    <p className="mt-4 max-w-3xl text-sm leading-7 text-white/60">
                      Manage your workspace, selected apps,
                      team access, billing, security, files,
                      AI tools, integrations, and settings from
                      one clean platform dashboard.
                    </p>
                  </div>

                  <Link
                    href="/apps"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-slate-200"
                  >
                    View selected apps
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </div>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <div
                    className={[
                      'flex h-12 w-12 items-center justify-center rounded-2xl ring-1',
                      accessBadgeClass(
                        membership?.accessLevel
                      ),
                    ].join(' ')}
                  >
                    <AccessIcon className="h-6 w-6" />
                  </div>

                  <div>
                    <p className="text-sm font-black">
                      {membership?.label ||
                        'Workspace Member'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Owner: {getOwnerName(owner)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Access
                    </p>
                    <p className="mt-1 font-black capitalize">
                      {membership?.accessLevel || 'member'}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Admin
                    </p>
                    <p className="mt-1 font-black">
                      {membership?.isAdmin ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <Building2 className="h-6 w-6" />
                  </div>

                  <span
                    className={[
                      'rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1',
                      statusBadgeClass(tenant?.status),
                    ].join(' ')}
                  >
                    {normalizeStatus(tenant?.status)}
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
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300">
                    <AppWindow className="h-6 w-6" />
                  </div>

                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                    Selected
                  </span>
                </div>

                <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                  Apps
                </p>

                <p className="mt-1 text-2xl font-black">
                  {installedModules.length}
                </p>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
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
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <LockKeyhole className="h-6 w-6" />
                  </div>

                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                    Active
                  </span>
                </div>

                <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                  Session
                </p>

                <p className="mt-1 truncate text-2xl font-black">
                  {session.device.browser}
                </p>
              </div>
            </section>

            <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_0.9fr]">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-black">
                      SaMi categories
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Core platform areas available to this
                      workspace.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {visibleCategories.map((category) => {
                    const Icon = category.icon;
                    const disabled =
                      category.status === 'coming-soon';

                    const content = (
                      <div
                        className={[
                          'group h-full rounded-3xl border border-slate-200 p-4 transition dark:border-slate-800',
                          disabled
                            ? 'opacity-75'
                            : 'hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-lg dark:hover:bg-slate-950',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <Icon className="h-5 w-5" />
                          </div>

                          <span
                            className={[
                              'rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1',
                              statusBadgeClass(
                                category.status
                              ),
                            ].join(' ')}
                          >
                            {category.status.replace('-', ' ')}
                          </span>
                        </div>

                        <p className="mt-4 text-sm font-black">
                          {category.title}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {category.description}
                        </p>

                        {!disabled && (
                          <div className="mt-4 flex items-center gap-1 text-xs font-black text-blue-600 dark:text-blue-400">
                            Open
                            <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                          </div>
                        )}
                      </div>
                    );

                    if (disabled) {
                      return (
                        <div key={category.title}>
                          {content}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={category.title}
                        href={category.href}
                      >
                        {content}
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-black">
                        Selected apps
                      </h2>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Only selected modules appear here.
                      </p>
                    </div>

                    <Link
                      href="/apps"
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950"
                    >
                      Manage
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>

                  <div className="mt-6 space-y-3">
                    {modules.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                        <AppWindow className="mx-auto h-8 w-8 text-slate-400" />
                        <p className="mt-3 text-sm font-black">
                          No selected apps
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Apps selected during registration will
                          appear here.
                        </p>
                      </div>
                    ) : (
                      modules.map((module) => (
                        <Link
                          key={module.key}
                          href={buildModuleHref(module.key)}
                          className="group flex items-center justify-between gap-4 rounded-3xl border border-slate-200 p-4 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              <AppWindow className="h-5 w-5" />
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-black">
                                {module.name}
                              </p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                Selected module
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={[
                                'rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1',
                                statusBadgeClass(
                                  module.status
                                ),
                              ].join(' ')}
                            >
                              {normalizeStatus(
                                module.status
                              )}
                            </span>

                            <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-slate-400" />
                    <h3 className="font-black">
                      Account security
                    </h3>
                  </div>

                  <div className="mt-5 space-y-4 text-sm">
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
                        Browser
                      </span>
                      <span className="font-bold">
                        {session.device.browser}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500 dark:text-slate-400">
                        System
                      </span>
                      <span className="font-bold">
                        {session.device.operatingSystem}
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
                  </div>

                  <Link
                    href="/settings/security"
                    className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    Security settings
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-[2rem] border border-blue-200 bg-blue-50 p-5 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

                <div>
                  <p className="text-sm font-black">
                    Dashboard corrected to user-facing SaMi categories
                  </p>

                  <p className="mt-1 text-sm leading-6 opacity-80">
                    This page no longer exposes internal database
                    names, table names, or engineering architecture.
                    Business modules like invoices, customers,
                    products, POS, CRM, and inventory are not
                    hardcoded. They only appear dynamically when
                    selected as workspace apps.
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-5 md:grid-cols-3">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <Building2 className="h-5 w-5 text-slate-400" />
                <p className="mt-4 text-sm font-black">
                  Workspace owner
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {getOwnerName(owner)}
                </p>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <Clock className="h-5 w-5 text-slate-400" />
                <p className="mt-4 text-sm font-black">
                  Session expires
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {formatDate(session.expiresAt)}
                </p>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <FileText className="h-5 w-5 text-slate-400" />
                <p className="mt-4 text-sm font-black">
                  Billing cycle
                </p>
                <p className="mt-1 text-sm capitalize text-slate-500 dark:text-slate-400">
                  {subscription?.billingCycle ||
                    'Not available'}
                </p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}