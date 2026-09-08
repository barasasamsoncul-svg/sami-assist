'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Smartphone,
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

const TWO_FACTOR_EMAIL_KEY =
  'sami_2fa_email';

const TWO_FACTOR_CHALLENGE_KEY =
  'sami_2fa_challenge';

const TWO_FACTOR_REMEMBER_KEY =
  'sami_2fa_remember';

const TWO_FACTOR_NEXT_KEY =
  'sami_2fa_next';

const THEME_STORAGE_KEY =
  'sami_theme';

const TWO_FACTOR_ENDPOINT =
  '/api/auth/login/2fa';

/* ============================================================
   TYPES
   ============================================================ */

type VerificationMode =
  | 'authenticator'
  | 'recovery';

type ResponseData = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  next?: string;

  retryAfterSeconds?: number | null;
  lockedUntil?: string | null;
};

/* ============================================================
   HELPERS
   ============================================================ */

function cleanAuthenticatorCode(
  value: string
) {
  return value
    .replace(/\D/g, '')
    .slice(0, 6);
}

function cleanRecoveryCode(
  value: string
) {
  return value
    .replace(/[\r\n\t]/g, '')
    .slice(0, 32);
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
    return '/dashboard';
  }

  if (
    /^\/(?:login|register|forgot-password|reset-password|verify-email)(?:\/|$|\?)/i.test(
      value
    )
  ) {
    return '/dashboard';
  }

  return value;
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

function clearChallengeStorage() {
  try {
    sessionStorage.removeItem(
      TWO_FACTOR_EMAIL_KEY
    );

    sessionStorage.removeItem(
      TWO_FACTOR_CHALLENGE_KEY
    );

    sessionStorage.removeItem(
      TWO_FACTOR_REMEMBER_KEY
    );

    sessionStorage.removeItem(
      TWO_FACTOR_NEXT_KEY
    );
  } catch {
    // Temporary auth state may already be unavailable.
  }
}

/* ============================================================
   PAGE
   ============================================================ */

