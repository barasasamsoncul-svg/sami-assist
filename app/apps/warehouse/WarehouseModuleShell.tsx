'use client';

import Link from 'next/link';

import {
  ArrowLeft,
  Boxes,
  ChevronRight,
  LayoutDashboard,
  Menu,
  Sparkles,
  X,
} from 'lucide-react';

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';

import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';
import WorkspaceAppSwitcher from '@/app/components/workspace/WorkspaceAppSwitcher';
import WorkspaceCompanyIdentity from '@/app/components/workspace/WorkspaceCompanyIdentity';
import WorkspaceNotificationCenter from '@/app/components/workspace/WorkspaceNotificationCenter';
import WorkspaceSearchLauncher from '@/app/components/workspace/WorkspaceSearch';
import WorkspaceTenantSwitcher from '@/app/components/workspace/WorkspaceTenantSwitcher';
import type { AppSidebarItem } from '@/app/components/apps/AppSurfaceShell';

/* -------------------------------------------------------------------------- */
/*  Double-mount guard                                                        */
/* -------------------------------------------------------------------------- */

// Marks "a WarehouseModuleShell is already rendering in this subtree".
// The inner one becomes a pass-through so we never paint two sidebars.
const WarehouseShellMount = createContext(false);

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type UserData = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
};

type TenantData = {
  id: string;
  name: string;
  slug: string;
  status: string;
} | null;

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

type WarehouseSidebarItem = AppSidebarItem & {
  sectionLabel?: string | null;
};

type Props = {
  user: UserData;
  tenant: TenantData;
  modules: ModuleData[];
  appSidebarItems: WarehouseSidebarItem[];
  activeSidebarKey: string;
  unreadNotifications?: number;
  sidebarCapabilities?: SidebarCapabilities;
  companyName: string;
  children: ReactNode;
};

/* -------------------------------------------------------------------------- */
/*  Sidebar                                                                   */
/* -------------------------------------------------------------------------- */

