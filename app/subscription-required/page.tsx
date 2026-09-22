import Link from 'next/link';

import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  LifeBuoy,
  LockKeyhole,
  Settings,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  requirePageSession,
} from '@/lib/auth/require-page-session';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export default async function SubscriptionRequiredPage() {
  const session =
    await requirePageSession(
      '/subscription-required',
    );

  const account =
    await getAccountContextForUser(
      session.user.id,
      session.currentTenantId,
    );

  let canManageBilling =
    account.membership
      ?.isOwner ===
    true;

  try {
    const permissions =
      await getPermissionContext();

    canManageBilling =
      canManageBilling ||
      permissions.permissionSet.has(
        SAMI_PERMISSIONS
          .BILLING_VIEW,
      ) ||
      permissions.permissionSet.has(
        SAMI_PERMISSIONS
          .BILLING_MANAGE,
      );
  } catch {
    // Recovery page remains available even while authorization is degraded.
  }

  const planName =
    account.subscription
      ?.planName ||
    'paid';

  const workspaceName =
    account.tenant
      ?.name ||
    'this workspace';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 dark:bg-[#0b0d12] dark:text-white sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex justify-center">
          <SaMiLogo />
        </div>

        <section className="overflow-hidden rounded-[28px] border border-amber-200 bg-white shadow-xl shadow-slate-950/5 dark:border-amber-500/20 dark:bg-[#11141a]">
          <div className="border-b border-amber-100 bg-amber-50 px-6 py-5 dark:border-amber-500/10 dark:bg-amber-500/10 sm:px-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
                <AlertTriangle className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
                  Subscription payment required
                </p>

                <h1 className="mt-1 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
                  {workspaceName} is temporarily locked
                </h1>
              </div>
            </div>
          </div>

          <div className="space-y-6 px-6 py-7 sm:px-8 sm:py-8">
            <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
              The {planName} subscription is past due. SaMi has paused normal workspace operations until a verified payment restores the subscription.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCard
                icon={LockKeyhole}
                title="Work is paused"
                text="Business apps, records, files, search, messages, automation, integrations, SaMi AI execution and Developer API access are unavailable while the workspace is locked."
              />

              <InfoCard
                icon={CreditCard}
                title="Recovery stays available"
                text="You can still sign in, manage your personal account and security, open Billing, complete payment and contact support."
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-xs font-bold">
                Automatic restoration
              </p>
              <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                After SaMi verifies the successful provider payment, workspace access is restored from the subscription state automatically. No app reinstall or data migration is required.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {canManageBilling ? (
                <Link
                  href="/settings?tab=billing"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700"
                >
                  Open Billing
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <div className="rounded-xl border border-slate-200 px-4 py-3 text-xs leading-5 text-slate-500 dark:border-white/10 dark:text-slate-400">
                  Ask a workspace owner or billing administrator to settle the subscription.
                </div>
              )}

              <Link
                href="/settings?tab=account"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.07]"
              >
                <Settings className="h-4 w-4" />
                My Account
              </Link>

              <Link
                href="/help"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.07]"
              >
                <LifeBuoy className="h-4 w-4" />
                Help
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof LockKeyhole;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
        <Icon className="h-4 w-4" />
      </div>

      <p className="mt-3 text-sm font-bold">
        {title}
      </p>

      <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
        {text}
      </p>
    </div>
  );
}
