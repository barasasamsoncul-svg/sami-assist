// app/admin/layout.tsx

import type {
  ReactNode,
} from 'react';

import {
  redirect,
} from 'next/navigation';

import {
  getAdminSession,
} from '@/lib/auth/admin-session';

import AdminShell from '../components/AdminShell';

export const dynamic =
  'force-dynamic';

type AdminLayoutProps = {
  children:
    ReactNode;
};

export default async function AdminLayout({
  children,
}: AdminLayoutProps) {
  const session =
    await getAdminSession();

  if (
    !session
  ) {
    redirect(
      '/admin/login'
    );
  }

  return (
    <AdminShell
      admin={session}
    >
      {children}
    </AdminShell>
  );
}