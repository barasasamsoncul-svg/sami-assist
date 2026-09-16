'use client';

import {
  usePathname,
  useRouter,
} from 'next/navigation';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Bell,
  Boxes,
  Building2,
  CreditCard,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  UserRound,
  Users,
} from 'lucide-react';

import UserAvatar from '@/app/components/account/UserAvatar';

import type {
  AdminSession,
} from '@/lib/auth/admin-session';

/* ============================================================
   TYPES
   ============================================================ */

type AdminTopBarProps = {
  admin: AdminSession;
  onMenuClick: () => void;
};

type RouteIdentity = {
  section: string;
  page: string;
  icon: React.ElementType;
};

type AdminAccountResponse = {
  success?: boolean;

  account?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    avatarFileId?: string | null;
    avatarUrl?: string | null;
  };
};

/* ============================================================
   ROUTE IDENTITY

   TopBar owns current-page identity.
   Sidebar owns navigation hierarchy.
   Page bodies therefore do not need repeated breadcrumbs,
   page titles or descriptive header blocks.
   ============================================================ */

function getRouteIdentity(
  pathname: string
): RouteIdentity {
  /* ==========================================================
     SETTINGS
     ========================================================== */

  if (
    pathname ===
      '/admin/settings/account' ||
    pathname.startsWith(
      '/admin/settings/account/'
    )
  ) {
    if (
      pathname.startsWith(
        '/admin/settings/account/email'
      )
    ) {
      return {
        section: 'Settings',
        page: 'Email',
        icon: Settings,
      };
    }

    return {
      section: 'Settings',
      page: 'My Account',
      icon: UserRound,
    };
  }

  if (
    pathname ===
      '/admin/settings/security' ||
    pathname.startsWith(
      '/admin/settings/security/'
    )
  ) {
    return {
      section: 'Settings',
      page: 'Security',
      icon: ShieldCheck,
    };
  }

  if (
    pathname ===
      '/admin/settings/sessions' ||
    pathname.startsWith(
      '/admin/settings/sessions/'
    )
  ) {
    return {
      section: 'Settings',
      page: 'Sessions & Devices',
      icon: ShieldCheck,
    };
  }

  if (
    pathname ===
      '/admin/settings/preferences' ||
    pathname.startsWith(
      '/admin/settings/preferences/'
    )
  ) {
    return {
      section: 'Settings',
      page: 'Preferences',
      icon: Settings,
    };
  }

  if (
    pathname ===
      '/admin/settings/notifications' ||
    pathname.startsWith(
      '/admin/settings/notifications/'
    )
  ) {
    return {
      section: 'Settings',
      page: 'Notifications',
      icon: Bell,
    };
  }

  if (
    pathname ===
      '/admin/settings/platform' ||
    pathname.startsWith(
      '/admin/settings/platform/'
    )
  ) {
    return {
      section: 'Settings',
      page: 'Platform Settings',
      icon: Settings,
    };
  }

  if (
    pathname ===
      '/admin/settings' ||
    pathname.startsWith(
      '/admin/settings/'
    )
  ) {
    return {
      section:
        'Platform Administration',
      page: 'Settings',
      icon: Settings,
    };
  }

  /* ==========================================================
     ADMINISTRATORS
     ========================================================== */

  if (
    pathname ===
    '/admin/administrators'
  ) {
    return {
      section:
        'Platform Administration',
      page: 'Administrators',
      icon: UserCog,
    };
  }

  if (
    pathname.startsWith(
      '/admin/administrators/'
    )
  ) {
    return {
      section: 'Administrators',
      page: 'Administrator Details',
      icon: UserCog,
    };
  }

  /* ==========================================================
     USERS
     ========================================================== */

  if (
    pathname ===
    '/admin/users'
  ) {
    return {
      section:
        'Platform Administration',
      page: 'Users',
      icon: Users,
    };
  }

  if (
    pathname.startsWith(
      '/admin/users/'
    )
  ) {
    return {
      section: 'Users',
      page: 'User Details',
      icon: Users,
    };
  }

  /* ==========================================================
     BUSINESSES / TENANTS
     ========================================================== */

  if (
    pathname ===
    '/admin/businesses'
  ) {
    return {
      section:
        'Platform Administration',
      page: 'Businesses',
      icon: Building2,
    };
  }

  if (
    pathname.startsWith(
      '/admin/businesses/'
    )
  ) {
    return {
      section: 'Businesses',
      page: 'Business Details',
      icon: Building2,
    };
  }

  /* ==========================================================
     SECURITY
     ========================================================== */

  if (
    pathname ===
    '/admin/security'
  ) {
    return {
      section:
        'Platform Administration',
      page: 'Security',
      icon: ShieldCheck,
    };
  }

  if (
    pathname.startsWith(
      '/admin/security/'
    )
  ) {
    return {
      section: 'Security',
      page: 'Security Details',
      icon: ShieldCheck,
    };
  }

  /* ==========================================================
     SUBSCRIPTIONS
     ========================================================== */

  if (
    pathname ===
    '/admin/subscriptions'
  ) {
    return {
      section:
        'Platform Administration',
      page: 'Subscriptions',
      icon: CreditCard,
    };
  }

  if (
    pathname.startsWith(
      '/admin/subscriptions/'
    )
  ) {
    return {
      section: 'Subscriptions',
      page: 'Subscription Details',
      icon: CreditCard,
    };
  }

  /* ==========================================================
     APPS
     ========================================================== */

  if (
    pathname ===
    '/admin/apps'
  ) {
    return {
      section:
        'Platform Administration',
      page: 'Apps',
      icon: Boxes,
    };
  }

  if (
    pathname.startsWith(
      '/admin/apps/'
    )
  ) {
    return {
      section: 'Apps',
      page: 'App Details',
      icon: Boxes,
    };
  }

  /* ==========================================================
     NOTIFICATIONS
     ========================================================== */

  if (
    pathname ===
    '/admin/notifications'
  ) {
    return {
      section:
        'Platform Administration',
      page: 'Notifications',
      icon: Bell,
    };
  }

  if (
    pathname.startsWith(
      '/admin/notifications/'
    )
  ) {
    return {
      section: 'Notifications',
      page: 'Notification Details',
      icon: Bell,
    };
  }

  /* ==========================================================
     AUDIT
     ========================================================== */

  if (
    pathname ===
    '/admin/audit'
  ) {
    return {
      section:
        'Platform Administration',
      page: 'Audit Logs',
      icon: ScrollText,
    };
  }

  if (
    pathname.startsWith(
      '/admin/audit/'
    )
  ) {
    return {
      section: 'Audit Logs',
      page: 'Audit Event',
      icon: ScrollText,
    };
  }

  /* ==========================================================
     DASHBOARD
     ========================================================== */

  return {
    section:
      'Platform Administration',
    page: 'Dashboard',
    icon: LayoutDashboard,
  };
}

