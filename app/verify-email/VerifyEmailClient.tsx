'use client';

import Link from 'next/link';
import {
  useRouter,
  useSearchParams,
} from 'next/navigation';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  MailCheck,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

/* ============================================================
   CONSTANTS
   ============================================================ */

const VERIFICATION_EMAIL_STORAGE_KEY =
  'sami_verification_email';

const THEME_STORAGE_KEY =
  'sami_theme';

const RESEND_COOLDOWN_SECONDS =
  60;

/* ============================================================
   TYPES
   ============================================================ */

type VerifyResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  next?: string;

  retryAfterSeconds?: number | null;
};

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeCode(value: string) {
  return value.trim();
}

function validCode(value: string) {
  return /^\d{6}$/.test(
    normalizeCode(value)
  );
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value.trim()
  );
}

function safeNextPath(
  value?: string | null
) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/api/')
  ) {
    return '/login?verified=1';
  }

  return value;
}

function maskEmail(value: string) {
  const clean =
    value.trim();

  const atIndex =
    clean.indexOf('@');

  if (atIndex <= 1) {
    return clean;
  }

  const local =
    clean.slice(0, atIndex);

  const domain =
    clean.slice(atIndex);

  return `${local.slice(
    0,
    Math.min(2, local.length)
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
   CONTENT
   ============================================================ */

function VerifyEmailContent() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const queryEmail =
    useMemo(
      () =>
        searchParams.get(
          'email'
        ) || '',
      [searchParams]
    );

  const [
    email,
    setEmail,
  ] = useState(
    queryEmail
  );

  const [
    code,
    setCode,
  ] = useState('');

  const [
    editingEmail,
    setEditingEmail,
  ] = useState(
    !queryEmail
  );

  const [
    verifying,
    setVerifying,
  ] = useState(false);

  const [
    resending,
    setResending,
  ] = useState(false);

  const [
    resendSeconds,
    setResendSeconds,
  ] = useState(0);

  const [
    verifyRetrySeconds,
    setVerifyRetrySeconds,
  ] = useState(0);

  const [
    darkMode,
    setDarkMode,
  ] = useState(false);

  const [
    emailError,
    setEmailError,
  ] = useState<
    string | null
  >(null);

  const [
    codeError,
    setCodeError,
  ] = useState<
    string | null
  >(null);

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
      // Theme remains usable.
    }
  }, []);

  const toggleTheme =
    useCallback(() => {
      setDarkMode(
        (current) => {
          const next =
            !current;

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
            // Ignore storage error.
          }

          return next;
        }
      );
    }, []);

  /* ==========================================================
     RESTORE EMAIL
     ========================================================== */

  useEffect(() => {
    if (queryEmail) {
      const normalized =
        queryEmail
          .trim()
          .toLowerCase();

      setEmail(
        normalized
      );

      setEditingEmail(
        false
      );

      try {
        sessionStorage.setItem(
          VERIFICATION_EMAIL_STORAGE_KEY,
          normalized
        );
      } catch {
        // Optional convenience storage.
      }

      return;
    }

    try {
      const storedEmail =
        sessionStorage.getItem(
          VERIFICATION_EMAIL_STORAGE_KEY
        );

      if (
        storedEmail &&
        validEmail(
          storedEmail
        )
      ) {
        setEmail(
          storedEmail
        );

        setEditingEmail(
          false
        );
      }
    } catch {
      // User can enter email manually.
    }
  }, [queryEmail]);

  /* ==========================================================
     RESEND COUNTDOWN
     ========================================================== */

  useEffect(() => {
    if (
      resendSeconds <= 0
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          setResendSeconds(
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
  }, [resendSeconds]);

  useEffect(() => {
    if (
      verifyRetrySeconds <= 0
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          setVerifyRetrySeconds(
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
  }, [verifyRetrySeconds]);

  /* ==========================================================
     FIELD HANDLING
     ========================================================== */

  function handleEmailChange(
    value: string
  ) {
    setEmail(value);

    if (
      verifyRetrySeconds > 0
    ) {
      setVerifyRetrySeconds(0);
    }

    if (emailError) {
      setEmailError(
        null
      );
    }
  }

  function handleCodeChange(
    value: string
  ) {
    if (
      !/^\d{0,6}$/.test(
        value
      )
    ) {
      return;
    }

    setCode(value);

    if (codeError) {
      setCodeError(
        null
      );
    }
  }

  /* ==========================================================
     VERIFY
     ========================================================== */

  async function handleVerify(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      verifying ||
      resending ||
      verifyRetrySeconds > 0
    ) {
      return;
    }

    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    const cleanVerificationCode =
      normalizeCode(code);

    let invalid =
      false;

    if (
      !validEmail(
        cleanEmail
      )
    ) {
      setEmailError(
        'Enter a valid email address.'
      );

      invalid = true;
    }

    if (
      !validCode(
        cleanVerificationCode
      )
    ) {
      setCodeError(
        'Enter the 6-digit verification code.'
      );

      invalid = true;
    }

    if (invalid) {
      setOverlay({
        type: 'warning',
        title:
          'Check your verification details',
        message:
          'Enter the email address used for your SaMi account and the complete 6-digit verification code.',
      });

      return;
    }

    setVerifying(true);

    setOverlay(null);

    try {
      const response =
        await fetch(
          '/api/auth/verify-email',
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

                code:
                  cleanVerificationCode,
              }),
          }
        );

      let data:
        VerifyResponse;

      try {
        data =
          (await response.json()) as VerifyResponse;
      } catch {
        data = {
          success: false,

          code:
            'EMAIL_VERIFY_ERROR',

          error:
            'SaMi could not process the verification response.',
        };
      }

      if (
        !response.ok ||
        !data.success
      ) {
        if (
          data.code ===
            'VERIFICATION_RATE_LIMITED' &&
          data.retryAfterSeconds &&
          data.retryAfterSeconds >
            0
        ) {
          setVerifyRetrySeconds(
            Math.ceil(
              data.retryAfterSeconds
            )
          );
        }

        setOverlay(
          getAuthOverlayMessage(
            data.code ||
              'EMAIL_VERIFY_ERROR',
            {
              fallback:
                data.error ||
                data.message ||
                'SaMi could not verify this email address.',

              email:
                cleanEmail,

              retryAfterSeconds:
                data.retryAfterSeconds,
            }
          )
        );

        return;
      }

      setVerifyRetrySeconds(0);

      try {
        sessionStorage.removeItem(
          VERIFICATION_EMAIL_STORAGE_KEY
        );
      } catch {
        // Verification is already complete.
      }

      setOverlay(
        getAuthOverlayMessage(
          data.code ||
            'EMAIL_VERIFIED',
          {
            fallback:
              data.message ||
              'Your email has been verified successfully.',
          }
        )
      );

      const destination =
        safeNextPath(
          data.next
        );

      window.setTimeout(
        () => {
          router.replace(
            destination
          );

          router.refresh();
        },
        850
      );
    } catch {
      setOverlay(
        getAuthOverlayMessage(
          'EMAIL_VERIFY_ERROR',
          {
            fallback:
              'SaMi could not connect to the server. Check your connection and try again.',
          }
        )
      );
    } finally {
      setVerifying(false);
    }
  }

  /* ==========================================================
     RESEND
     ========================================================== */

  async function resend() {
    if (
      resending ||
      verifying ||
      resendSeconds > 0
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

    setResending(true);

    setOverlay(null);

    try {
      const response =
        await fetch(
          '/api/auth/resend-verification',
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
        VerifyResponse;

      try {
        data =
          (await response.json()) as VerifyResponse;
      } catch {
        data = {
          success: false,

          code:
            'RESEND_VERIFICATION_ERROR',

          error:
            'SaMi could not process the resend response.',
        };
      }

      if (
        !response.ok ||
        data.success === false
      ) {
        setOverlay(
          getAuthOverlayMessage(
            data.code ||
              'RESEND_VERIFICATION_ERROR',
            {
              fallback:
                data.error ||
                data.message ||
                'SaMi could not resend the verification code.',

              email:
                cleanEmail,

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
          setResendSeconds(
            data.retryAfterSeconds
          );
        }

        return;
      }

      setCode('');

      setCodeError(null);

      setResendSeconds(
        data.retryAfterSeconds &&
          data.retryAfterSeconds >
            0
          ? data.retryAfterSeconds
          : RESEND_COOLDOWN_SECONDS
      );

      try {
        sessionStorage.setItem(
          VERIFICATION_EMAIL_STORAGE_KEY,
          cleanEmail
        );
      } catch {
        // Optional convenience storage.
      }

      setOverlay(
        getAuthOverlayMessage(
          'VERIFICATION_CODE_SENT'
        )
      );
    } catch {
      setOverlay(
        getAuthOverlayMessage(
          'RESEND_VERIFICATION_ERROR',
          {
            fallback:
              'SaMi could not connect to the server. Check your connection and try again.',
          }
        )
      );
    } finally {
      setResending(false);
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

        {/* Background */}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -left-52 -top-52 h-[600px] w-[600px] rounded-full bg-blue-500/[0.07] blur-[120px] dark:bg-blue-500/[0.10]" />

          <div className="absolute -bottom-56 right-[-160px] h-[620px] w-[620px] rounded-full bg-indigo-500/[0.06] blur-[120px] dark:bg-indigo-500/[0.09]" />
        </div>

        {/* Theme */}

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

        {/* Page */}

        <div className="relative mx-auto flex min-h-screen w-full max-w-[1200px] items-center justify-center px-4 py-8 sm:px-6">

          <div className="grid w-full max-w-[980px] items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">

            {/* ===============================================
                BRAND
               =============================================== */}

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
                  <MailCheck className="h-6 w-6" />
                </div>

                <h1 className="mt-5 text-[34px] font-black leading-tight tracking-[-0.04em]">
                  One quick check,
                  <br />
                  then you&apos;re in.
                </h1>

                <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Email verification helps
                  SaMi protect your identity,
                  workspace and business
                  access.
                </p>

                <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <ShieldCheck className="h-4 w-4" />

                  Secure account verification
                </div>
              </div>
            </section>

            {/* ===============================================
                VERIFY CARD
               =============================================== */}

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

              <div className="rounded-[30px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8 dark:border-slate-800 dark:bg-[#0d111a]/95">

                {/* Header */}

                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <MailCheck className="h-6 w-6" />
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
                      Email verification
                    </p>

                    <h2 className="mt-1 text-[27px] font-black tracking-[-0.035em]">
                      Verify your email
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Enter the 6-digit code
                      SaMi sent to your email.
                    </p>
                  </div>
                </div>

                {/* Email identity */}

                {!editingEmail &&
                validEmail(email) ? (
                  <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                      <Mail className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                        Code sent to
                      </p>

                      <p className="truncate text-sm font-black">
                        {maskEmail(
                          email
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setEditingEmail(
                          true
                        )
                      }
                      disabled={
                        verifying ||
                        resending
                      }
                      className="text-[11px] font-bold text-blue-600 transition hover:text-blue-700 disabled:opacity-50 dark:text-blue-400"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="mt-6">
                    <label
                      htmlFor="verify-email"
                      className="text-[12px] font-bold text-slate-700 dark:text-slate-200"
                    >
                      Email address
                    </label>

                    <div
                      className={`mt-2 flex h-11 items-center gap-3 rounded-xl border bg-white px-4 transition focus-within:ring-4 dark:bg-slate-950 ${
                        emailError
                          ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/10'
                          : 'border-slate-200 focus-within:border-blue-500 focus-within:ring-blue-500/10 dark:border-slate-700'
                      }`}
                    >
                      <Mail className="h-4 w-4 shrink-0 text-slate-400" />

                      <input
                        id="verify-email"
                        type="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={email}
                        onChange={(event) =>
                          handleEmailChange(
                            event.target.value
                          )
                        }
                        placeholder="you@example.com"
                        aria-invalid={
                          Boolean(
                            emailError
                          )
                        }
                        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
                      />
                    </div>

                    {emailError && (
                      <p className="mt-1.5 text-xs font-medium text-red-500">
                        {emailError}
                      </p>
                    )}
                  </div>
                )}

                {/* Form */}

                <form
                  onSubmit={
                    handleVerify
                  }
                  noValidate
                  className="mt-6"
                >
                  <label
                    htmlFor="verify-code"
                    className="text-[12px] font-bold text-slate-700 dark:text-slate-200"
                  >
                    Verification code
                  </label>

                  <input
                    id="verify-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={(event) =>
                      handleCodeChange(
                        event.target.value
                      )
                    }
                    placeholder="000000"
                    aria-invalid={
                      Boolean(
                        codeError
                      )
                    }
                    className={`mt-2 h-[66px] w-full rounded-2xl border bg-white px-4 text-center text-[28px] font-black tracking-[0.35em] outline-none transition focus:ring-4 dark:bg-slate-950 sm:text-[31px] ${
                      codeError
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10 dark:border-slate-700'
                    }`}
                  />

                  {codeError ? (
                    <p className="mt-1.5 text-xs font-medium text-red-500">
                      {codeError}
                    </p>
                  ) : (
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                      <ShieldCheck className="h-3.5 w-3.5" />

                      Verification codes are
                      single-use and expire after
                      15 minutes.
                    </div>
                  )}

                  {/* Verify */}

                  <button
                    type="submit"
                    disabled={
                      verifying ||
                      resending ||
                      verifyRetrySeconds >
                        0
                    }
                    aria-busy={
                      verifying
                    }
                    className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-[0.997] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />

                        Verifying...
                      </>
                    ) : verifyRetrySeconds >
                      0 ? (
                      <>
                        <Clock3 className="h-5 w-5" />

                        Try again in{' '}
                        {verifyRetrySeconds}s
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-5 w-5" />

                        Verify email
                      </>
                    )}
                  </button>
                </form>

                {/* Resend */}

                <div className="mt-5 flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-center dark:bg-slate-950">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Didn&apos;t receive the code?
                  </p>

                  <button
                    type="button"
                    onClick={resend}
                    disabled={
                      resending ||
                      verifying ||
                      resendSeconds >
                        0
                    }
                    className="inline-flex items-center gap-2 text-xs font-black text-blue-600 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-blue-400"
                  >
                    {resending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />

                        Sending...
                      </>
                    ) : resendSeconds >
                      0 ? (
                      <>
                        <Clock3 className="h-3.5 w-3.5" />

                        Resend in{' '}
                        {resendSeconds}s
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3.5 w-3.5" />

                        Send another code
                      </>
                    )}
                  </button>
                </div>

                {/* Back */}

                <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />

                    Back to sign in
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

/* ============================================================
   EXPORT
   ============================================================ */

export default function VerifyEmailClient() {
  return <VerifyEmailContent />;
}