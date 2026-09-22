'use client';

import Link from 'next/link';

import {
  usePathname,
} from 'next/navigation';

import {
  AlertTriangle,
  CreditCard,
  LockKeyhole,
  Menu,
  Sparkles,
} from 'lucide-react';

import {
  useState,
  type ReactNode,
} from 'react';

import WorkspaceSidebar from '@/app/components/workspace/WorkspaceSidebar';
import WorkspaceNotificationCenter from '@/app/components/workspace/WorkspaceNotificationCenter';
import WorkspaceCompanyIdentity from '@/app/components/workspace/WorkspaceCompanyIdentity';
import WorkspaceSearchLauncher from '@/app/components/workspace/WorkspaceSearch';
import WorkspaceAppSwitcher from '@/app/components/workspace/WorkspaceAppSwitcher';

type UserData = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
};

type TenantData =
  | {
      id: string;
      name: string;
      slug: string;
      status: string;
    }
  | null;

type MembershipData =
  | {
      accessLevel:
        | 'owner'
        | 'admin'
        | 'member';
      isOwner: boolean;
      isAdmin: boolean;
      label: string;
    }
  | null;

type SubscriptionData =
  | {
      status: string;
      planKey: string | null;
      planName: string | null;
      pastDue?: boolean;
      suspended?: boolean;
      graceEndsAt?: string | null;
      graceDays?: number;
      daysPastDue?: number | null;
    }
  | null;

type ModuleData = {
  key: string;
  name: string;
  status: string;
  href?: string | null;
  description?: string | null;
};

type SidebarCapabilities = {
  aiEnabled?: boolean;
  filesEnabled?: boolean;
  notificationsEnabled?: boolean;
};

type Props = {
  user: UserData;
  tenant: TenantData;
  membership: MembershipData;
  subscription: SubscriptionData;
  modules: ModuleData[];
  sidebarCapabilities?: SidebarCapabilities;
  unreadNotifications?: number;

  title: string;
  description?: string;
  contextLabel?: string | null;
  actions?: ReactNode;
  headerContent?: ReactNode;

  children: ReactNode;
  contentClassName?: string;
};

