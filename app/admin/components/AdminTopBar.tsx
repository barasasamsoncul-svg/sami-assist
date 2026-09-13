'use client';

import {
  useRouter,
} from 'next/navigation';

import {
  useState,
} from 'react';

import {
  Menu,
  ShieldCheck,
  LogOut,
  Loader2,
  UserRound,
} from 'lucide-react';

import type {
  AdminSession,
} from '@/lib/auth/admin-session';

type AdminTopBarProps = {
  admin:
    AdminSession;

  onMenuClick:
    () => void;
};

export default function AdminTopBar({
  admin,
  onMenuClick,
}: AdminTopBarProps) {
  const router =
    useRouter();

  const [
    loggingOut,
    setLoggingOut,
  ] =
    useState(false);

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
            'include',
        }
      );
    } finally {
      router.replace(
        '/admin/login'
      );

      router.refresh();
    }
  }

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
        border-zinc-200

        bg-white/90

        px-4

        backdrop-blur

        dark:border-zinc-800
        dark:bg-zinc-950/90

        sm:px-6

        lg:px-8
      "
    >
      <button
        type="button"
        onClick={
          onMenuClick
        }
        className="
          mr-3

          rounded-lg

          p-2

          text-zinc-600

          hover:bg-zinc-100

          dark:text-zinc-300
          dark:hover:bg-zinc-900

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

      <div
        className="
          flex
          min-w-0
          flex-1
          items-center
          gap-3
        "
      >
        <ShieldCheck
          className="
            hidden
            h-5
            w-5

            text-zinc-500

            sm:block
          "
        />

        <div
          className="
            min-w-0
          "
        >
          <div
            className="
              truncate

              text-sm
              font-semibold
            "
          >
            SaMi Platform Administration
          </div>

          <div
            className="
              hidden

              truncate

              text-xs
              text-zinc-500

              sm:block
            "
          >
            Secure internal control workspace
          </div>
        </div>
      </div>

      <div
        className="
          flex
          items-center
          gap-2
        "
      >
        <div
          className="
            hidden

            items-center
            gap-2

            rounded-xl

            border
            border-zinc-200

            px-3
            py-2

            dark:border-zinc-800

            md:flex
          "
        >
          <UserRound
            className="
              h-4
              w-4

              text-zinc-500
            "
          />

          <div
            className="
              max-w-40

              truncate

              text-sm
              font-medium
            "
          >
            {admin.fullName}
          </div>
        </div>

        <button
          type="button"
          onClick={
            logout
          }
          disabled={
            loggingOut
          }
          className="
            inline-flex
            items-center
            gap-2

            rounded-xl

            border
            border-zinc-200

            px-3
            py-2

            text-sm
            font-medium

            transition-colors

            hover:bg-zinc-100

            disabled:cursor-not-allowed
            disabled:opacity-60

            dark:border-zinc-800
            dark:hover:bg-zinc-900
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

          <span
            className="
              hidden
              sm:inline
            "
          >
            Logout
          </span>
        </button>
      </div>
    </header>
  );
}