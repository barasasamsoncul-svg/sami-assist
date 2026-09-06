'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AppWindow,
  ArrowRight,
  Bell,
  Bot,
  Building2,
  ChevronRight,
  Clock3,
  CreditCard,
  Crown,
  FileStack,
  Folder,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquare,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  Star,
  UserCog,
  UserRound,
  Users,
  WandSparkles,
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

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  adminOnly?: boolean;
};

type WorkItem = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const mainNav: NavItem[] = [
  {
    title: 'SaMi AI',
    href: '/ai',
    icon: Bot,
  },
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
];

const workspaceNav: NavItem[] = [
  {
    title: 'Workspace',
    href: '/settings/workspace',
    icon: Building2,
  },
  {
    title: 'Team',
    href: '/team',
    icon: Users,
    adminOnly: true,
  },
  {
    title: 'Files',
    href: '/files',
    icon: Folder,
  },
  {
    title: 'Notifications',
    href: '/notifications',
    icon: Bell,
  },
  {
    title: 'Integrations',
    href: '/integrations',
    icon: Plug,
    adminOnly: true,
  },
  {
    title: 'Billing',
    href: '/billing',
    icon: CreditCard,
    ownerOnly: true,
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

const yourWorkItems: WorkItem[] = [
  {
    title: 'Recent records',
    description: 'Records opened from your apps will appear here.',
    icon: Clock3,
  },
  {
    title: 'Recently opened apps',
    description: 'Quickly return to apps you use often.',
    icon: AppWindow,
  },
  {
    title: 'Assigned work',
    description: 'Tasks assigned to you by installed apps.',
    icon: ListChecks,
  },
  {
    title: 'Drafts',
    description: 'Unfinished records from your workspace.',
    icon: FileStack,
  },
  {
    title: 'Favorites',
    description: 'Pinned records and saved shortcuts.',
    icon: Star,
  },
];

const activityItems: WorkItem[] = [
  {
    title: 'Tasks requiring attention',
    description: 'Important items from your apps and workspace.',
    icon: Inbox,
  },
  {
    title: 'Mentions',
    description: 'Comments and mentions will appear here.',
    icon: MessageSquare,
  },
  {
    title: 'Approvals',
    description: 'Approvals requested by apps will appear here.',
    icon: ListChecks,
  },
  {
    title: 'Reminders',
    description: 'Follow-ups and scheduled reminders.',
    icon: Bell,
  },
  {
    title: 'Recent activity',
    description: 'Workspace activity will appear here.',
    icon: Clock3,
  },
];

function canSeeItem(
  item: NavItem,
  membership: DashboardMembership
): boolean {
  if (item.ownerOnly && !membership?.isOwner) {
    return false;
  }

  if (item.adminOnly && !membership?.isAdmin) {
    return false;
  }

  return true;
}

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

function statusClass(status?: string | null): string {
  const value = String(status || '').toLowerCase();

  if (
    value === 'active' ||
    value === 'trialing' ||
    value === 'installed' ||
    value === 'enabled'
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
    value.includes('cancelled') ||
    value.includes('expired') ||
    value.includes('suspended') ||
    value.includes('disabled')
  ) {
    return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60';
  }

  return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
}

function accessClass(access?: string | null): string {
  if (access === 'owner') {
    return 'bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:ring-yellow-900/60';
  }

  if (access === 'admin') {
    return 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60';
  }

  return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
}

function getAccessIcon(access?: string | null): LucideIcon {
  if (access === 'owner') {
    return Crown;
  }

  if (access === 'admin') {
    return UserCog;
  }

  return UserRound;
}

function appHref(moduleKey: string): string {
  return `/apps/${encodeURIComponent(moduleKey)}`;
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

  const AccessIcon = getAccessIcon(membership?.accessLevel);

  const apps = useMemo(
    () =>
      modules.filter(
        (module) =>
          !['failed', 'disabled'].includes(
            module.status.toLowerCase()
          )
      ),
    [modules]
  );

  const visibleWorkspaceNav = useMemo(
    () =>
      workspaceNav.filter((item) =>
        canSeeItem(item, membership)
      ),
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
          'fixed inset-y-0 left-0 z-50 w-80 border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-20 items-center justify-between px-5">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <SaMiLogo />
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-black tracking-tight">
                  SaMi
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  AI business workspace
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
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white dark:bg-white dark:text-slate-950">
                  {getInitials(user)}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {tenant?.name || user.email}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className={[
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black capitalize ring-1',
                    accessClass(membership?.accessLevel),
                  ].join(' ')}
                >
                  <AccessIcon className="h-3.5 w-3.5" />
                  {membership?.accessLevel || 'member'}
                </span>

                <span
                  className={[
                    'inline-flex rounded-full px-2.5 py-1 text-xs font-black capitalize ring-1',
                    statusClass(tenant?.status),
                  ].join(' ')}
                >
                  {normalizeStatus(tenant?.status)}
                </span>
              </div>
            </div>
          </div>

          <nav className="mt-5 flex-1 overflow-y-auto px-4 pb-4">
            <div className="space-y-1">
              {mainNav.map((item) => {
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
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between px-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  Apps
                </p>

                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {apps.length}
                </span>
              </div>

              <div className="space-y-1">
                {apps.length === 0 ? (
                  <Link
                    href="/apps"
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    <AppWindow className="h-5 w-5" />
                    Choose apps
                  </Link>
                ) : (
                  apps.map((app) => (
                    <Link
                      key={app.key}
                      href={appHref(app.key)}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <AppWindow className="h-5 w-5 shrink-0" />

                      <span className="min-w-0 flex-1 truncate">
                        {app.name}
                      </span>

                      <span
                        className={[
                          'h-2 w-2 shrink-0 rounded-full',
                          app.status.toLowerCase() === 'installed' ||
                          app.status.toLowerCase() === 'enabled' ||
                          app.status.toLowerCase() === 'active'
                            ? 'bg-emerald-500'
                            : 'bg-amber-500',
                        ].join(' ')}
                      />
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="mt-6">
              <p className="mb-2 px-3 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Workspace
              </p>

              <div className="space-y-1">
                {visibleWorkspaceNav.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <Icon className="h-5 w-5" />
                      {item.title}
                    </Link>
                  );
                })}
              </div>
            </div>
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

      <section className="min-h-screen lg:pl-80">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
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
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                SaMi Workspace
              </p>

              <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">
                {tenant?.name || 'Business workspace'}
              </h1>
            </div>

            <div className="hidden min-w-0 max-w-xl flex-1 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-900 md:flex">
              <Search className="h-5 w-5 text-slate-400" />

              <input
                placeholder="Search SaMi..."
                className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none placeholder:text-slate-400"
              />
            </div>

            <Link
              href="/notifications"
              className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </Link>

            <Link
              href="/help"
              className="hidden rounded-2xl border border-slate-200 bg-white p-3 text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:block"
              aria-label="Help"
            >
              <HelpCircle className="h-5 w-5" />
            </Link>
          </div>
        </header>

        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <WandSparkles className="h-4 w-4" />
                  AI-powered business workspace
                </p>

                <h2 className="mt-5 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">
                  Welcome back, {displayName}.
                </h2>

                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500 dark:text-slate-400 sm:text-base">
                  Here’s what’s happening in your workspace.
                  Open an app, ask SaMi, review your work, or
                  continue where you left off.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/ai"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  Ask SaMi
                  <ArrowRight className="h-5 w-5" />
                </Link>

                <Link
                  href="/apps"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-800 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  View all apps
                  <AppWindow className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </section>

          <section className="mt-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black">
                  Apps
                </h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Open the apps enabled for this workspace.
                </p>
              </div>

              <Link
                href="/apps"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                View all apps
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {apps.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
                <AppWindow className="mx-auto h-10 w-10 text-slate-400" />

                <p className="mt-4 text-base font-black">
                  No apps enabled yet
                </p>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Once this workspace has apps installed, they will
                  appear here as your main launcher.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                {apps.map((app) => (
                  <Link
                    key={app.key}
                    href={appHref(app.key)}
                    className="group rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-950"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                        <AppWindow className="h-7 w-7" />
                      </div>

                      <span
                        className={[
                          'rounded-full px-2.5 py-1 text-xs font-black capitalize ring-1',
                          statusClass(app.status),
                        ].join(' ')}
                      >
                        {normalizeStatus(app.status)}
                      </span>
                    </div>

                    <p className="mt-5 truncate text-base font-black">
                      {app.name}
                    </p>

                    <div className="mt-4 flex items-center gap-1 text-xs font-black text-blue-600 dark:text-blue-400">
                      Open app
                      <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-2">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black">
                    Your work
                  </h2>

                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    A personal workspace view across your apps.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {yourWorkItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.title}
                      className="flex items-start gap-3 rounded-3xl border border-slate-200 p-4 dark:border-slate-800"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black">
                    Activity
                  </h2>

                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Updates, reminders, approvals, and mentions.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {activityItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.title}
                      className="flex items-start gap-3 rounded-3xl border border-slate-200 p-4 dark:border-slate-800"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-950">
                  <Bot className="h-6 w-6" />
                </div>

                <div>
                  <h2 className="text-lg font-black">
                    SaMi AI
                  </h2>

                  <p className="mt-1 text-sm text-white/60">
                    Ask anything about your workspace.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm leading-6 text-white/75">
                  “What needs my attention today?”
                </p>
              </div>

              <Link
                href="/ai"
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-slate-200"
              >
                Ask SaMi
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black">
                    Dynamic insights
                  </h2>

                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Apps can register widgets here when available.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl border border-dashed border-slate-300 p-5 dark:border-slate-700">
                  <AppWindow className="h-5 w-5 text-slate-400" />

                  <p className="mt-4 text-sm font-black">
                    App widget slot
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Installed apps will provide insights here.
                  </p>
                </div>

                <div className="rounded-3xl border border-dashed border-slate-300 p-5 dark:border-slate-700">
                  <WandSparkles className="h-5 w-5 text-slate-400" />

                  <p className="mt-4 text-sm font-black">
                    AI insight slot
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    SaMi AI can summarize app activity here.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <Building2 className="h-5 w-5 text-slate-400" />

              <p className="mt-4 text-sm font-black">
                Workspace
              </p>

              <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                {tenant?.name || 'Not available'}
              </p>
            </div>

            <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <Crown className="h-5 w-5 text-slate-400" />

              <p className="mt-4 text-sm font-black">
                Owner
              </p>

              <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                {getOwnerName(owner)}
              </p>
            </div>

            <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <LockKeyhole className="h-5 w-5 text-slate-400" />

              <p className="mt-4 text-sm font-black">
                Secure session
              </p>

              <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                {session.device.browser} on{' '}
                {session.device.operatingSystem}
              </p>
            </div>
          </section>

          <section className="mt-6 flex flex-wrap items-center justify-between gap-3 pb-4 text-xs text-slate-500 dark:text-slate-400">
            <p>SaMi · AI-powered business workspace</p>

            <div className="flex flex-wrap items-center gap-4">
              <span className="capitalize">
                {subscription?.planName ||
                  subscription?.planKey ||
                  'Free'}{' '}
                plan
              </span>

              <span className="capitalize">
                {membership?.accessLevel || 'member'}
              </span>

              <Link
                href="/settings"
                className="font-bold hover:text-slate-950 dark:hover:text-white"
              >
                Settings
              </Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}