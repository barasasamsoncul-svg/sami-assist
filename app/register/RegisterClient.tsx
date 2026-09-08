'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Check,
  CircleHelp,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Moon,
  Phone,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
  type LucideIcon,
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

/* ============================================================
   TYPES
   ============================================================ */

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  businessName: string;
  password: string;
};

type FieldErrors = Partial<
  Record<keyof FormState, string>
>;

type OverlayState = {
  type:
    | 'error'
    | 'warning'
    | 'success'
    | 'info';

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

type CheckEmailResponse = {
  exists?: boolean;
  success?: boolean;
  code?: string;
  message?: string;
  error?: string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const REGISTRATION_STORAGE_KEY =
  'sami_account_form';

const THEME_STORAGE_KEY =
  'sami_theme';

const GOOGLE_INTENT_STORAGE_KEY =
  'sami_google_intent';

/* ============================================================
   VALIDATION
   ============================================================ */

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value.trim()
  );
}

function normalizePhone(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ');
}

function validatePhone(value: string) {
  const clean = value.trim();

  if (!clean) {
    return true;
  }

  return /^[+0-9()\-\s]{7,30}$/.test(
    clean
  );
}

function validateField(
  field: keyof FormState,
  value: string
): string | undefined {
  const clean = value.trim();

  switch (field) {
    case 'firstName':
      if (!clean) {
        return 'First name is required.';
      }

      if (clean.length < 2) {
        return 'Enter your first name.';
      }

      if (clean.length > 80) {
        return 'First name is too long.';
      }

      return undefined;

    case 'lastName':
      if (!clean) {
        return 'Last name is required.';
      }

      if (clean.length < 2) {
        return 'Enter your last name.';
      }

      if (clean.length > 80) {
        return 'Last name is too long.';
      }

      return undefined;

    case 'email':
      if (!clean) {
        return 'Email address is required.';
      }

      if (!validEmail(clean)) {
        return 'Enter a valid email address.';
      }

      if (clean.length > 254) {
        return 'Email address is too long.';
      }

      return undefined;

    case 'phone':
      if (
        clean &&
        !validatePhone(clean)
      ) {
        return 'Enter a valid phone number.';
      }

      return undefined;

    case 'businessName':
      if (!clean) {
        return 'Business name is required.';
      }

      if (clean.length < 2) {
        return 'Enter your business name.';
      }

      if (clean.length > 120) {
        return 'Business name is too long.';
      }

      return undefined;

    case 'password':
      if (!value) {
        return 'Password is required.';
      }

      if (value.length < 8) {
        return 'Password must contain at least 8 characters.';
      }

      if (value.length > 128) {
        return 'Password is too long.';
      }

      return undefined;

    default:
      return undefined;
  }
}

/* ============================================================
   PASSWORD QUALITY
   ============================================================ */

function getPasswordStrength(
  password: string
) {
  if (!password) {
    return {
      score: 0,
      label: 'Not entered',
    };
  }

  let score = 0;

  if (password.length >= 8) {
    score += 1;
  }

  if (password.length >= 12) {
    score += 1;
  }

  if (
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password)
  ) {
    score += 1;
  }

  if (/[0-9]/.test(password)) {
    score += 1;
  }

  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  }

  if (score <= 1) {
    return {
      score,
      label: 'Weak',
    };
  }

  if (score <= 3) {
    return {
      score,
      label: 'Good',
    };
  }

  return {
    score,
    label: 'Strong',
  };
}

/* ============================================================
   GOOGLE ERROR MESSAGE
   ============================================================ */

