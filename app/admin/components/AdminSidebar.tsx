'use client';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  usePathname,
} from 'next/navigation';

import {
  LayoutDashboard,
  Users,
  UserCog,
  Building2,
  ShieldCheck,
  CreditCard,
  Boxes,
  Bell,
  ScrollText,
  Settings,
  X,
  ChevronDown,
  UserRound,
  SlidersHorizontal,
  Activity,
  CircleAlert,
  CloudCog,
  ListChecks,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

import type {
  AdminSession,
  PlatformAdminRole,
} from '@/lib/auth/admin-session';

import {
  hasAdminCapability,
  type PlatformAdminCapability,
} from '@/lib/admin/capabilities';

/* ============================================================
   TYPES
   ============================================================ */

type AdminSidebarProps = {
  admin: AdminSession;
  open: boolean;
  onClose: () => void;
};

type NavigationChild = {
  label: string;
  href: string;

  icon?: React.ElementType;

  capability?: PlatformAdminCapability;

  /**
   * A child may be visible before its capability is complete.
   * Disabled children never navigate.
   */
  disabled?: boolean;
};

type NavigationItem = {
  label: string;

  /**
   * Parent href is optional because dropdown-only parents
   * should not require a landing page.
   */
  href?: string;

  icon: React.ElementType;

  capability?: PlatformAdminCapability;

  children?: readonly NavigationChild[];
};

/* ============================================================
   NAVIGATION
   ============================================================ */

const navigation: readonly NavigationItem[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },

  {
    label: 'Administrators',
    href: '/admin/administrators',
    icon: UserCog,

    capability: 'administrators.read',
  },

  {
    label: 'Users',
    href: '/admin/users',
    icon: Users,

    capability: 'users.read',
  },

  {
    label: 'Businesses',
    href: '/admin/businesses',
    icon: Building2,

    capability: 'tenants.read',
  },

  {
    label: 'Security',
    href: '/admin/security',
    icon: ShieldCheck,

    capability: 'security.read',
  },

  {
    label: 'Subscriptions',
    href: '/admin/subscriptions',
    icon: CreditCard,

    capability: 'subscriptions.read',
  },

  {
    label: 'Apps',
    href: '/admin/apps',
    icon: Boxes,

    capability: 'modules.read',
  },

  {
    label: 'Operations',
    icon: Activity,

    children: [
      {
        label: 'Platform Health',
        href: '/admin/operations/health',
        icon: Activity,
        capability: 'health.read',
      },

      {
        label: 'Incidents & Errors',
        href: '/admin/operations/incidents',
        icon: CircleAlert,
        capability: 'incidents.read',
      },

      {
        label: 'Providers',
        href: '/admin/operations/providers',
        icon: CloudCog,
        capability: 'providers.read',
      },

      {
        label: 'Services & Costs',
        href: '/admin/operations/services',
        icon: CreditCard,
        capability: 'providers.read',
      },

      {
        label: 'Vercel Runtime',
        href: '/admin/operations/vercel',
        icon: CloudCog,
        capability: 'providers.read',
      },

      {
        label: 'Jobs & Workers',
        href: '/admin/operations/jobs',
        icon: ListChecks,
        capability: 'jobs.read',
      },
    ],
  },

  {
    label: 'Notifications',
    href: '/admin/notifications',
    icon: Bell,

    capability: 'notifications.read',
  },

  {
    label: 'Audit Logs',
    href: '/admin/audit',
    icon: ScrollText,

    capability: 'audit.read',
  },

  /* ==========================================================
     SETTINGS

     Settings is a dropdown parent.

     We intentionally do NOT require the administrator to open
     /admin/settings and then navigate through another sidebar.

     The main Platform Admin sidebar owns this hierarchy.
     ========================================================== */

  {
    label: 'Settings',
    icon: Settings,

    children: [
      {
        label: 'My Account',
        href: '/admin/settings/account',
        icon: UserRound,
      },

      {
        label: 'Notifications',
        href: '/admin/settings/notifications',
        icon: Bell,
      },

      {
        label: 'Platform Settings',
        href: '/admin/settings/platform',
        icon: SlidersHorizontal,

        /*
         * Category 25.
         *
         * This will later receive its own permission enforcement
         * at both page and API boundaries.
         */
        capability: 'security.read',

        disabled: true,
      },
    ],
  },
];

