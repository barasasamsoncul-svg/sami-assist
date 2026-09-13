'use client';

import type {
  ReactNode,
} from 'react';

import {
  useState,
} from 'react';

import type {
  AdminSession,
} from '@/lib/auth/admin-session';

import AdminSidebar from './AdminSidebar';
import AdminTopBar from './AdminTopBar';

type AdminShellProps = {
  children:
    ReactNode;

  admin:
    AdminSession;
};

export default function AdminShell({
  children,
  admin,
}: AdminShellProps) {
  const [
    sidebarOpen,
    setSidebarOpen,
  ] =
    useState(false);

  return (
    <div
      className="
        min-h-screen
        bg-zinc-50
        text-zinc-950

        dark:bg-zinc-950
        dark:text-zinc-100
      "
    >
      <AdminSidebar
        admin={admin}
        open={sidebarOpen}
        onClose={() =>
          setSidebarOpen(
            false
          )
        }
      />

      <div
        className="
          min-h-screen
          lg:pl-72
        "
      >
        <AdminTopBar
          admin={admin}
          onMenuClick={() =>
            setSidebarOpen(
              true
            )
          }
        />

        <main
          className="
            px-4
            py-6

            sm:px-6

            lg:px-8
            lg:py-8
          "
        >
          {children}
        </main>
      </div>
    </div>
  );
}