'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import Link from 'next/link';

import {
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

import SaMiOverlay, {
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

/* ============================================================
   TYPES
   ============================================================ */

type CompleteIdentityResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  next?:
    string;
};

type OverlayState = {
  open:
    boolean;

  type:
    SaMiOverlayType;

  title:
    string;

  message:
    string;
};

/* ============================================================
   PAGE
   ============================================================ */

export default function AdminCompleteIdentityPage() {
  const router =
    useRouter();

  const [
    token,
    setToken,
  ] =
    useState('');

  const [
    password,
    setPassword,
  ] =
    useState('');

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState('');

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    completed,
    setCompleted,
  ] =
    useState(false);

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>({
      open:
        false,

      type:
        'info',

      title:
        '',

      message:
        '',
    });

  /* ==========================================================
     TOKEN
     ========================================================== */

  useEffect(
    () => {
      const params =
        new URLSearchParams(
          window.location.search
        );

      setToken(
        params
          .get(
            'token'
          )
          ?.trim() ||
          ''
      );
    },
    []
  );

  /* ==========================================================
     OVERLAY
     ========================================================== */

  function showOverlay(
    type:
      SaMiOverlayType,
    title:
      string,
    message:
      string
  ) {
    setOverlay({
      open:
        true,

      type,

      title,

      message,
    });
  }

  function closeOverlay() {
    setOverlay(
      (
        current
      ) => ({
        ...current,

        open:
          false,
      })
    );
  }

  /* ==========================================================
     SUBMIT
     ========================================================== */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      loading ||
      completed
    ) {
      return;
    }

    if (
      !token
    ) {
      showOverlay(
        'error',
        'Invalid setup link',
        'This administrator setup link is incomplete. Ask a SaMi super administrator to provision the account again.'
      );

      return;
    }

    if (
      password.length <
        12
    ) {
      showOverlay(
        'warning',
        'Password requirements',
        'Administrator passwords must contain at least 12 characters.'
      );

      return;
    }

    if (
      !/[A-Z]/.test(
        password
      ) ||
      !/[a-z]/.test(
        password
      ) ||
      !/[0-9]/.test(
        password
      ) ||
      !/[^A-Za-z0-9]/.test(
        password
      ) ||
      /\s/.test(
        password
      )
    ) {
      showOverlay(
        'warning',
        'Password requirements',
        'Use uppercase, lowercase, a number and a symbol, with no spaces.'
      );

      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      showOverlay(
        'warning',
        'Passwords do not match',
        'Enter the same password in both password fields.'
      );

      return;
    }

    setLoading(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/complete-identity',
          {
            method:
              'POST',

            credentials:
              'same-origin',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                token,

                password,

                confirmPassword,
              }),
          }
        );

      const data =
        (
          await response.json()
        ) as
          CompleteIdentityResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        showOverlay(
          data.code ===
            'SERVICE_TEMPORARILY_UNAVAILABLE'
            ? 'warning'
            : 'error',

          data.code ===
            'SETUP_TOKEN_EXPIRED'
            ? 'Setup link expired'
            : data.code ===
                'SERVICE_TEMPORARILY_UNAVAILABLE'
              ? 'SaMi is temporarily unavailable'
              : 'Setup could not be completed',

          data.error ||
            data.message ||
            'SaMi could not complete administrator setup.'
        );

        return;
      }

      setCompleted(
        true
      );

      setOverlay({
        open:
          true,

        type:
          'success',

        title:
          'Administrator account ready',

        message:
          'Your SaMi administrator identity is active. Sign in with your new password to continue with the required security setup.',
      });

      window.setTimeout(
        () => {
          router.replace(
            data.next ||
              '/admin/login?reason=account_ready'
          );
        },
        1500
      );
    } catch (
      error
    ) {
      console.error(
        '[Admin Complete Identity]',
        error
      );

      showOverlay(
        'warning',
        'Connection problem',
        'SaMi could not reach the administrator service. Your account was not changed. Try again.'
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute left-1/2 top-[-20rem] h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-blue-600/[0.08] blur-3xl" />

          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        </div>

        <section className="relative z-10 w-full max-w-md">
          <header className="mb-7 flex flex-col items-center text-center">
            <SaMiLogo
              size="md"
              showTagline={false}
              showReflection={false}
              showBackground={false}
              className="max-w-[220px]"
            />

            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-400">
              <ShieldCheck className="h-3.5 w-3.5" />

              Platform Administration
            </div>
          </header>

          <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Administrator identity
            </p>

            <h1 className="mt-2 text-2xl font-semibold">
              Complete your account
            </h1>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Your email has been verified. Create the password you will use for your SaMi Platform Administrator account.
            </p>

            <form
              onSubmit={
                handleSubmit
              }
              className="mt-7 space-y-5"
            >
              <div>
                <label
                  htmlFor="admin-password"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Create password
                </label>

                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />

                  <input
                    id="admin-password"
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    autoComplete="new-password"
                    value={
                      password
                    }
                    onChange={(
                      event
                    ) =>
                      setPassword(
                        event.target.value
                      )
                    }
                    disabled={
                      loading ||
                      completed
                    }
                    className="h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-12 pr-12 text-sm outline-none transition placeholder:text-zinc-600 focus:border-blue-500/60 focus:ring-4 focus:ring-blue-500/[0.06] disabled:opacity-50"
                    placeholder="New administrator password"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (
                          current
                        ) =>
                          !current
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
                    aria-label={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-confirm-password"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Confirm password
                </label>

                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />

                  <input
                    id="admin-confirm-password"
                    type={
                      showConfirmPassword
                        ? 'text'
                        : 'password'
                    }
                    autoComplete="new-password"
                    value={
                      confirmPassword
                    }
                    onChange={(
                      event
                    ) =>
                      setConfirmPassword(
                        event.target.value
                      )
                    }
                    disabled={
                      loading ||
                      completed
                    }
                    className="h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-12 pr-12 text-sm outline-none transition placeholder:text-zinc-600 focus:border-blue-500/60 focus:ring-4 focus:ring-blue-500/[0.06] disabled:opacity-50"
                    placeholder="Confirm password"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(
                        (
                          current
                        ) =>
                          !current
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
                    aria-label={
                      showConfirmPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-xs font-medium text-zinc-300">
                  Administrator password requirements
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  At least 12 characters with uppercase, lowercase, number and symbol. Spaces are not allowed.
                </p>
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  completed ||
                  !token
                }
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />

                    Securing account...
                  </>
                ) : (
                  'Complete administrator account'
                )}
              </button>
            </form>

            {!token ? (
              <div className="mt-6 text-center">
                <p className="text-sm text-zinc-400">
                  This setup link is invalid or incomplete.
                </p>
              </div>
            ) : null}

            <div className="mt-7 border-t border-white/10 pt-5">
              <p className="text-xs leading-5 text-zinc-500">
                After completing your identity, SaMi may require additional administrator security configuration before access is granted.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-zinc-600">
            SaMi — AI Powered Business Workspace
          </p>

          <div className="mt-3 text-center">
            <Link
              href="/admin/login"
              className="text-xs text-zinc-500 transition hover:text-white"
            >
              Return to administrator sign in
            </Link>
          </div>
        </section>
      </main>

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
          completed
            ? {
                label:
                  'Continue to sign in',

                onClick:
                  () => {
                    router.replace(
                      '/admin/login?reason=account_ready'
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