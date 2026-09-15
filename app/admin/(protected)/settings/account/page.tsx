'use client';

import Link from 'next/link';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  ChevronRight,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';

import SaMiOverlay, {
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

/* ============================================================
   TYPES
   ============================================================ */

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

  updatedAt?: string | null;
};

type ApiPayload = {
  success?: boolean;

  code?: string;

  account?: AdminAccount;

  error?: string;

  message?: string;

  field?: string | null;

  retryable?: boolean;

  requestId?: string;
};

type ViewMode =
  | 'overview'
  | 'profile';

type OverlayState = {
  open: boolean;

  type:
    SaMiOverlayType;

  title: string;

  message: string;
};

/* ============================================================
   HELPERS
   ============================================================ */

function roleLabel(
  value: string
) {
  return value
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

function statusLabel(
  value: string
) {
  return value
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

function initials(
  account:
    AdminAccount
) {
  const first =
    account.firstName
      ?.trim()
      .charAt(0);

  const last =
    account.lastName
      ?.trim()
      .charAt(0);

  return (
    `${first || ''}${last || ''}`
      .toUpperCase() ||
    'SM'
  );
}

function normalizeName(
  value: string
) {
  return value
    .normalize('NFKC')
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}

function validName(
  value: string
) {
  const normalized =
    normalizeName(
      value
    );

  return (
    normalized.length >=
      1 &&
    normalized.length <=
      80 &&
    /^[\p{L}\p{M}][\p{L}\p{M}\s'’\-]*$/u.test(
      normalized
    )
  );
}

async function readPayload(
  response: Response
): Promise<ApiPayload> {
  try {
    const body:
      unknown =
      await response.json();

    if (
      body &&
      typeof body ===
        'object' &&
      !Array.isArray(
        body
      )
    ) {
      return body as
        ApiPayload;
    }
  } catch {
    // handled below
  }

  return {
    success: false,

    code:
      'INVALID_SERVER_RESPONSE',

    error:
      'SaMi returned an invalid response.',
  };
}

/* ============================================================
   COMPONENT
   ============================================================ */

export default function AdminMyAccountPage() {
  const router =
    useRouter();

  /* ==========================================================
     ACCOUNT
     ========================================================== */

  const [
    account,
    setAccount,
  ] =
    useState<AdminAccount | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    loadError,
    setLoadError,
  ] =
    useState<string | null>(
      null
    );

  /* ==========================================================
     NAVIGATION STATE
     ========================================================== */

  const [
    view,
    setView,
  ] =
    useState<ViewMode>(
      'overview'
    );

  /* ==========================================================
     PROFILE FORM
     ========================================================== */

  const [
    firstName,
    setFirstName,
  ] =
    useState('');

  const [
    lastName,
    setLastName,
  ] =
    useState('');

  const [
    savingProfile,
    setSavingProfile,
  ] =
    useState(false);

  const [
    firstNameError,
    setFirstNameError,
  ] =
    useState<string | null>(
      null
    );

  const [
    lastNameError,
    setLastNameError,
  ] =
    useState<string | null>(
      null
    );

  /* ==========================================================
     OVERLAY
     ========================================================== */

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>({
      open: false,

      type:
        'info',

      title: '',

      message: '',
    });

  function showOverlay(
    type:
      SaMiOverlayType,
    title: string,
    message: string
  ) {
    setOverlay({
      open: true,
      type,
      title,
      message,
    });
  }

  function closeOverlay() {
    setOverlay(
      current => ({
        ...current,
        open: false,
      })
    );
  }

  /* ==========================================================
     LOAD ACCOUNT
     ========================================================== */

  const loadAccount =
    useCallback(
      async () => {
        setLoading(
          true
        );

        setLoadError(
          null
        );

        try {
          const response =
            await fetch(
              '/api/admin/account',
              {
                method:
                  'GET',

                cache:
                  'no-store',

                credentials:
                  'same-origin',

                headers: {
                  Accept:
                    'application/json',
                },
              }
            );

          const payload =
            await readPayload(
              response
            );

          if (
            response.status ===
            401
          ) {
            showOverlay(
              'warning',
              'Administrator session expired',
              'Your administrator session is no longer active. Sign in again to continue.'
            );

            return;
          }

          if (
            response.status ===
            503
          ) {
            throw new Error(
              payload.error ||
                'SaMi administrator services are temporarily unavailable.'
            );
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

          const loaded =
            payload.account;

          setAccount(
            loaded
          );

          setFirstName(
            loaded.firstName
          );

          setLastName(
            loaded.lastName
          );
        } catch (
          error
        ) {
          console.error(
            '[Admin My Account] Load failed:',
            error
          );

          setLoadError(
            error instanceof
              Error
              ? error.message
              : 'SaMi could not load your administrator account.'
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );

  useEffect(
    () => {
      void loadAccount();
    },
    [
      loadAccount,
    ]
  );

  /* ==========================================================
     PROFILE STATE
     ========================================================== */

  const profileChanged =
    useMemo(
      () => {
        if (
          !account
        ) {
          return false;
        }

        return (
          normalizeName(
            firstName
          ) !==
            account.firstName ||
          normalizeName(
            lastName
          ) !==
            account.lastName
        );
      },
      [
        account,
        firstName,
        lastName,
      ]
    );

  function openProfile() {
    if (
      !account
    ) {
      return;
    }

    setFirstName(
      account.firstName
    );

    setLastName(
      account.lastName
    );

    setFirstNameError(
      null
    );

    setLastNameError(
      null
    );

    setView(
      'profile'
    );
  }

  function closeProfile() {
    if (
      savingProfile
    ) {
      return;
    }

    if (
      account
    ) {
      setFirstName(
        account.firstName
      );

      setLastName(
        account.lastName
      );
    }

    setFirstNameError(
      null
    );

    setLastNameError(
      null
    );

    setView(
      'overview'
    );
  }

  /* ==========================================================
     SAVE PROFILE
     ========================================================== */

  async function saveProfile(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      savingProfile ||
      !account
    ) {
      return;
    }

    setFirstNameError(
      null
    );

    setLastNameError(
      null
    );

    const normalizedFirst =
      normalizeName(
        firstName
      );

    const normalizedLast =
      normalizeName(
        lastName
      );

    let invalid =
      false;

    if (
      !validName(
        normalizedFirst
      )
    ) {
      setFirstNameError(
        'Enter a valid first name using 1–80 letters, spaces, apostrophes or hyphens.'
      );

      invalid =
        true;
    }

    if (
      !validName(
        normalizedLast
      )
    ) {
      setLastNameError(
        'Enter a valid last name using 1–80 letters, spaces, apostrophes or hyphens.'
      );

      invalid =
        true;
    }

    if (invalid) {
      return;
    }

    if (
      !profileChanged
    ) {
      showOverlay(
        'info',
        'No changes to save',
        'Your administrator profile has not changed.'
      );

      return;
    }

    setSavingProfile(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/account/profile',
          {
            method:
              'PATCH',

            credentials:
              'same-origin',

            cache:
              'no-store',

            headers: {
              Accept:
                'application/json',

              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                firstName:
                  normalizedFirst,

                lastName:
                  normalizedLast,
              }),
          }
        );

      const payload =
        await readPayload(
          response
        );

      if (
        response.status ===
        401
      ) {
        showOverlay(
          'warning',
          'Administrator session expired',
          'Your administrator session is no longer active. Sign in again to continue.'
        );

        return;
      }

      if (
        !response.ok ||
        !payload.account
      ) {
        if (
          payload.field ===
          'firstName'
        ) {
          setFirstNameError(
            payload.error ||
              'First name is invalid.'
          );

          return;
        }

        if (
          payload.field ===
          'lastName'
        ) {
          setLastNameError(
            payload.error ||
              'Last name is invalid.'
          );

          return;
        }

        if (
          response.status ===
          503
        ) {
          showOverlay(
            'warning',
            'Service temporarily unavailable',
            payload.error ||
              'SaMi administrator services are temporarily unavailable. Your profile was not changed.'
          );

          return;
        }

        throw new Error(
          payload.error ||
            'SaMi could not update your administrator profile.'
        );
      }

      const updated =
        payload.account;

      /*
       * The profile endpoint intentionally returns
       * only its authoritative identity fields.
       *
       * Preserve authentication/security state
       * already loaded by /api/admin/account.
       */
      const nextAccount:
        AdminAccount = {
        ...account,

        ...updated,

        twoFactorRequired:
          account.twoFactorRequired,

        twoFactorEnabled:
          account.twoFactorEnabled,
      };

      setAccount(
        nextAccount
      );

      setFirstName(
        nextAccount.firstName
      );

      setLastName(
        nextAccount.lastName
      );

      setView(
        'overview'
      );

      showOverlay(
        'success',
        'Profile updated',
        'Your administrator personal information has been updated successfully.'
      );
    } catch (
      error
    ) {
      console.error(
        '[Admin My Account] Profile update failed:',
        error
      );

      showOverlay(
        'error',
        'Profile update failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not update your administrator profile.'
      );
    } finally {
      setSavingProfile(
        false
      );
    }
  }

  /* ==========================================================
     LOADING
     ========================================================== */

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

  /* ==========================================================
     LOAD FAILURE
     ========================================================== */

  if (
    loadError ||
    !account
  ) {
    return (
      <>
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm dark:border-red-950 dark:bg-zinc-900">
          <AlertTriangle className="h-7 w-7 text-red-600" />

          <h2 className="mt-5 text-xl font-bold text-zinc-950 dark:text-white">
            Account unavailable
          </h2>

          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {loadError ||
              'SaMi could not load your administrator account.'}
          </p>

          <button
            type="button"
            onClick={() =>
              void loadAccount()
            }
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            <RefreshCw className="h-4 w-4" />

            Try again
          </button>
        </div>

        <SaMiOverlay
          open={
            overlay.open
          }
          type={
            overlay.type
          }
          title={
            overlay.title
          }
          message={
            overlay.message
          }
          primaryAction={
            overlay.title ===
            'Administrator session expired'
              ? {
                  label:
                    'Sign in again',

                  onClick:
                    () => {
                      router.replace(
                        '/admin/login'
                      );
                    },
                }
              : undefined
          }
          onClose={
            closeOverlay
          }
        />
      </>
    );
  }

  /* ==========================================================
     PROFILE EDITOR
     ========================================================== */

  if (
    view ===
    'profile'
  ) {
    return (
      <>
        <div className="mx-auto w-full max-w-4xl">
          <button
            type="button"
            onClick={
              closeProfile
            }
            disabled={
              savingProfile
            }
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />

            My Account
          </button>

          <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-4 border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <UserRound className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold text-zinc-950 dark:text-white">
                  Personal information
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Update the name attached to your Platform Administrator identity.
                </p>
              </div>
            </div>

            <form
              onSubmit={
                saveProfile
              }
              className="p-6"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="admin-first-name"
                    className="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
                  >
                    First name
                  </label>

                  <input
                    id="admin-first-name"
                    type="text"
                    value={
                      firstName
                    }
                    disabled={
                      savingProfile
                    }
                    autoComplete="given-name"
                    maxLength={
                      80
                    }
                    onChange={
                      event => {
                        setFirstName(
                          event
                            .target
                            .value
                        );

                        if (
                          firstNameError
                        ) {
                          setFirstNameError(
                            null
                          );
                        }
                      }
                    }
                    className={`mt-2 h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-zinc-950 outline-none transition placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-950 dark:text-white ${
                      firstNameError
                        ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 dark:border-red-700'
                        : 'border-zinc-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700'
                    }`}
                  />

                  {firstNameError && (
                    <p className="mt-2 text-xs font-medium leading-5 text-red-600 dark:text-red-400">
                      {
                        firstNameError
                      }
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="admin-last-name"
                    className="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
                  >
                    Last name
                  </label>

                  <input
                    id="admin-last-name"
                    type="text"
                    value={
                      lastName
                    }
                    disabled={
                      savingProfile
                    }
                    autoComplete="family-name"
                    maxLength={
                      80
                    }
                    onChange={
                      event => {
                        setLastName(
                          event
                            .target
                            .value
                        );

                        if (
                          lastNameError
                        ) {
                          setLastNameError(
                            null
                          );
                        }
                      }
                    }
                    className={`mt-2 h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-zinc-950 outline-none transition placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-950 dark:text-white ${
                      lastNameError
                        ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 dark:border-red-700'
                        : 'border-zinc-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700'
                    }`}
                  />

                  {lastNameError && (
                    <p className="mt-2 text-xs font-medium leading-5 text-red-600 dark:text-red-400">
                      {
                        lastNameError
                      }
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-400">
                  Administrator email
                </p>

                <p className="mt-2 break-all text-sm font-semibold text-zinc-950 dark:text-white">
                  {
                    account.email
                  }
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Email is managed separately because changing your sign-in identity requires verification.
                </p>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={
                    closeProfile
                  }
                  disabled={
                    savingProfile
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <X className="h-4 w-4" />

                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    savingProfile ||
                    !profileChanged
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {savingProfile ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}

                  {savingProfile
                    ? 'Saving'
                    : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        </div>

        <SaMiOverlay
          open={
            overlay.open
          }
          type={
            overlay.type
          }
          title={
            overlay.title
          }
          message={
            overlay.message
          }
          primaryAction={
            overlay.title ===
            'Administrator session expired'
              ? {
                  label:
                    'Sign in again',

                  onClick:
                    () => {
                      router.replace(
                        '/admin/login'
                      );
                    },
                }
              : undefined
          }
          onClose={
            closeOverlay
          }
        />
      </>
    );
  }

  /* ==========================================================
     ACCOUNT OVERVIEW
     ========================================================== */

  return (
    <>
      <div className="mx-auto w-full max-w-5xl">

        {/* ====================================================
            IDENTITY SUMMARY
            ==================================================== */}

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-950 text-lg font-bold text-white dark:bg-white dark:text-zinc-950">
                {initials(
                  account
                )}
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-zinc-950 dark:text-white">
                  {
                    account.fullName
                  }
                </h2>

                <p className="mt-1 truncate text-sm text-zinc-500">
                  {
                    account.email
                  }
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {roleLabel(
                  account.role
                )}
              </span>

              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                {statusLabel(
                  account.status
                )}
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

            {/* ================================================
                PERSONAL INFORMATION
                ================================================ */}

            <button
              type="button"
              onClick={
                openProfile
              }
              className="group flex w-full items-center gap-4 px-6 py-5 text-left transition hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-zinc-950"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <UserRound className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-950 dark:text-white">
                  Personal information
                </p>

                <p className="mt-1 truncate text-sm text-zinc-500">
                  {account.firstName}{' '}
                  {account.lastName}
                </p>
              </div>

              <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:group-hover:text-zinc-200" />
            </button>

            {/* ================================================
                EMAIL
                ================================================ */}

            <Link
              href="/admin/settings/account/email"
              className="group flex items-center gap-4 px-6 py-5 transition hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-zinc-950"
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
                  {
                    account.email
                  }
                </p>
              </div>

              <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:group-hover:text-zinc-200" />
            </Link>

            {/* ================================================
                PASSWORD
                Category 4 — Security
                ================================================ */}

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
                  Password management belongs to administrator Security.
                </p>
              </div>

              <ShieldCheck className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-700" />
            </div>
          </div>
        </section>
      </div>

      <SaMiOverlay
        open={
          overlay.open
        }
        type={
          overlay.type
        }
        title={
          overlay.title
        }
        message={
          overlay.message
        }
        primaryAction={
          overlay.title ===
          'Administrator session expired'
            ? {
                label:
                  'Sign in again',

                onClick:
                  () => {
                    router.replace(
                      '/admin/login'
                    );
                  },
              }
            : undefined
        }
        onClose={
          closeOverlay
        }
      />
    </>
  );
}