/* ============================================================
   LABEL HELPERS
   ============================================================ */

function roleLabel(
  role: string
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

function getInitials(
  firstName: string,
  lastName: string
) {
  const first =
    firstName
      ?.trim()
      .charAt(0);

  const last =
    lastName
      ?.trim()
      .charAt(0);

  return (
    `${first || ''}${last || ''}`
      .toUpperCase() ||
    'SM'
  );
}

/* ============================================================
   COMPONENT
   ============================================================ */

export default function AdminTopBar({
  admin,
  onMenuClick,
}: AdminTopBarProps) {
  const router =
    useRouter();

  const pathname =
    usePathname();

  const [
    loggingOut,
    setLoggingOut,
  ] =
    useState(false);

  const [
    avatarFileId,
    setAvatarFileId,
  ] =
    useState<string | null>(
      null
    );

  const route =
    useMemo(
      () =>
        getRouteIdentity(
          pathname
        ),
      [
        pathname,
      ]
    );

  const PageIcon =
    route.icon;

  const initials =
    useMemo(
      () =>
        getInitials(
          admin.firstName,
          admin.lastName
        ),
      [
        admin.firstName,
        admin.lastName,
      ]
    );

  /* ==========================================================
     ADMIN AVATAR

     The authenticated account endpoint remains authoritative
     for administrator account/profile data.

     AdminSession does not need to become responsible for
     profile-image state. This also means an avatar changed in
     My Account can be refreshed without changing the session
     security model.
     ========================================================== */

  useEffect(() => {
    let cancelled =
      false;

    async function loadAvatar() {
      try {
        const response =
          await fetch(
            '/api/admin/account',
            {
              method:
                'GET',

              credentials:
                'same-origin',

              cache:
                'no-store',

              headers: {
                Accept:
                  'application/json',
              },
            }
          );

        if (
          !response.ok
        ) {
          return;
        }

        const data =
          (await response.json()) as
            AdminAccountResponse;

        if (
          cancelled
        ) {
          return;
        }

        setAvatarFileId(
          data.account
            ?.avatarFileId ??
            null
        );
      } catch (
        error
      ) {
        console.error(
          '[Admin TopBar] Failed to load administrator avatar:',
          error
        );
      }
    }

    void loadAvatar();

    return () => {
      cancelled =
        true;
    };
  }, [
    pathname,
  ]);

  /* ==========================================================
     LOGOUT
     ========================================================== */

  async function logout() {
    if (
      loggingOut
    ) {
      return;
    }

    setLoggingOut(
      true
    );

    try {
      await fetch(
        '/api/admin/auth/logout',
        {
          method:
            'POST',

          credentials:
            'same-origin',

          cache:
            'no-store',

          headers: {
            Accept:
              'application/json',
          },
        }
      );
    } catch (
      error
    ) {
      console.error(
        '[Admin TopBar] Logout request failed:',
        error
      );
    } finally {
      router.replace(
        '/admin/login'
      );

      router.refresh();
    }
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <header
      className="
        sticky
        top-0
        z-30

        flex
        h-16
        items-center

        border-b
        border-zinc-200/90

        bg-white/90

        px-4

        backdrop-blur-xl

        dark:border-zinc-800
        dark:bg-zinc-950/90

        sm:px-6
        lg:px-8
      "
    >
      {/* ======================================================
          MOBILE NAVIGATION
          ====================================================== */}

      <button
        type="button"
        onClick={
          onMenuClick
        }
        aria-label="Open administrator navigation"
        className="
          mr-3

          inline-flex
          h-10
          w-10
          shrink-0
          items-center
          justify-center

          rounded-xl

          text-zinc-600

          outline-none

          transition

          hover:bg-zinc-100
          hover:text-zinc-950

          focus-visible:ring-2
          focus-visible:ring-zinc-400
          focus-visible:ring-offset-2

          dark:text-zinc-300
          dark:hover:bg-zinc-900
          dark:hover:text-white
          dark:focus-visible:ring-zinc-600
          dark:focus-visible:ring-offset-zinc-950

          lg:hidden
        "
      >
        <Menu
          className="
            h-5
            w-5
          "
        />
      </button>

      {/* ======================================================
          CURRENT PAGE IDENTITY
          ====================================================== */}

      <div
        className="
          flex
          min-w-0
          flex-1
          items-center
          gap-3
        "
      >
        <div
          className="
            hidden
            h-9
            w-9
            shrink-0
            items-center
            justify-center

            rounded-xl

            border
            border-zinc-200

            bg-zinc-50

            text-zinc-600

            dark:border-zinc-800
            dark:bg-zinc-900
            dark:text-zinc-300

            sm:flex
          "
        >
          <PageIcon
            className="
              h-[18px]
              w-[18px]
            "
          />
        </div>

        <div
          className="
            min-w-0
          "
        >
          <div
            className="
              flex
              min-w-0
              items-center
              gap-2
            "
          >
            <h1
              className="
                truncate

                text-sm
                font-bold
                text-zinc-950

                dark:text-white

                sm:text-[15px]
              "
            >
              {route.page}
            </h1>
          </div>

          <div
            className="
              mt-0.5
              hidden

              truncate

              text-xs
              font-medium
              text-zinc-500

              sm:block
            "
          >
            {route.section}
          </div>
        </div>
      </div>

      {/* ======================================================
          ADMINISTRATOR IDENTITY
          ====================================================== */}

      <div
        className="
          ml-4
          flex
          shrink-0
          items-center
          gap-2
        "
      >
        <div
          className="
            hidden

            items-center
            gap-3

            rounded-xl

            border
            border-zinc-200

            bg-white

            px-2.5
            py-1.5

            dark:border-zinc-800
            dark:bg-zinc-900

            md:flex
          "
        >
          <UserAvatar
            avatarFileId={
              avatarFileId
            }
            displayName={
              admin.fullName
            }
            initials={
              initials
            }
            endpoint="/api/admin/account/avatar"
            size="sm"
          />

          <div
            className="
              min-w-0
              max-w-44
            "
          >
            <div
              className="
                truncate

                text-xs
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
                mt-0.5
                truncate

                text-[11px]
                text-zinc-500
              "
              title={
                roleLabel(
                  admin.role
                )
              }
            >
              {roleLabel(
                admin.role
              )}
            </div>
          </div>
        </div>

        {/* ====================================================
            MOBILE ADMIN AVATAR
            ==================================================== */}

        <div
          className="
            flex
            items-center
            md:hidden
          "
        >
          <UserAvatar
            avatarFileId={
              avatarFileId
            }
            displayName={
              admin.fullName
            }
            initials={
              initials
            }
            endpoint="/api/admin/account/avatar"
            size="sm"
          />
        </div>

        {/* ====================================================
            LOGOUT
            ==================================================== */}

        <button
          type="button"
          onClick={
            logout
          }
          disabled={
            loggingOut
          }
          aria-label={
            loggingOut
              ? 'Signing out'
              : 'Sign out'
          }
          title={
            loggingOut
              ? 'Signing out'
              : 'Sign out'
          }
          className="
            inline-flex
            h-10
            w-10
            shrink-0
            items-center
            justify-center

            rounded-xl

            border
            border-zinc-200

            bg-white

            text-zinc-500

            outline-none

            transition

            hover:border-red-200
            hover:bg-red-50
            hover:text-red-600

            focus-visible:ring-2
            focus-visible:ring-red-400
            focus-visible:ring-offset-2

            disabled:cursor-not-allowed
            disabled:opacity-60

            dark:border-zinc-800
            dark:bg-zinc-900
            dark:text-zinc-400
            dark:hover:border-red-900
            dark:hover:bg-red-950/30
            dark:hover:text-red-400
            dark:focus-visible:ring-offset-zinc-950
          "
        >
          {loggingOut ? (
            <Loader2
              className="
                h-4
                w-4
                animate-spin
              "
            />
          ) : (
            <LogOut
              className="
                h-4
                w-4
              "
            />
          )}
        </button>
      </div>
    </header>
  );
}