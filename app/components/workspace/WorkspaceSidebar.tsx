'use client';

import Link from 'next/link';
import {
  usePathname,
  useSearchParams,
} from 'next/navigation';

import {
  AppWindow,
  Bell,
  Bot,
  Building2,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Folder,
  Home,
  LayoutGrid,
  LockKeyhole,
  PackageSearch,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  User,
  X,
  Boxes,
  Calculator,
  ContactRound,
  FolderKanban,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';

/* ============================================================
   TYPES
   ============================================================ */

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

type Capabilities = {
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
  capabilities?: Capabilities;
  unreadNotifications?: number;
  open: boolean;
  onClose: () => void;
};

type SettingsTab =
  | 'personal'
  | 'security'
  | 'sessions'
  | 'workspace'
  | 'apps'
  | 'ai'
  | 'billing';

type SettingsChild = {
  key: SettingsTab;
  label: string;
  href: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  adminOnly?: boolean;
};

type AppChild = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const DISABLED_MODULE_STATUSES =
  new Set([
    'disabled',
    'failed',
    'uninstalled',
    'removed',
    'inactive',
  ]);

const APP_ROUTE_ALIASES:
  Record<string, string> = {
    invoice: '/invoices',
    invoices: '/invoices',
    invoicing: '/invoices',

    accounting: '/accounting',
    finance: '/accounting',

    crm: '/crm',

    sale: '/sales',
    sales: '/sales',

    pos: '/pos',
    'point-of-sale': '/pos',
    point_of_sale: '/pos',

    inventory: '/inventory',
    stock: '/inventory',

    hr: '/hr',
    'human-resources': '/hr',
    human_resources: '/hr',

    project: '/projects',
    projects: '/projects',

    ecommerce: '/ecommerce',
    'e-commerce': '/ecommerce',
    e_commerce: '/ecommerce',
  };

const SETTINGS_CHILDREN:
  SettingsChild[] = [
    {
      key: 'personal',
      label: 'My Account',
      href:
        '/settings?tab=personal',
      icon: User,
    },
    {
      key: 'security',
      label: 'Security',
      href:
        '/settings?tab=security',
      icon: ShieldCheck,
    },
    {
      key: 'sessions',
      label:
        'Sessions & Devices',
      href:
        '/settings?tab=sessions',
      icon: LockKeyhole,
    },
    {
      key: 'workspace',
      label: 'Workspace',
      href:
        '/settings?tab=workspace',
      icon: Building2,
      adminOnly: true,
    },
    {
      key: 'apps',
      label: 'Apps',
      href:
        '/settings?tab=apps',
      icon: LayoutGrid,
      adminOnly: true,
    },
    {
      key: 'ai',
      label: 'SaMi AI',
      href:
        '/settings?tab=ai',
      icon: Bot,
    },
    {
      key: 'billing',
      label: 'Billing',
      href:
        '/settings?tab=billing',
      icon: CreditCard,
      ownerOnly: true,
    },
  ];

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeKey(
  value: string
) {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      '-'
    );
}

function getModuleHref(
  module: ModuleData
) {
  const suppliedHref =
    module.href?.trim();

  if (suppliedHref) {
    return suppliedHref;
  }

  const normalized =
    normalizeKey(
      module.key
    );

  if (
    APP_ROUTE_ALIASES[
      normalized
    ]
  ) {
    return APP_ROUTE_ALIASES[
      normalized
    ];
  }

  return `/apps/${encodeURIComponent(
    normalized
  )}`;
}

function getModuleIcon(
  key: string
): LucideIcon {
  const normalized =
    normalizeKey(key);

  if (
    normalized ===
      'invoice' ||
    normalized ===
      'invoices' ||
    normalized ===
      'invoicing'
  ) {
    return ReceiptText;
  }

  if (
    normalized ===
      'accounting' ||
    normalized ===
      'finance'
  ) {
    return Calculator;
  }

  if (
    normalized === 'crm'
  ) {
    return ContactRound;
  }

  if (
    normalized ===
      'sale' ||
    normalized ===
      'sales'
  ) {
    return ShoppingCart;
  }

  if (
    normalized ===
      'inventory' ||
    normalized ===
      'stock'
  ) {
    return Boxes;
  }

  if (
    normalized === 'hr' ||
    normalized ===
      'human-resources' ||
    normalized ===
      'human_resources'
  ) {
    return UsersRound;
  }

  if (
    normalized ===
      'project' ||
    normalized ===
      'projects'
  ) {
    return FolderKanban;
  }

  if (
    normalized ===
      'ecommerce' ||
    normalized ===
      'e-commerce' ||
    normalized ===
      'e_commerce'
  ) {
    return Store;
  }

  if (
    normalized === 'pos' ||
    normalized ===
      'point-of-sale' ||
    normalized ===
      'point_of_sale'
  ) {
    return PackageSearch;
  }

  return AppWindow;
}

