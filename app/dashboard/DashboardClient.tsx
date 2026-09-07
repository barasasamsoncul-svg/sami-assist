'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AppWindow,
  Bell,
  Bot,
  ChevronRight,
  FileText,
  Folder,
  HelpCircle,
  Home,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  Star,
  UserRound,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import SaMiLogo from '@/app/components/SaMiLogo';

type UserData = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
};

type TenantData = { id: string; name: string; slug: string; status: string } | null;
type MembershipData = { accessLevel: 'owner' | 'admin' | 'member'; isOwner: boolean; isAdmin: boolean; label: string } | null;
type SubscriptionData = { status: string; planKey: string | null; planName: string | null } | null;
type ModuleData = { key: string; name: string; status: string };

type Props = {
  user: UserData;
  tenant: TenantData;
  membership: MembershipData;
  subscription: SubscriptionData;
  modules: ModuleData[];
};

export default function DashboardClient({ user, tenant, membership, subscription, modules }: Props) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const installedApps = useMemo(
    () => modules.filter((module) => !['disabled', 'failed', 'uninstalled'].includes(String(module.status).toLowerCase())),
    [modules]
  );

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      router.replace('/login?reason=logged_out');
      router.refresh();
    }
  }

  const displayName = user.firstName || user.fullName || user.email;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#080B12] dark:text-white">
      <div className="flex min-h-screen">
        {sidebarOpen && <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />}

        <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-950 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex h-20 items-center justify-between px-5">
            <Link href="/dashboard"><SaMiLogo size="sm" showTagline={false} /></Link>
            <button type="button" onClick={() => setSidebarOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"><X className="h-5 w-5" /></button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-4">
            <NavLink href="/dashboard" icon={Home} label="Dashboard" active />
            <NavLink href="/ai" icon={Bot} label="SaMi AI" />

            <div className="mt-7 px-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Apps</div>
            <div className="mt-2 space-y-1">
              {installedApps.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Installed apps will appear here.</div>
              ) : (
                installedApps.slice(0, 8).map((module) => <NavLink key={module.key} href={`/apps?app=${encodeURIComponent(module.key)}`} icon={AppWindow} label={module.name} />)
              )}
            </div>

            <div className="mt-7 px-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Workspace</div>
            <div className="mt-2 space-y-1">
              <NavLink href="/files" icon={Folder} label="Files" />
              <NavLink href="/notifications" icon={Bell} label="Notifications" />
              <NavLink href="/settings" icon={Settings} label="Settings" />
            </div>
          </nav>

          <div className="border-t border-slate-200 p-4 dark:border-slate-800">
            <div className="mb-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
              <p className="truncate text-sm font-bold">{displayName}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{tenant?.name || 'Workspace'}</p>
            </div>
            <button type="button" onClick={logout} disabled={loggingOut} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
              <LogOut className="h-4 w-4" />
              {loggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1 lg:pl-[280px]">
          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-[#080B12]/90">
            <div className="flex h-20 items-center gap-4 px-4 sm:px-6 lg:px-8">
              <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"><Menu className="h-5 w-5" /></button>

              <div className="relative max-w-xl flex-1">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input placeholder="Search SaMi" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900" />
              </div>

              <Link href="/help" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><HelpCircle className="h-5 w-5" /></Link>
              <Link href="/notifications" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Bell className="h-5 w-5" /></Link>
              <Link href="/settings" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950"><UserRound className="h-5 w-5" /></Link>
            </div>
          </header>

          <div className="px-4 py-7 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">{tenant?.name || 'SaMi Workspace'}</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight">Welcome, {displayName}</h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Open an app, continue your work or ask SaMi AI.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="font-bold">{subscription?.planName || subscription?.planKey || 'Free'} plan</p>
                <p className="text-xs capitalize text-slate-500 dark:text-slate-400">{membership?.label || membership?.accessLevel || 'Member'}</p>
              </div>
            </div>

            <section className="mt-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black">Quick Access</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your installed SaMi apps.</p>
                </div>
                <Link href="/apps" className="text-sm font-bold text-blue-600 dark:text-blue-400">View apps</Link>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {installedApps.length === 0 ? (
                  <div className="sm:col-span-2 xl:col-span-4 rounded-[24px] border border-dashed border-slate-300 bg-white p-7 text-center dark:border-slate-700 dark:bg-slate-900">
                    <AppWindow className="mx-auto h-8 w-8 text-slate-400" />
                    <p className="mt-3 text-sm font-bold">No apps installed yet</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Installed modules will appear here automatically.</p>
                  </div>
                ) : (
                  installedApps.map((module) => (
                    <Link key={module.key} href={`/apps?app=${encodeURIComponent(module.key)}`} className="group rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"><AppWindow className="h-5 w-5" /></div>
                        <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                      </div>
                      <p className="mt-5 text-sm font-black">{module.name}</p>
                      <p className="mt-1 text-xs capitalize text-slate-500 dark:text-slate-400">{String(module.status).replace(/_/g, ' ')}</p>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <div className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300"><Sparkles className="h-5 w-5" /></div><div><h2 className="font-black">Your Work</h2><p className="text-sm text-slate-500 dark:text-slate-400">Platform-level shortcuts that work across apps.</p></div></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Quick href="/recent" icon={FileText} label="Recent records" />
                  <Quick href="/apps" icon={AppWindow} label="Recently opened apps" />
                  <Quick href="/favorites" icon={Star} label="Favorites" />
                  <Quick href="/files" icon={Folder} label="Files" />
                </div>
              </section>

              <section className="rounded-[26px] border border-slate-200 bg-gradient-to-br from-slate-950 to-blue-950 p-6 text-white shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><Bot className="h-5 w-5" /></div>
                <h2 className="mt-5 text-xl font-black">SaMi AI</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">Ask questions, search your workspace and use AI tools made available by installed apps.</p>
                <Link href="/ai" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-slate-950">Open SaMi AI<ChevronRight className="h-4 w-4" /></Link>
              </section>
            </div>

            <section className="mt-8 rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-black">Activity</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tasks, mentions, approvals, reminders and module activity will appear here as those services are completed.</p>
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No platform activity to show yet.</div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function NavLink({ href, icon: Icon, label, active = false }: { href: string; icon: typeof Home; label: string; active?: boolean }) {
  return <Link href={href} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${active ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'}`}><Icon className="h-5 w-5" /><span>{label}</span></Link>;
}

function Quick({ href, icon: Icon, label }: { href: string; icon: typeof Home; label: string }) {
  return <Link href={href} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950"><Icon className="h-5 w-5 text-slate-400" /><span className="text-sm font-bold">{label}</span><ChevronRight className="ml-auto h-4 w-4 text-slate-300" /></Link>;
}
