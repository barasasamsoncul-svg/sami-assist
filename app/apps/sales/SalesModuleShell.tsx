'use client';

import Link from 'next/link';

import {
  ArrowLeft,
  Boxes,
  LayoutDashboard,
  Menu,
  Sparkles,
  X,
} from 'lucide-react';

import {
  useState,
  type ReactNode,
} from 'react';

import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';
import WorkspaceAppSwitcher from '@/app/components/workspace/WorkspaceAppSwitcher';
import WorkspaceCompanyIdentity from '@/app/components/workspace/WorkspaceCompanyIdentity';
import WorkspaceNotificationCenter from '@/app/components/workspace/WorkspaceNotificationCenter';
import WorkspaceSearchLauncher from '@/app/components/workspace/WorkspaceSearch';
import WorkspaceTenantSwitcher from '@/app/components/workspace/WorkspaceTenantSwitcher';
import type {
  AppSidebarItem,
} from '@/app/components/apps/AppSurfaceShell';


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

type ModuleData = {
  key: string;
  registryKey?: string;
  name: string;
  status: string;
  href?: string | null;
  description?: string | null;
  iconKey?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
};

type SidebarCapabilities = {
  aiEnabled?: boolean;
  notificationsEnabled?: boolean;
};

type SalesSidebarItem =
  AppSidebarItem & {
    sectionLabel?:
      string | null;
  };


type Props = {
  user: UserData;
  tenant: TenantData;
  modules: ModuleData[];
  appSidebarItems: SalesSidebarItem[];
  activeSidebarKey: string;
  unreadNotifications?: number;
  sidebarCapabilities?: SidebarCapabilities;
  companyName: string;
  children: ReactNode;
};


function SalesSidebar({
  companyName,
  appSidebarItems,
  activeSidebarKey,
  onNavigate,
}: {
  companyName: string;
  appSidebarItems: SalesSidebarItem[];
  activeSidebarKey: string;
  onNavigate?: () => void;
}) {
  return (
    <aside
      aria-label="Sales navigation"
      className="flex h-full min-h-0 flex-col bg-[var(--sami-sidebar)] text-slate-950 dark:text-white"
    >
      <div className="flex min-h-[72px] shrink-0 items-center gap-3 border-b border-[var(--sami-border)] py-3 pl-5 pr-14 lg:pr-5">
        <SamiAppIconTile
          appKey="sales"
          category="sales"
          size="sm"
        />

        <div className="min-w-0">
          <p className="break-words text-sm font-black leading-5 tracking-[-0.02em]">
            Sales
          </p>
          <p className="mt-0.5 break-words text-[10px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
            {companyName}
          </p>
        </div>
      </div>

      <div className="shrink-0 border-b border-[var(--sami-border)] px-4 py-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex h-10 items-center gap-3 rounded-xl px-3 text-[11px] font-bold text-slate-600 transition hover:bg-[var(--sami-surface)] hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
        >
          <LayoutDashboard className="h-[18px] w-[18px] shrink-0" />
          Workspace
        </Link>

        <Link
          href="/apps"
          onClick={onNavigate}
          className="mt-1 flex h-10 items-center gap-3 rounded-xl px-3 text-[11px] font-bold text-slate-600 transition hover:bg-[var(--sami-surface)] hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
        >
          <Boxes className="h-[18px] w-[18px] shrink-0" />
          All apps
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {
          appSidebarItems.map(
            (
              item,
              index,
            ) => {
              const active =
                item.key ===
                activeSidebarKey;

              const previousSection =
                index > 0
                  ? appSidebarItems[
                      index - 1
                    ]?.sectionLabel
                  : null;

              const showSection =
                Boolean(
                  item.sectionLabel &&
                  item.sectionLabel !==
                    previousSection,
                );

              return (
                <div
                  key={item.key}
                  className={
                    showSection &&
                    index > 0
                      ? 'pt-3'
                      : undefined
                  }
                >
                  {
                    showSection
                      ? (
                        <p className="px-3 pb-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                          {
                            item
                              .sectionLabel
                          }
                        </p>
                      )
                      : null
                  }

                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={
                      active
                        ? 'page'
                        : undefined
                    }
                    className={[
                      'group flex min-h-10 min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-[11px] font-semibold transition',
                      active
                        ? 'sami-nav-active-surface shadow-[var(--sami-shadow-sm)] ring-1 ring-[var(--sami-border)]'
                        : 'text-slate-500 hover:bg-[var(--sami-surface)] hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                    ].join(
                      ' ',
                    )}
                  >
                    <span
                      className={[
                        'h-2 w-2 shrink-0 rounded-full',
                        active
                          ? 'bg-blue-600'
                          : 'bg-slate-300 group-hover:bg-blue-400 dark:bg-slate-600',
                      ].join(
                        ' ',
                      )}
                    />

                    <span className="min-w-0 flex-1 break-words whitespace-normal leading-4">
                      {item.label}
                    </span>

                    {
                      item.badge !==
                        null &&
                      item.badge !==
                        undefined
                        ? (
                          <span
                            className="max-w-[72px] shrink-0 truncate rounded-full bg-[var(--sami-surface-soft)] px-2 py-0.5 text-[9px] font-black tabular-nums text-slate-500"
                            title={
                              String(
                                item.badge,
                              )
                            }
                          >
                            {item.badge}
                          </span>
                        )
                        : null
                    }
                  </Link>
                </div>
              );
            },
          )
        }
      </nav>
    </aside>
  );
}


