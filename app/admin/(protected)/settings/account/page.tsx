'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import {
  AlertTriangle,
  BadgeCheck,
  ChevronRight,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import SaMiOverlay from '@/app/components/SaMiOverlay';

type AdminAccount = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  twoFactorRequired: boolean;
  twoFactorEnabled: boolean;
};

type ApiPayload = {
  account?: AdminAccount;
  error?: string;
  message?: string;
};

function roleLabel(value: string) {
  return value
    .split('_')
    .map(
      part =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(' ');
}

function statusLabel(value: string) {
  return value
    .split('_')
    .map(
      part =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(' ');
}

async function readPayload(
  response: Response
): Promise<ApiPayload> {
  try {
    const body = await response.json();

    if (
      body &&
      typeof body === 'object'
    ) {
      return body as ApiPayload;
    }
  } catch {
    // Empty/malformed response.
  }

  return {};
}

export default function AdminMyAccountPage() {
  const router = useRouter();

  const [account, setAccount] =
    useState<AdminAccount | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [sessionOverlay, setSessionOverlay] =
    useState(false);

  const loadAccount =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          '/api/admin/account',
          {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',

            headers: {
              Accept: 'application/json',
            },
          }
        );

        const payload =
          await readPayload(response);

        if (response.status === 401) {
          setSessionOverlay(true);
          return;
        }

        if (
          !response.ok ||
          !payload.account
        ) {
          throw new Error(
            payload.error ||
            'SaMi could not load your administrator account.'
          );
        }

        setAccount(payload.account);
      } catch (loadError) {
        console.error(
          '[Admin My Account] load failed:',
          loadError
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'SaMi could not load your administrator account.'
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-zinc-500" />

          <p className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">
            Loading your account
          </p>

          <p className="mt-1 text-sm text-zinc-500">
            Verifying administrator information.
          </p>
        </div>
      </div>
    );
  }

  if (
    error ||
    !account
  ) {
    return (
      <>
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm dark:border-red-950 dark:bg-zinc-900">
          <AlertTriangle className="h-7 w-7 text-red-600" />

          <h1 className="mt-5 text-2xl font-bold text-zinc-950 dark:text-white">
            Account unavailable
          </h1>

          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {error ||
              'SaMi could not load your administrator account.'}
          </p>

          <button
            type="button"
            onClick={() =>
              void loadAccount()
            }
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>

        <SaMiOverlay
          open={sessionOverlay}
          type="warning"
          title="Administrator session expired"
          message="Your administrator session is no longer active. Sign in again to continue."
          primaryAction={{
            label: 'Sign in again',

            onClick: () => {
              router.replace('/admin/login');
            },
          }}
          onClose={() =>
            setSessionOverlay(false)
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-5xl">
        {/* ====================================================
            HEADER
            ==================================================== */}

        <header>
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-500">
            <UserRound className="h-4 w-4" />
            Settings / My Account
          </div>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">
            My Account
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Manage your personal Platform Administrator identity and sign-in information.
          </p>
        </header>

        {/* ====================================================
            IDENTITY SUMMARY
            ==================================================== */}

        <section className="mt-7 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-950 text-lg font-bold text-white dark:bg-white dark:text-zinc-950">
                {account.firstName
                  .charAt(0)
                  .toUpperCase()}

                {account.lastName
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-zinc-950 dark:text-white">
                  {account.fullName}
                </h2>

                <p className="mt-1 truncate text-sm text-zinc-500">
                  {account.email}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {roleLabel(account.role)}
              </span>

              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                {statusLabel(account.status)}
              </span>
            </div>
          </div>
        </section>

        {/* ====================================================
            ACCOUNT OPTIONS
            ==================================================== */}

        <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
            <h2 className="font-bold text-zinc-950 dark:text-white">
              Account settings
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Select what you want to manage.
            </p>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {/* EMAIL */}

            <Link
              href="/admin/settings/account/email"
              className="group flex items-center gap-4 px-6 py-5 transition hover:bg-zinc-50 dark:hover:bg-zinc-950"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <Mail className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-zinc-950 dark:text-white">
                    Email
                  </p>

                  {account.emailVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Verified
                    </span>
                  )}
                </div>

                <p className="mt-1 truncate text-sm text-zinc-500">
                  {account.email}
                </p>
              </div>

              <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:group-hover:text-zinc-200" />
            </Link>

            {/* PROFILE */}

            <div
              aria-disabled="true"
              className="flex cursor-not-allowed items-center gap-4 px-6 py-5 opacity-60"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <UserRound className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-zinc-950 dark:text-white">
                    Personal information
                  </p>

                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400 dark:bg-zinc-800">
                    Later
                  </span>
                </div>

                <p className="mt-1 text-sm text-zinc-500">
                  Name and personal administrator information.
                </p>
              </div>

              <ChevronRight className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-700" />
            </div>

            {/* PASSWORD */}

            <div
              aria-disabled="true"
              className="flex cursor-not-allowed items-center gap-4 px-6 py-5 opacity-60"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <KeyRound className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-zinc-950 dark:text-white">
                    Password
                  </p>

                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400 dark:bg-zinc-800">
                    Security
                  </span>
                </div>

                <p className="mt-1 text-sm text-zinc-500">
                  Password management belongs to the administrator Security capability.
                </p>
              </div>

              <ShieldCheck className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-700" />
            </div>
          </div>
        </section>
      </div>

      <SaMiOverlay
        open={sessionOverlay}
        type="warning"
        title="Administrator session expired"
        message="Your administrator session is no longer active. Sign in again to continue."
        primaryAction={{
          label: 'Sign in again',

          onClick: () => {
            router.replace('/admin/login');
          },
        }}
        onClose={() =>
          setSessionOverlay(false)
        }
      />
    </>
  );
}