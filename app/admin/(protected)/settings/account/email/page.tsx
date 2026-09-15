'use client';

import Link from 'next/link';

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Clock3,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Pencil,
  RefreshCw,
  RotateCcw,
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
};

type PendingEmailChange = {
  email: string;
  expiresAt: string;
  createdAt: string;
  canResendInSeconds: number;
};

type ApiPayload = {
  account?: AdminAccount;

  pending?: PendingEmailChange | null;

  email?: string;
  expiresAt?: string;
  canResendInSeconds?: number;
  retryAfterSeconds?: number;

  code?: string;
  error?: string;
  message?: string;

  next?: string;
  sessionInvalidated?: boolean;
};

type OverlayState = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;

  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };

  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
};

const CODE_LENGTH = 6;

const EMPTY_OVERLAY: OverlayState = {
  open: false,
  type: 'info',
  title: '',
  message: '',
};

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  const email = normalizeEmail(value);

  return (
    email.length > 0 &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function normalizeCode(value: string) {
  return value
    .replace(/\D/g, '')
    .slice(0, CODE_LENGTH);
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  ).format(date);
}

function formatCountdown(seconds: number) {
  const safe =
    Math.max(
      0,
      Math.ceil(seconds)
    );

  const minutes =
    Math.floor(safe / 60);

  const remainder =
    safe % 60;

  if (minutes === 0) {
    return `${remainder}s`;
  }

  return `${minutes}:${String(
    remainder
  ).padStart(2, '0')}`;
}

