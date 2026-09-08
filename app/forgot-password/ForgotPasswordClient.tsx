'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  MailCheck,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import {
  type FormEvent,
  useEffect,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

/* ============================================================
   CONSTANTS
   ============================================================ */

const THEME_STORAGE_KEY =
  'sami_theme';

const FORGOT_PASSWORD_ENDPOINT =
  '/api/auth/forgot-password';

const DEFAULT_RESEND_COOLDOWN =
  60;

/* ============================================================
   TYPES
   ============================================================ */

type ResponseData = {
  success?: boolean;
  code?: string;
  message?: string;
  error?: string;
  retryAfterSeconds?: number | null;
};

/* ============================================================
   HELPERS
   ============================================================ */

function validEmail(
  value: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value.trim()
  );
}

function maskEmail(
  value: string
) {
  const clean =
    value.trim();

  const at =
    clean.indexOf('@');

  if (at <= 1) {
    return clean;
  }

  const local =
    clean.slice(0, at);

  const domain =
    clean.slice(at);

  return `${local.slice(
    0,
    Math.min(
      2,
      local.length
    )
  )}${'•'.repeat(
    Math.max(
      2,
      Math.min(
        local.length - 2,
        6
      )
    )
  )}${domain}`;
}

/* ============================================================
   PAGE
   ============================================================ */

