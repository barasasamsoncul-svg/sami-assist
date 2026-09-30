'use client';

import Link from 'next/link';

import {
  ArrowLeft,
  Boxes,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';

import {
  usePathname,
} from 'next/navigation';

import {
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';
import WorkspaceAppSwitcher from '@/app/components/workspace/WorkspaceAppSwitcher';
import WorkspaceCompanyIdentity from '@/app/components/workspace/WorkspaceCompanyIdentity';
import WorkspaceNotificationCenter from '@/app/components/workspace/WorkspaceNotificationCenter';
import WorkspaceSearchLauncher from '@/app/components/workspace/WorkspaceSearch';
import WorkspaceTenantSwitcher from '@/app/components/workspace/WorkspaceTenantSwitcher';
import {
  WorkspaceTutorialToggle,
} from '@/app/components/workspace/WorkspaceTutorial';

import type {
  SamiAppUiProfile,
} from '@/lib/apps/ui-profiles';


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
  registryKey?: string;
  name: string;
  status: string;
  href?: string | null;
  description?: string | null;
  iconKey?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
};

export type AppSidebarItem = {
  key: string;
  label: string;
  href: string;
  description?: string | null;
  badge?: string | number | null;
};

type SidebarCapabilities = {
  aiEnabled?: boolean;
  filesEnabled?: boolean;
  notificationsEnabled?: boolean;
};

type Props = {
  appKey: string;
  appCategory?: string | null;
  appIconKey?: string | null;
  profile: SamiAppUiProfile;
  user: UserData;
  tenant: TenantData;
  membership: MembershipData;
  subscription: SubscriptionData;
  modules: ModuleData[];
  appSidebarItems: AppSidebarItem[];
  activeSidebarKey?: string | null;
  sidebarCapabilities?: SidebarCapabilities;
  unreadNotifications?: number;
  title: string;
  description?: string;
  contextLabel?: string | null;
  actions?: ReactNode;
  children: ReactNode;
};

function headerClasses(
  profile:
    SamiAppUiProfile,
) {
  switch (
    profile.header
  ) {
    case 'command':
      return 'rounded-[24px] border border-white/10 bg-slate-950 text-white shadow-[0_22px_70px_rgba(15,23,42,0.22)] dark:bg-[#0a0d13]';

    case 'editor':
      return 'rounded-[30px] border border-[var(--sami-border)] bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:bg-[#11151d]/92';

    case 'immersive':
      return 'overflow-hidden rounded-[32px] border border-white/15 text-white shadow-[0_26px_80px_rgba(15,23,42,0.20)]';

    case 'split':
      return 'rounded-[24px] border border-[var(--sami-border)] bg-[var(--sami-surface)] shadow-[var(--sami-shadow-sm)]';

    default:
      return 'rounded-[22px] border border-[var(--sami-border)] bg-[var(--sami-surface)] shadow-[var(--sami-shadow-sm)]';
  }
}

function contentWidthClass(
  profile:
    SamiAppUiProfile,
) {
  switch (
    profile.contentWidth
  ) {
    case 'full':
      return 'max-w-none';

    case 'focused':
      return 'max-w-[1280px]';

    default:
      return 'max-w-[1720px]';
  }
}

export default function AppSurfaceShell({
  appKey,
  appCategory,
  appIconKey,
  profile,
  user,
  tenant,
  membership,
  subscription,
  modules,
  appSidebarItems,
  activeSidebarKey,
  sidebarCapabilities,
  unreadNotifications = 0,
  title,
  description,
  contextLabel,
  actions,
  children,
}: Props) {
  const pathname =
    usePathname();

  const [
    liveUnreadNotifications,
    setLiveUnreadNotifications,
  ] =
    useState(
      unreadNotifications,
    );

  const [
    sidebarOpen,
    setSidebarOpen,
  ] =
    useState(
      false,
    );

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

  const appLocked =
    subscriptionSuspended &&
    !recoverySurface;

  const showDunningWarning =
    subscriptionPastDue &&
    !subscriptionSuspended &&
    !recoverySurface;

  const style = {
    '--sami-app-accent':
      profile.accent,
    '--sami-app-secondary':
      profile.secondary,
  } as CSSProperties;

  const immersive =
    profile.header ===
    'immersive';

  const appSidebar = (
    <div
      data-app-sidebar={
        appKey
      }
      className={[
        'overflow-hidden rounded-[24px] border border-[var(--sami-border)] shadow-[var(--sami-shadow-sm)]',
        profile.header ===
          'command'
          ? 'bg-slate-950 text-white dark:bg-[#0a0d13]'
          : profile.header ===
              'immersive'
            ? 'bg-[var(--sami-surface)]'
            : 'bg-[var(--sami-surface)]',
      ].join(
        ' ',
      )}
    >
      <div
        className="border-b border-[var(--sami-border)] px-4 py-4"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--sami-app-accent) 12%, transparent), color-mix(in srgb, var(--sami-app-secondary) 8%, transparent))',
        }}
      >
        <div className="flex items-center gap-3">
          <SamiAppIconTile
            appKey={
              appKey
            }
            category={
              appCategory
            }
            iconKey={
              appIconKey
            }
            size="sm"
          />

          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-[-0.02em]">
              {title}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-bold text-slate-600 dark:text-slate-300">
              {
                contextLabel ||
                tenant?.name ||
                profile.eyebrow
              }
            </p>
          </div>
        </div>
      </div>

      <nav
        aria-label={
          title +
          ' navigation'
        }
        className="max-h-[calc(100vh-190px)] space-y-1 overflow-y-auto p-2.5"
      >
        {
          appSidebarItems.map(
            item => {
              const active =
                activeSidebarKey ===
                item.key;

              return (
                <Link
                  key={
                    item.key
                  }
                  href={
                    item.href
                  }
                  onClick={
                    () =>
                      setSidebarOpen(
                        false,
                      )
                  }
                  aria-current={
                    active
                      ? 'page'
                      : undefined
                  }
                  className={[
                    'group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                    active
                      ? 'sami-nav-active-accent shadow-sm'
                      : profile.header ===
                          'command'
                        ? 'text-slate-300 hover:bg-white/8 hover:text-white'
                        : 'text-slate-600 hover:bg-[var(--sami-surface-soft)] hover:text-slate-950 dark:text-slate-300 dark:hover:text-white',
                  ].join(
                    ' ',
                  )}
                  style={
                    active
                      ? {
                          background:
                            'linear-gradient(135deg, var(--sami-app-accent), var(--sami-app-secondary))',
                        }
                      : undefined
                  }
                >
                  <span
                    className={[
                      'h-2 w-2 shrink-0 rounded-full ring-4 ring-transparent transition',
                      active
                        ? 'bg-white ring-white/15'
                        : 'bg-[var(--sami-app-accent)] opacity-55 group-hover:opacity-100',
                    ].join(
                      ' ',
                    )}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-black">
                      {
                        item.label
                      }
                    </span>
                    {
                      item.description
                      ? (
                        <span
                          className={[
                            'mt-0.5 block line-clamp-2 text-[9px] font-medium leading-4',
                            active
                              ? 'text-inherit'
                              : 'text-slate-600 dark:text-slate-300',
                          ].join(
                            ' ',
                          )}
                        >
                          {
                            item.description
                          }
                        </span>
                      ) : null
                    }
                  </span>

                  {
                    item.badge !==
                      null &&
                    item.badge !==
                      undefined
                    ? (
                      <span
                        className={[
                          'rounded-full px-2 py-0.5 text-[9px] font-black',
                          active
                            ? 'bg-white/16 text-inherit'
                            : 'bg-[var(--sami-surface-soft)] text-slate-500 dark:text-slate-300',
                        ].join(
                          ' ',
                        )}
                      >
                        {
                          item.badge
                        }
                      </span>
                    ) : (
                      <ChevronRight
                        className={[
                          'h-3.5 w-3.5 shrink-0 transition',
                          active
                            ? 'text-inherit'
                            : 'text-slate-300 group-hover:translate-x-0.5 group-hover:text-[var(--sami-app-accent)] dark:text-slate-600',
                        ].join(
                          ' ',
                        )}
                      />
                    )
                  }
                </Link>
              );
            },
          )
        }
      </nav>

      <div className="border-t border-[var(--sami-border)] p-2.5">
        <Link
          href="/apps"
          onClick={
            () =>
              setSidebarOpen(
                false,
              )
          }
          className="flex h-10 items-center gap-2 rounded-xl px-3 text-[10px] font-black text-slate-500 transition hover:bg-[var(--sami-surface-soft)] hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
        >
          <Boxes className="h-4 w-4" />
          All SaMi Apps
        </Link>
      </div>
    </div>
  );

  return (
    <main
      style={style}
      data-sami-app={
        appKey
      }
      data-app-archetype={
        profile.archetype
      }
      data-app-header={
        profile.header
      }
      data-app-density={
        profile.density
      }
      data-app-navigation={
        profile.navigation
      }
      className="sami-canvas min-h-screen text-slate-950 transition-colors dark:text-white"
    >
      <header className="sticky top-0 z-50 border-b border-[var(--sami-border)] bg-[var(--sami-topbar)]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[64px] w-full max-w-[1920px] items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:px-7">
          <button
            type="button"
            aria-label="Open app sidebar"
            aria-expanded={
              sidebarOpen
            }
            onClick={
              () =>
                setSidebarOpen(
                  true,
                )
            }
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] text-slate-500 shadow-[var(--sami-shadow-sm)] transition hover:text-slate-950 lg:hidden dark:text-slate-300 dark:hover:text-white"
          >
            <Menu className="h-4 w-4" />
          </button>

          <Link
            href="/apps"
            aria-label="Back to all apps"
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] text-slate-500 shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px hover:text-slate-950 lg:inline-flex dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex min-w-0 items-center gap-3">
            <SamiAppIconTile
              appKey={
                appKey
              }
              category={
                appCategory
              }
              iconKey={
                appIconKey
              }
              size="md"
            />

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-black tracking-[-0.02em]">
                  {title}
                </p>
                <span className="hidden text-slate-300 md:inline dark:text-slate-700">
                  /
                </span>
                <p className="hidden max-w-[220px] truncate text-[10px] font-bold text-slate-600 md:block dark:text-slate-300">
                  {
                    contextLabel ||
                    tenant?.name
                  }
                </p>
              </div>

              <p className="hidden max-w-[560px] truncate text-[10px] text-slate-600 sm:block dark:text-slate-300">
                {
                  profile.eyebrow
                }
              </p>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/dashboard"
              aria-label="Open workspace dashboard"
              title="Workspace dashboard"
              className="hidden h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-[10px] font-black text-slate-600 shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px sm:inline-flex dark:text-slate-300"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden xl:inline">
                Workspace
              </span>
            </Link>

            <WorkspaceAppSwitcher
              modules={
                modules
              }
            />

            <WorkspaceTutorialToggle
              userId={
                user.id
              }
            />

            {
              sidebarCapabilities
                ?.aiEnabled !==
              false
            ? (
              <Link
                href="/ai"
                aria-label="Open SaMi AI"
                title="SaMi AI"
                className="group inline-flex h-10 items-center gap-2 rounded-xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50 to-blue-50 px-2.5 text-[10px] font-bold text-indigo-700 shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-blue-500/10 dark:text-indigo-300"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="hidden 2xl:inline">
                  SaMi AI
                </span>
              </Link>
            ) : null
            }

            <WorkspaceSearchLauncher />

            <WorkspaceTenantSwitcher
              currentTenant={
                tenant
              }
            />

            <WorkspaceCompanyIdentity />

            {
              sidebarCapabilities
                ?.notificationsEnabled !==
              false
            ? (
              <WorkspaceNotificationCenter
                userId={
                  user.id
                }
                initialUnreadNotifications={
                  liveUnreadNotifications
                }
                onUnreadChange={
                  setLiveUnreadNotifications
                }
              />
            ) : null
            }
          </div>
        </div>
      </header>

      {
        showDunningWarning
        ? (
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/15 dark:bg-amber-500/10 sm:px-5 lg:px-7">
            <div className="mx-auto flex max-w-[1920px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                <p className="text-[11px] font-semibold leading-5 text-amber-900 dark:text-amber-100">
                  Subscription payment is overdue. This app remains active during the grace period, but business work will pause if payment is not restored before{' '}
                  {
                    subscription
                      ?.graceEndsAt
                    ? new Date(
                        subscription
                          .graceEndsAt,
                      )
                        .toLocaleDateString()
                    : 'the grace deadline'
                  }.
                </p>
              </div>

              {
                membership
                  ?.isOwner ||
                membership
                  ?.isAdmin
              ? (
                <Link
                  href="/settings?tab=billing"
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-amber-600 px-3 text-[10px] font-black text-white transition hover:bg-amber-700"
                >
                  Resolve billing
                </Link>
              ) : null
              }
            </div>
          </div>
        ) : null
      }

      {
        sidebarOpen
        ? (
          <div className="fixed inset-0 z-[80] lg:hidden">
            <button
              type="button"
              aria-label="Close app sidebar"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
              onClick={
                () =>
                  setSidebarOpen(
                    false,
                  )
              }
            />

            <div className="absolute inset-y-0 left-0 w-[min(88vw,320px)] overflow-y-auto border-r border-[var(--sami-border)] bg-[var(--sami-canvas)] p-3 shadow-2xl">
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">
                  {
                    profile.eyebrow
                  }
                </p>

                <button
                  type="button"
                  aria-label="Close app sidebar"
                  onClick={
                    () =>
                      setSidebarOpen(
                        false,
                      )
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {appSidebar}
            </div>
          </div>
        ) : null
      }

      <div className="mx-auto w-full max-w-[1920px] px-3 pb-8 pt-4 sm:px-5 sm:pb-10 sm:pt-5 lg:px-7 lg:pt-6">
        {
          appLocked
          ? (
            <section className="mx-auto flex min-h-[72vh] max-w-3xl items-center justify-center py-8 sm:py-12">
              <div className="w-full overflow-hidden rounded-[30px] border border-amber-200 bg-white shadow-xl shadow-amber-950/5 dark:border-amber-500/20 dark:bg-[#11141a]">
                <div className="border-b border-amber-100 bg-amber-50 px-5 py-4 dark:border-amber-500/15 dark:bg-amber-500/10 sm:px-7">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
                      <LockKeyhole className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                        Subscription recovery
                      </p>
                      <h1 className="mt-1 text-lg font-black tracking-[-0.02em] sm:text-xl">
                        {title} is temporarily suspended
                      </h1>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-6 sm:px-7 sm:py-7">
                  <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                    SaMi has retained the app data and configuration. Normal business work resumes automatically after payment is verified.
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    {
                      membership
                        ?.isOwner ||
                      membership
                        ?.isAdmin
                    ? (
                      <Link
                        href="/settings?tab=billing"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl sami-contrast-invert px-5 text-xs font-black"
                      >
                        <CreditCard className="h-4 w-4" />
                        Open Billing
                      </Link>
                    ) : null
                    }

                    <Link
                      href="/apps"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-5 text-xs font-black"
                    >
                      <Boxes className="h-4 w-4" />
                      All Apps
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <div className="grid min-w-0 gap-5 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-6">
              <aside className="hidden min-w-0 lg:block">
                <div className="sticky top-[88px]">
                  {appSidebar}
                </div>
              </aside>

              <div className="min-w-0">
              <section
                className={[
                  headerClasses(
                    profile,
                  ),
                  'relative mb-5 sm:mb-6',
                ].join(
                  ' ',
                )}
                style={
                  immersive
                    ? {
                        background:
                          `linear-gradient(120deg, ${profile.accent}, ${profile.secondary})`,
                      }
                    : undefined
                }
              >
                {
                  immersive
                  ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 opacity-40"
                      style={{
                        background:
                          'radial-gradient(circle at 82% 14%, rgba(255,255,255,.34), transparent 28%), radial-gradient(circle at 10% 100%, rgba(255,255,255,.14), transparent 34%)',
                      }}
                    />
                  ) : null
                }

                <div className={[
                  'relative',
                  profile.density ===
                    'spacious'
                    ? 'px-5 py-7 sm:px-7 sm:py-9 lg:px-9'
                    : profile.density ===
                        'compact'
                      ? 'px-4 py-4 sm:px-5 sm:py-5'
                      : 'px-5 py-5 sm:px-6 sm:py-6',
                  profile.header ===
                    'split'
                    ? 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end'
                    : 'flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between',
                ].join(
                  ' ',
                )}>
                  <div className="max-w-4xl">
                    <p
                      className={[
                        'text-[10px] font-black uppercase tracking-[0.16em]',
                        immersive
                          ? 'text-white/70'
                          : 'text-[var(--sami-app-accent)]',
                      ].join(
                        ' ',
                      )}
                    >
                      {
                        profile.eyebrow
                      }
                    </p>

                    <h1
                      className={[
                        'mt-2 font-black tracking-[-0.045em]',
                        profile.header ===
                          'command'
                          ? 'text-2xl sm:text-3xl'
                          : profile.density ===
                              'spacious'
                            ? 'text-3xl sm:text-4xl'
                            : 'text-2xl sm:text-[32px]',
                      ].join(
                        ' ',
                      )}
                    >
                      {
                        profile.headline
                      }
                    </h1>

                    <p
                      className={[
                        'mt-2 max-w-3xl text-xs leading-6 sm:text-sm',
                        immersive ||
                        profile.header ===
                          'command'
                          ? 'text-white/72'
                          : 'text-slate-500 dark:text-slate-400',
                      ].join(
                        ' ',
                      )}
                    >
                      {
                        description ||
                        profile.signature
                      }
                    </p>

                    <p
                      className={[
                        'mt-3 max-w-3xl text-[10px] font-semibold leading-5',
                        immersive ||
                        profile.header ===
                          'command'
                          ? 'text-white/55'
                          : 'text-slate-400',
                      ].join(
                        ' ',
                      )}
                    >
                      {
                        profile.signature
                      }
                    </p>
                  </div>

                  {
                    actions
                    ? (
                      <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {actions}
                      </div>
                    ) : null
                  }
                </div>
              </section>

              <div
                className={[
                  'mx-auto w-full',
                  contentWidthClass(
                    profile,
                  ),
                ].join(
                  ' ',
                )}
              >
                {children}
              </div>
              </div>
            </div>
          )
        }
      </div>
    </main>
  );
}
