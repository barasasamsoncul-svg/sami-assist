'use client';

import Link from 'next/link';
import {
  useRouter,
  useSearchParams,
} from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import {
  type FormEvent,
  Suspense,
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

const THEME_STORAGE_KEY =
  'sami_theme';

const RESET_ENDPOINT =
  '/api/auth/reset-password';

/* ============================================================
   TYPES
   ============================================================ */

type ResponseData = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  next?: string;
};

type PasswordChecks = {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
};

/* ============================================================
   HELPERS
   ============================================================ */

function getPasswordChecks(
  password: string
): PasswordChecks {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

function validatePassword(
  password: string
) {
  const checks =
    getPasswordChecks(password);

  if (
    !checks.length ||
    !checks.uppercase ||
    !checks.lowercase ||
    !checks.number
  ) {
    return 'PASSWORD_WEAK';
  }

  return null;
}

function safeNextPath(
  value?: string | null
) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/login?reason=password_reset';
  }

  if (
    value.startsWith('/api/')
  ) {
    return '/login?reason=password_reset';
  }

  return value;
}

/* ============================================================
   RESET CONTENT
   ============================================================ */

function ResetPasswordContent() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const token =
    useMemo(
      () =>
        searchParams.get(
          'token'
        ) || '',
      [searchParams]
    );

  const email =
    useMemo(
      () =>
        searchParams.get(
          'email'
        ) || '',
      [searchParams]
    );

  const [
    newPassword,
    setNewPassword,
  ] = useState('');

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState('');

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    darkMode,
    setDarkMode,
  ] = useState(false);

  const [
    newPasswordError,
    setNewPasswordError,
  ] = useState<
    string | null
  >(null);

  const [
    confirmPasswordError,
    setConfirmPasswordError,
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
  >(
    token
      ? null
      : {
          type: 'warning',
          title:
            'Invalid reset link',
          message:
            'This password reset link is missing or invalid. Request a new password reset link to continue.',
          primaryAction: {
            label:
              'Request new link',
            href:
              '/forgot-password',
          },
        }
  );

  const passwordChecks =
    useMemo(
      () =>
        getPasswordChecks(
          newPassword
        ),
      [newPassword]
    );

  const passwordsMatch =
    Boolean(
      newPassword &&
        confirmPassword &&
        newPassword ===
          confirmPassword
    );

  const passwordValid =
    !validatePassword(
      newPassword
    );

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
      // Page remains usable if localStorage
      // is unavailable.
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
     FIELD HANDLING
     ========================================================== */

  function updateNewPassword(
    value: string
  ) {
    setNewPassword(
      value
    );

    if (newPasswordError) {
      setNewPasswordError(
        null
      );
    }

    if (
      confirmPassword &&
      confirmPassword !==
        value
    ) {
      setConfirmPasswordError(
        'Passwords do not match.'
      );
    } else {
      setConfirmPasswordError(
        null
      );
    }
  }

  function updateConfirmPassword(
    value: string
  ) {
    setConfirmPassword(
      value
    );

    if (
      value &&
      value !==
        newPassword
    ) {
      setConfirmPasswordError(
        'Passwords do not match.'
      );
    } else {
      setConfirmPasswordError(
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
      !token
    ) {
      return;
    }

    setOverlay(null);

    const passwordIssue =
      validatePassword(
        newPassword
      );

    if (passwordIssue) {
      setNewPasswordError(
        'Use at least 8 characters with uppercase, lowercase and a number.'
      );

      setOverlay(
        getAuthOverlayMessage(
          passwordIssue
        )
      );

      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setConfirmPasswordError(
        'Passwords do not match.'
      );

      setOverlay(
        getAuthOverlayMessage(
          'PASSWORDS_DO_NOT_MATCH'
        )
      );

      return;
    }

    setSubmitting(true);

    try {
      const response =
        await fetch(
          RESET_ENDPOINT,
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
                token,

                email,

                newPassword,

                confirmPassword,
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
            'RESET_PASSWORD_ERROR',

          error:
            'SaMi could not process the password reset response.',
        };
      }

      if (
        !response.ok ||
        !data.success
      ) {
        setOverlay(
          getAuthOverlayMessage(
            data.code ||
              'RESET_PASSWORD_ERROR',
            {
              fallback:
                data.error ||
                data.message ||
                'SaMi could not reset your password.',
            }
          )
        );

        return;
      }

      /*
       * Remove sensitive values
       * from client state immediately.
       */
      setNewPassword('');
      setConfirmPassword('');

      setOverlay(
        getAuthOverlayMessage(
          'PASSWORD_RESET_SUCCESS'
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
        900
      );
    } catch {
      setOverlay(
        getAuthOverlayMessage(
          'RESET_PASSWORD_ERROR',
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

          <div className="absolute -bottom-56 right-[-170px] h-[620px] w-[620px] rounded-full bg-indigo-500/[0.06] blur-[120px] dark:bg-indigo-500/[0.09]" />
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
                  Secure your
                  <br />
                  SaMi account.
                </h1>

                <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Create a new password
                  for your account. Once
                  changed, use the new
                  password the next time
                  you sign in.
                </p>

                <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <LockKeyhole className="h-4 w-4" />

                  Secure password recovery
                </div>
              </div>
            </section>

            {/* =================================================
                RESET CARD
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
                      Account recovery
                    </p>

                    <h2 className="mt-1 text-[27px] font-black tracking-[-0.035em]">
                      Create a new password
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Choose a strong password
                      for your SaMi account.
                    </p>
                  </div>
                </div>

                {/* Email */}

                {email && (
                  <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                    <p className="text-[9px] font-black uppercase tracking-[0.11em] text-slate-400">
                      Resetting password for
                    </p>

                    <p className="mt-1 truncate text-xs font-bold">
                      {email}
                    </p>
                  </div>
                )}

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

                  {/* New password */}

                  <PasswordField
                    id="new-password"
                    label="New password"
                    value={
                      newPassword
                    }
                    onChange={
                      updateNewPassword
                    }
                    show={
                      showPassword
                    }
                    toggle={() =>
                      setShowPassword(
                        (current) =>
                          !current
                      )
                    }
                    error={
                      newPasswordError
                    }
                  />

                  {/* Password requirements */}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <PasswordRule
                      valid={
                        passwordChecks.length
                      }
                      label="8+ characters"
                    />

                    <PasswordRule
                      valid={
                        passwordChecks.uppercase
                      }
                      label="Uppercase letter"
                    />

                    <PasswordRule
                      valid={
                        passwordChecks.lowercase
                      }
                      label="Lowercase letter"
                    />

                    <PasswordRule
                      valid={
                        passwordChecks.number
                      }
                      label="Number"
                    />
                  </div>

                  {/* Confirm */}

                  <div className="mt-5">
                    <PasswordField
                      id="confirm-password"
                      label="Confirm new password"
                      value={
                        confirmPassword
                      }
                      onChange={
                        updateConfirmPassword
                      }
                      show={
                        showConfirmPassword
                      }
                      toggle={() =>
                        setShowConfirmPassword(
                          (current) =>
                            !current
                        )
                      }
                      error={
                        confirmPasswordError
                      }
                    />
                  </div>

                  {/* Match status */}

                  {confirmPassword && (
                    <div
                      className={`mt-2 flex items-center gap-2 text-[10px] font-bold ${
                        passwordsMatch
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {passwordsMatch ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}

                      {passwordsMatch
                        ? 'Passwords match'
                        : 'Passwords must match'}
                    </div>
                  )}

                  {/* Security note */}

                  <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

                    <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                      After the reset,
                      sign in using this new
                      password. SaMi&apos;s
                      server controls reset
                      link validity and
                      security checks.
                    </p>
                  </div>

                  {/* Submit */}

                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      !token ||
                      !passwordValid ||
                      newPassword !==
                        confirmPassword
                    }
                    aria-busy={
                      submitting
                    }
                    className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-[0.997] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />

                        Resetting password...
                      </>
                    ) : (
                      <>
                        Reset password

                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </form>

                {/* =============================================
                    BACK
                   ============================================= */}

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
   PASSWORD FIELD
   ============================================================ */

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  toggle,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  show: boolean;
  toggle: () => void;
  error?: string | null;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[12px] font-bold text-slate-700 dark:text-slate-200"
      >
        {label}
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
            error
              ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/10 dark:border-red-500'
              : 'border-slate-200 focus-within:border-blue-500 focus-within:ring-blue-500/10 dark:border-slate-700 dark:focus-within:border-blue-500'
          }
        `}
      >
        <LockKeyhole className="h-[18px] w-[18px] shrink-0 text-slate-400" />

        <input
          id={id}
          type={
            show
              ? 'text'
              : 'password'
          }
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          maxLength={128}
          autoComplete="new-password"
          aria-invalid={
            Boolean(error)
          }
          placeholder="Enter password"
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />

        <button
          type="button"
          onClick={toggle}
          aria-label={
            show
              ? 'Hide password'
              : 'Show password'
          }
          aria-pressed={show}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          {show ? (
            <EyeOff className="h-[18px] w-[18px]" />
          ) : (
            <Eye className="h-[18px] w-[18px]" />
          )}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-1.5 text-xs font-medium text-red-500"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/* ============================================================
   PASSWORD RULE
   ============================================================ */

function PasswordRule({
  valid,
  label,
}: {
  valid: boolean;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[9px] font-bold transition ${
        valid
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'bg-slate-50 text-slate-400 dark:bg-slate-950 dark:text-slate-500'
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
          valid
            ? 'bg-emerald-500 text-white'
            : 'border border-slate-300 dark:border-slate-700'
        }`}
      >
        {valid && (
          <Check className="h-2.5 w-2.5" />
        )}
      </span>

      {label}
    </div>
  );
}

/* ============================================================
   EXPORT — BUILD SAFE FOR useSearchParams
   ============================================================ */

export default function ResetPasswordClient() {
  return (
    <Suspense
      fallback={
        <ResetPasswordLoading />
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

/* ============================================================
   LOADING SCREEN
   ============================================================ */

function ResetPasswordLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4 dark:bg-[#070a10]">
      <div className="w-full max-w-[520px]">

        {/* FULL APPROVED LOGO */}
        <SaMiLogo
          size="lg"
          className="mb-7 max-w-full"
        />

        <div className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <ShieldCheck className="h-6 w-6" />
          </div>

          <div className="mt-5 h-8 w-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />

          <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />

          <div className="mt-7 h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          </div>

          <div className="mt-5 h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

          <div className="mt-6 h-12 w-full animate-pulse rounded-xl bg-blue-600/70" />
        </div>
      </div>
    </main>
  );
}