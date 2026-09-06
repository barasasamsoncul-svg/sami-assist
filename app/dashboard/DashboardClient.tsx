'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AppWindow,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Crown,
  FileText,
  Folder,
  Grid2X2,
  LayoutDashboard,
  LifeBuoy,
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

type SidebarItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  adminOnly?: boolean;
};

type WorkspaceCard = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  adminOnly?: boolean;
  badge?: string;
};

const mainSidebarItems: SidebarItem[] = [
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

const workspaceSidebarItems: SidebarItem[] = [
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
    title: 'Reports',
    href: '/reports',
    icon: BarChart3,
  },
  {
    title: 'Billing',
    href: '/billing',
    icon: CreditCard,
    ownerOnly: true,
  },
  {
    title: 'Integrations',
    href: '/integrations',
    icon: Plug,
    adminOnly: true,
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

const workspaceCards: WorkspaceCard[] = [
  {
    title: 'SaMi AI',
    description:
      'Ask questions, summarize work, search knowledge, and automate tasks.',
    href: '/ai',
    icon: Bot,
    badge: 'Core',
  },
  {
    title: 'Selected Apps',
    description:
      'Open and manage apps selected for this business workspace.',
    href: '/apps',
    icon: AppWindow,
    badge: 'Dynamic',
  },
  {
    title: 'Workspace',
    description:
      'Manage business profile, workspace identity, and preferences.',
    href: '/settings/workspace',
    icon: Building2,
  },
  {
    title: 'Team & Access',
    description:
      'Invite people, manage roles, and control workspace access.',
    href: '/team',
    icon: Users,
    adminOnly: true,
  },
  {
    title: 'Files & Knowledge',
    description:
      'Store documents and prepare business knowledge for SaMi AI.',
    href: '/files',
    icon: Folder,
  },
  {
    title: 'Reports',
    description:
      'View workspace summaries, insights, and future AI reports.',
    href: '/reports',
    icon: BarChart3,
  },
  {
    title: 'Billing',
    description:
      'Manage subscription, plan, payments, and billing status.',
    href: '/billing',
    icon: CreditCard,
    ownerOnly: true,
  },
  {
    title: 'Integrations',
    description:
      'Connect tools such as payment gateways, email, APIs, and webhooks.',
    href: '/integrations',
    icon: Plug,
    adminOnly: true,
  },
  {
    title: 'Security',
    description:
      'Review sessions, devices, password, MFA, and login activity.',
    href: '/settings/security',
    icon: ShieldCheck,
  },
  {
    title: 'Settings',
    description:
      'Control profile, appearance, notifications, and account settings.',
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

function getAccessIcon(accessLevel?: string | null): LucideIcon {
  if (accessLevel === 'owner') {
    return Crown;
  }

  if (accessLevel === 'admin') {
    return UserCog;
  }

  return Users;
}

function buildAppHref(moduleKey: string): string {
  const params = new URLSearchParams();

  params.set('module', moduleKey);

  return `/apps?${params.toString()}`;
}

function canSeeItem(
  item: {
    ownerOnly?: boolean;
    adminOnly?: boolean;
  },
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

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

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

  const visibleWorkspaceItems = useMemo(
    () =>
      workspaceSidebarItems.filter((item) =>
        canSeeItem(item, membership)
      ),
    [membership]
  );

  const visibleWorkspaceCards = useMemo(
    () =>
      workspaceCards.filter((card) =>
        canSeeItem(card, membership)
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

  function renderSidebarContent() {
    return (
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
              <p className="text-sm font-black tracking-tight">
                SaMi
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AI Workspace
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
                  {tenant?.name || user.email}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
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

        <nav className="mt-5 flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-1">
            {mainSidebarItems.map((item) => {
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
                Selected Apps
              </p>

              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {installedModules.length}
              </span>
            </div>

            <div className="space-y-1">
              {installedModules.length === 0 ? (
                <Link
                  href="/apps"
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <Grid2X2 className="h-5 w-5" />
                  No apps selected
                </Link>
              ) : (
                installedModules.map((module) => (
                  <Link
                    key={module.key}
                    href={buildAppHref(module.key)}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    <AppWindow className="h-5 w-5" />
                    <span className="min-w-0 flex-1 truncate">
                      {module.name}
                    </span>
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
              {visibleWorkspaceItems.map((item) => {
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
    );
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
          'fixed inset-y-0 left-0 z-50 w-80 transform border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {renderSidebarContent()}
      </aside>

      <section className="min-h-screen lg:pl-80">
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
                SaMi Workspace
              </p>

              <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">
                {tenant?.name || 'Business Workspace'}
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
            <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 left-20 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />

              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 ring-1 ring-white/10">
                  <Sparkles className="h-4 w-4" />
                  AI-powered business workspace
                </div>

                <h2 className="mt-6 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">
                  Work faster with SaMi AI and your selected business apps.
                </h2>

                <p className="mt-4 max-w-3xl text-sm leading-7 text-white/60 sm:text-base">
                  SaMi brings your workspace, AI assistant,
                  selected apps, files, team access, billing,
                  reports, integrations, security, and settings
                  into one professional business platform.
                </p>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/ai"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-slate-200"
                  >
                    Open SaMi AI
                    <ArrowRight className="h-5 w-5" />
                  </Link>

                  <Link
                    href="/apps"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/15"
                  >
                    View selected apps
                    <AppWindow className="h-5 w-5" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div
                  className={[
                    'flex h-12 w-12 items-center justify-center rounded-2xl ring-1',
                    accessBadgeClass(membership?.accessLevel),
                  ].join(' ')}
                >
                  <AccessIcon className="h-6 w-6" />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black">
                    {membership?.label || 'Workspace Member'}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {user.email}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Owner
                  </p>
                  <p className="mt-1 truncate text-sm font-black">
                    {getOwnerName(owner)}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Access
                  </p>
                  <p className="mt-1 text-sm font-black capitalize">
                    {membership?.accessLevel || 'member'}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Plan
                  </p>
                  <p className="mt-1 truncate text-sm font-black">
                    {subscription?.planName ||
                      subscription?.planKey ||
                      'Free'}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Apps
                  </p>
                  <p className="mt-1 text-sm font-black">
                    {installedModules.length} selected
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-300" />
              <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                Workspace
              </p>
              <p className="mt-1 truncate text-2xl font-black">
                {tenant?.name || 'No workspace'}
              </p>
              <span
                className={[
                  'mt-4 inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1',
                  statusBadgeClass(tenant?.status),
                ].join(' ')}
              >
                {normalizeStatus(tenant?.status)}
              </span>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <Bot className="h-6 w-6 text-violet-600 dark:text-violet-300" />
              <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                SaMi AI
              </p>
              <p className="mt-1 text-2xl font-black">
                Ready
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Your AI workspace entry point.
              </p>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <AppWindow className="h-6 w-6 text-cyan-600 dark:text-cyan-300" />
              <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                Selected Apps
              </p>
              <p className="mt-1 text-2xl font-black">
                {installedModules.length}
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Loaded dynamically from your workspace.
              </p>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-300" />
              <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                Security
              </p>
              <p className="mt-1 truncate text-2xl font-black">
                {session.device.browser}
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {session.device.operatingSystem} ·{' '}
                {session.device.deviceType}
              </p>
            </div>
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_0.9fr]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-black">
                    Workspace areas
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Core areas of your SaMi business workspace.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {visibleWorkspaceCards.map((card) => {
                  const Icon = card.icon;

                  return (
                    <Link
                      key={card.title}
                      href={card.href}
                      className="group rounded-3xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-lg dark:border-slate-800 dark:hover:bg-slate-950"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          <Icon className="h-5 w-5" />
                        </div>

                        {card.badge && (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                            {card.badge}
                          </span>
                        )}
                      </div>

                      <p className="mt-4 text-sm font-black">
                        {card.title}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {card.description}
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

            <div className="space-y-5">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-black">
                      Selected apps
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Apps selected for this workspace.
                    </p>
                  </div>

                  <Link
                    href="/apps"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950"
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
                        Apps chosen during registration will
                        appear here.
                      </p>
                    </div>
                  ) : (
                    modules.map((module) => (
                      <Link
                        key={module.key}
                        href={buildAppHref(module.key)}
                        className="group flex items-center justify-between gap-4 rounded-3xl border border-slate-200 p-4 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <BriefcaseBusiness className="h-5 w-5" />
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-black">
                              {module.name}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              Workspace app
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={[
                              'rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1',
                              statusBadgeClass(module.status),
                            ].join(' ')}
                          >
                            {normalizeStatus(module.status)}
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
                  <LockKeyhole className="h-5 w-5 text-slate-400" />
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

          <section className="mt-6 grid gap-5 md:grid-cols-3">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <Crown className="h-5 w-5 text-slate-400" />
              <p className="mt-4 text-sm font-black">
                Workspace owner
              </p>
              <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                {getOwnerName(owner)}
              </p>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <CreditCard className="h-5 w-5 text-slate-400" />
              <p className="mt-4 text-sm font-black">
                Subscription
              </p>
              <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                {subscription?.planName ||
                  subscription?.planKey ||
                  'Free'}{' '}
                · {normalizeStatus(subscription?.status)}
              </p>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <FileText className="h-5 w-5 text-slate-400" />
              <p className="mt-4 text-sm font-black">
                Session expires
              </p>
              <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                {formatDate(session.expiresAt)}
              </p>
            </div>
          </section>

          <section className="mt-6 rounded-[2rem] border border-blue-200 bg-blue-50 p-5 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

              <div>
                <p className="text-sm font-black">
                  SaMi workspace shell is now platform-safe
                </p>

                <p className="mt-1 text-sm leading-6 opacity-80">
                  The sidebar is fixed on desktop, mobile-friendly,
                  AI-first, and module-safe. Selected apps come
                  dynamically from the workspace modules, while the
                  core platform remains stable.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-6 flex flex-wrap items-center justify-between gap-3 pb-4 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/help"
                className="inline-flex items-center gap-1 font-bold hover:text-slate-950 dark:hover:text-white"
              >
                <LifeBuoy className="h-4 w-4" />
                Help
              </Link>

              <Link
                href="/settings"
                className="inline-flex items-center gap-1 font-bold hover:text-slate-950 dark:hover:text-white"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>

              <Link
                href="/communications"
                className="inline-flex items-center gap-1 font-bold hover:text-slate-950 dark:hover:text-white"
              >
                <Mail className="h-4 w-4" />
                Communications
              </Link>
            </div>

            <p>
              SaMi · AI-powered business workspace
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}