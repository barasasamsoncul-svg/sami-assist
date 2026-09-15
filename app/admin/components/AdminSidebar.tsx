'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
  ChevronRight,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

import type {
  AdminSession,
  PlatformAdminRole,
} from '@/lib/auth/admin-session';

/* ============================================================
   TYPES
   ============================================================ */

type AdminSidebarProps = {
  admin: AdminSession;
  open: boolean;
  onClose: () => void;
};

type NavigationItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: readonly PlatformAdminRole[];
};

/* ============================================================
   NAVIGATION
   ============================================================ */

const navigation: NavigationItem[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },

  {
    label: 'Administrators',
    href: '/admin/administrators',
    icon: UserCog,

    roles: [
      'super_admin',
    ],
  },

  {
    label: 'Users',
    href: '/admin/users',
    icon: Users,

    roles: [
      'super_admin',
      'support_admin',
      'security_admin',
      'operations_admin',
      'read_only_admin',
    ],
  },

  {
    label: 'Businesses',
    href: '/admin/businesses',
    icon: Building2,

    roles: [
      'super_admin',
      'support_admin',
      'operations_admin',
      'billing_admin',
      'read_only_admin',
    ],
  },

  {
    label: 'Security',
    href: '/admin/security',
    icon: ShieldCheck,

    roles: [
      'super_admin',
      'security_admin',
      'read_only_admin',
    ],
  },

  {
    label: 'Subscriptions',
    href: '/admin/subscriptions',
    icon: CreditCard,

    roles: [
      'super_admin',
      'billing_admin',
      'operations_admin',
      'read_only_admin',
    ],
  },

  {
    label: 'Apps',
    href: '/admin/apps',
    icon: Boxes,

    roles: [
      'super_admin',
      'operations_admin',
      'developer_admin',
      'read_only_admin',
    ],
  },

  {
    label: 'Notifications',
    href: '/admin/notifications',
    icon: Bell,

    roles: [
      'super_admin',
      'support_admin',
      'operations_admin',
      'read_only_admin',
    ],
  },

  {
    label: 'Audit Logs',
    href: '/admin/audit',
    icon: ScrollText,

    roles: [
      'super_admin',
      'security_admin',
      'read_only_admin',
    ],
  },

  /*
   * Personal administrator settings.
   *
   * IMPORTANT:
   * Every authenticated Platform Administrator must be able to
   * manage their own identity/account settings.
   *
   * Authorization for platform-wide configuration belongs inside
   * the relevant settings section/API, not by hiding the entire
   * Settings area from some administrator roles.
   */
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: Settings,
  },
];

/* ============================================================
   ROLE ACCESS
   ============================================================ */

function canSeeItem(
  role: PlatformAdminRole,
  item: NavigationItem
) {
  if (
    role === 'super_admin'
  ) {
    return true;
  }

  if (
    !item.roles
  ) {
    return true;
  }

  return item.roles.includes(
    role
  );
}

/* ============================================================
   ROLE LABEL
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
   ACTIVE ROUTE
   ============================================================ */

function isNavigationItemActive(
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

  const visibleNavigation =
    navigation.filter(
      item =>
        canSeeItem(
          admin.role,
          item
        )
    );

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
            fixed inset-0 z-40
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
          fixed inset-y-0 left-0 z-50
          flex w-72 flex-col

          border-r border-zinc-200
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
            flex min-h-20
            items-center
            justify-between

            border-b
            border-zinc-200

            px-5 py-3

            dark:border-zinc-800
          "
        >
          <Link
            href="/admin"
            onClick={onClose}
            aria-label="SaMi Platform Administration"
            className="
              min-w-0 flex-1
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
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ====================================================
            CURRENT ADMINISTRATOR
            ==================================================== */}

        <div
          className="
            border-b
            border-zinc-200

            px-5 py-4

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
            title={admin.fullName}
          >
            {admin.fullName}
          </div>

          <div
            className="
              mt-1 truncate
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
              px-2.5 py-1

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
            space-y-1

            overflow-y-auto

            px-3 py-4
          "
        >
          {visibleNavigation.map(
            item => {
              const Icon =
                item.icon;

              const active =
                isNavigationItemActive(
                  pathname,
                  item.href
                );

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  aria-current={
                    active
                      ? 'page'
                      : undefined
                  }
                  className={`
                    group

                    flex
                    items-center
                    gap-3

                    rounded-xl

                    px-3 py-2.5

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
                      active
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
                      h-5 w-5
                      shrink-0
                    "
                  />

                  <span className="flex-1">
                    {item.label}
                  </span>

                  {active && (
                    <ChevronRight
                      aria-hidden="true"
                      className="
                        h-4 w-4
                        shrink-0
                      "
                    />
                  )}
                </Link>
              );
            }
          )}
        </nav>

        {/* ====================================================
            FOOTER
            ==================================================== */}

        <div
          className="
            border-t
            border-zinc-200

            px-5 py-4

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