function getInitials(
  user: UserData
) {
  const first =
    user.firstName
      ?.trim()
      .charAt(0);

  const last =
    user.lastName
      ?.trim()
      .charAt(0);

  const initials =
    `${first || ''}${last || ''}`
      .trim();

  if (initials) {
    return initials.toUpperCase();
  }

  if (
    user.fullName?.trim()
  ) {
    return user.fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part =>
        part.charAt(0)
      )
      .join('')
      .toUpperCase();
  }

  return (
    user.email
      .charAt(0)
      .toUpperCase() ||
    'S'
  );
}

function getDisplayName(
  user: UserData
) {
  return (
    user.fullName?.trim() ||
    `${user.firstName || ''} ${
      user.lastName || ''
    }`.trim() ||
    user.email
  );
}

function hrefPath(
  href: string
) {
  return (
    href.split('?')[0] ||
    href
  );
}

/* ============================================================
   WORKSPACE SIDEBAR
   ============================================================ */

export default function WorkspaceSidebar({
  user,
  tenant,
  membership,
  subscription,
  modules,
  capabilities,
  unreadNotifications = 0,
  open,
  onClose,
}: Props) {
  const pathname =
    usePathname();

  const searchParams =
    useSearchParams();

  const settingsTab =
    (
      searchParams.get(
        'tab'
      ) ||
      'personal'
    ) as SettingsTab;

  const canAdminWorkspace =
    Boolean(
      membership?.isAdmin ||
        membership?.isOwner
    );

  const canManageApps =
    canAdminWorkspace;

  const installedApps =
    useMemo(
      () =>
        modules.filter(
          module => {
            const status =
              String(
                module.status ||
                  ''
              )
                .trim()
                .toLowerCase();

            return !DISABLED_MODULE_STATUSES.has(
              status
            );
          }
        ),
      [modules]
    );

  const appChildren =
    useMemo<AppChild[]>(
      () =>
        installedApps.map(
          module => ({
            key: module.key,
            label:
              module.name,
            href:
              getModuleHref(
                module
              ),
            icon:
              getModuleIcon(
                module.key
              ),
          })
        ),
      [installedApps]
    );

  const settingsChildren =
    useMemo(
      () =>
        SETTINGS_CHILDREN.filter(
          item => {
            if (
              item.ownerOnly &&
              !membership?.isOwner
            ) {
              return false;
            }

            if (
              item.adminOnly &&
              !canAdminWorkspace
            ) {
              return false;
            }

            if (
              item.key === 'ai' &&
              capabilities
                ?.aiEnabled ===
                false
            ) {
              return false;
            }

            return true;
          }
        ),
      [
        membership?.isOwner,
        canAdminWorkspace,
        capabilities
          ?.aiEnabled,
      ]
    );

  const appRouteActive =
    appChildren.some(
      item => {
        const path =
          hrefPath(
            item.href
          );

        return (
          pathname === path ||
          pathname.startsWith(
            `${path}/`
          )
        );
      }
    );

  const settingsRouteActive =
    pathname ===
      '/settings' ||
    pathname.startsWith(
      '/settings/'
    );

  const coreRouteActive =
    pathname ===
      '/files' ||
    pathname.startsWith(
      '/files/'
    ) ||
    pathname ===
      '/notifications' ||
    pathname.startsWith(
      '/notifications/'
    );

  const [
    appsExpanded,
    setAppsExpanded,
  ] = useState(
    appRouteActive
  );

  const [
    coreExpanded,
    setCoreExpanded,
  ] = useState(
    coreRouteActive
  );

  const [
    settingsExpanded,
    setSettingsExpanded,
  ] = useState(
    settingsRouteActive
  );

  /*
   * Automatically expose the current
   * navigation branch.
   */
  useEffect(() => {
    if (appRouteActive) {
      setAppsExpanded(
        true
      );
    }
  }, [
    appRouteActive,
  ]);

  useEffect(() => {
    if (coreRouteActive) {
      setCoreExpanded(
        true
      );
    }
  }, [
    coreRouteActive,
  ]);

  useEffect(() => {
    if (
      settingsRouteActive
    ) {
      setSettingsExpanded(
        true
      );
    }
  }, [
    settingsRouteActive,
  ]);

  /*
   * Close mobile navigation after
   * browser navigation.
   */
  useEffect(() => {
    if (open) {
      onClose();
    }

    // Intentionally tied to URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pathname,
    searchParams,
  ]);

  const displayName =
    getDisplayName(user);

  const initials =
    getInitials(user);

  const planName =
    subscription?.planName ||
    subscription?.planKey ||
    'Free';

  const roleName =
    membership?.label ||
    membership
      ?.accessLevel ||
    'Member';

  return (
    <>
      {/* ======================================================
          MOBILE BACKDROP
          ====================================================== */}

      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {/* ======================================================
          SIDEBAR
          ====================================================== */}

      <aside
        aria-label="Workspace navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-[#090d15] lg:translate-x-0 ${
          open
            ? 'translate-x-0'
            : '-translate-x-full'
        }`}
      >
        {/* BRAND */}

        <div className="flex h-[76px] shrink-0 items-center border-b border-slate-100 px-5 dark:border-slate-800">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="min-w-0 flex-1"
          >
            <SaMiLogo
              size="sm"
              className="max-w-full"
            />
          </Link>

          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* WORKSPACE IDENTITY */}

        <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 dark:bg-slate-900">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-xs font-black text-white">
              {tenant?.name
                ?.trim()
                .charAt(0)
                .toUpperCase() ||
                'S'}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                {tenant?.name ||
                  'SaMi Workspace'}
              </p>

              <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                {roleName}
                {' · '}
                {planName}
              </p>
            </div>
          </div>
        </div>

        {/* NAVIGATION */}

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <NavSectionLabel>
            Workspace
          </NavSectionLabel>

          <div className="space-y-1">
            <NavLink
              href="/dashboard"
              icon={Home}
              label="Dashboard"
              active={
                pathname ===
                  '/dashboard' ||
                pathname.startsWith(
                  '/dashboard/'
                )
              }
              onNavigate={
                onClose
              }
            />

            {capabilities
              ?.aiEnabled !==
              false && (
              <NavLink
                href="/ai"
                icon={Bot}
                label="SaMi AI"
                active={
                  pathname ===
                    '/ai' ||
                  pathname.startsWith(
                    '/ai/'
                  )
                }
                onNavigate={
                  onClose
                }
              />
            )}
          </div>

          {/* APPS */}

          <div className="mt-6">
            <NavSectionLabel>
              Business
            </NavSectionLabel>

            <DropdownButton
              icon={LayoutGrid}
              label="Apps"
              expanded={
                appsExpanded
              }
              active={
                appRouteActive
              }
              badge={
                installedApps.length >
                0
                  ? String(
                      installedApps.length
                    )
                  : undefined
              }
              onClick={() =>
                setAppsExpanded(
                  current =>
                    !current
                )
              }
            />

            {appsExpanded && (
              <div className="ml-[19px] mt-1 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                {appChildren.length >
                0 ? (
                  appChildren.map(
                    item => (
                      <ChildNavLink
                        key={
                          item.key
                        }
                        href={
                          item.href
                        }
                        icon={
                          item.icon
                        }
                        label={
                          item.label
                        }
                        active={
                          pathname ===
                            hrefPath(
                              item.href
                            ) ||
                          pathname.startsWith(
                            `${hrefPath(
                              item.href
                            )}/`
                          )
                        }
                        onNavigate={
                          onClose
                        }
                      />
                    )
                  )
                ) : (
                  <div className="px-3 py-2 text-[10px] font-semibold leading-4 text-slate-400">
                    No business apps installed.
                  </div>
                )}

                {canManageApps && (
                  <ChildNavLink
                    href="/settings?tab=apps"
                    icon={AppWindow}
                    label="Manage Apps"
                    active={
                      settingsRouteActive &&
                      settingsTab ===
                        'apps'
                    }
                    onNavigate={
                      onClose
                    }
                  />
                )}
              </div>
            )}
          </div>

          {/* CORE */}

          {(capabilities
            ?.filesEnabled ||
            capabilities
              ?.notificationsEnabled) && (
            <div className="mt-6">
              <NavSectionLabel>
                Core
              </NavSectionLabel>

              <DropdownButton
                icon={Folder}
                label="Workspace Tools"
                expanded={
                  coreExpanded
                }
                active={
                  coreRouteActive
                }
                onClick={() =>
                  setCoreExpanded(
                    current =>
                      !current
                  )
                }
              />

              {coreExpanded && (
                <div className="ml-[19px] mt-1 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                  {capabilities
                    ?.filesEnabled && (
                    <ChildNavLink
                      href="/files"
                      icon={Folder}
                      label="Files"
                      active={
                        pathname ===
                          '/files' ||
                        pathname.startsWith(
                          '/files/'
                        )
                      }
                      onNavigate={
                        onClose
                      }
                    />
                  )}

                  {capabilities
                    ?.notificationsEnabled && (
                    <ChildNavLink
                      href="/notifications"
                      icon={Bell}
                      label="Notifications"
                      badge={
                        unreadNotifications >
                        0
                          ? unreadNotifications >
                            99
                            ? '99+'
                            : String(
                                unreadNotifications
                              )
                          : undefined
                      }
                      active={
                        pathname ===
                          '/notifications' ||
                        pathname.startsWith(
                          '/notifications/'
                        )
                      }
                      onNavigate={
                        onClose
                      }
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* SETTINGS */}

          <div className="mt-6">
            <NavSectionLabel>
              Account
            </NavSectionLabel>

            <DropdownButton
              icon={Settings}
              label="Settings"
              expanded={
                settingsExpanded
              }
              active={
                settingsRouteActive
              }
              onClick={() =>
                setSettingsExpanded(
                  current =>
                    !current
                )
              }
            />

            {settingsExpanded && (
              <div className="ml-[19px] mt-1 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                {settingsChildren.map(
                  item => (
                    <ChildNavLink
                      key={
                        item.key
                      }
                      href={
                        item.href
                      }
                      icon={
                        item.icon
                      }
                      label={
                        item.label
                      }
                      active={
                        settingsRouteActive &&
                        settingsTab ===
                          item.key
                      }
                      onNavigate={
                        onClose
                      }
                    />
                  )
                )}
              </div>
            )}

            <div className="mt-1">
              <NavLink
                href="/help"
                icon={
                  CircleHelp
                }
                label="Help"
                active={
                  pathname ===
                    '/help' ||
                  pathname.startsWith(
                    '/help/'
                  )
                }
                onNavigate={
                  onClose
                }
              />
            </div>
          </div>
        </nav>

        {/* USER */}

        <div className="shrink-0 border-t border-slate-100 p-3 dark:border-slate-800">
          <Link
            href="/settings?tab=personal"
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-xs font-black text-white">
              {initials}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                {displayName}
              </p>

              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                {user.email}
              </p>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
}

/* ============================================================
   SECTION LABEL
   ============================================================ */

function NavSectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
      {children}
    </p>
  );
}

/* ============================================================
   PRIMARY NAV LINK
   ============================================================ */

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  badge,
  onNavigate,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={
        active
          ? 'page'
          : undefined
      }
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
      }`}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${
          active
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-slate-400'
        }`}
      />

      <span className="min-w-0 flex-1 truncate">
        {label}
      </span>

      {badge && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {badge}
        </span>
      )}
    </Link>
  );
}

/* ============================================================
   DROPDOWN PARENT
   ============================================================ */

function DropdownButton({
  icon: Icon,
  label,
  expanded,
  active,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  expanded: boolean;
  active: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={
        expanded
      }
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
      }`}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${
          active
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-slate-400'
        }`}
      />

      <span className="min-w-0 flex-1 truncate">
        {label}
      </span>

      {badge && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {badge}
        </span>
      )}

      <ChevronDown
        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
          expanded
            ? 'rotate-180'
            : ''
        }`}
      />
    </button>
  );
}

/* ============================================================
   CHILD NAV LINK
   ============================================================ */

function ChildNavLink({
  href,
  icon: Icon,
  label,
  active,
  badge,
  onNavigate,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={
        active
          ? 'page'
          : undefined
      }
      className={`flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-[11px] font-bold transition ${
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/35 dark:text-blue-300'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
      }`}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${
          active
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-slate-400'
        }`}
      />

      <span className="min-w-0 flex-1 truncate">
        {label}
      </span>

      {badge && (
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {badge}
        </span>
      )}
    </Link>
  );
}