'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  HelpCircle,
  Loader2,
  LockKeyhole,
  Mail,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  type FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

/* ============================================================
   TYPES
   ============================================================ */

type LoginResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  next?: string;
  email?: string;
  challengeToken?: string;
  retryAfterSeconds?: number | null;
  lockedUntil?: string | null;
};

type LoginErrors = {
  email?: string;
  password?: string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const THEME_STORAGE_KEY = 'sami_theme';

const TWO_FACTOR_EMAIL_KEY = 'sami_2fa_email';
const TWO_FACTOR_CHALLENGE_KEY = 'sami_2fa_challenge';
const TWO_FACTOR_REMEMBER_KEY = 'sami_2fa_remember';
const TWO_FACTOR_NEXT_KEY = 'sami_2fa_next';

const AUTH_NEXT_KEY = 'sami_auth_next';

/* ============================================================
   HELPERS
   ============================================================ */

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value.trim()
  );
}

function safeNextPath(
  value: string | null | undefined
) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/dashboard';
  }

  if (value.startsWith('/api/')) {
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

function googleErrorMessage(code: string) {
  switch (code) {
    case 'cancelled':
    case 'access_denied':
      return {
        title: 'Google sign-in cancelled',
        message:
          'Google sign-in was cancelled. You can try again or sign in with your email and password.',
      };

    case 'google_config':
      return {
        title: 'Google sign-in unavailable',
        message:
          'Google sign-in is temporarily unavailable. Please sign in with your email and password.',
      };

    case 'google_token':
      return {
        title: 'Google sign-in could not be completed',
        message:
          'SaMi could not complete the secure connection with Google. Please try again.',
      };

    case 'google_email':
      return {
        title: 'Google account information unavailable',
        message:
          'SaMi could not retrieve the required email information from Google.',
      };

    case 'google_identity':
      return {
        title: 'Google identity could not be verified',
        message:
          'SaMi could not securely verify your Google identity. Please try again.',
      };

    case 'google_unverified':
      return {
        title: 'Google email is not verified',
        message:
          'Your Google email must be verified before it can be used to sign in to SaMi.',
      };

    case 'google_account_deleted':
      return {
        title: 'Account unavailable',
        message:
          'The SaMi account associated with this Google email is unavailable. Please use account recovery or contact support.',
      };

    case 'google_missing_code':
    case 'google_invalid_request':
    case 'google_unauthorized':
    case 'google_unsupported_response':
    case 'google_invalid_scope':
      return {
        title: 'Google sign-in could not start',
        message:
          'The Google authentication request could not be completed. Please try again.',
      };

    case 'google_server_error':
    case 'google_unavailable':
      return {
        title: 'Google is temporarily unavailable',
        message:
          'Google could not complete the authentication request right now. Please try again shortly.',
      };

    default:
      return {
        title: 'Google sign-in failed',
        message:
          'SaMi could not complete Google sign-in. Please try again or use your email and password.',
      };
  }
}

/* ============================================================
   PAGE
   ============================================================ */

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const googleStartedAtRef =
    useRef<number | null>(null);

  const googleRecoveryTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  const nextPath = useMemo(
    () =>
      safeNextPath(
        searchParams.get('next')
      ),
    [searchParams]
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] =
    useState('');

  const [rememberMe, setRememberMe] =
    useState(true);

  const [showPassword, setShowPassword] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [googleLoading, setGoogleLoading] =
    useState(false);

  const [darkMode, setDarkMode] =
    useState(false);

  const [errors, setErrors] =
    useState<LoginErrors>({});

  const [overlay, setOverlay] =
    useState<
      ReturnType<
        typeof getAuthOverlayMessage
      > | null
    >(null);

  /* ==========================================================
     THEME
     ========================================================== */

  useEffect(() => {
    try {
      const storedTheme =
        localStorage.getItem(
          THEME_STORAGE_KEY
        );

      const systemDark =
        window.matchMedia?.(
          '(prefers-color-scheme: dark)'
        ).matches ?? false;

      const useDark =
        storedTheme === 'dark' ||
        (!storedTheme && systemDark);

      setDarkMode(useDark);

      document.documentElement.classList.toggle(
        'dark',
        useDark
      );
    } catch {
      // Login remains usable if local storage
      // is unavailable.
    }
  }, []);

  function toggleTheme() {
    const next = !darkMode;

    setDarkMode(next);

    document.documentElement.classList.toggle(
      'dark',
      next
    );

    try {
      localStorage.setItem(
        THEME_STORAGE_KEY,
        next ? 'dark' : 'light'
      );
    } catch {
      // Ignore storage errors.
    }
  }

  /* ==========================================================
     URL STATUS / AUTH MESSAGES
     ========================================================== */

  useEffect(() => {
    const emailParam =
      searchParams.get('email');

    const verified =
      searchParams.get('verified');

    const reason =
      searchParams.get('reason');

    const googleError =
      searchParams.get('google_error') ||
      searchParams.get('error');

    if (emailParam) {
      setEmail(emailParam);
    }

    if (verified === '1') {
      setOverlay(
        getAuthOverlayMessage(
          'EMAIL_VERIFIED'
        )
      );
    } else if (
      reason === 'password_reset'
    ) {
      setOverlay(
        getAuthOverlayMessage(
          'PASSWORD_RESET_SUCCESS'
        )
      );
    } else if (
      reason === 'logged_out'
    ) {
      setOverlay(
        getAuthOverlayMessage(
          'LOGGED_OUT'
        )
      );
    } else if (
      reason === 'session_expired'
    ) {
      setOverlay(
        getAuthOverlayMessage(
          'SESSION_EXPIRED'
        )
      );
    } else if (googleError) {
      const error =
        googleErrorMessage(googleError);

      setOverlay(
        getAuthOverlayMessage(
          'LOGIN_ERROR',
          {
            fallback: `${error.title}. ${error.message}`,
          }
        )
      );
    }

    if (
      verified ||
      reason ||
      googleError
    ) {
      const url = new URL(
        window.location.href
      );

      url.searchParams.delete(
        'verified'
      );

      url.searchParams.delete(
        'reason'
      );

      url.searchParams.delete(
        'google_error'
      );

      url.searchParams.delete(
        'error'
      );

      url.searchParams.delete(
        'error_description'
      );

      window.history.replaceState(
        {},
        '',
        `${url.pathname}${url.search}${url.hash}`
      );
    }
  }, [searchParams]);

  /* ==========================================================
     GOOGLE OAUTH RECOVERY
     ========================================================== */

  const resetGoogleState =
    useCallback(() => {
      setGoogleLoading(false);

      googleStartedAtRef.current =
        null;

      if (
        googleRecoveryTimerRef.current
      ) {
        clearTimeout(
          googleRecoveryTimerRef.current
        );

        googleRecoveryTimerRef.current =
          null;
      }
    }, []);

  useEffect(() => {
    function recoverGoogleState() {
      if (
        !googleStartedAtRef.current
      ) {
        return;
      }

      const elapsed =
        Date.now() -
        googleStartedAtRef.current;

      if (elapsed > 1500) {
        resetGoogleState();
      }
    }

    function handlePageShow() {
      resetGoogleState();
    }

    function handleVisibility() {
      if (
        document.visibilityState ===
        'visible'
      ) {
        recoverGoogleState();
      }
    }

    window.addEventListener(
      'pageshow',
      handlePageShow
    );

    window.addEventListener(
      'focus',
      recoverGoogleState
    );

    document.addEventListener(
      'visibilitychange',
      handleVisibility
    );

    return () => {
      window.removeEventListener(
        'pageshow',
        handlePageShow
      );

      window.removeEventListener(
        'focus',
        recoverGoogleState
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      );

      if (
        googleRecoveryTimerRef.current
      ) {
        clearTimeout(
          googleRecoveryTimerRef.current
        );
      }
    };
  }, [resetGoogleState]);

  /* ==========================================================
     FIELD HANDLING
     ========================================================== */

  function updateEmail(value: string) {
    setEmail(value);

    if (errors.email) {
      setErrors((current) => ({
        ...current,
        email: undefined,
      }));
    }
  }

  function updatePassword(value: string) {
    setPassword(value);

    if (errors.password) {
      setErrors((current) => ({
        ...current,
        password: undefined,
      }));
    }
  }

  function validateForm() {
    const nextErrors: LoginErrors = {};

    const cleanEmail =
      email.trim().toLowerCase();

    if (!cleanEmail) {
      nextErrors.email =
        'Email address is required.';
    } else if (
      !isValidEmail(cleanEmail)
    ) {
      nextErrors.email =
        'Enter a valid email address.';
    }

    if (!password) {
      nextErrors.password =
        'Password is required.';
    }

    setErrors(nextErrors);

    return {
      valid:
        Object.keys(nextErrors)
          .length === 0,
      cleanEmail,
    };
  }

  /* ==========================================================
     EMAIL/PASSWORD LOGIN
     ========================================================== */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submitting ||
      googleLoading
    ) {
      return;
    }

    setOverlay(null);

    const validation =
      validateForm();

    if (!validation.valid) {
      if (errors.email) {
        setOverlay(
          getAuthOverlayMessage(
            'INVALID_EMAIL'
          )
        );
      }

      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            Accept:
              'application/json',
          },
          credentials: 'include',

          body: JSON.stringify({
            email:
              validation.cleanEmail,
            password,
            rememberMe,
          }),
        }
      );

      let data: LoginResponse;

      try {
        data =
          (await response.json()) as LoginResponse;
      } catch {
        data = {
          success: false,
          code: 'LOGIN_ERROR',
          error:
            'SaMi could not process the sign-in response.',
        };
      }

      /* ------------------------------------------------------
         2FA challenge
         ------------------------------------------------------ */

      if (
        data.code ===
          'TWO_FACTOR_REQUIRED' &&
        data.challengeToken
      ) {
        const destination =
          safeNextPath(nextPath);

        sessionStorage.setItem(
          TWO_FACTOR_EMAIL_KEY,
          data.email ||
            validation.cleanEmail
        );

        sessionStorage.setItem(
          TWO_FACTOR_CHALLENGE_KEY,
          data.challengeToken
        );

        sessionStorage.setItem(
          TWO_FACTOR_REMEMBER_KEY,
          String(rememberMe)
        );

        sessionStorage.setItem(
          TWO_FACTOR_NEXT_KEY,
          destination
        );

        const twoFactorPath =
          safeNextPath(
            data.next
          );

        const target =
          twoFactorPath ===
          '/dashboard'
            ? '/login/two-factor'
            : twoFactorPath;

        router.push(
          `${target}?next=${encodeURIComponent(
            destination
          )}`
        );

        return;
      }

      /* ------------------------------------------------------
         Login error
         ------------------------------------------------------ */

      if (
        !response.ok ||
        !data.success
      ) {
        setOverlay(
          getAuthOverlayMessage(
            data.code ||
              'LOGIN_ERROR',
            {
              fallback:
                data.error ||
                data.message ||
                'Sign in failed. Please try again.',

              retryAfterSeconds:
                data.retryAfterSeconds,

              lockedUntil:
                data.lockedUntil,

              email:
                validation.cleanEmail,
            }
          )
        );

        return;
      }

      /* ------------------------------------------------------
         Successful login
         ------------------------------------------------------ */

      const destination =
        safeNextPath(
          data.next || nextPath
        );

      router.replace(destination);
      router.refresh();
    } catch {
      setOverlay(
        getAuthOverlayMessage(
          'LOGIN_ERROR',
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
     GOOGLE LOGIN
     ========================================================== */

  function handleGoogle() {
    if (
      googleLoading ||
      submitting
    ) {
      return;
    }

    setOverlay(null);
    setGoogleLoading(true);

    googleStartedAtRef.current =
      Date.now();

    try {
      sessionStorage.setItem(
        AUTH_NEXT_KEY,
        nextPath
      );
    } catch {
      // OAuth can continue without session storage.
    }

    googleRecoveryTimerRef.current =
      setTimeout(() => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          resetGoogleState();

          setOverlay(
            getAuthOverlayMessage(
              'LOGIN_ERROR',
              {
                fallback:
                  'Google sign-in is taking longer than expected. Please try again or sign in with your email.',
              }
            )
          );
        }
      }, 15000);

    window.location.assign(
      '/api/auth/google'
    );
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      {overlay && (
        <SaMiOverlay
          open
          type={overlay.type}
          title={overlay.title}
          message={overlay.message}
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

      <main className="relative min-h-screen overflow-hidden bg-[#f7f9fc] text-slate-950 transition-colors dark:bg-[#070a10] dark:text-white">

        {/* ====================================================
            AMBIENT BACKGROUND
           ==================================================== */}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-blue-500/[0.07] blur-[100px] dark:bg-blue-500/[0.10]" />

          <div className="absolute -bottom-56 right-[-140px] h-[600px] w-[600px] rounded-full bg-indigo-500/[0.07] blur-[120px] dark:bg-indigo-500/[0.10]" />
        </div>

        {/* Theme */}

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={
            darkMode
              ? 'Switch to light theme'
              : 'Switch to dark theme'
          }
          className="fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white sm:right-6 sm:top-6"
        >
          {darkMode ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>

        <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px]">

          {/* ==================================================
              BRAND SIDE
             ================================================== */}

          <section className="relative hidden w-[47%] flex-col justify-between px-12 py-12 lg:flex xl:px-16">
            <div>
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
            </div>

            <div className="max-w-[540px] pb-8">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-blue-50/70 px-3 py-1.5 text-xs font-bold text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300">
                <Sparkles className="h-3.5 w-3.5" />

                AI-powered business workspace
              </div>

              <h1 className="text-[42px] font-black leading-[1.08] tracking-[-0.045em] text-slate-950 xl:text-[48px] dark:text-white">
                Your business.
                <br />
                One intelligent workspace.
              </h1>

              <p className="mt-5 max-w-[490px] text-[15px] leading-7 text-slate-500 dark:text-slate-400">
                Access your SaMi workspace,
                installed business apps and
                SaMi AI from one secure account.
              </p>

              <div className="mt-8 grid gap-3">
                <Feature
                  text="One secure account across your workspace"
                />

                <Feature
                  text="Business apps connected through one platform"
                />

                <Feature
                  text="SaMi AI available across your work"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4" />

              Secure SaMi workspace access
            </div>
          </section>

          {/* ==================================================
              LOGIN SIDE
             ================================================== */}

          <section className="flex min-h-screen min-w-0 flex-1 items-center justify-center px-4 py-20 sm:px-8 lg:px-12">
            <div className="w-full max-w-[500px]">

              {/* Mobile brand */}

              <div className="mb-9 lg:hidden">
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

              <div className="rounded-[30px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8 dark:border-slate-800 dark:bg-[#0d111a]/95 dark:shadow-[0_24px_80px_rgba(0,0,0,0.30)]">

                {/* Header */}

                <div>
                  <p className="text-[12px] font-black uppercase tracking-[0.17em] text-blue-600 dark:text-blue-400">
                    Sign in
                  </p>

                  <h2 className="mt-3 text-[30px] font-black tracking-[-0.035em] text-slate-950 dark:text-white">
                    Welcome back
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Sign in to continue to your
                    SaMi workspace.
                  </p>
                </div>

                {/* Google */}

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={
                    googleLoading ||
                    submitting
                  }
                  aria-busy={
                    googleLoading
                  }
                  className="mt-7 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.997] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900"
                >
                  {googleLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}

                  <span>
                    {googleLoading
                      ? 'Connecting to Google...'
                      : 'Continue with Google'}
                  </span>
                </button>

                {googleLoading && (
                  <button
                    type="button"
                    onClick={() => {
                      resetGoogleState();

                      setOverlay(
                        getAuthOverlayMessage(
                          'LOGIN_ERROR',
                          {
                            fallback:
                              'Google sign-in was stopped. You can try again or continue with email.',
                          }
                        )
                      );
                    }}
                    className="mt-2 w-full text-center text-[11px] font-medium text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    Having trouble? Cancel and
                    try again
                  </button>
                )}

                {/* Divider */}

                <div className="my-7 flex items-center gap-4">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />

                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    or continue with email
                  </span>

                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>

                {/* Form */}

                <form
                  onSubmit={handleSubmit}
                  noValidate
                  className="space-y-5"
                >
                  {/* Email */}

                  <div>
                    <label
                      htmlFor="email"
                      className="text-[13px] font-bold text-slate-700 dark:text-slate-200"
                    >
                      Email address
                    </label>

                    <div
                      className={`
                        mt-2 flex h-12 items-center
                        gap-3 rounded-xl border
                        bg-white px-4
                        transition
                        focus-within:ring-4
                        dark:bg-slate-950
                        ${
                          errors.email
                            ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/10 dark:border-red-500'
                            : 'border-slate-200 focus-within:border-blue-500 focus-within:ring-blue-500/10 dark:border-slate-700 dark:focus-within:border-blue-500'
                        }
                      `}
                    >
                      <Mail className="h-[18px] w-[18px] shrink-0 text-slate-400" />

                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={254}
                        value={email}
                        onChange={(event) =>
                          updateEmail(
                            event.target.value
                          )
                        }
                        aria-invalid={
                          Boolean(
                            errors.email
                          )
                        }
                        aria-describedby={
                          errors.email
                            ? 'login-email-error'
                            : undefined
                        }
                        placeholder="you@example.com"
                        className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400 dark:text-white"
                      />
                    </div>

                    {errors.email && (
                      <p
                        id="login-email-error"
                        role="alert"
                        className="mt-1.5 text-xs font-medium text-red-500"
                      >
                        {errors.email}
                      </p>
                    )}
                  </div>

                  {/* Password */}

                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <label
                        htmlFor="password"
                        className="text-[13px] font-bold text-slate-700 dark:text-slate-200"
                      >
                        Password
                      </label>

                      <Link
                        href="/forgot-password"
                        className="text-[12px] font-bold text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Forgot password?
                      </Link>
                    </div>

                    <div
                      className={`
                        mt-2 flex h-12 items-center
                        gap-3 rounded-xl border
                        bg-white px-4
                        transition
                        focus-within:ring-4
                        dark:bg-slate-950
                        ${
                          errors.password
                            ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/10 dark:border-red-500'
                            : 'border-slate-200 focus-within:border-blue-500 focus-within:ring-blue-500/10 dark:border-slate-700 dark:focus-within:border-blue-500'
                        }
                      `}
                    >
                      <LockKeyhole className="h-[18px] w-[18px] shrink-0 text-slate-400" />

                      <input
                        id="password"
                        name="password"
                        type={
                          showPassword
                            ? 'text'
                            : 'password'
                        }
                        autoComplete="current-password"
                        maxLength={128}
                        value={password}
                        onChange={(event) =>
                          updatePassword(
                            event.target.value
                          )
                        }
                        aria-invalid={
                          Boolean(
                            errors.password
                          )
                        }
                        aria-describedby={
                          errors.password
                            ? 'login-password-error'
                            : undefined
                        }
                        placeholder="Enter your password"
                        className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400 dark:text-white"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowPassword(
                            (current) =>
                              !current
                          )
                        }
                        aria-label={
                          showPassword
                            ? 'Hide password'
                            : 'Show password'
                        }
                        aria-pressed={
                          showPassword
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                      >
                        {showPassword ? (
                          <EyeOff className="h-[18px] w-[18px]" />
                        ) : (
                          <Eye className="h-[18px] w-[18px]" />
                        )}
                      </button>
                    </div>

                    {errors.password && (
                      <p
                        id="login-password-error"
                        role="alert"
                        className="mt-1.5 text-xs font-medium text-red-500"
                      >
                        {errors.password}
                      </p>
                    )}
                  </div>

                  {/* Remember */}

                  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-slate-700">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-slate-800 dark:text-slate-200">
                        Remember this device
                      </span>

                      <span className="mt-0.5 block text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                        Keep this browser signed in
                        for longer.
                      </span>
                    </span>

                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) =>
                        setRememberMe(
                          event.target.checked
                        )
                      }
                      className="mt-1 h-[18px] w-[18px] shrink-0 accent-blue-600"
                    />
                  </label>

                  {/* Submit */}

                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      googleLoading
                    }
                    aria-busy={submitting}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.997] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    {submitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ArrowRight className="h-5 w-5" />
                    )}

                    <span aria-live="polite">
                      {submitting
                        ? 'Signing in...'
                        : 'Sign in'}
                    </span>
                  </button>
                </form>

                {/* Create account */}

                <div className="mt-7 border-t border-slate-100 pt-6 text-center dark:border-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Don&apos;t have a SaMi
                    account?{' '}
                    <Link
                      href="/register"
                      className="font-bold text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Create account
                    </Link>
                  </p>
                </div>
              </div>

              {/* Bottom */}

              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />

                  Secure sign-in
                </span>

                <Link
                  href="/help"
                  className="inline-flex items-center gap-1.5 transition hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <HelpCircle className="h-3.5 w-3.5" />

                  Help
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