function WarehouseSidebar({
  companyName,
  appSidebarItems,
  activeSidebarKey,
  onNavigate,
}: {
  companyName: string;
  appSidebarItems: WarehouseSidebarItem[];
  activeSidebarKey: string;
  onNavigate?: () => void;
}) {
  return (
    <aside
      aria-label="Warehouse navigation"
      className="flex h-full min-h-0 flex-col bg-[var(--sami-sidebar)] text-slate-950 dark:text-white"
    >
      {/* Brand */}
      <div className="flex min-h-[68px] shrink-0 items-center gap-3 border-b border-[var(--sami-border)] py-3 pl-5 pr-14 lg:pr-5">
        <SamiAppIconTile appKey="warehouse" category="supply_chain" size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-black leading-5 tracking-[-0.02em]">
            Warehouse
          </p>
          <p
            title={companyName}
            className="mt-0.5 truncate text-[10px] font-semibold leading-4 text-slate-500 dark:text-slate-400"
          >
            {companyName}
          </p>
        </div>
      </div>

      {/* Cross-module shortcuts */}
      <div className="shrink-0 border-b border-[var(--sami-border)] px-3 py-2">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[11px] font-bold text-slate-600 transition hover:bg-[var(--sami-surface)] hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
        >
          <LayoutDashboard className="h-[16px] w-[16px] shrink-0" aria-hidden="true" />
          Workspace
        </Link>
        <Link
          href="/apps"
          onClick={onNavigate}
          className="mt-0.5 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[11px] font-bold text-slate-600 transition hover:bg-[var(--sami-surface)] hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
        >
          <Boxes className="h-[16px] w-[16px] shrink-0" aria-hidden="true" />
          All apps
        </Link>
      </div>

      {/* Nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {appSidebarItems.map((item, index) => {
          const active = item.key === activeSidebarKey;
          const previousSection =
            index > 0 ? appSidebarItems[index - 1]?.sectionLabel : null;
          const showSection = Boolean(
            item.sectionLabel && item.sectionLabel !== previousSection,
          );

          return (
            <div
              key={item.key}
              className={showSection && index > 0 ? 'pt-4' : undefined}
            >
              {showSection ? (
                <p className="px-2 pb-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  {item.sectionLabel}
                </p>
              ) : null}

              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                title={item.description || item.label}
                className={[
                  'group relative flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                  active
                    ? 'bg-[var(--sami-surface)] text-slate-950 shadow-[var(--sami-shadow-sm)] ring-1 ring-blue-500/20 dark:text-white'
                    : 'text-slate-600 hover:bg-[var(--sami-surface)] hover:text-slate-950 dark:text-slate-400 dark:hover:text-white',
                ].join(' ')}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-blue-600"
                  />
                ) : null}

                <span
                  aria-hidden="true"
                  className={[
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    active
                      ? 'bg-blue-600'
                      : 'bg-slate-300 group-hover:bg-blue-400 dark:bg-slate-600',
                  ].join(' ')}
                />

                <span className="min-w-0 flex-1 truncate leading-4">
                  {item.label}
                </span>

                {item.badge !== null && item.badge !== undefined ? (
                  <span
                    className="max-w-[64px] shrink-0 truncate rounded-full bg-[var(--sami-surface-soft)] px-1.5 py-0.5 text-[9px] font-black tabular-nums text-slate-600 dark:text-slate-300"
                    title={String(item.badge)}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Footer brand tag */}
      <div className="shrink-0 border-t border-[var(--sami-border)] px-4 py-3">
        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          SaMi Warehouse
        </p>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shell                                                                     */
/* -------------------------------------------------------------------------- */

export default function WarehouseModuleShell({
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
  // If a WarehouseModuleShell is already rendering above us in the tree, don't
  // paint a second sidebar/topbar/padding — just pass children through.
  const alreadyMounted = useContext(WarehouseShellMount);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [liveUnread, setLiveUnread] = useState(unreadNotifications);

  if (alreadyMounted) {
    return <>{children}</>;
  }

  const activePage = appSidebarItems.find(
    (item) => item.key === activeSidebarKey,
  );

  return (
    <WarehouseShellMount.Provider value={true}>
      <main
        data-sami-app="warehouse"
        data-warehouse-shell="standalone"
        data-warehouse-active-view={activeSidebarKey}
        className="min-h-screen bg-[var(--sami-canvas)] text-slate-950 dark:text-white"
      >
        {/* ---------------------------------------------------------------- */}
        {/* Desktop sidebar                                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className="hidden lg:block">
          <div className="fixed inset-y-0 left-0 z-50 w-[260px] border-r border-[var(--sami-border)] bg-[var(--sami-sidebar)] shadow-[8px_0_32px_rgba(16,24,40,0.03)]">
            <WarehouseSidebar
              companyName={companyName}
              appSidebarItems={appSidebarItems}
              activeSidebarKey={activeSidebarKey}
            />
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Mobile sidebar                                                   */}
        {/* ---------------------------------------------------------------- */}
        {mobileSidebarOpen ? (
          <div className="fixed inset-0 z-[90] lg:hidden">
            <button
              type="button"
              aria-label="Close Warehouse navigation"
              className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-[min(88vw,280px)] border-r border-[var(--sami-border)] bg-[var(--sami-sidebar)] shadow-2xl">
              <button
                type="button"
                aria-label="Close Warehouse navigation"
                onClick={() => setMobileSidebarOpen(false)}
                className="absolute right-3 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <WarehouseSidebar
                companyName={companyName}
                appSidebarItems={appSidebarItems}
                activeSidebarKey={activeSidebarKey}
                onNavigate={() => setMobileSidebarOpen(false)}
              />
            </div>
          </div>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Content                                                          */}
        {/* ---------------------------------------------------------------- */}
        <div className="min-h-screen lg:pl-[260px]">
          <header className="sticky top-0 z-40 border-b border-[var(--sami-border)] bg-[var(--sami-topbar)]/95 backdrop-blur-xl">
            <div className="flex h-[60px] min-w-0 items-center gap-2 px-3 sm:px-5 lg:px-6">
              <button
                type="button"
                aria-label="Open Warehouse navigation"
                onClick={() => setMobileSidebarOpen(true)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] lg:hidden"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>

              <Link
                href="/apps"
                aria-label="Back to all apps"
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] text-slate-500 transition hover:text-slate-950 sm:inline-flex dark:text-slate-300 dark:hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>

              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-xs">
                  <Link
                    href="/apps/warehouse"
                    className="shrink-0 text-slate-500 transition hover:text-slate-950 dark:hover:text-white"
                  >
                    Warehouse
                  </Link>
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                  <span className="truncate font-black">
                    {activePage?.label || 'Workspace'}
                  </span>
                </p>
                <p
                  title={activePage?.description || undefined}
                  className="mt-0.5 hidden max-w-[min(52vw,640px)] truncate text-[11px] text-slate-500 dark:text-slate-400 sm:block"
                >
                  {activePage?.description || `Warehouse workspace for ${companyName}`}
                </p>
              </div>

              <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
                {sidebarCapabilities?.aiEnabled !== false ? (
                  <Link
                    href="/ai?module=warehouse"
                    aria-label="Open SaMi AI"
                    title="SaMi AI"
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 transition hover:from-indigo-100 hover:to-blue-100 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-blue-500/10 dark:text-indigo-300 dark:hover:from-indigo-500/20 dark:hover:to-blue-500/20 sm:w-auto sm:px-3"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span className="ml-2 hidden text-[10px] font-black uppercase tracking-[0.06em] xl:inline">
                      SaMi AI
                    </span>
                  </Link>
                ) : null}

                <div className="hidden md:block">
                  <WorkspaceSearchLauncher />
                </div>

                <WorkspaceAppSwitcher modules={modules} />

                <div className="hidden lg:block">
                  <WorkspaceTenantSwitcher currentTenant={tenant} />
                </div>

                <div className="hidden xl:block">
                  <WorkspaceCompanyIdentity />
                </div>

                {sidebarCapabilities?.notificationsEnabled !== false ? (
                  <WorkspaceNotificationCenter
                    userId={user.id}
                    initialUnreadNotifications={liveUnread}
                    onUnreadChange={setLiveUnread}
                  />
                ) : null}
              </div>
            </div>
          </header>

          <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
            <div className="mx-auto min-w-0 max-w-[1680px]">{children}</div>
          </div>
        </div>
      </main>
    </WarehouseShellMount.Provider>
  );
}