/* ============================================================
   ACCESS
   ============================================================ */

function canSeeCapability(
  role: PlatformAdminRole,
  capability?: PlatformAdminCapability
) {
  if (!capability) {
    return true;
  }

  return hasAdminCapability(
    role,
    capability
  );
}

function getVisibleChildren(
  role: PlatformAdminRole,
  item: NavigationItem
) {
  if (!item.children) {
    return [];
  }

  return item.children.filter(
    child =>
      canSeeCapability(
        role,
        child.capability
      )
  );
}

function canSeeItem(
  role: PlatformAdminRole,
  item: NavigationItem
) {
  if (
    !canSeeCapability(
      role,
      item.capability
    )
  ) {
    return false;
  }

  if (
    item.children &&
    !item.href
  ) {
    return (
      getVisibleChildren(
        role,
        item
      ).length > 0
    );
  }

  return true;
}

/* ============================================================
   LABELS
   ============================================================ */

function roleLabel(
  role: PlatformAdminRole
) {
  return role
    .split('_')
    .map(
      part =>
        part
          .charAt(0)
          .toUpperCase() +
        part.slice(1)
    )
    .join(' ');
}

/* ============================================================
   ROUTE MATCHING
   ============================================================ */

function isRouteActive(
  pathname: string,
  href: string
) {
  if (
    href === '/admin'
  ) {
    return pathname === '/admin';
  }

  return (
    pathname === href ||
    pathname.startsWith(
      `${href}/`
    )
  );
}

function isChildActive(
  pathname: string,
  child: NavigationChild
) {
  return isRouteActive(
    pathname,
    child.href
  );
}

function isParentActive(
  pathname: string,
  item: NavigationItem,
  visibleChildren: readonly NavigationChild[]
) {
  if (
    item.href &&
    isRouteActive(
      pathname,
      item.href
    )
  ) {
    return true;
  }

  return visibleChildren.some(
    child =>
      isChildActive(
        pathname,
        child
      )
  );
}

/* ============================================================
   COMPONENT
   ============================================================ */