/* ============================================================
   SMALL COMPONENTS
   ============================================================ */

function Feature({
  text,
}: {
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
        <Check className="h-3.5 w-3.5" />
      </span>

      {text}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M21.35 12.27c0-.77-.07-1.52-.2-2.24H12v4.24h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.39Z"
      />

      <path
        fill="#34A853"
        d="M12 21.7c2.63 0 4.84-.87 6.45-2.34l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.7Z"
      />

      <path
        fill="#FBBC05"
        d="M6.54 13.8A5.86 5.86 0 0 1 6.23 12c0-.63.11-1.24.31-1.8V7.67H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.06 1.05 4.33l3.24-2.53Z"
      />

      <path
        fill="#EA4335"
        d="M12 6.17c1.43 0 2.72.49 3.74 1.46l2.8-2.8C16.83 3.28 14.62 2.3 12 2.3a9.74 9.74 0 0 0-8.7 5.37l3.24 2.53C7.31 7.89 9.46 6.17 12 6.17Z"
      />
    </svg>
  );
}

/* ============================================================
   SUSPENSE WRAPPER
   ============================================================ */

export default function LoginClient() {
  return (
    <Suspense
      fallback={
        <LoginLoadingScreen />
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginLoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-4 dark:bg-[#070a10]">
      <div className="w-full max-w-[500px]">
        <div className="mb-8">
          {/* FULL APPROVED LOGO */}
          <SaMiLogo
            size="lg"
            className="max-w-full"
          />
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="h-4 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />

          <div className="mt-4 h-9 w-52 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />

          <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-full bg-slate-100 dark:bg-slate-800/70" />

          <div className="mt-8 h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

          <div className="mt-8 h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

          <div className="mt-5 h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

          <div className="mt-6 h-12 w-full animate-pulse rounded-xl bg-slate-950/80 dark:bg-white/80" />
        </div>
      </div>
    </main>
  );
}