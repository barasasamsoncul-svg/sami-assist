'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

/* ============================================================
   TYPES
   ============================================================ */

type LoginResponse = {
  success?:
    boolean;

  authenticated?:
    boolean;

  requiresEmailVerification?:
    boolean;

  requiresTwoFactor?:
    boolean;

  requiresTwoFactorSetup?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  email?:
    string;

  next?:
    string;

  retryAfterSeconds?:
    number | null;

  lockedUntil?:
    string;

  challengeExpiresAt?:
    string;

  admin?: {
    id?:
      string;

    email?:
      string;

    firstName?:
      string;

    lastName?:
      string;

    fullName?:
      string;

    role?:
      string;

    status?:
      string;
  } | null;
};

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeEmail(
  value:
    string
) {
  return value
    .trim()
    .toLowerCase();
}

function isValidEmail(
  value:
    string
) {
  const email =
    normalizeEmail(
      value
    );

  return (
    email.length >
      0 &&
    email.length <=
      254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

/* ============================================================
   PAGE
   ============================================================ */

export default function AdminLoginPage() {
  const router =
    useRouter();

  const [
    email,
    setEmail,
  ] =
    useState(
      ''
    );

  const [
    password,
    setPassword,
  ] =
    useState(
      ''
    );

  const [
    rememberMe,
    setRememberMe,
  ] =
    useState(
      false
    );

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(
      false
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState<
      string | null
    >(
      null
    );

  /* ==========================================================
     QUERY-STRING STATUS
     ========================================================== */

  useEffect(
    () => {
      const params =
        new URLSearchParams(
          window.location.search
        );

      const verified =
        params.get(
          'verified'
        );

      const reason =
        params.get(
          'reason'
        );

      if (
        verified ===
        '1'
      ) {
        setSuccessMessage(
          'Administrator email verified successfully. You can now continue signing in.'
        );

        return;
      }

      if (
        reason ===
        'password_reset'
      ) {
        setSuccessMessage(
          'Your administrator password has been reset successfully. Sign in using your new password.'
        );
      }
    },
    []
  );

  /* ==========================================================
     SUBMIT
     ========================================================== */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      loading
    ) {
      return;
    }

    const normalizedEmail =
      normalizeEmail(
        email
      );

    setError(
      null
    );

    setSuccessMessage(
      null
    );

    /* ========================================================
       CLIENT VALIDATION
       ======================================================== */

    if (
      !normalizedEmail ||
      !password
    ) {
      setError(
        'Enter your administrator email and password.'
      );

      return;
    }

    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {
      setError(
        'Enter a valid administrator email address.'
      );

      return;
    }

    setLoading(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/login',
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
                email:
                  normalizedEmail,

                password,

                rememberMe,
              }),
          }
        );

      let data:
        LoginResponse;

      try {
        data =
          (
            await response.json()
          ) as
            LoginResponse;
      } catch {
        setError(
          'SaMi received an invalid response from the administrator authentication service.'
        );

        return;
      }

      /* ======================================================
         EMAIL VERIFICATION HANDOFF

         This response is intentionally HTTP 403, therefore this
         check MUST happen before the generic response.ok check.
         ====================================================== */

      if (
        data.code ===
          'EMAIL_VERIFICATION_REQUIRED' ||
        data.requiresEmailVerification
      ) {
        const verificationEmail =
          normalizeEmail(
            data.email ||
            normalizedEmail
          );

        /*
         * This storage value is only cosmetic/navigation state.
         *
         * No password, verification code, auth token or session
         * credential is stored in sessionStorage.
         */
        sessionStorage.setItem(
          'sami_admin_login_email',
          verificationEmail
        );

        const fallbackNext =
          `/admin/verify-email?email=${encodeURIComponent(
            verificationEmail
          )}`;

        router.replace(
          data.next ||
          fallbackNext
        );

        return;
      }

      /* ======================================================
         NORMAL FAILURE
         ====================================================== */

      if (
        !response.ok ||
        !data.success
      ) {
        let message =
          data.error ||
          data.message ||
          'Administrator sign-in failed.';

        if (
          data.code ===
            'ACCOUNT_LOCKED' &&
          data.lockedUntil
        ) {
          const lockedUntil =
            new Date(
              data.lockedUntil
            );

          if (
            !Number.isNaN(
              lockedUntil.getTime()
            )
          ) {
            message =
              `This administrator account is temporarily locked. Try again after ${lockedUntil.toLocaleString()}.`;
          }
        }

        setError(
          message
        );

        return;
      }

      /* ======================================================
         2FA HANDOFF
         ====================================================== */

      if (
        data.requiresTwoFactor ||
        data.requiresTwoFactorSetup
      ) {
        /*
         * Email is navigation/display state only.
         *
         * Authentication remains protected by the secure
         * admin login-challenge cookie created by the server.
         */
        sessionStorage.setItem(
          'sami_admin_login_email',
          normalizedEmail
        );

        if (
          data.challengeExpiresAt
        ) {
          sessionStorage.setItem(
            'sami_admin_login_challenge_expires_at',
            data.challengeExpiresAt
          );
        } else {
          sessionStorage.removeItem(
            'sami_admin_login_challenge_expires_at'
          );
        }

        router.replace(
          data.next ||
          (
            data.requiresTwoFactorSetup
              ? '/admin/two-factor/setup'
              : '/admin/two-factor'
          )
        );

        return;
      }

      /* ======================================================
         AUTHENTICATED
         ====================================================== */

      if (
        data.authenticated
      ) {
        sessionStorage.removeItem(
          'sami_admin_login_email'
        );

        sessionStorage.removeItem(
          'sami_admin_login_challenge_expires_at'
        );

        router.replace(
          data.next ||
          '/admin'
        );

        router.refresh();

        return;
      }

      setError(
        'Administrator authentication did not complete.'
      );
    } catch (
      requestError
    ) {
      console.error(
        '[Admin Login]',
        requestError
      );

      setError(
        'SaMi could not connect to the administrator authentication service.'
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /* ==========================================================
     PAGE
     ========================================================== */

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10 text-white sm:px-6">
      {/* ======================================================
          BACKGROUND
          ====================================================== */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-1/2 top-[-20rem] h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-blue-600/[0.08] blur-3xl" />

        <div className="absolute bottom-[-18rem] right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-indigo-500/[0.06] blur-3xl" />

        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      </div>

      {/* ======================================================
          CONTENT
          ====================================================== */}

      <section className="relative z-10 w-full max-w-md">
        {/* ====================================================
            BRAND
            ==================================================== */}

        <header className="mb-8 text-center">
          <div className="flex justify-center">
            <SaMiLogo
              size="md"
              showTagline={false}
              showReflection={false}
              showBackground={false}
              className="max-w-[220px]"
            />
          </div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5" />

            Platform Administration
          </div>
        </header>

        {/* ====================================================
            CARD
            ==================================================== */}

        <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
          {/* ==================================================
              HEADER
              ================================================== */}

          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Administrator access
            </p>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Sign in
            </h1>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Sign in using an authorized SaMi Platform Administrator account.
            </p>
          </div>

          {/* ==================================================
              SUCCESS
              ================================================== */}

          {successMessage ? (
            <div className="mb-6 flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

              <span>
                {successMessage}
              </span>
            </div>
          ) : null}

          {/* ==================================================
              ERROR
              ================================================== */}

          {error ? (
            <div className="mb-6 flex gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

              <span>
                {error}
              </span>
            </div>
          ) : null}

          {/* ==================================================
              FORM
              ================================================== */}

          <form
            onSubmit={
              handleSubmit
            }
            className="space-y-5"
          >
            {/* =================================================
                EMAIL
                ================================================= */}

            <div>
              <label
                htmlFor="admin-email"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Administrator email
              </label>

              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />

                <input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="email"
                  value={
                    email
                  }
                  onChange={(
                    event
                  ) => {
                    setEmail(
                      event.target.value
                    );

                    setError(
                      null
                    );
                  }}
                  disabled={
                    loading
                  }
                  className="h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-12 pr-4 text-sm outline-none transition placeholder:text-zinc-600 focus:border-blue-500/60 focus:ring-4 focus:ring-blue-500/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Administrator email"
                />
              </div>
            </div>

            {/* =================================================
                PASSWORD
                ================================================= */}

            <div>
              <div className="mb-2 flex items-center justify-between gap-4">
                <label
                  htmlFor="admin-password"
                  className="block text-sm font-medium text-zinc-300"
                >
                  Password
                </label>

                <Link
                  href="/admin/forgot-password"
                  className="text-xs font-medium text-blue-400 transition hover:text-blue-300"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />

                <input
                  id="admin-password"
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  autoComplete="current-password"
                  value={
                    password
                  }
                  onChange={(
                    event
                  ) => {
                    setPassword(
                      event.target.value
                    );

                    setError(
                      null
                    );
                  }}
                  disabled={
                    loading
                  }
                  className="h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-12 pr-12 text-sm outline-none transition placeholder:text-zinc-600 focus:border-blue-500/60 focus:ring-4 focus:ring-blue-500/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Password"
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
                  disabled={
                    loading
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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

            {/* =================================================
                REMEMBER
                ================================================= */}

            <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={
                  rememberMe
                }
                onChange={(
                  event
                ) =>
                  setRememberMe(
                    event.target.checked
                  )
                }
                disabled={
                  loading
                }
                className="h-4 w-4 accent-white"
              />

              Keep this administrator session active
            </label>

            {/* =================================================
                SUBMIT
                ================================================= */}

            <button
              type="submit"
              disabled={
                loading
              }
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 focus:outline-none focus:ring-4 focus:ring-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />

                  Verifying...
                </>
              ) : (
                <>
                  Continue

                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* ==================================================
              SECURITY NOTICE
              ================================================== */}

          <div className="mt-7 border-t border-white/10 pt-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />

              <p className="text-xs leading-5 text-zinc-500">
                Restricted to authorized SaMi Platform Administrators. Administrative authentication and security activity is audited.
              </p>
            </div>
          </div>
        </div>

        {/* ====================================================
            FOOTER
            ==================================================== */}

        <p className="mt-6 text-center text-xs text-zinc-600">
          SaMi — AI Powered Business Workspace
        </p>
      </section>
    </main>
  );
}