export default function SalesModuleShell({
  user,
  tenant,
  modules,
  appSidebarItems,
  activeSidebarKey,
  unreadNotifications = 0,
  sidebarCapabilities,
  companyName,
  children,
}: Props) {
  const [
    mobileSidebarOpen,
    setMobileSidebarOpen,
  ] =
    useState(
      false,
    );

  const [
    liveUnread,
    setLiveUnread,
  ] =
    useState(
      unreadNotifications,
    );

  return (
    <main
      data-sami-app="sales"
      data-sales-shell="standalone"
      className="min-h-screen bg-[var(--sami-canvas)] text-slate-950 dark:text-white"
    >
      <div className="hidden lg:block">
        <div className="fixed inset-y-0 left-0 z-50 w-[286px] border-r border-[var(--sami-border)] bg-[var(--sami-sidebar)] shadow-[8px_0_32px_rgba(16,24,40,0.03)]">
          <SalesSidebar
            companyName={companyName}
            appSidebarItems={appSidebarItems}
            activeSidebarKey={activeSidebarKey}
          />
        </div>
      </div>

      {
        mobileSidebarOpen
          ? (
            <div className="fixed inset-0 z-[90] lg:hidden">
              <button
                type="button"
                aria-label="Close Sales navigation"
                className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
                onClick={
                  () =>
                    setMobileSidebarOpen(
                      false,
                    )
                }
              />

              <div className="absolute inset-y-0 left-0 w-[min(88vw,286px)] border-r border-[var(--sami-border)] bg-[var(--sami-sidebar)] shadow-2xl">
                <button
                  type="button"
                  aria-label="Close Sales navigation"
                  onClick={
                    () =>
                      setMobileSidebarOpen(
                        false,
                      )
                  }
                  className="absolute right-3 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)]"
                >
                  <X className="h-4 w-4" />
                </button>

                <SalesSidebar
                  companyName={companyName}
                  appSidebarItems={appSidebarItems}
                  activeSidebarKey={activeSidebarKey}
                  onNavigate={
                    () =>
                      setMobileSidebarOpen(
                        false,
                      )
                  }
                />
              </div>
            </div>
          )
          : null
      }

      <div className="min-h-screen lg:pl-[286px]">
        <header className="sticky top-0 z-40 border-b border-[var(--sami-border)] bg-[var(--sami-topbar)]/95 backdrop-blur-xl">
          <div className="flex h-[64px] min-w-0 items-center gap-2 px-3 sm:px-5 lg:px-6">
            <button
              type="button"
              aria-label="Open Sales navigation"
              onClick={
                () =>
                  setMobileSidebarOpen(
                    true,
                  )
              }
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            <Link
              href="/apps"
              aria-label="Back to all apps"
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] text-slate-500 transition hover:text-slate-950 sm:inline-flex dark:text-slate-300 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            <div className="min-w-0">
              <p className="break-words whitespace-normal text-sm font-black">
                Sales
              </p>
              <p className="break-words whitespace-normal text-[10px] text-slate-500 sm:hidden">
                {companyName}
              </p>
            </div>

            <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
              {
                sidebarCapabilities
                  ?.aiEnabled !==
                false
                  ? (
                    <Link
                      href="/ai?module=sales"
                      aria-label="Open SaMi AI"
                      title="SaMi AI"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-blue-500/10 dark:text-indigo-300 sm:w-auto sm:px-3"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span className="ml-2 hidden text-[10px] font-black xl:inline">
                        SaMi AI
                      </span>
                    </Link>
                  )
                  : null
              }

              <div className="hidden md:block">
                <WorkspaceSearchLauncher />
              </div>

              <WorkspaceAppSwitcher
                modules={modules}
              />

              <div className="hidden lg:block">
                <WorkspaceTenantSwitcher
                  currentTenant={tenant}
                />
              </div>

              <div className="hidden xl:block">
                <WorkspaceCompanyIdentity />
              </div>

              {
                sidebarCapabilities
                  ?.notificationsEnabled !==
                false
                  ? (
                    <WorkspaceNotificationCenter
                      userId={user.id}
                      initialUnreadNotifications={liveUnread}
                      onUnreadChange={setLiveUnread}
                    />
                  )
                  : null
              }
            </div>
          </div>
        </header>

        <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
          <div className="mx-auto min-w-0 max-w-[1680px]">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}