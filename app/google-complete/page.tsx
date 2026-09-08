'use client';

import Link from 'next/link';
import {
  useRouter,
  useSearchParams,
} from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  Moon,
  Phone,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';

/* ============================================================
   CONSTANTS
   ============================================================ */

const ACCOUNT_STORAGE_KEY =
  'sami_account_form';

const THEME_STORAGE_KEY =
  'sami_theme';

const NEXT_ROUTE =
  '/select-apps';

/* ============================================================
   TYPES
   ============================================================ */

interface AccountForm {
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  phone: string;
  businessName: string;
}

type FieldErrors = Partial<
  Record<
    'businessName' | 'phone',
    string
  >
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

/* ============================================================
   HELPERS
   ============================================================ */

function safeText(
  value: string | null,
  maxLength = 160
) {
  if (!value) {
    return '';
  }

  return value
    .trim()
    .slice(0, maxLength);
}

function normalizeEmail(
  value: string
) {
  return value
    .trim()
    .toLowerCase()
    .slice(0, 254);
}

function validEmail(
  value: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

function normalizePhone(
  value: string
) {
  return value
    .replace(
      /[^\d+\s()-]/g,
      ''
    )
    .slice(0, 30);
}

function initials(
  firstName: string,
  lastName: string,
  email: string
) {
  const first =
    firstName
      .trim()
      .charAt(0);

  const last =
    lastName
      .trim()
      .charAt(0);

  const output =
    `${first}${last}`
      .trim()
      .toUpperCase();

  if (output) {
    return output;
  }

  return (
    email
      .trim()
      .charAt(0)
      .toUpperCase() ||
    'S'
  );
}

/* ============================================================
   CONTENT
   ============================================================ */

function GoogleCompleteContent() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const [
    darkMode,
    setDarkMode,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    ready,
    setReady,
  ] = useState(false);

  const [
    errors,
    setErrors,
  ] = useState<FieldErrors>(
    {}
  );

  const [
    overlay,
    setOverlay,
  ] = useState<OverlayState | null>(
    null
  );

  const [
    form,
    setForm,
  ] = useState<AccountForm>({
    email: '',
    firstName: '',
    lastName: '',
    avatarUrl: '',
    phone: '',
    businessName: '',
  });

  /* ==========================================================
     THEME
     ========================================================== */

  useEffect(() => {
    try {
      const savedTheme =
        localStorage.getItem(
          THEME_STORAGE_KEY
        );

      const systemDark =
        window.matchMedia?.(
          '(prefers-color-scheme: dark)'
        ).matches ?? false;

      const useDark =
        savedTheme === 'dark' ||
        (!savedTheme &&
          systemDark);

      setDarkMode(
        useDark
      );

      document.documentElement.classList.toggle(
        'dark',
        useDark
      );
    } catch {
      // Theme remains usable
      // without persistence.
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
            // Ignore storage failure.
          }

          return next;
        }
      );
    }, []);

  /* ==========================================================
     GOOGLE ACCOUNT DATA
     ========================================================== */

  useEffect(() => {
    const email =
      normalizeEmail(
        safeText(
          searchParams.get(
            'email'
          ),
          254
        )
      );

    const firstName =
      safeText(
        searchParams.get(
          'firstName'
        ),
        80
      );

    const lastName =
      safeText(
        searchParams.get(
          'lastName'
        ),
        80
      );

    const avatarUrl =
      safeText(
        searchParams.get(
          'avatar'
        ),
        500
      );

    if (
      !email ||
      !validEmail(email)
    ) {
      setOverlay({
        type: 'error',

        title:
          'Google registration unavailable',

        message:
          'SaMi could not retrieve a valid Google account. Start Google registration again.',

        primaryAction: {
          label:
            'Return to registration',

          href:
            '/register',
        },
      });

      setReady(true);

      return;
    }

    /*
     * Query parameters are only temporary
     * onboarding UI data.
     *
     * The server must still validate the
     * Google identity before creating the
     * account/workspace.
     */
    setForm({
      email,

      firstName,

      lastName,

      avatarUrl,

      phone: '',

      businessName: '',
    });

    setReady(true);
  }, [searchParams]);

  /* ==========================================================
     DERIVED
     ========================================================== */

  const displayName =
    useMemo(() => {
      const fullName =
        `${form.firstName} ${form.lastName}`
          .trim();

      return (
        fullName ||
        'Google account'
      );
    }, [
      form.firstName,
      form.lastName,
    ]);

  /* ==========================================================
     FIELDS
     ========================================================== */

  function updateBusinessName(
    value: string
  ) {
    setForm(
      (current) => ({
        ...current,

        businessName:
          value.slice(
            0,
            120
          ),
      })
    );

    if (
      errors.businessName
    ) {
      setErrors(
        (current) => ({
          ...current,

          businessName:
            undefined,
        })
      );
    }
  }

  function updatePhone(
    value: string
  ) {
    setForm(
      (current) => ({
        ...current,

        phone:
          normalizePhone(
            value
          ),
      })
    );

    if (errors.phone) {
      setErrors(
        (current) => ({
          ...current,

          phone:
            undefined,
        })
      );
    }
  }

  /* ==========================================================
     CONTINUE
     ========================================================== */

  function handleNext() {
    if (
      loading ||
      !ready
    ) {
      return;
    }

    const cleanEmail =
      normalizeEmail(
        form.email
      );

    const businessName =
      form.businessName
        .trim();

    const phone =
      form.phone
        .trim();

    if (
      !cleanEmail ||
      !validEmail(
        cleanEmail
      )
    ) {
      setOverlay({
        type: 'error',

        title:
          'Google account unavailable',

        message:
          'Your Google account information is missing or invalid. Restart Google registration to continue.',

        primaryAction: {
          label:
            'Restart registration',

          href:
            '/register',
        },
      });

      return;
    }

    if (!businessName) {
      setErrors({
        businessName:
          'Enter your business or workspace name.',
      });

      setOverlay({
        type: 'warning',

        title:
          'Business name required',

        message:
          'Enter the name you want to use for your SaMi workspace.',
      });

      return;
    }

    /*
     * Do not unnecessarily reject legitimate
     * one-character names here.
     */
    if (
      businessName.length >
      120
    ) {
      setErrors({
        businessName:
          'Business name is too long.',
      });

      return;
    }

    setLoading(true);

    try {
      /*
       * Temporary onboarding state only.
       *
       * This does NOT authenticate the user.
       * The registration API/server remains
       * authoritative for Google identity,
       * tenant creation, plan, apps and payment.
       */
      sessionStorage.setItem(
        ACCOUNT_STORAGE_KEY,
        JSON.stringify({
          firstName:
            form.firstName
              .trim(),

          lastName:
            form.lastName
              .trim(),

          email:
            cleanEmail,

          phone,

          businessName,

          avatarUrl:
            form.avatarUrl,

          googleAuth:
            true,

          authProvider:
            'google',
        })
      );

      router.push(
        NEXT_ROUTE
      );
    } catch {
      setLoading(false);

      setOverlay({
        type: 'error',

        title:
          'Could not continue',

        message:
          'SaMi could not save your onboarding information in this browser. Check browser storage settings and try again.',
      });
    }
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  if (!ready) {
    return (
      <GoogleCompleteLoading />
    );
  }

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

          <div className="absolute -bottom-56 right-[-160px] h-[620px] w-[620px] rounded-full bg-violet-500/[0.06] blur-[120px] dark:bg-violet-500/[0.09]" />
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

        <div className="relative mx-auto flex min-h-screen w-full max-w-[1120px] items-center justify-center px-4 py-6 sm:px-6">

          <div className="grid w-full max-w-[970px] items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">

            {/* =================================================
                LEFT
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

              <div className="mt-9 max-w-[390px]">

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-6 w-6" />
                </div>

                <h1 className="mt-5 text-[34px] font-black leading-[1.08] tracking-[-0.04em]">
                  Google connected.
                  <br />
                  Build your workspace.
                </h1>

                <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Your Google identity is
                  ready for onboarding.
                  Tell SaMi what to call
                  your business workspace,
                  then choose your apps and
                  plan.
                </p>

                <div className="mt-6 space-y-3">
                  <JourneyItem
                    number="1"
                    label="Account"
                    active
                  />

                  <JourneyItem
                    number="2"
                    label="Choose apps"
                  />

                  <JourneyItem
                    number="3"
                    label="Choose plan"
                  />
                </div>
              </div>
            </section>

            {/* =================================================
                CARD
               ================================================= */}

            <section className="w-full">

              {/* Mobile logo */}

              <div className="mb-6 lg:hidden">
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

                <div className="flex items-start justify-between gap-4">

                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />

                      Google connected
                    </div>

                    <h2 className="mt-2 text-[27px] font-black tracking-[-0.035em]">
                      Complete your workspace
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Add your business name
                      before choosing your
                      SaMi apps.
                    </p>
                  </div>

                  <span className="hidden rounded-full bg-blue-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 sm:inline-flex">
                    Step 1 of 3
                  </span>
                </div>

                {/* =============================================
                    GOOGLE ACCOUNT
                   ============================================= */}

                <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">

                  {form.avatarUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          form.avatarUrl
                        }
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    </>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-black text-white">
                      {initials(
                        form.firstName,
                        form.lastName,
                        form.email
                      )}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">
                      {displayName}
                    </p>

                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-slate-500 dark:text-slate-400">
                      <Mail className="h-3 w-3 shrink-0" />

                      <span className="truncate">
                        {form.email}
                      </span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 text-[9px] font-black text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" />

                    Google
                  </div>
                </div>

                {/* =============================================
                    FORM
                   ============================================= */}

                <div className="mt-6 space-y-5">

                  {/* Business name */}

                  <div>
                    <label
                      htmlFor="businessName"
                      className="text-[12px] font-bold text-slate-700 dark:text-slate-200"
                    >
                      Business name
                      <span className="ml-1 text-red-500">
                        *
                      </span>
                    </label>

                    <div
                      className={`mt-2 flex h-12 items-center gap-3 rounded-xl border bg-white px-4 transition focus-within:ring-4 dark:bg-slate-950 ${
                        errors.businessName
                          ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/10 dark:border-red-500'
                          : 'border-slate-200 focus-within:border-blue-500 focus-within:ring-blue-500/10 dark:border-slate-700 dark:focus-within:border-blue-500'
                      }`}
                    >
                      <Building2 className="h-[18px] w-[18px] shrink-0 text-slate-400" />

                      <input
                        id="businessName"
                        name="businessName"
                        type="text"
                        value={
                          form.businessName
                        }
                        onChange={(event) =>
                          updateBusinessName(
                            event.target.value
                          )
                        }
                        autoComplete="organization"
                        maxLength={120}
                        autoFocus
                        placeholder="Your business or workspace name"
                        aria-invalid={
                          Boolean(
                            errors.businessName
                          )
                        }
                        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                      />
                    </div>

                    {errors.businessName ? (
                      <p
                        role="alert"
                        className="mt-1.5 text-xs font-medium text-red-500"
                      >
                        {
                          errors.businessName
                        }
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[10px] text-slate-400">
                        This becomes the name
                        of your SaMi workspace.
                      </p>
                    )}
                  </div>

                  {/* Phone */}

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <label
                        htmlFor="phone"
                        className="text-[12px] font-bold text-slate-700 dark:text-slate-200"
                      >
                        Phone number
                      </label>

                      <span className="text-[9px] font-medium text-slate-400">
                        Optional
                      </span>
                    </div>

                    <div
                      className={`mt-2 flex h-12 items-center gap-3 rounded-xl border bg-white px-4 transition focus-within:ring-4 dark:bg-slate-950 ${
                        errors.phone
                          ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/10'
                          : 'border-slate-200 focus-within:border-blue-500 focus-within:ring-blue-500/10 dark:border-slate-700 dark:focus-within:border-blue-500'
                      }`}
                    >
                      <Phone className="h-[18px] w-[18px] shrink-0 text-slate-400" />

                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={
                          form.phone
                        }
                        onChange={(event) =>
                          updatePhone(
                            event.target.value
                          )
                        }
                        autoComplete="tel"
                        inputMode="tel"
                        maxLength={30}
                        placeholder="+254 700 000 000"
                        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* ===========================================
                      SECURITY NOTE
                     =========================================== */}

                  <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

                    <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                      Google information shown
                      here is onboarding data.
                      SaMi&apos;s server still
                      validates your Google
                      identity and workspace
                      creation before activation.
                    </p>
                  </div>

                  {/* ===========================================
                      NEXT
                     =========================================== */}

                  <button
                    type="button"
                    onClick={
                      handleNext
                    }
                    disabled={
                      loading ||
                      !form.email
                    }
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-[0.997] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />

                        Continuing...
                      </>
                    ) : (
                      <>
                        Continue to Apps

                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>

                {/* =============================================
                    BACK
                   ============================================= */}

                <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />

                    Back to registration
                  </Link>
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
                  href="/terms"
                  className="transition hover:text-slate-700 dark:hover:text-white"
                >
                  Terms
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

/* ============================================================
   JOURNEY ITEM
   ============================================================ */

function JourneyItem({
  number,
  label,
  active = false,
}: {
  number: string;
  label: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black ${
          active
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
            : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
        }`}
      >
        {number}
      </span>

      <span
        className={`text-xs font-bold ${
          active
            ? 'text-slate-950 dark:text-white'
            : 'text-slate-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/* ============================================================
   EXPORT
   ============================================================ */

export default function GoogleCompletePage() {
  return (
    <Suspense
      fallback={
        <GoogleCompleteLoading />
      }
    >
      <GoogleCompleteContent />
    </Suspense>
  );
}

/* ============================================================
   LOADING
   ============================================================ */

function GoogleCompleteLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4 dark:bg-[#070a10]">
      <div className="w-full max-w-[520px]">

        {/* FULL APPROVED LOGO */}
        <SaMiLogo
          size="lg"
          className="mb-7 max-w-full"
        />

        <div className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <UserRound className="h-6 w-6" />
          </div>

          <div className="mt-5 h-8 w-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />

          <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />

          <div className="mt-6 h-16 w-full animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />

          <div className="mt-5 h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

          <div className="mt-5 h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

          <div className="mt-6 h-12 w-full animate-pulse rounded-xl bg-blue-600/70" />
        </div>
      </div>
    </main>
  );
}