export default function ForgotPasswordClient() {
  const [
    email,
    setEmail,
  ] = useState('');

  const [
    emailError,
    setEmailError,
  ] = useState<
    string | null
  >(null);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    sent,
    setSent,
  ] = useState(false);

  const [
    lastSentEmail,
    setLastSentEmail,
  ] = useState('');

  const [
    cooldown,
    setCooldown,
  ] = useState(0);

  const [
    darkMode,
    setDarkMode,
  ] = useState(false);

  const [
    overlay,
    setOverlay,
  ] = useState<
    ReturnType<
      typeof getAuthOverlayMessage
    > | null
  >(null);

  /* ==========================================================
     THEME
     ========================================================== */

  useEffect(() => {
    try {
      const stored =
        localStorage.getItem(
          THEME_STORAGE_KEY
        );

      const prefersDark =
        window.matchMedia?.(
          '(prefers-color-scheme: dark)'
        ).matches ?? false;

      const useDark =
        stored === 'dark' ||
        (!stored &&
          prefersDark);

      setDarkMode(
        useDark
      );

      document.documentElement.classList.toggle(
        'dark',
        useDark
      );
    } catch {
      // Page remains usable without
      // local storage.
    }
  }, []);

  function toggleTheme() {
    const next =
      !darkMode;

    setDarkMode(next);

    document.documentElement.classList.toggle(
      'dark',
      next
    );

    try {
      localStorage.setItem(
        THEME_STORAGE_KEY,
        next
          ? 'dark'
          : 'light'
      );
    } catch {
      // Ignore storage failure.
    }
  }

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
            (current) =>
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
     EMAIL
     ========================================================== */

  function updateEmail(
    value: string
  ) {
    setEmail(value);

    setSent(false);

    if (emailError) {
      setEmailError(
        null
      );
    }
  }

  /* ==========================================================
     SUBMIT
     ========================================================== */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submitting ||
      cooldown > 0
    ) {
      return;
    }

    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    if (
      !validEmail(
        cleanEmail
      )
    ) {
      setEmailError(
        'Enter a valid email address.'
      );

      setOverlay(
        getAuthOverlayMessage(
          'INVALID_EMAIL'
        )
      );

      return;
    }

    setSubmitting(true);

    setOverlay(null);

    setEmailError(null);

    try {
      const response =
        await fetch(
          FORGOT_PASSWORD_ENDPOINT,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                email:
                  cleanEmail,
              }),
          }
        );

      let data:
        ResponseData;

      try {
        data =
          (await response.json()) as ResponseData;
      } catch {
        data = {
          success: false,
          code:
            'FORGOT_PASSWORD_ERROR',
          error:
            'SaMi could not process the password recovery response.',
        };
      }

      /* ------------------------------------------------------
         API error
         ------------------------------------------------------ */

      if (!response.ok) {
        setOverlay(
          getAuthOverlayMessage(
            data.code ||
              'FORGOT_PASSWORD_ERROR',
            {
              fallback:
                data.error ||
                data.message ||
                'SaMi could not process your password recovery request.',

              retryAfterSeconds:
                data.retryAfterSeconds,
            }
          )
        );

        if (
          data.retryAfterSeconds &&
          data.retryAfterSeconds >
            0
        ) {
          setCooldown(
            data.retryAfterSeconds
          );
        }

        return;
      }

      /*
       * IMPORTANT:
       *
       * Do not tell the user whether
       * the account actually exists.
       *
       * The UI always gives the same
       * successful response to prevent
       * account enumeration.
       */

      setLastSentEmail(
        cleanEmail
      );

      setSent(true);

      setCooldown(
        data.retryAfterSeconds &&
          data.retryAfterSeconds >
            0
          ? data.retryAfterSeconds
          : DEFAULT_RESEND_COOLDOWN
      );

      setOverlay(
        getAuthOverlayMessage(
          'RESET_LINK_SENT'
        )
      );
    } catch {
      setOverlay(
        getAuthOverlayMessage(
          'FORGOT_PASSWORD_ERROR',
          {
            fallback:
              'SaMi could not connect to the server. Check your connection and try again.',
          }
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      {overlay && (
        <SaMiOverlay
          open
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
            overlay.primaryAction
          }
          secondaryAction={
            overlay.secondaryAction
          }
          onClose={() =>
            setOverlay(null)
          }
        />
      )}

      <main className="relative min-h-screen overflow-hidden bg-[#f6f8fb] text-slate-950 transition-colors dark:bg-[#070a10] dark:text-white">

        {/* ====================================================
            BACKGROUND
           ==================================================== */}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -left-52 -top-52 h-[600px] w-[600px] rounded-full bg-blue-500/[0.07] blur-[120px] dark:bg-blue-500/[0.10]" />

          <div className="absolute -bottom-56 right-[-160px] h-[620px] w-[620px] rounded-full bg-indigo-500/[0.06] blur-[120px] dark:bg-indigo-500/[0.09]" />
        </div>

        {/* ====================================================
            THEME
           ==================================================== */}

        <button
          type="button"
          onClick={
            toggleTheme
          }
          aria-label={
            darkMode
              ? 'Switch to light theme'
              : 'Switch to dark theme'
          }
          className="fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400 dark:hover:text-white sm:right-6 sm:top-6"
        >
          {darkMode ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>

        {/* ====================================================
            PAGE
           ==================================================== */}

        <div className="relative mx-auto flex min-h-screen w-full max-w-[1120px] items-center justify-center px-4 py-7 sm:px-6">

          <div className="grid w-full max-w-[950px] items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">

            {/* =================================================
                BRAND
               ================================================= */}

            <section className="hidden lg:block">

              <Link
                href="/"
                aria-label="SaMi home"
                className="inline-block max-w-full"
              >
                {/* FULL APPROVED LOGO */}
                <SaMiLogo
                  size="xl"
                  className="max-w-full"
                />
              </Link>

              <div className="mt-10 max-w-[390px]">

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                  <ShieldCheck className="h-6 w-6" />
                </div>

                <h1 className="mt-5 text-[34px] font-black leading-[1.08] tracking-[-0.04em]">
                  Recover your
                  <br />
                  SaMi account.
                </h1>

                <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Enter the email connected
                  to your SaMi account. We&apos;ll
                  send a secure reset link if
                  the account can be recovered.
                </p>

                <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <ShieldCheck className="h-4 w-4" />

                  Secure password recovery
                </div>
              </div>
            </section>

            {/* =================================================
                RECOVERY CARD
               ================================================= */}

            <section className="w-full">

              {/* Mobile logo */}

              <div className="mb-7 lg:hidden">
                <Link
                  href="/"
                  aria-label="SaMi home"
                  className="inline-block max-w-full"
                >
                  {/* FULL APPROVED LOGO */}
                  <SaMiLogo
                    size="lg"
                    className="max-w-full"
                  />
                </Link>
              </div>

              <div className="rounded-[30px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8 dark:border-slate-800 dark:bg-[#0d111a]/95 dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)]">

                {/* =============================================
                    HEADER
                   ============================================= */}

                <div className="flex items-start gap-4">

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <MailCheck className="h-6 w-6" />
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
                      Password recovery
                    </p>

                    <h2 className="mt-1 text-[27px] font-black tracking-[-0.035em]">
                      Reset your password
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Enter your SaMi account
                      email to receive a secure
                      password reset link.
                    </p>
                  </div>
                </div>

                {/* =============================================
                    SUCCESS SUMMARY
                   ============================================= */}

                {sent &&
                lastSentEmail ? (
                  <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/25">

                    <div className="flex items-start gap-3">

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-black text-emerald-800 dark:text-emerald-300">
                          Check your email
                        </p>

                        <p className="mt-1 text-[10px] leading-4 text-emerald-700 dark:text-emerald-400">
                          If a SaMi account
                          exists for{' '}
                          <strong>
                            {maskEmail(
                              lastSentEmail
                            )}
                          </strong>
                          , a password reset
                          link has been sent.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* =============================================
                    FORM
                   ============================================= */}

                <form
                  onSubmit={
                    handleSubmit
                  }
                  noValidate
                  className="mt-6"
                >

                  <label
                    htmlFor="forgot-email"
                    className="text-[12px] font-bold text-slate-700 dark:text-slate-200"
                  >
                    Email address
                  </label>

                  <div
                    className={`
                      mt-2 flex h-12
                      items-center gap-3
                      rounded-xl border
                      bg-white px-4
                      transition
                      focus-within:ring-4
                      dark:bg-slate-950
                      ${
                        emailError
                          ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/10 dark:border-red-500'
                          : 'border-slate-200 focus-within:border-blue-500 focus-within:ring-blue-500/10 dark:border-slate-700 dark:focus-within:border-blue-500'
                      }
                    `}
                  >
                    <Mail className="h-[18px] w-[18px] shrink-0 text-slate-400" />

                    <input
                      id="forgot-email"
                      name="email"
                      type="email"
                      value={email}
                      onChange={(event) =>
                        updateEmail(
                          event.target.value
                        )
                      }
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={254}
                      aria-invalid={
                        Boolean(
                          emailError
                        )
                      }
                      aria-describedby={
                        emailError
                          ? 'forgot-email-error'
                          : undefined
                      }
                      placeholder="you@example.com"
                      className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                    />
                  </div>

                  {emailError && (
                    <p
                      id="forgot-email-error"
                      role="alert"
                      className="mt-1.5 text-xs font-medium text-red-500"
                    >
                      {emailError}
                    </p>
                  )}

                  {/* ===========================================
                      PRIVACY NOTE
                     =========================================== */}

                  <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">

                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

                    <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                      For account security,
                      SaMi does not reveal
                      whether an email address
                      is registered.
                    </p>
                  </div>

                  {/* ===========================================
                      SUBMIT
                     =========================================== */}

                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      cooldown > 0
                    }
                    aria-busy={
                      submitting
                    }
                    className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-[0.997] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />

                        Sending reset link...
                      </>
                    ) : cooldown >
                      0 ? (
                      <>
                        <Clock3 className="h-4 w-4" />

                        Send again in{' '}
                        {cooldown}s
                      </>
                    ) : sent ? (
                      <>
                        Send another link

                        <ArrowRight className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Send reset link

                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* =============================================
                    BACK
                   ============================================= */}

                <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">

                  <div className="flex flex-wrap items-center justify-between gap-3">

                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />

                      Back to sign in
                    </Link>

                    <span className="text-[10px] text-slate-400">
                      Remember your password?{' '}
                      <Link
                        href="/login"
                        className="font-black text-blue-600 dark:text-blue-400"
                      >
                        Sign in
                      </Link>
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}

              <div className="mt-4 flex justify-center gap-4 text-[10px] text-slate-400">
                <Link
                  href="/help"
                  className="transition hover:text-slate-700 dark:hover:text-white"
                >
                  Help
                </Link>

                <Link
                  href="/privacy"
                  className="transition hover:text-slate-700 dark:hover:text-white"
                >
                  Privacy
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}