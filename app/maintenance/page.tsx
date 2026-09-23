import Link from 'next/link';
import {
  redirect,
} from 'next/navigation';

import {
  Clock3,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

import {
  getRuntimePlatformSettings,
} from '@/lib/admin/platform-settings';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function MaintenancePage() {
  const settings =
    await getRuntimePlatformSettings();

  if (
    !settings
      .operations
      .maintenanceMode
  ) {
    redirect(
      '/dashboard',
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-white sm:px-6">
      <div className="mx-auto flex min-h-[75vh] max-w-2xl items-center">
        <section className="w-full rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <Wrench className="h-7 w-7" />
          </div>

          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.18em] text-amber-600 dark:text-amber-300">
            Scheduled maintenance
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
            SaMi workspace is temporarily unavailable
          </h1>

          <p className="mt-4 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
            {settings.operations.maintenanceMessage}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-950">
              <Clock3 className="h-5 w-5 text-blue-600 dark:text-blue-300" />

              <p className="mt-3 text-sm font-black">
                Your data remains intact
              </p>

              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Maintenance mode pauses normal workspace access; it does not remove your account, workspace or business data.
              </p>
            </div>

            <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-950">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />

              <p className="mt-3 text-sm font-black">
                Recovery access remains available
              </p>

              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Account settings and subscription recovery remain reachable while Platform Administration completes maintenance.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/settings"
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-black text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Account settings
            </Link>

            <Link
              href="/subscription-required"
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-black text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Subscription access
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