export default function WorkspaceShell({
  user,
  tenant,
  membership,
  subscription,
  modules,
  sidebarCapabilities,
  unreadNotifications = 0,
  title,
  description,
  contextLabel,
  actions,
  headerContent,
  children,
  contentClassName = '',
}: Props) {
  const [
    sidebarOpen,
    setSidebarOpen,
  ] =
    useState(
      false,
    );

  const [
    liveUnreadNotifications,
    setLiveUnreadNotifications,
  ] =
    useState(
      unreadNotifications,
    );

  const pathname =
    usePathname();

  const subscriptionPastDue =
    subscription
      ?.pastDue ===
      true ||
    subscription
      ?.status
      ?.trim()
      .toLowerCase() ===
      'past_due';

  const subscriptionSuspended =
    subscription
      ?.suspended ===
      true;

  const recoverySurface =
    pathname ===
      '/settings' ||
    pathname.startsWith(
      '/settings/',
    );

  const workspaceLocked =
    subscriptionSuspended &&
    !recoverySurface;

  const showDunningWarning =
    subscriptionPastDue &&
    !subscriptionSuspended &&
    !recoverySurface;

  return (
    <main className="sami-canvas min-h-screen text-slate-950 transition-colors dark:text-white">
      <div className="flex min-h-screen">
        <WorkspaceSidebar
          user={user}
          tenant={tenant}
          membership={membership}
          subscription={subscription}
          modules={modules}
          capabilities={
            sidebarCapabilities
          }
          unreadNotifications={
            liveUnreadNotifications
          }
          open={
            sidebarOpen
          }
          onClose={() =>
            setSidebarOpen(
              false,
            )
          }
        />

        <div className="min-w-0 flex-1 lg:pl-[286px]">
          <header className="sticky top-0 z-40 border-b border-[var(--sami-border)] bg-[var(--sami-topbar)] shadow-[0_1px_0_rgba(16,24,40,0.02)] backdrop-blur-xl">
            <div className="flex min-h-[60px] flex-wrap items-center gap-2 px-2.5 py-2 sm:flex-nowrap sm:gap-3 sm:px-5 lg:px-6">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() =>
                  setSidebarOpen(
                    true,
                  )
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] text-slate-500 shadow-[var(--sami-shadow-sm)] transition hover:bg-[var(--sami-surface-soft)] dark:text-slate-400 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>

              {headerContent ? (
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  {headerContent}
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-[15px] font-bold tracking-[-0.01em] text-slate-900 dark:text-white">
                      {title}
                    </p>

                    {(contextLabel ||
                      tenant?.name) && (
                      <>
                        <span className="hidden text-slate-300 md:inline dark:text-slate-700">
                          /
                        </span>
                        <p className="hidden max-w-[220px] truncate text-[11px] font-semibold text-slate-400 md:block">
                          {contextLabel ||
                            tenant?.name}
                        </p>
                      </>
                    )}
                  </div>

                  {description && (
                    <p className="mt-0.5 hidden max-w-[660px] truncate text-[10px] text-slate-400 sm:block">
                      {description}
                    </p>
                  )}
                </div>
              )}

              <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                <WorkspaceAppSwitcher
                  modules={modules}
                />

                <Link
                  href="/ai"
                  aria-label="Open SaMi AI"
                  title="SaMi AI"
                  className="group inline-flex h-10 items-center gap-2 rounded-xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50 to-blue-50 px-2.5 text-[10px] font-bold text-indigo-700 shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px hover:shadow-md sm:px-3 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-blue-500/10 dark:text-indigo-300"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <span className="hidden xl:inline">
                    SaMi AI
                  </span>
                </Link>

                <WorkspaceSearchLauncher />

                <WorkspaceCompanyIdentity />

                <WorkspaceNotificationCenter
                  userId={user.id}
                  onUnreadChange={
                    setLiveUnreadNotifications
                  }
                />
              </div>

              {actions && (
                <div className="order-3 flex w-full items-center gap-2 overflow-x-auto border-t border-[var(--sami-border)] pt-2 sm:order-none sm:w-auto sm:overflow-visible sm:border-0 sm:pt-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {actions}
                </div>
              )}
            </div>
          </header>

          {showDunningWarning && (
            <div className="border-b border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/15 dark:bg-amber-500/10 sm:px-5 lg:px-6">
              <div className="mx-auto flex max-w-[1720px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />

                  <p className="text-[11px] font-semibold leading-5 text-amber-900 dark:text-amber-100">
                    Subscription payment is overdue. Your workspace is still active during the grace period, but it will be suspended if payment is not restored before
                    {' '}
                    {subscription?.graceEndsAt
                      ? new Date(
                          subscription.graceEndsAt,
                        ).toLocaleDateString()
                      : 'the grace deadline'}
                    .
                  </p>
                </div>

                {(membership?.isOwner ||
                  membership?.isAdmin) && (
                  <Link
                    href="/settings?tab=billing"
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-amber-600 px-3 text-[10px] font-black text-white transition hover:bg-amber-700"
                  >
                    Resolve billing
                  </Link>
                )}
              </div>
            </div>
          )}

          <div
            className={[
              'mx-auto w-full max-w-[1720px] px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6',
              contentClassName,
            ].join(
              ' ',
            )}
          >
            {workspaceLocked ? (
              <section className="mx-auto flex min-h-[68vh] max-w-3xl items-center justify-center py-8 sm:py-12">
                <div className="w-full overflow-hidden rounded-[28px] border border-amber-200 bg-white shadow-xl shadow-amber-950/5 dark:border-amber-500/20 dark:bg-[#11141a]">
                  <div className="border-b border-amber-100 bg-amber-50 px-5 py-4 dark:border-amber-500/15 dark:bg-amber-500/10 sm:px-7">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
                        <LockKeyhole className="h-4.5 w-4.5" />
                      </span>

                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                          Subscription recovery
                        </p>
                        <h1 className="mt-1 text-lg font-black tracking-[-0.02em] text-slate-950 dark:text-white sm:text-xl">
                          Workspace temporarily suspended
                        </h1>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-6 sm:px-7 sm:py-7">
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                      <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-300" />

                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          The subscription payment is past due.
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          SaMi has paused normal business work across apps, AI, messages, automations, integrations and developer access. Existing workspace data is retained and access is restored automatically after SaMi verifies payment.
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                          Data
                        </p>
                        <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Your workspace records and configuration remain stored.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                          Restoration
                        </p>
                        <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Verified payment restores normal workspace access automatically.
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                      {membership?.isOwner ||
                      membership?.isAdmin ? (
                        <Link
                          href="/settings?tab=billing"
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                        >
                          <CreditCard className="h-4 w-4" />
                          Open Billing
                        </Link>
                      ) : (
                        <div className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                          Contact a workspace owner or administrator to restore the subscription.
                        </div>
                      )}

                      <Link
                        href="/settings"
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.05]"
                      >
                        Account & settings
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