function googleErrorMessage(
  code: string
): OverlayState {
  switch (code) {
    case 'cancelled':
    case 'access_denied':
      return {
        type: 'warning',
        title: 'Google sign-up cancelled',
        message:
          'Google sign-up was cancelled. You can try again or continue with email.',
      };

    case 'google_config':
      return {
        type: 'error',
        title: 'Google sign-up unavailable',
        message:
          'Google sign-up is temporarily unavailable. You can continue creating your account with email.',
      };

    case 'google_token':
      return {
        type: 'error',
        title:
          'Google sign-up could not be completed',
        message:
          'SaMi could not complete the secure connection with Google. Please try again.',
      };

    case 'google_email':
      return {
        type: 'error',
        title:
          'Google account information unavailable',
        message:
          'SaMi could not retrieve the email information required to create your account.',
      };

    case 'google_identity':
      return {
        type: 'error',
        title:
          'Google identity could not be verified',
        message:
          'SaMi could not securely verify your Google identity. Please try again.',
      };

    case 'google_unverified':
      return {
        type: 'warning',
        title:
          'Google email is not verified',
        message:
          'Your Google email must be verified before it can be used to create a SaMi account.',
      };

    case 'google_account_deleted':
      return {
        type: 'warning',
        title: 'Account unavailable',
        message:
          'A previously deleted SaMi account is associated with this Google email. Use account recovery or contact support.',
        primaryAction: {
          label: 'Get help',
          href: '/help',
        },
      };

    case 'account_exists':
    case 'google_account_exists':
      return {
        type: 'warning',
        title: 'Account already exists',
        message:
          'A SaMi account already exists for this Google email. Sign in instead.',
        primaryAction: {
          label: 'Sign in',
          href: '/login',
        },
      };

    case 'google_server_error':
    case 'google_unavailable':
      return {
        type: 'error',
        title:
          'Google is temporarily unavailable',
        message:
          'Google could not complete the authentication request right now. Please try again shortly.',
      };

    default:
      return {
        type: 'error',
        title: 'Google sign-up failed',
        message:
          'SaMi could not complete Google registration. Please try again or continue with email.',
      };
  }
}

/* ============================================================
   REGISTER
   ============================================================ */

