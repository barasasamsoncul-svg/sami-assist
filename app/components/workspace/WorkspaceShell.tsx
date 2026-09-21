'use client';

import {
  Menu,
} from 'lucide-react';

import {
  useState,
  type ReactNode,
} from 'react';

import WorkspaceSidebar from '@/app/components/workspace/WorkspaceSidebar';
import WorkspaceNotificationCenter from '@/app/components/workspace/WorkspaceNotificationCenter';
import WorkspaceCompanyIdentity from '@/app/components/workspace/WorkspaceCompanyIdentity';
import WorkspaceSearchLauncher from '@/app/components/workspace/WorkspaceSearch';

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
    <main className="min-h-screen bg-[#F6F7F9] text-slate-950 transition-colors dark:bg-[#090B10] dark:text-white">
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
          <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0E14]/95">
            <div className="flex min-h-16 flex-wrap items-center gap-2 px-2.5 py-2 sm:flex-nowrap sm:gap-3 sm:px-5 lg:px-7">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() =>
                  setSidebarOpen(
                    true,
                  )
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>

              {headerContent ? (
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  {headerContent}
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold tracking-tight">
                    {title}
                  </p>

                  {description && (
                    <p className="mt-0.5 hidden max-w-[620px] truncate text-[11px] text-slate-400 sm:block">
                      {description}
                    </p>
                  )}

                  {(contextLabel ||
                    tenant?.name) && (
                    <p className="mt-0.5 hidden max-w-[260px] truncate text-[10px] font-medium text-slate-400 md:block">
                      {contextLabel ||
                        tenant?.name}
                    </p>
                  )}
                </div>
              )}

              <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
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
                <div className="order-3 flex w-full items-center gap-2 overflow-x-auto border-t border-slate-200/70 pt-2 sm:order-none sm:w-auto sm:overflow-visible sm:border-0 sm:pt-0 dark:border-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {actions}
                </div>
              )}
            </div>
          </header>

          <div
            className={[
              'mx-auto w-full max-w-[1700px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8',
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
