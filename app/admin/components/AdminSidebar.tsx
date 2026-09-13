'use client';

import Link from 'next/link';

import {
  usePathname,
} from 'next/navigation';

import {
  LayoutDashboard,
  Users,
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

import type {
  AdminSession,
  PlatformAdminRole,
} from '@/lib/auth/admin-session';

type AdminSidebarProps = {
  admin:
    AdminSession;

  open:
    boolean;

  onClose:
    () => void;
};

type NavigationItem = {
  label:
    string;

  href:
    string;

  icon:
    React.ElementType;

  roles?:
    readonly PlatformAdminRole[];
};

const navigation:
  NavigationItem[] = [
    {
      label:
        'Dashboard',

      href:
        '/admin',

      icon:
        LayoutDashboard,
    },

    {
      label:
        'Users',

      href:
        '/admin/users',

      icon:
        Users,

      roles: [
        'super_admin',
        'support_admin',
        'security_admin',
        'operations_admin',
        'read_only_admin',
      ],
    },

    {
      label:
        'Businesses',

      href:
        '/admin/businesses',

      icon:
        Building2,

      roles: [
        'super_admin',
        'support_admin',
        'operations_admin',
        'billing_admin',
        'read_only_admin',
      ],
    },

    {
      label:
        'Security',

      href:
        '/admin/security',

      icon:
        ShieldCheck,

      roles: [
        'super_admin',
        'security_admin',
        'read_only_admin',
      ],
    },

    {
      label:
        'Subscriptions',

      href:
        '/admin/subscriptions',

      icon:
        CreditCard,

      roles: [
        'super_admin',
        'billing_admin',
        'operations_admin',
        'read_only_admin',
      ],
    },

    {
      label:
        'Apps',

      href:
        '/admin/apps',

      icon:
        Boxes,

      roles: [
        'super_admin',
        'operations_admin',
        'developer_admin',
        'read_only_admin',
      ],
    },

    {
      label:
        'Notifications',

      href:
        '/admin/notifications',

      icon:
        Bell,

      roles: [
        'super_admin',
        'support_admin',
        'operations_admin',
        'read_only_admin',
      ],
    },

    {
      label:
        'Audit Logs',

      href:
        '/admin/audit',

      icon:
        ScrollText,

      roles: [
        'super_admin',
        'security_admin',
        'read_only_admin',
      ],
    },

    {
      label:
        'Settings',

      href:
        '/admin/settings',

      icon:
        Settings,

      roles: [
        'super_admin',
        'security_admin',
        'developer_admin',
      ],
    },
  ];

function canSeeItem(
  role:
    PlatformAdminRole,
  item:
    NavigationItem
) {
  if (
    role ===
    'super_admin'
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

function roleLabel(
  role:
    PlatformAdminRole
) {
  return role
    .split('_')
    .map(
      (part) =>
        part
          .charAt(0)
          .toUpperCase() +
        part.slice(1)
    )
    .join(' ');
}

export default function AdminSidebar({
  admin,
  open,
  onClose,
}: AdminSidebarProps) {
  const pathname =
    usePathname();

  const visibleNavigation =
    navigation.filter(
      (item) =>
        canSeeItem(
          admin.role,
          item
        )
    );

  return (
    <>
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
        <div
          className="
            flex
            h-16
            items-center
            justify-between

            border-b
            border-zinc-200

            px-5

            dark:border-zinc-800
          "
        >
          <Link
            href="/admin"
            className="
              flex
              items-center
              gap-3
            "
            onClick={onClose}
          >
            <div
              className="
                flex
                h-9
                w-9
                items-center
                justify-center

                rounded-xl

                bg-zinc-950
                text-sm
                font-bold
                text-white

                dark:bg-white
                dark:text-zinc-950
              "
            >
              SM
            </div>

            <div>
              <div
                className="
                  font-semibold
                  tracking-tight
                "
              >
                SaMi Admin
              </div>

              <div
                className="
                  text-xs
                  text-zinc-500
                "
              >
                Platform Control
              </div>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="
              rounded-lg
              p-2

              text-zinc-500

              hover:bg-zinc-100

              dark:hover:bg-zinc-900

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
              text-sm
              font-medium
            "
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
          >
            {admin.email}
          </div>

          <div
            className="
              mt-3

              inline-flex
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

        <nav
          className="
            flex-1

            space-y-1

            overflow-y-auto

            px-3
            py-4
          "
        >
          {visibleNavigation.map(
            (item) => {
              const Icon =
                item.icon;

              const active =
                item.href ===
                '/admin'
                  ? pathname ===
                    '/admin'
                  : pathname ===
                      item.href ||
                    pathname.startsWith(
                      `${item.href}/`
                    );

              return (
                <Link
                  key={
                    item.href
                  }
                  href={
                    item.href
                  }
                  onClick={
                    onClose
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
                    className="
                      h-5
                      w-5
                      shrink-0
                    "
                  />

                  <span
                    className="
                      flex-1
                    "
                  >
                    {
                      item.label
                    }
                  </span>

                  {active && (
                    <ChevronRight
                      className="
                        h-4
                        w-4
                      "
                    />
                  )}
                </Link>
              );
            }
          )}
        </nav>

        <div
          className="
            border-t
            border-zinc-200

            px-5
            py-4

            text-xs
            text-zinc-500

            dark:border-zinc-800
          "
        >
          SaMi Technologies
        </div>
      </aside>
    </>
  );
}