function RegisterContent() {
  const router = useRouter();

  const searchParams =
    useSearchParams();

  const googleStartedAtRef =
    useRef<number | null>(null);

  const googleRecoveryTimerRef =
    useRef<
      ReturnType<typeof setTimeout> | null
    >(null);

  const [form, setForm] =
    useState<FormState>({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      businessName: '',
      password: '',
    });

  const [errors, setErrors] =
    useState<FieldErrors>({});

  const [touched, setTouched] =
    useState<
      Partial<
        Record<
          keyof FormState,
          boolean
        >
      >
    >({});

  const [showPassword, setShowPassword] =
    useState(false);

  const [checking, setChecking] =
    useState(false);

  const [googleLoading, setGoogleLoading] =
    useState(false);

  const [darkMode, setDarkMode] =
    useState(false);

  const [overlay, setOverlay] =
    useState<OverlayState | null>(
      null
    );

  const passwordStrength =
    useMemo(
      () =>
        getPasswordStrength(
          form.password
        ),
      [form.password]
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

      const systemDark =
        window.matchMedia?.(
          '(prefers-color-scheme: dark)'
        ).matches ?? false;

      const useDark =
        stored === 'dark' ||
        (!stored && systemDark);

      setDarkMode(useDark);

      document.documentElement.classList.toggle(
        'dark',
        useDark
      );
    } catch {
      // Registration remains usable without
      // localStorage access.
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
        next
          ? 'dark'
          : 'light'
      );
    } catch {
      // Ignore storage failure.
    }
  }

  /* ==========================================================
     RESTORE REGISTRATION
     ========================================================== */

  useEffect(() => {
    try {
      const stored =
        sessionStorage.getItem(
          REGISTRATION_STORAGE_KEY
        );

      if (!stored) {
        return;
      }

      const parsed =
        JSON.parse(stored) as Partial<
          FormState
        >;

      setForm((current) => ({
        ...current,

        firstName:
          typeof parsed.firstName ===
          'string'
            ? parsed.firstName
            : current.firstName,

        lastName:
          typeof parsed.lastName ===
          'string'
            ? parsed.lastName
            : current.lastName,

        email:
          typeof parsed.email ===
          'string'
            ? parsed.email
            : current.email,

        phone:
          typeof parsed.phone ===
          'string'
            ? parsed.phone
            : current.phone,

        businessName:
          typeof parsed.businessName ===
          'string'
            ? parsed.businessName
            : current.businessName,

        password:
          typeof parsed.password ===
          'string'
            ? parsed.password
            : current.password,
      }));
    } catch {
      // Invalid stored registration data should
      // never prevent account creation.
    }
  }, []);

  /* ==========================================================
     URL / GOOGLE ERRORS
     ========================================================== */

  useEffect(() => {
    const emailParam =
      searchParams.get('email');

    const googleError =
      searchParams.get(
        'google_error'
      ) ||
      searchParams.get('error');

    if (emailParam) {
      setForm((current) => ({
        ...current,
        email: emailParam,
      }));
    }

    if (!googleError) {
      return;
    }

    setGoogleLoading(false);

    setOverlay(
      googleErrorMessage(
        googleError
      )
    );

    const clean = new URL(
      window.location.href
    );

    clean.searchParams.delete(
      'google_error'
    );

    clean.searchParams.delete(
      'error'
    );

    clean.searchParams.delete(
      'error_description'
    );

    window.history.replaceState(
      {},
      '',
      `${clean.pathname}${clean.search}${clean.hash}`
    );
  }, [searchParams]);

  /* ==========================================================
     GOOGLE RECOVERY
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
    function recover() {
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
        recover();
      }
    }

    window.addEventListener(
      'pageshow',
      handlePageShow
    );

    window.addEventListener(
      'focus',
      recover
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
        recover
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
     FORM
     ========================================================== */

  function update<
    K extends keyof FormState
  >(
    key: K,
    value: FormState[K]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    if (
      touched[key] ||
      errors[key]
    ) {
      setErrors((current) => ({
        ...current,
        [key]:
          validateField(
            key,
            value
          ),
      }));
    }
  }

  function blurField(
    key: keyof FormState
  ) {
    setTouched((current) => ({
      ...current,
      [key]: true,
    }));

    setErrors((current) => ({
      ...current,
      [key]: validateField(
        key,
        form[key]
      ),
    }));
  }

  function validateForm() {
    const nextErrors: FieldErrors =
      {};

    (
      Object.keys(
        form
      ) as Array<keyof FormState>
    ).forEach((key) => {
      const error =
        validateField(
          key,
          form[key]
        );

      if (error) {
        nextErrors[key] =
          error;
      }
    });

    setErrors(nextErrors);

    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      businessName: true,
      password: true,
    });

    return (
      Object.keys(nextErrors)
        .length === 0
    );
  }

  /* ==========================================================
     CONTINUE REGISTRATION
     ========================================================== */

  async function handleNext(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      checking ||
      googleLoading
    ) {
      return;
    }

    setOverlay(null);

    if (!validateForm()) {
      setOverlay({
        type: 'warning',
        title:
          'Check your information',
        message:
          'Some account details need your attention before you can continue.',
      });

      return;
    }

    const email =
      form.email
        .trim()
        .toLowerCase();

    setChecking(true);

    try {
      const response =
        await fetch(
          `/api/auth/check-email?email=${encodeURIComponent(
            email
          )}`,
          {
            method: 'GET',
            headers: {
              Accept:
                'application/json',
            },
            cache: 'no-store',
            credentials:
              'same-origin',
          }
        );

      let data: CheckEmailResponse;

      try {
        data =
          (await response.json()) as CheckEmailResponse;
      } catch {
        data = {
          success: false,
          error:
            'SaMi could not process the email verification response.',
        };
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            'SaMi could not verify this email address.'
        );
      }

      if (data.exists) {
        setOverlay({
          type: 'warning',
          title:
            'Account already exists',
          message:
            'This email is already registered with SaMi. Sign in instead.',
          primaryAction: {
            label: 'Sign in',
            href: `/login?email=${encodeURIComponent(
              email
            )}`,
          },
          secondaryAction: {
            label:
              'Use another email',
            onClick: () => {
              setOverlay(null);

              setForm(
                (current) => ({
                  ...current,
                  email: '',
                })
              );

              setTouched(
                (current) => ({
                  ...current,
                  email: false,
                })
              );

              setErrors(
                (current) => ({
                  ...current,
                  email: undefined,
                })
              );
            },
          },
        });

        return;
      }

      const registrationData = {
        firstName:
          form.firstName.trim(),

        lastName:
          form.lastName.trim(),

        email,

        phone:
          normalizePhone(
            form.phone
          ),

        businessName:
          form.businessName.trim(),

        password:
          form.password,

        authProvider:
          'email',

        googleAuth:
          false,
      };

      sessionStorage.setItem(
        REGISTRATION_STORAGE_KEY,
        JSON.stringify(
          registrationData
        )
      );

      router.push('/select-apps');
    } catch (error) {
      setOverlay({
        type: 'error',
        title:
          'Could not continue',
        message:
          error instanceof Error
            ? error.message
            : 'SaMi could not verify your email right now. Please try again.',
      });
    } finally {
      setChecking(false);
    }
  }

  /* ==========================================================
     GOOGLE
     ========================================================== */

  function handleGoogle() {
    if (
      checking ||
      googleLoading
    ) {
      return;
    }

    setOverlay(null);
    setGoogleLoading(true);

    googleStartedAtRef.current =
      Date.now();

    try {
      sessionStorage.setItem(
        GOOGLE_INTENT_STORAGE_KEY,
        'register'
      );
    } catch {
      // OAuth still works when storage is unavailable.
    }

    googleRecoveryTimerRef.current =
      setTimeout(() => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          resetGoogleState();

          setOverlay({
            type: 'error',
            title:
              'Google sign-up is taking too long',
            message:
              'SaMi could not connect to Google. Please try again or continue creating your account with email.',
          });
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

      <main className="relative min-h-screen overflow-hidden bg-[#f7f9fc] text-slate-950 transition-colors dark:bg-[#070a10] dark:text-white">

        {/* Background */}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -left-48 -top-48 h-[600px] w-[600px] rounded-full bg-blue-500/[0.07] blur-[110px] dark:bg-blue-500/[0.10]" />

          <div className="absolute -bottom-52 right-[-150px] h-[620px] w-[620px] rounded-full bg-indigo-500/[0.07] blur-[120px] dark:bg-indigo-500/[0.10]" />
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

        <div className="relative mx-auto flex min-h-screen w-full max-w-[1550px]">

          {/* ==================================================
              BRAND / EXPLANATION
             ================================================== */}

          <section className="relative hidden w-[43%] flex-col justify-between px-12 py-12 lg:flex xl:px-16">

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

            <div className="max-w-[520px] pb-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                Your SaMi workspace
              </p>

              <h1 className="mt-4 text-[40px] font-black leading-[1.08] tracking-[-0.045em] xl:text-[47px]">
                Start with what
                <br />
                your business needs.
              </h1>

              <p className="mt-5 max-w-[480px] text-[15px] leading-7 text-slate-500 dark:text-slate-400">
                Create one secure SaMi
                account, choose your
                business apps, select a
                plan and launch your
                workspace.
              </p>

              <div className="mt-8 space-y-4">
                <JourneyItem
                  active
                  number="1"
                  title="Create account"
                  description="Set up your secure SaMi identity."
                />

                <JourneyItem
                  number="2"
                  title="Choose apps"
                  description="Select the tools your business needs."
                />

                <JourneyItem
                  number="3"
                  title="Choose plan"
                  description="Confirm your workspace plan."
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4" />

              Secure account creation
            </div>
          </section>

          {/* ==================================================
              FORM AREA
             ================================================== */}

          <section className="flex min-h-screen min-w-0 flex-1 items-center justify-center px-4 py-20 sm:px-8 lg:px-12">
            <div className="w-full max-w-[650px]">

              {/* Mobile logo */}

              <div className="mb-8 lg:hidden">
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

              {/* Mobile progress */}

              <div className="mb-5 flex items-center gap-2 lg:hidden">
                <StepChip
                  active
                  number="1"
                  label="Account"
                />

                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />

                <StepChip
                  number="2"
                  label="Apps"
                />

                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />

                <StepChip
                  number="3"
                  label="Plan"
                />
              </div>

              <div className="rounded-[30px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8 dark:border-slate-800 dark:bg-[#0d111a]/95 dark:shadow-[0_24px_80px_rgba(0,0,0,0.30)]">

                {/* Heading */}

                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.17em] text-blue-600 dark:text-blue-400">
                    Step 1 of 3
                  </p>

                  <h2 className="mt-3 text-[30px] font-black tracking-[-0.035em]">
                    Create your account
                  </h2>

                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Set up your SaMi
                    identity and workspace.
                    You&apos;ll choose your
                    business apps next.
                  </p>
                </div>

                {/* Google */}

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={
                    checking ||
                    googleLoading
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

                  {googleLoading
                    ? 'Connecting to Google...'
                    : 'Continue with Google'}
                </button>

                {googleLoading && (
                  <button
                    type="button"
                    onClick={() => {
                      resetGoogleState();

                      setOverlay({
                        type: 'info',
                        title:
                          'Google sign-up stopped',
                        message:
                          'The Google sign-up attempt was stopped. You can try again or continue with email.',
                      });
                    }}
                    className="mt-2 w-full text-center text-[11px] font-medium text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    Having trouble? Cancel
                    and try again
                  </button>
                )}

                {/* Divider */}

                <div className="my-7 flex items-center gap-4">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />

                  <span className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-400">
                    or use email
                  </span>

                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>

                {/* Form */}

                <form
                  onSubmit={handleNext}
                  noValidate
                >
                  <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">

                    <Field
                      id="firstName"
                      icon={User}
                      label="First name"
                      value={
                        form.firstName
                      }
                      onChange={(value) =>
                        update(
                          'firstName',
                          value
                        )
                      }
                      onBlur={() =>
                        blurField(
                          'firstName'
                        )
                      }
                      autoComplete="given-name"
                      placeholder="John"
                      error={
                        errors.firstName
                      }
                      maxLength={80}
                    />

                    <Field
                      id="lastName"
                      icon={User}
                      label="Last name"
                      value={
                        form.lastName
                      }
                      onChange={(value) =>
                        update(
                          'lastName',
                          value
                        )
                      }
                      onBlur={() =>
                        blurField(
                          'lastName'
                        )
                      }
                      autoComplete="family-name"
                      placeholder="Doe"
                      error={
                        errors.lastName
                      }
                      maxLength={80}
                    />

                    <Field
                      id="email"
                      icon={Mail}
                      label="Email address"
                      type="email"
                      value={form.email}
                      onChange={(value) =>
                        update(
                          'email',
                          value
                        )
                      }
                      onBlur={() =>
                        blurField(
                          'email'
                        )
                      }
                      autoComplete="email"
                      placeholder="you@company.com"
                      error={
                        errors.email
                      }
                      maxLength={254}
                      className="sm:col-span-2"
                    />

                    <Field
                      id="phone"
                      icon={Phone}
                      label="Phone"
                      optional
                      type="tel"
                      value={form.phone}
                      onChange={(value) =>
                        update(
                          'phone',
                          value
                        )
                      }
                      onBlur={() =>
                        blurField(
                          'phone'
                        )
                      }
                      autoComplete="tel"
                      placeholder="+254 700 000 000"
                      error={
                        errors.phone
                      }
                      maxLength={30}
                    />

                    <Field
                      id="businessName"
                      icon={Building2}
                      label="Business name"
                      value={
                        form.businessName
                      }
                      onChange={(value) =>
                        update(
                          'businessName',
                          value
                        )
                      }
                      onBlur={() =>
                        blurField(
                          'businessName'
                        )
                      }
                      autoComplete="organization"
                      placeholder="Acme Ltd"
                      error={
                        errors.businessName
                      }
                      maxLength={120}
                    />

                    {/* Password */}

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="register-password"
                        className="text-[13px] font-bold text-slate-700 dark:text-slate-200"
                      >
                        Password
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
                            errors.password
                              ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/10 dark:border-red-500'
                              : 'border-slate-200 focus-within:border-blue-500 focus-within:ring-blue-500/10 dark:border-slate-700 dark:focus-within:border-blue-500'
                          }
                        `}
                      >
                        <ShieldCheck className="h-[18px] w-[18px] shrink-0 text-slate-400" />

                        <input
                          id="register-password"
                          name="password"
                          type={
                            showPassword
                              ? 'text'
                              : 'password'
                          }
                          autoComplete="new-password"
                          value={
                            form.password
                          }
                          onChange={(event) =>
                            update(
                              'password',
                              event.target
                                .value
                            )
                          }
                          onBlur={() =>
                            blurField(
                              'password'
                            )
                          }
                          maxLength={128}
                          placeholder="At least 8 characters"
                          aria-invalid={
                            Boolean(
                              errors.password
                            )
                          }
                          aria-describedby={
                            errors.password
                              ? 'register-password-error'
                              : 'register-password-help'
                          }
                          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
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

                      {errors.password ? (
                        <p
                          id="register-password-error"
                          role="alert"
                          className="mt-1.5 text-xs font-medium text-red-500"
                        >
                          {
                            errors.password
                          }
                        </p>
                      ) : (
                        <div
                          id="register-password-help"
                          className="mt-2 flex items-center justify-between gap-4"
                        >
                          <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                            Minimum 8
                            characters. Longer,
                            mixed passwords are
                            safer.
                          </p>

                          {form.password && (
                            <span
                              className={`shrink-0 text-[11px] font-bold ${
                                passwordStrength.label ===
                                'Strong'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : passwordStrength.label ===
                                      'Good'
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {
                                passwordStrength.label
                              }
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Legal */}

                  <p className="mt-6 text-[11px] leading-5 text-slate-400">
                    By continuing, you
                    agree to SaMi&apos;s{' '}
                    <Link
                      href="/terms"
                      className="font-semibold text-slate-600 underline-offset-2 hover:underline dark:text-slate-300"
                    >
                      Terms
                    </Link>{' '}
                    and acknowledge our{' '}
                    <Link
                      href="/privacy"
                      className="font-semibold text-slate-600 underline-offset-2 hover:underline dark:text-slate-300"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </p>

                  {/* Continue */}

                  <button
                    type="submit"
                    disabled={
                      checking ||
                      googleLoading
                    }
                    aria-busy={checking}
                    className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.997] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    {checking ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ArrowRight className="h-5 w-5" />
                    )}

                    <span aria-live="polite">
                      {checking
                        ? 'Checking account...'
                        : 'Continue to apps'}
                    </span>
                  </button>
                </form>

                {/* Login */}

                <div className="mt-7 border-t border-slate-100 pt-6 text-center dark:border-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Already have a SaMi
                    account?{' '}
                    <Link
                      href="/login"
                      className="font-bold text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Sign in
                    </Link>
                  </p>
                </div>
              </div>

              {/* Footer */}

              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Secure registration
                </span>

                <Link
                  href="/help"
                  className="inline-flex items-center gap-1.5 transition hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                  Help
                </Link>

                <Link
                  href="/terms"
                  className="transition hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Terms
                </Link>

                <Link
                  href="/privacy"
                  className="transition hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Privacy
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
   INPUT
   ============================================================ */

