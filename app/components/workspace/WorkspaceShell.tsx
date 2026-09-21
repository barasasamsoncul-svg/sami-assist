'use client';

import Link from 'next/link';

import {
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

                {sidebarCapabilities?.aiEnabled && (
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
                )}

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

          <div
            className={[
              'mx-auto w-full max-w-[1720px] px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6',
              contentClassName,
            ].join(
              ' ',
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