export default function AdminSidebar({
  admin,
  open,
  onClose,
}: AdminSidebarProps) {
  const pathname =
    usePathname();

  /* ==========================================================
     VISIBLE NAVIGATION
     ========================================================== */

  const visibleNavigation =
    useMemo(
      () =>
        navigation.filter(
          item =>
            canSeeItem(
              admin.role,
              item
            )
        ),
      [admin.role]
    );

  /* ==========================================================
     EXPANDED DROPDOWNS

     Store labels rather than array indexes so the state remains
     stable when role filtering changes navigation.
     ========================================================== */

  const [
    expanded,
    setExpanded,
  ] =
    useState<Record<string, boolean>>(
      {}
    );

  /* ==========================================================
     AUTO-EXPAND ACTIVE PARENT

     If the administrator refreshes directly on:
       /admin/settings/account

     Settings remains expanded automatically.
     ========================================================== */

  useEffect(() => {
    setExpanded(
      current => {
        let changed = false;

        const next = {
          ...current,
        };

        for (
          const item of
          visibleNavigation
        ) {
          const children =
            getVisibleChildren(
              admin.role,
              item
            );

          if (
            children.length === 0
          ) {
            continue;
          }

          const containsActiveRoute =
            children.some(
              child =>
                isChildActive(
                  pathname,
                  child
                )
            );

          if (
            containsActiveRoute &&
            !next[item.label]
          ) {
            next[item.label] =
              true;

            changed = true;
          }
        }

        return changed
          ? next
          : current;
      }
    );
  }, [
    pathname,
    admin.role,
    visibleNavigation,
  ]);

  /* ==========================================================
     TOGGLE
     ========================================================== */

  function toggleDropdown(
    label: string
  ) {
    setExpanded(
      current => ({
        ...current,

        [label]:
          !current[label],
      })
    );
  }

  /* ==========================================================
     MOBILE CLOSE

     Navigation links close the mobile drawer.
     Dropdown buttons do NOT close it.
     ========================================================== */

  function handleNavigation() {
    onClose();
  }

  return (
    <>
      {/* ======================================================
          MOBILE OVERLAY
          ====================================================== */}

      {open && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={onClose}
          className="
            fixed
            inset-0
            z-40

            bg-black/40
            backdrop-blur-sm

            lg:hidden
          "
        />
      )}

      {/* ======================================================
          SIDEBAR
          ====================================================== */}

      <aside
        className={`
          fixed
          inset-y-0
          left-0
          z-50

          flex
          w-72
          flex-col

          border-r
          border-zinc-200

          bg-white

          transition-transform
          duration-200

          dark:border-zinc-800
          dark:bg-zinc-950

          lg:translate-x-0

          ${
            open
              ? 'translate-x-0'
              : '-translate-x-full'
          }
        `}
      >
        {/* ====================================================
            BRAND
            ==================================================== */}

        <div
          className="
            flex
            min-h-20
            items-center
            justify-between

            border-b
            border-zinc-200

            px-5
            py-3

            dark:border-zinc-800
          "
        >
          <Link
            href="/admin"
            onClick={
              handleNavigation
            }
            aria-label="SaMi Platform Administration"
            className="
              min-w-0
              flex-1

              rounded-xl

              outline-none

              focus-visible:ring-2
              focus-visible:ring-zinc-400
              focus-visible:ring-offset-2

              dark:focus-visible:ring-zinc-600
              dark:focus-visible:ring-offset-zinc-950
            "
          >
            <SaMiLogo
              size="sm"
              showTagline={false}
              showReflection={false}
              showBackground={false}
              className="max-w-[150px]"
            />

            <div
              className="
                mt-1

                text-[11px]
                font-medium
                tracking-wide
                text-zinc-500
              "
            >
              Platform Administration
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="
              ml-3

              rounded-lg

              p-2

              text-zinc-500

              transition-colors

              hover:bg-zinc-100
              hover:text-zinc-950

              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-zinc-400

              dark:hover:bg-zinc-900
              dark:hover:text-white
              dark:focus-visible:ring-zinc-600

              lg:hidden
            "
          >
            <X
              className="
                h-5
                w-5
              "
            />
          </button>
        </div>

        {/* ====================================================
            CURRENT ADMINISTRATOR
            ==================================================== */}

        <div
          className="
            border-b
            border-zinc-200

            px-5
            py-4

            dark:border-zinc-800
          "
        >
          <div
            className="
              truncate

              text-sm
              font-semibold
              text-zinc-950

              dark:text-white
            "
            title={
              admin.fullName
            }
          >
            {admin.fullName}
          </div>

          <div
            className="
              mt-1
              truncate

              text-xs
              text-zinc-500
            "
            title={admin.email}
          >
            {admin.email}
          </div>

          <div
            className="
              mt-3

              inline-flex
              items-center

              rounded-full

              bg-zinc-100

              px-2.5
              py-1

              text-xs
              font-medium
              text-zinc-700

              dark:bg-zinc-900
              dark:text-zinc-300
            "
          >
            {roleLabel(
              admin.role
            )}
          </div>
        </div>

        {/* ====================================================
            NAVIGATION
            ==================================================== */}

        <nav
          aria-label="Platform administrator navigation"
          className="
            flex-1

            overflow-y-auto

            px-3
            py-4
          "
        >
          <div className="space-y-1">
            {visibleNavigation.map(
              item => {
                const Icon =
                  item.icon;

                const children =
                  getVisibleChildren(
                    admin.role,
                    item
                  );

                const hasChildren =
                  children.length > 0;

                const parentActive =
                  isParentActive(
                    pathname,
                    item,
                    children
                  );

                const isExpanded =
                  Boolean(
                    expanded[
                      item.label
                    ]
                  );

                /* ============================================
                   NORMAL LINK
                   ============================================ */

                if (
                  !hasChildren
                ) {
                  if (!item.href) {
                    return null;
                  }

                  return (
                    <Link
                      key={
                        item.label
                      }
                      href={
                        item.href
                      }
                      onClick={
                        handleNavigation
                      }
                      aria-current={
                        parentActive
                          ? 'page'
                          : undefined
                      }
                      className={`
                        group

                        flex
                        items-center
                        gap-3

                        rounded-xl

                        px-3
                        py-2.5

                        text-sm
                        font-medium

                        transition-colors

                        outline-none

                        focus-visible:ring-2
                        focus-visible:ring-zinc-400
                        focus-visible:ring-offset-2

                        dark:focus-visible:ring-zinc-600
                        dark:focus-visible:ring-offset-zinc-950

                        ${
                          parentActive
                            ? `
                              bg-zinc-950
                              text-white

                              dark:bg-white
                              dark:text-zinc-950
                            `
                            : `
                              text-zinc-600

                              hover:bg-zinc-100
                              hover:text-zinc-950

                              dark:text-zinc-400
                              dark:hover:bg-zinc-900
                              dark:hover:text-white
                            `
                        }
                      `}
                    >
                      <Icon
                        aria-hidden="true"
                        className="
                          h-5
                          w-5
                          shrink-0
                        "
                      />

                      <span className="flex-1">
                        {item.label}
                      </span>
                    </Link>
                  );
                }

                /* ============================================
                   DROPDOWN PARENT
                   ============================================ */

                return (
                  <div
                    key={
                      item.label
                    }
                  >
                    <button
                      type="button"
                      onClick={() =>
                        toggleDropdown(
                          item.label
                        )
                      }
                      aria-expanded={
                        isExpanded
                      }
                      aria-controls={`admin-sidebar-${item.label
                        .toLowerCase()
                        .replace(
                          /[^a-z0-9]+/g,
                          '-'
                        )}`}
                      className={`
                        group

                        flex
                        w-full
                        items-center
                        gap-3

                        rounded-xl

                        px-3
                        py-2.5

                        text-left
                        text-sm
                        font-medium

                        transition-colors

                        outline-none

                        focus-visible:ring-2
                        focus-visible:ring-zinc-400
                        focus-visible:ring-offset-2

                        dark:focus-visible:ring-zinc-600
                        dark:focus-visible:ring-offset-zinc-950

                        ${
                          parentActive
                            ? `
                              bg-zinc-100
                              text-zinc-950

                              dark:bg-zinc-900
                              dark:text-white
                            `
                            : `
                              text-zinc-600

                              hover:bg-zinc-100
                              hover:text-zinc-950

                              dark:text-zinc-400
                              dark:hover:bg-zinc-900
                              dark:hover:text-white
                            `
                        }
                      `}
                    >
                      <Icon
                        aria-hidden="true"
                        className="
                          h-5
                          w-5
                          shrink-0
                        "
                      />

                      <span
                        className="
                          min-w-0
                          flex-1
                          truncate
                        "
                      >
                        {item.label}
                      </span>

                      <ChevronDown
                        aria-hidden="true"
                        className={`
                          h-4
                          w-4
                          shrink-0

                          transition-transform
                          duration-200

                          ${
                            isExpanded
                              ? 'rotate-180'
                              : ''
                          }
                        `}
                      />
                    </button>

                    {/* ========================================
                        CHILDREN
                        ======================================== */}

                    <div
                      id={`admin-sidebar-${item.label
                        .toLowerCase()
                        .replace(
                          /[^a-z0-9]+/g,
                          '-'
                        )}`}
                      className={`
                        grid

                        transition-[grid-template-rows,opacity]
                        duration-200
                        ease-out

                        ${
                          isExpanded
                            ? `
                              grid-rows-[1fr]
                              opacity-100
                            `
                            : `
                              grid-rows-[0fr]
                              opacity-0
                            `
                        }
                      `}
                    >
                      <div className="overflow-hidden">
                        <div
                          className="
                            relative

                            ml-5
                            mt-1
                            space-y-1

                            border-l
                            border-zinc-200

                            pl-3

                            dark:border-zinc-800
                          "
                        >
                          {children.map(
                            child => {
                              const ChildIcon =
                                child.icon;

                              const active =
                                isChildActive(
                                  pathname,
                                  child
                                );

                              /* ==============================
                                 DISABLED CHILD
                                 ============================== */

                              if (
                                child.disabled
                              ) {
                                return (
                                  <div
                                    key={
                                      child.href
                                    }
                                    aria-disabled="true"
                                    title="This section will become available when its SaMi capability is implemented."
                                    className="
                                      flex
                                      cursor-not-allowed
                                      items-center
                                      gap-2.5

                                      rounded-lg

                                      px-3
                                      py-2

                                      text-sm
                                      text-zinc-400

                                      dark:text-zinc-600
                                    "
                                  >
                                    {ChildIcon && (
                                      <ChildIcon
                                        aria-hidden="true"
                                        className="
                                          h-4
                                          w-4
                                          shrink-0
                                        "
                                      />
                                    )}

                                    <span
                                      className="
                                        min-w-0
                                        flex-1
                                        truncate
                                      "
                                    >
                                      {child.label}
                                    </span>

                                    <span
                                      className="
                                        shrink-0

                                        rounded-full

                                        bg-zinc-100

                                        px-1.5
                                        py-0.5

                                        text-[9px]
                                        font-bold
                                        uppercase
                                        tracking-wide
                                        text-zinc-400

                                        dark:bg-zinc-900
                                        dark:text-zinc-600
                                      "
                                    >
                                      Later
                                    </span>
                                  </div>
                                );
                              }

                              /* ==============================
                                 ACTIVE CHILD LINK
                                 ============================== */

                              return (
                                <Link
                                  key={
                                    child.href
                                  }
                                  href={
                                    child.href
                                  }
                                  onClick={
                                    handleNavigation
                                  }
                                  aria-current={
                                    active
                                      ? 'page'
                                      : undefined
                                  }
                                  className={`
                                    flex
                                    items-center
                                    gap-2.5

                                    rounded-lg

                                    px-3
                                    py-2

                                    text-sm
                                    font-medium

                                    outline-none

                                    transition-colors

                                    focus-visible:ring-2
                                    focus-visible:ring-zinc-400

                                    dark:focus-visible:ring-zinc-600

                                    ${
                                      active
                                        ? `
                                          bg-zinc-950
                                          text-white

                                          dark:bg-white
                                          dark:text-zinc-950
                                        `
                                        : `
                                          text-zinc-500

                                          hover:bg-zinc-100
                                          hover:text-zinc-950

                                          dark:text-zinc-500
                                          dark:hover:bg-zinc-900
                                          dark:hover:text-white
                                        `
                                    }
                                  `}
                                >
                                  {ChildIcon && (
                                    <ChildIcon
                                      aria-hidden="true"
                                      className="
                                        h-4
                                        w-4
                                        shrink-0
                                      "
                                    />
                                  )}

                                  <span
                                    className="
                                      min-w-0
                                      flex-1
                                      truncate
                                    "
                                  >
                                    {child.label}
                                  </span>
                                </Link>
                              );
                            }
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </nav>

        {/* ====================================================
            FOOTER
            ==================================================== */}

        <div
          className="
            border-t
            border-zinc-200

            px-5
            py-4

            dark:border-zinc-800
          "
        >
          <div
            className="
              text-xs
              font-medium
              text-zinc-600

              dark:text-zinc-400
            "
          >
            SaMi Technologies
          </div>

          <div
            className="
              mt-1

              text-[11px]
              text-zinc-400

              dark:text-zinc-600
            "
          >
            Platform Control
          </div>
        </div>
      </aside>
    </>
  );
}