export default function TwoFactorLoginClient() {
  const router =
    useRouter();

  const [
    email,
    setEmail,
  ] = useState('');

  const [
    challengeToken,
    setChallengeToken,
  ] = useState('');

  const [
    rememberMe,
    setRememberMe,
  ] = useState(false);

  const [
    intendedNext,
    setIntendedNext,
  ] = useState(
    '/dashboard'
  );

  const [
    mode,
    setMode,
  ] = useState<VerificationMode>(
    'authenticator'
  );

  const [
    code,
    setCode,
  ] = useState('');

  const [
    codeError,
    setCodeError,
  ] = useState<
    string | null
  >(null);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    darkMode,
    setDarkMode,
  ] = useState(false);

  const [
    ready,
    setReady,
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

      const systemDark =
        window.matchMedia?.(
          '(prefers-color-scheme: dark)'
        ).matches ?? false;

      const useDark =
        stored === 'dark' ||
        (!stored &&
          systemDark);

      setDarkMode(
        useDark
      );

      document.documentElement.classList.toggle(
        'dark',
        useDark
      );
    } catch {
      // Page remains usable.
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
            // Ignore theme persistence failure.
          }

          return next;
        }
      );
    }, []);

  /* ==========================================================
     RESTORE LOGIN CHALLENGE
     ========================================================== */

  useEffect(() => {
    try {
      const storedEmail =
        sessionStorage.getItem(
          TWO_FACTOR_EMAIL_KEY
        ) || '';

      const storedChallenge =
        sessionStorage.getItem(
          TWO_FACTOR_CHALLENGE_KEY
        ) || '';

      const storedRemember =
        sessionStorage.getItem(
          TWO_FACTOR_REMEMBER_KEY
        ) === 'true';

      const storedNext =
        safeNextPath(
          sessionStorage.getItem(
            TWO_FACTOR_NEXT_KEY
          )
        );

      setEmail(
        storedEmail
      );

      setChallengeToken(
        storedChallenge
      );

      setRememberMe(
        storedRemember
      );

      setIntendedNext(
        storedNext
      );

      if (
        !storedEmail ||
        !storedChallenge
      ) {
        setOverlay(
          getAuthOverlayMessage(
            'LOGIN_CHALLENGE_EXPIRED'
          )
        );
      }
    } catch {
      setOverlay(
        getAuthOverlayMessage(
          'LOGIN_CHALLENGE_EXPIRED'
        )
      );
    } finally {
      setReady(true);
    }
  }, []);

  /* ==========================================================
     INPUT
     ========================================================== */

  const displayCode =
    useMemo(() => {
      return mode ===
        'authenticator'
        ? cleanAuthenticatorCode(
            code
          )
        : cleanRecoveryCode(
            code
          );
    }, [
      mode,
      code,
    ]);

  function updateCode(
    value: string
  ) {
    const next =
      mode ===
      'authenticator'
        ? cleanAuthenticatorCode(
            value
          )
        : cleanRecoveryCode(
            value
          );

    setCode(next);

    if (codeError) {
      setCodeError(
        null
      );
    }
  }

  function changeMode(
    nextMode: VerificationMode
  ) {
    if (
      submitting ||
      nextMode === mode
    ) {
      return;
    }

    setMode(
      nextMode
    );

    setCode('');

    setCodeError(
      null
    );

    setOverlay(null);
  }

  /* ==========================================================
     CANCEL
     ========================================================== */

  function handleCancel() {
    if (submitting) {
      return;
    }

    clearChallengeStorage();

    router.replace(
      '/login'
    );
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
      !email ||
      !challengeToken
    ) {
      return;
    }

    const normalizedCode =
      mode ===
      'authenticator'
        ? cleanAuthenticatorCode(
            code
          )
        : cleanRecoveryCode(
            code
          ).trim();

    if (
      mode ===
        'authenticator' &&
      normalizedCode.length !==
        6
    ) {
      setCodeError(
        'Enter the complete 6-digit authenticator code.'
      );

      setOverlay(
        getAuthOverlayMessage(
          'TWO_FACTOR_REQUIRED'
        )
      );

      return;
    }

    if (
      mode === 'recovery' &&
      !normalizedCode
    ) {
      setCodeError(
        'Enter one of your unused recovery codes.'
      );

      setOverlay(
        getAuthOverlayMessage(
          'TWO_FACTOR_REQUIRED'
        )
      );

      return;
    }

    setSubmitting(true);

    setOverlay(null);

    setCodeError(null);

    try {
      const response =
        await fetch(
          TWO_FACTOR_ENDPOINT,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'include',

            cache:
              'no-store',

            body:
              JSON.stringify({
                email,

                challengeToken,

                code:
                  normalizedCode,

                rememberMe,
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
            'TWO_FACTOR_LOGIN_ERROR',

          error:
            'SaMi could not process the verification response.',
        };
      }

      /* ------------------------------------------------------
         FAILED VERIFICATION
         ------------------------------------------------------ */

      if (
        !response.ok ||
        !data.success
      ) {
        if (
          data.code ===
          'LOGIN_CHALLENGE_EXPIRED'
        ) {
          clearChallengeStorage();
        }

        setOverlay(
          getAuthOverlayMessage(
            data.code ||
              'TWO_FACTOR_LOGIN_ERROR',
            {
              fallback:
                data.error ||
                data.message ||
                'SaMi could not complete two-factor verification.',

              retryAfterSeconds:
                data.retryAfterSeconds,

              lockedUntil:
                data.lockedUntil,

              email,
            }
          )
        );

        return;
      }

      /* ------------------------------------------------------
         SUCCESS
         ------------------------------------------------------ */

      clearChallengeStorage();

      setCode('');

      const destination =
        safeNextPath(
          data.next ||
            intendedNext
        );

      router.replace(
        destination
      );

      router.refresh();
    } catch {
      setOverlay(
        getAuthOverlayMessage(
          'TWO_FACTOR_LOGIN_ERROR',
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

          <div className="absolute -bottom-56 right-[-170px] h-[620px] w-[620px] rounded-full bg-violet-500/[0.06] blur-[120px] dark:bg-violet-500/[0.09]" />
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

        <div className="relative mx-auto flex min-h-screen w-full max-w-[1100px] items-center justify-center px-4 py-7 sm:px-6">

          <div className="grid w-full max-w-[930px] items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">

            {/* =================================================
                BRAND PANEL
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
                  One more step
                  <br />
                  to your workspace.
                </h1>

                <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Two-factor authentication
                  protects your SaMi account
                  even if somebody knows your
                  password.
                </p>

                <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <LockKeyhole className="h-4 w-4" />

                  Protected sign-in
                </div>
              </div>
            </section>

            {/* =================================================
                TWO FACTOR CARD
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
                    <ShieldCheck className="h-6 w-6" />
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
                      Secure sign-in
                    </p>

                    <h2 className="mt-1 text-[27px] font-black tracking-[-0.035em]">
                      Two-factor verification
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Verify your identity to
                      continue to SaMi.
                    </p>
                  </div>
                </div>

                {/* =============================================
                    ACCOUNT
                   ============================================= */}

                {email && (
                  <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">

                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                      <LockKeyhole className="h-3.5 w-3.5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Signing in as
                      </p>

                      <p className="truncate text-xs font-bold">
                        {maskEmail(
                          email
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={
                        handleCancel
                      }
                      disabled={
                        submitting
                      }
                      className="text-[10px] font-bold text-blue-600 transition hover:text-blue-700 disabled:opacity-50 dark:text-blue-400"
                    >
                      Change
                    </button>
                  </div>
                )}

                {/* =============================================
                    MODE SWITCH
                   ============================================= */}

                <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-950">

                  <button
                    type="button"
                    onClick={() =>
                      changeMode(
                        'authenticator'
                      )
                    }
                    disabled={
                      submitting
                    }
                    className={`flex h-10 items-center justify-center gap-2 rounded-lg text-[10px] font-black transition ${
                      mode ===
                      'authenticator'
                        ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" />

                    Authenticator
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      changeMode(
                        'recovery'
                      )
                    }
                    disabled={
                      submitting
                    }
                    className={`flex h-10 items-center justify-center gap-2 rounded-lg text-[10px] font-black transition ${
                      mode ===
                      'recovery'
                        ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    <KeyRound className="h-3.5 w-3.5" />

                    Recovery code
                  </button>
                </div>

                {/* =============================================
                    FORM
                   ============================================= */}

                <form
                  onSubmit={
                    handleSubmit
                  }
                  noValidate
                  className="mt-5"
                >

                  <label
                    htmlFor="two-factor-code"
                    className="text-[12px] font-bold text-slate-700 dark:text-slate-200"
                  >
                    {mode ===
                    'authenticator'
                      ? '6-digit authenticator code'
                      : 'Recovery code'}
                  </label>

                  <input
                    id="two-factor-code"
                    type="text"
                    inputMode={
                      mode ===
                      'authenticator'
                        ? 'numeric'
                        : 'text'
                    }
                    autoComplete={
                      mode ===
                      'authenticator'
                        ? 'one-time-code'
                        : 'off'
                    }
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={
                      mode ===
                      'authenticator'
                        ? 6
                        : 32
                    }
                    value={
                      displayCode
                    }
                    onChange={(event) =>
                      updateCode(
                        event.target.value
                      )
                    }
                    autoFocus
                    disabled={
                      submitting ||
                      !ready ||
                      !email ||
                      !challengeToken
                    }
                    placeholder={
                      mode ===
                      'authenticator'
                        ? '000000'
                        : 'Enter recovery code'
                    }
                    aria-invalid={
                      Boolean(
                        codeError
                      )
                    }
                    aria-describedby={
                      codeError
                        ? 'two-factor-code-error'
                        : 'two-factor-code-help'
                    }
                    className={`mt-2 w-full rounded-2xl border bg-white px-4 outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950 ${
                      mode ===
                      'authenticator'
                        ? 'h-[66px] text-center text-[28px] font-black tracking-[0.35em]'
                        : 'h-12 text-sm font-bold tracking-wide'
                    } ${
                      codeError
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10 dark:border-red-500'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10 dark:border-slate-700 dark:focus:border-blue-500'
                    }`}
                  />

                  {codeError ? (
                    <p
                      id="two-factor-code-error"
                      role="alert"
                      className="mt-1.5 text-xs font-medium text-red-500"
                    >
                      {codeError}
                    </p>
                  ) : (
                    <p
                      id="two-factor-code-help"
                      className="mt-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400"
                    >
                      {mode ===
                      'authenticator'
                        ? 'Open your authenticator app and enter the current code for SaMi.'
                        : 'Use one unused recovery code saved when two-factor authentication was enabled.'}
                    </p>
                  )}

                  {/* ===========================================
                      SUBMIT
                     =========================================== */}

                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      !ready ||
                      !email ||
                      !challengeToken
                    }
                    aria-busy={
                      submitting
                    }
                    className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-[0.997] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />

                        Verifying...
                      </>
                    ) : (
                      <>
                        Verify and continue

                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* =============================================
                    SECURITY NOTE
                   ============================================= */}

                <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

                  <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                    SaMi will never ask you
                    to share your authenticator
                    secret or unused recovery
                    codes outside this secure
                    sign-in flow.
                  </p>
                </div>

                {/* =============================================
                    CANCEL
                   ============================================= */}

                <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={
                      handleCancel
                    }
                    disabled={
                      submitting
                    }
                    className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-slate-950 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />

                    Back to sign in
                  </button>
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