async function readPayload(
  response: Response
): Promise<ApiPayload> {
  try {
    const body =
      await response.json();

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

/* ============================================================
   PAGE
   ============================================================ */

export default function AdminEmailSettingsPage() {
  const router =
    useRouter();

  const [
    account,
    setAccount,
  ] =
    useState<AdminAccount | null>(
      null
    );

  const [
    pending,
    setPending,
  ] =
    useState<PendingEmailChange | null>(
      null
    );

  const [
    changeMode,
    setChangeMode,
  ] =
    useState(false);

  const [
    newEmail,
    setNewEmail,
  ] =
    useState('');

  const [
    verificationCode,
    setVerificationCode,
  ] =
    useState('');

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

  const [
    requesting,
    setRequesting,
  ] =
    useState(false);

  const [
    verifying,
    setVerifying,
  ] =
    useState(false);

  const [
    cancelling,
    setCancelling,
  ] =
    useState(false);

  const [
    cooldown,
    setCooldown,
  ] =
    useState(0);

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>(
      EMPTY_OVERLAY
    );

  const closeOverlay =
    useCallback(() => {
      setOverlay(
        EMPTY_OVERLAY
      );
    }, []);

  const showOverlay =
    useCallback(
      (
        type: SaMiOverlayType,
        title: string,
        message: string
      ) => {
        setOverlay({
          open: true,
          type,
          title,
          message,
        });
      },
      []
    );

  const sessionExpired =
    useCallback(
      (payload?: ApiPayload) => {
        setOverlay({
          open: true,

          type: 'warning',

          title:
            'Administrator session expired',

          message:
            payload?.error ||
            'Your administrator session is no longer active. Sign in again to continue.',

          primaryAction: {
            label:
              'Sign in again',

            onClick: () => {
              router.replace(
                '/admin/login'
              );
            },
          },
        });
      },
      [router]
    );

  /* ==========================================================
     LOAD
     ========================================================== */

  const loadData =
    useCallback(async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const [
          accountResponse,
          pendingResponse,
        ] =
          await Promise.all([
            fetch(
              '/api/admin/account',
              {
                method: 'GET',
                cache: 'no-store',
                credentials:
                  'same-origin',

                headers: {
                  Accept:
                    'application/json',
                },
              }
            ),

            fetch(
              '/api/admin/account/email-change',
              {
                method: 'GET',
                cache: 'no-store',
                credentials:
                  'same-origin',

                headers: {
                  Accept:
                    'application/json',
                },
              }
            ),
          ]);

        const [
          accountPayload,
          pendingPayload,
        ] =
          await Promise.all([
            readPayload(
              accountResponse
            ),

            readPayload(
              pendingResponse
            ),
          ]);

        if (
          accountResponse.status === 401 ||
          pendingResponse.status === 401
        ) {
          sessionExpired(
            accountResponse.status === 401
              ? accountPayload
              : pendingPayload
          );

          return;
        }

        if (
          !accountResponse.ok ||
          !accountPayload.account
        ) {
          throw new Error(
            accountPayload.error ||
            'SaMi could not load your administrator account.'
          );
        }

        if (!pendingResponse.ok) {
          throw new Error(
            pendingPayload.error ||
            'SaMi could not load your pending email change.'
          );
        }

        setAccount(
          accountPayload.account
        );

        const nextPending =
          pendingPayload.pending ??
          null;

        setPending(
          nextPending
        );

        setCooldown(
          Math.max(
            0,
            Number(
              nextPending
                ?.canResendInSeconds ??
              0
            )
          )
        );

        /*
         * A pending request means the administrator already
         * explicitly started the sensitive workflow previously.
         *
         * Restore that workflow so refresh does not strand it.
         */
        if (nextPending) {
          setChangeMode(true);

          setNewEmail(
            nextPending.email
          );
        }
      } catch (error) {
        console.error(
          '[Admin Email Settings] load failed:',
          error
        );

        setLoadError(
          error instanceof Error
            ? error.message
            : 'SaMi could not load email settings.'
        );
      } finally {
        setLoading(false);
      }
    }, [sessionExpired]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /* ==========================================================
     COOLDOWN
     ========================================================== */

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          setCooldown(
            current =>
              Math.max(
                0,
                current - 1
              )
          );
        },
        1000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [cooldown]);

  /* ==========================================================
     ENTER CHANGE MODE
     ========================================================== */

  function startChange() {
    if (!account) {
      return;
    }

    setNewEmail('');
    setVerificationCode('');
    setChangeMode(true);
  }

  function leaveChangeMode() {
    if (pending) {
      return;
    }

    setNewEmail('');
    setVerificationCode('');
    setChangeMode(false);
  }

  /* ==========================================================
     REQUEST
     ========================================================== */

  const requestChange =
    useCallback(
      async (
        requestedEmail: string,
        resend = false
      ) => {
        if (
          requesting ||
          !account
        ) {
          return;
        }

        const email =
          normalizeEmail(
            requestedEmail
          );

        if (
          !isValidEmail(email)
        ) {
          showOverlay(
            'warning',
            'Check the email address',
            'Enter a valid new email address.'
          );

          return;
        }

        if (
          email ===
          normalizeEmail(
            account.email
          )
        ) {
          showOverlay(
            'info',
            'Email unchanged',
            'This is already your primary administrator email.'
          );

          return;
        }

        setRequesting(true);

        try {
          const response =
            await fetch(
              '/api/admin/account/email-change/request',
              {
                method: 'POST',

                credentials:
                  'same-origin',

                headers: {
                  Accept:
                    'application/json',

                  'Content-Type':
                    'application/json',
                },

                body:
                  JSON.stringify({
                    email,
                  }),
              }
            );

          const payload =
            await readPayload(
              response
            );

          if (
            response.status === 401
          ) {
            sessionExpired(
              payload
            );

            return;
          }

          if (
            response.status === 429
          ) {
            const retry =
              Math.max(
                1,
                Number(
                  payload.retryAfterSeconds ??
                  payload.canResendInSeconds ??
                  60
                )
              );

            setCooldown(
              retry
            );

            showOverlay(
              'info',
              'Please wait',
              `You can request another verification code in ${formatCountdown(
                retry
              )}.`
            );

            return;
          }

          if (!response.ok) {
            showOverlay(
              response.status >= 500
                ? 'error'
                : 'warning',

              resend
                ? 'Code not resent'
                : 'Email change not started',

              payload.error ||
              'SaMi could not send the verification code.'
            );

            return;
          }

          const pendingEmail =
            payload.email ??
            email;

          const expiresAt =
            payload.expiresAt ??
            new Date(
              Date.now() +
              15 * 60 * 1000
            ).toISOString();

          const nextCooldown =
            Math.max(
              0,
              Number(
                payload.canResendInSeconds ??
                60
              )
            );

          setPending({
            email:
              pendingEmail,

            expiresAt,

            createdAt:
              new Date().toISOString(),

            canResendInSeconds:
              nextCooldown,
          });

          setNewEmail(
            pendingEmail
          );

          setVerificationCode(
            ''
          );

          setCooldown(
            nextCooldown
          );

          showOverlay(
            'success',

            resend
              ? 'New code sent'
              : 'Verification code sent',

            `Enter the 6-digit code sent to ${pendingEmail}.`
          );
        } catch (error) {
          console.error(
            '[Admin Email Settings] request failed:',
            error
          );

          showOverlay(
            'error',
            'Unable to send code',
            'SaMi could not contact the administrator service.'
          );
        } finally {
          setRequesting(false);
        }
      },
      [
        account,
        requesting,
        sessionExpired,
        showOverlay,
      ]
    );

  async function handleRequest(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    await requestChange(
      newEmail
    );
  }

  async function handleResend() {
    if (
      !pending ||
      cooldown > 0 ||
      requesting
    ) {
      return;
    }

    await requestChange(
      pending.email,
      true
    );
  }

  /* ==========================================================
     VERIFY
     ========================================================== */

  async function handleVerify(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !pending ||
      verifying
    ) {
      return;
    }

    const code =
      normalizeCode(
        verificationCode
      );

    if (
      code.length !==
      CODE_LENGTH
    ) {
      showOverlay(
        'warning',
        'Incomplete verification code',
        'Enter the complete 6-digit verification code.'
      );

      return;
    }

    setVerifying(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/email-change/verify',
          {
            method: 'POST',

            credentials:
              'same-origin',

            headers: {
              Accept:
                'application/json',

              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                code,
              }),
          }
        );

      const payload =
        await readPayload(
          response
        );

      if (
        response.status === 401
      ) {
        sessionExpired(
          payload
        );

        return;
      }

      if (!response.ok) {
        if (
          response.status === 429
        ) {
          showOverlay(
            'warning',
            'Too many attempts',
            payload.error ||
            'Too many verification attempts. Wait before trying again.'
          );

          return;
        }

        showOverlay(
          response.status >= 500
            ? 'error'
            : 'warning',

          'Email not changed',

          payload.error ||
          'The verification code could not be accepted.'
        );

        return;
      }

      const changedEmail =
        pending.email;

      setPending(null);
      setVerificationCode('');
      setCooldown(0);

      setOverlay({
        open: true,

        type: 'success',

        title:
          'Administrator email changed',

        message:
          payload.message ||
          `Your primary administrator email is now ${changedEmail}. For security, sign in again using the new email.`,

        primaryAction: {
          label:
            'Sign in with new email',

          onClick: () => {
            router.replace(
              payload.next ||
              '/admin/login?reason=email_changed'
            );

            router.refresh();
          },
        },
      });
    } catch (error) {
      console.error(
        '[Admin Email Settings] verification failed:',
        error
      );

      showOverlay(
        'error',
        'Verification unavailable',
        'SaMi could not contact the administrator service.'
      );
    } finally {
      setVerifying(false);
    }
  }

  /* ==========================================================
     CANCEL PENDING REQUEST
     ========================================================== */

  async function cancelPending() {
    if (cancelling) {
      return;
    }

    setCancelling(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/email-change',
          {
            method:
              'DELETE',

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
        response.status === 401
      ) {
        sessionExpired(
          payload
        );

        return;
      }

      if (!response.ok) {
        showOverlay(
          response.status >= 500
            ? 'error'
            : 'warning',

          'Unable to cancel',

          payload.error ||
          'SaMi could not cancel the pending email change.'
        );

        return;
      }

      setPending(null);
      setNewEmail('');
      setVerificationCode('');
      setCooldown(0);
      setChangeMode(false);

      showOverlay(
        'success',
        'Email change cancelled',
        'Your primary administrator email remains unchanged.'
      );
    } catch (error) {
      console.error(
        '[Admin Email Settings] cancel failed:',
        error
      );

      showOverlay(
        'error',
        'Unable to cancel',
        'SaMi could not contact the administrator service.'
      );
    } finally {
      setCancelling(false);
    }
  }

  function confirmCancel() {
    setOverlay({
      open: true,

      type: 'warning',

      title:
        'Cancel email change?',

      message:
        'The current verification code will stop working and your existing administrator email will remain unchanged.',

      primaryAction: {
        label:
          'Cancel email change',

        onClick: () => {
          closeOverlay();

          void cancelPending();
        },
      },

      secondaryAction: {
        label:
          'Keep change',

        onClick:
          closeOverlay,
      },
    });
  }

  /* ==========================================================
     LOADING
     ========================================================== */

  if (loading) {
    return (
      <>
        <div className="flex min-h-[55vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-zinc-500" />

            <p className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">
              Loading email settings
            </p>
          </div>
        </div>

        <SaMiOverlay
          open={overlay.open}
          type={overlay.type}
          title={overlay.title}
          message={overlay.message}
          primaryAction={overlay.primaryAction}
          secondaryAction={overlay.secondaryAction}
          onClose={closeOverlay}
        />
      </>
    );
  }

  /* ==========================================================
     ERROR
     ========================================================== */

  if (
    loadError ||
    !account
  ) {
    return (
      <>
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm dark:border-red-950 dark:bg-zinc-900">
          <AlertTriangle className="h-7 w-7 text-red-600" />

          <h1 className="mt-5 text-2xl font-bold text-zinc-950 dark:text-white">
            Email settings unavailable
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            {loadError ||
              'SaMi could not load your email settings.'}
          </p>

          <button
            type="button"
            onClick={() =>
              void loadData()
            }
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>

        <SaMiOverlay
          open={overlay.open}
          type={overlay.type}
          title={overlay.title}
          message={overlay.message}
          primaryAction={overlay.primaryAction}
          secondaryAction={overlay.secondaryAction}
          onClose={closeOverlay}
        />
      </>
    );
  }

  /* ==========================================================
     PAGE
     ========================================================== */

  return (
    <>
      <div className="mx-auto w-full max-w-4xl">
        {/* BACK */}

        <Link
          href="/admin/settings/account"
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-zinc-950 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          My Account
        </Link>

        {/* HEADER */}

        <header className="mt-5">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-500">
            <Mail className="h-4 w-4" />
            My Account / Email
          </div>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Email
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Manage the primary email used for your Platform Administrator identity and sign-in.
          </p>
        </header>

        {/* ====================================================
            CURRENT EMAIL — DEFAULT VIEW
            ==================================================== */}

        <section className="mt-7 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
              Primary email
            </p>

            <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-all text-lg font-bold text-zinc-950 dark:text-white">
                    {account.email}
                  </p>

                  {account.emailVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <BadgeCheck className="h-4 w-4" />
                      Verified
                    </span>
                  )}
                </div>

                {account.emailVerifiedAt && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Verified{' '}
                    {formatDate(
                      account.emailVerifiedAt
                    )}
                  </p>
                )}
              </div>

              {!changeMode && (
                <button
                  type="button"
                  onClick={startChange}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  <Pencil className="h-4 w-4" />
                  Change email
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ====================================================
            CHANGE FORM

            Hidden until explicit Change email action.
            ==================================================== */}

        {changeMode && !pending && (
          <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
              <h2 className="font-bold text-zinc-950 dark:text-white">
                Change primary email
              </h2>

              <p className="mt-1 text-sm leading-6 text-zinc-500">
                Enter your new email. SaMi will verify ownership before changing your administrator identity.
              </p>
            </div>

            <form
              onSubmit={handleRequest}
              className="p-6"
            >
              <label
                htmlFor="new-admin-email"
                className="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
              >
                New email
              </label>

              <div className="relative mt-3">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />

                <input
                  id="new-admin-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={254}
                  autoFocus
                  value={newEmail}
                  disabled={requesting}
                  onChange={event =>
                    setNewEmail(
                      event.target.value
                    )
                  }
                  placeholder="new@email.com"
                  className="h-12 w-full rounded-xl border border-zinc-300 bg-white pl-12 pr-4 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-white"
                />
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  disabled={requesting}
                  onClick={leaveChangeMode}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 px-5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    requesting ||
                    !newEmail.trim()
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950"
                >
                  {requesting && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}

                  Send verification code
                </button>
              </div>
            </form>
          </section>
        )}

        {/* ====================================================
            VERIFICATION

            Only visible after request exists.
            ==================================================== */}

        {pending && (
          <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-950 dark:text-white">
                    <Clock3 className="h-4 w-4" />
                    Verify new email
                  </div>

                  <p className="mt-2 text-sm text-zinc-500">
                    Verification code sent to
                  </p>

                  <p className="mt-1 break-all text-sm font-bold text-zinc-950 dark:text-white">
                    {pending.email}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={cancelling}
                  onClick={confirmCancel}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  {cancelling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}

                  Cancel change
                </button>
              </div>
            </div>

            <form
              onSubmit={handleVerify}
              className="p-6"
            >
              <label
                htmlFor="admin-email-code"
                className="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
              >
                6-digit verification code
              </label>

              <div className="relative mt-3 max-w-sm">
                <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />

                <input
                  id="admin-email-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={CODE_LENGTH}
                  autoFocus
                  value={verificationCode}
                  disabled={verifying}
                  onChange={event =>
                    setVerificationCode(
                      normalizeCode(
                        event.target.value
                      )
                    )
                  }
                  placeholder="000000"
                  className="h-12 w-full rounded-xl border border-zinc-300 bg-white pl-12 pr-4 font-mono text-lg font-bold tracking-[0.25em] text-zinc-950 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
              </div>

              <div className="mt-5 flex flex-col gap-4 border-t border-zinc-200 pt-5 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-zinc-500">
                    Code expires{' '}
                    {formatDate(
                      pending.expiresAt
                    )}
                  </p>

                  <button
                    type="button"
                    disabled={
                      requesting ||
                      cooldown > 0
                    }
                    onClick={() =>
                      void handleResend()
                    }
                    className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 transition hover:text-zinc-950 disabled:cursor-not-allowed disabled:text-zinc-400 dark:text-zinc-300 dark:hover:text-white"
                  >
                    {requesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}

                    {cooldown > 0
                      ? `Resend in ${formatCountdown(
                          cooldown
                        )}`
                      : 'Resend code'}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={
                    verifying ||
                    verificationCode.length !==
                      CODE_LENGTH
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950"
                >
                  {verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BadgeCheck className="h-4 w-4" />
                  )}

                  Verify and change email
                </button>
              </div>
            </form>
          </section>
        )}

        {/* SECURITY NOTE */}

        <div className="mt-6 flex items-start gap-4 rounded-3xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-950 dark:bg-amber-950/20">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <LockKeyhole className="h-5 w-5" />
          </div>

          <div>
            <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
              Changing your primary email affects authentication
            </p>

            <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-300">
              After the new email is verified and applied, existing administrator sessions are invalidated. You must sign in again using the new email.
            </p>
          </div>
        </div>
      </div>

      <SaMiOverlay
        open={overlay.open}
        type={overlay.type}
        title={overlay.title}
        message={overlay.message}
        primaryAction={overlay.primaryAction}
        secondaryAction={overlay.secondaryAction}
        onClose={closeOverlay}
      />
    </>
  );
}