function Field({
  id,
  icon: Icon,
  label,
  optional = false,
  value,
  onChange,
  onBlur,
  type = 'text',
  autoComplete,
  placeholder,
  error,
  maxLength,
  className = '',
}: {
  id: string;
  icon: LucideIcon;
  label: string;
  optional?: boolean;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  error?: string;
  maxLength?: number;
  className?: string;
}) {
  const errorId =
    `${id}-error`;

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[13px] font-bold text-slate-700 dark:text-slate-200"
      >
        {label}

        {optional && (
          <span className="text-[10px] font-medium text-slate-400">
            optional
          </span>
        )}
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
        <Icon className="h-[18px] w-[18px] shrink-0 text-slate-400" />

        <input
          id={id}
          name={id}
          type={type}
          autoComplete={
            autoComplete
          }
          autoCapitalize={
            type === 'email'
              ? 'none'
              : undefined
          }
          spellCheck={
            type === 'email'
              ? false
              : undefined
          }
          maxLength={maxLength}
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          onBlur={onBlur}
          placeholder={placeholder}
          aria-invalid={
            Boolean(error)
          }
          aria-describedby={
            error
              ? errorId
              : undefined
          }
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400 dark:text-white"
        />
      </div>

      {error && (
        <p
          id={errorId}
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
   REGISTRATION JOURNEY
   ============================================================ */

function JourneyItem({
  number,
  title,
  description,
  active = false,
}: {
  number: string;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        className={`
          flex h-9 w-9 shrink-0
          items-center justify-center
          rounded-full
          text-xs font-black
          ${
            active
              ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
              : 'border border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900'
          }
        `}
      >
        {active ? (
          <Check className="h-4 w-4" />
        ) : (
          number
        )}
      </div>

      <div>
        <p
          className={`text-sm font-bold ${
            active
              ? 'text-slate-950 dark:text-white'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          {title}
        </p>

        <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
    </div>
  );
}

function StepChip({
  number,
  label,
  active = false,
}: {
  number: string;
  label: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
          active
            ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
            : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}
      >
        {number}
      </span>

      <span
        className={`hidden text-[10px] font-bold sm:inline ${
          active
            ? 'text-slate-900 dark:text-white'
            : 'text-slate-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/* ============================================================
   GOOGLE
   ============================================================ */

function GoogleIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
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
   SUSPENSE
   ============================================================ */

export default function RegisterClient() {
  return (
    <Suspense
      fallback={
        <RegisterLoadingScreen />
      }
    >
      <RegisterContent />
    </Suspense>
  );
}

function RegisterLoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-4 dark:bg-[#070a10]">
      <div className="w-full max-w-[650px]">
        {/* FULL APPROVED LOGO */}
        <SaMiLogo
          size="lg"
          className="mb-8 max-w-full"
        />

        <div className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />

          <div className="mt-4 h-9 w-60 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />

          <div className="mt-8 h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

            <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

            <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800 sm:col-span-2" />

            <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

            <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          </div>

          <div className="mt-6 h-12 w-full animate-pulse rounded-xl bg-slate-950/80 dark:bg-white/80" />
        </div>
      </div>
    </main>
  );
}