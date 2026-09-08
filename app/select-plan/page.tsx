'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Crown,
  CreditCard,
  Loader2,
  LockKeyhole,
  Moon,
  Package,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { SAMI_APPS } from '@/lib/sami-apps';

/* ============================================================
   CONSTANTS
   ============================================================ */

const ACCOUNT_STORAGE_KEY =
  'sami_account_form';

const APPS_STORAGE_KEY =
  'sami_selected_apps';

const PLAN_STORAGE_KEY =
  'sami_selected_plan';

const VERIFICATION_EMAIL_STORAGE_KEY =
  'sami_verification_email';

const THEME_STORAGE_KEY =
  'sami_theme';

const REGISTER_ENDPOINT =
  '/api/auth/register';

const VERIFY_EMAIL_ROUTE =
  '/verify-email';

/* ============================================================
   TYPES
   ============================================================ */

type PlanKey =
  | 'free'
  | 'standard'
  | 'custom';

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

type PlanDefinition = {
  key: PlanKey;

  name: string;

  price: string;

  billingLabel: string;

  description: string;

  aiAllowance: string;

  appAccess: string;

  icon: LucideIcon;

  accent: string;

  iconClass: string;

  selectedClass: string;

  highlighted?: boolean;
};

type RegisterResponse = {
  success?: boolean;

  code?: string;

  message?: string;

  error?: string;

  email?: string;

  requiresPayment?: boolean;

  verificationRequired?: boolean;

  next?: string;

  pesapalOrder?: {
    redirectUrl?: string;
    orderTrackingId?: string;
  } | null;
};

/* ============================================================
   PLANS

   IMPORTANT:
   Pricing and AI allowances are PER USER.
   ============================================================ */

const PLANS: PlanDefinition[] = [
  {
    key: 'free',

    name: 'Free',

    price: 'KES 0',

    billingLabel:
      'per user / month',

    description:
      'A simple way to start using SaMi.',

    aiAllowance:
      '100 AI queries / user / month',

    appAccess:
      '1 business app',

    icon: Sparkles,

    accent:
      'from-slate-500 to-slate-700',

    iconClass:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',

    selectedClass:
      'border-slate-700 ring-slate-500/15 dark:border-slate-300',
  },

  {
    key: 'standard',

    name: 'Standard',

    price: 'KES 2,000',

    billingLabel:
      'per user / month',

    description:
      'The complete workspace for growing businesses.',

    aiAllowance:
      '1,000 AI queries / user / month',

    appAccess:
      'All selected business apps',

    icon: Crown,

    accent:
      'from-blue-600 to-indigo-600',

    iconClass:
      'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',

    selectedClass:
      'border-blue-500 ring-blue-500/15 dark:border-blue-500',

    highlighted: true,
  },

  {
    key: 'custom',

    name: 'Custom',

    price: 'KES 3,340',

    billingLabel:
      'per user / month',

    description:
      'Advanced capabilities for demanding teams.',

    aiAllowance:
      'Advanced AI allowance / user',

    appAccess:
      'All business apps',

    icon: Zap,

    accent:
      'from-violet-600 to-purple-700',

    iconClass:
      'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300',

    selectedClass:
      'border-violet-500 ring-violet-500/15 dark:border-violet-500',
  },
];

/* ============================================================
   HELPERS
   ============================================================ */

function isPlanKey(
  value: unknown
): value is PlanKey {
  return (
    value === 'free' ||
    value === 'standard' ||
    value === 'custom'
  );
}

function readSelectedApps(): string[] {
  if (
    typeof window === 'undefined'
  ) {
    return [];
  }

  try {
    const raw =
      sessionStorage.getItem(
        APPS_STORAGE_KEY
      );

    if (!raw) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const validKeys =
      new Set(
        SAMI_APPS.map(
          (app) => app.key
        )
      );

    return [
      ...new Set(
        parsed.filter(
          (
            item
          ): item is string =>
            typeof item ===
              'string' &&
            validKeys.has(item)
        )
      ),
    ];
  } catch {
    return [];
  }
}

function readAccountForm():
  | Record<string, unknown>
  | null {
  if (
    typeof window === 'undefined'
  ) {
    return null;
  }

  try {
    const raw =
      sessionStorage.getItem(
        ACCOUNT_STORAGE_KEY
      );

    if (!raw) {
      return null;
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !==
        'object' ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    return parsed as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function readSavedPlan():
  | PlanKey
  | null {
  if (
    typeof window === 'undefined'
  ) {
    return null;
  }

  try {
    const value =
      sessionStorage.getItem(
        PLAN_STORAGE_KEY
      );

    return isPlanKey(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

function savePlan(
  value: PlanKey
) {
  try {
    sessionStorage.setItem(
      PLAN_STORAGE_KEY,
      value
    );
  } catch {
    // The server remains authoritative.
  }
}

function getSelectedAppNames(
  keys: string[]
) {
  const selected =
    new Set(keys);

  return SAMI_APPS.filter(
    (app) =>
      selected.has(app.key)
  ).map(
    (app) => ({
      key: app.key,
      name: app.name,
    })
  );
}

function safeNextPath(
  value?: string
) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/dashboard';
  }

  return value;
}

/* ============================================================
   PAGE
   ============================================================ */

export default function SelectPlanPage() {
  const router = useRouter();

  const [
    darkMode,
    setDarkMode,
  ] = useState(false);

  const [
    selectedPlan,
    setSelectedPlan,
  ] = useState<PlanKey>(
    'free'
  );

  const [
    selectedApps,
    setSelectedApps,
  ] = useState<string[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    overlay,
    setOverlay,
  ] = useState<OverlayState | null>(
    null
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

      setDarkMode(useDark);

      document.documentElement.classList.toggle(
        'dark',
        useDark
      );
    } catch {
      // Theme still works without persistence.
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
            // Ignore storage errors.
          }

          return next;
        }
      );
    }, []);

  /* ==========================================================
     RESTORE ONBOARDING
     ========================================================== */

  useEffect(() => {
    const apps =
      readSelectedApps();

    const savedPlan =
      readSavedPlan();

    setSelectedApps(apps);

    /*
     * Free supports one business app.
     * Multiple apps therefore default
     * to Standard.
     */
    if (apps.length > 1) {
      if (
        savedPlan === 'custom'
      ) {
        setSelectedPlan(
          'custom'
        );

        return;
      }

      setSelectedPlan(
        'standard'
      );

      savePlan(
        'standard'
      );

      return;
    }

    if (savedPlan) {
      setSelectedPlan(
        savedPlan
      );
    }
  }, []);

  /* ==========================================================
     DERIVED
     ========================================================== */

  const selectedAppCount =
    selectedApps.length;

  const multipleApps =
    selectedAppCount > 1;

  const effectivePlan: PlanKey =
    multipleApps &&
    selectedPlan === 'free'
      ? 'standard'
      : selectedPlan;

  const currentPlan =
    useMemo(
      () =>
        PLANS.find(
          (plan) =>
            plan.key ===
            effectivePlan
        ) ?? PLANS[0],
      [effectivePlan]
    );

  const selectedAppDetails =
    useMemo(
      () =>
        getSelectedAppNames(
          selectedApps
        ),
      [selectedApps]
    );

  /* ==========================================================
     PLAN SELECTION
     ========================================================== */

  const selectPlan =
    useCallback(
      (plan: PlanKey) => {
        if (loading) {
          return;
        }

        if (
          plan === 'free' &&
          multipleApps
        ) {
          setOverlay({
            type: 'info',

            title:
              'Free supports one app',

            message:
              `You selected ${selectedAppCount} apps. Keep one app to use Free, or continue with Standard or Custom.`,

            primaryAction: {
              label:
                'Change apps',

              onClick: () => {
                setOverlay(null);

                router.push(
                  '/select-apps'
                );
              },
            },

            secondaryAction: {
              label:
                'Use Standard',

              onClick: () => {
                setOverlay(null);

                setSelectedPlan(
                  'standard'
                );

                savePlan(
                  'standard'
                );
              },
            },
          });

          return;
        }

        setSelectedPlan(plan);

        savePlan(plan);
      },
      [
        loading,
        multipleApps,
        selectedAppCount,
        router,
      ]
    );

  /* ==========================================================
     BACK
     ========================================================== */

  function handleBack() {
    if (loading) {
      return;
    }

    savePlan(
      effectivePlan
    );

    router.push(
      '/select-apps'
    );
  }

  /* ==========================================================
     REGISTER
     ========================================================== */

  const handleCreateAccount =
    useCallback(async () => {
      if (loading) {
        return;
      }

      setOverlay(null);

      const account =
        readAccountForm();

      const apps =
        readSelectedApps();

      /* ------------------------------------------------------
         Missing account
         ------------------------------------------------------ */

      if (!account) {
        setOverlay({
          type: 'error',

          title:
            'Registration information missing',

          message:
            'Your account information is no longer available. Return to registration and continue again.',

          primaryAction: {
            label:
              'Return to registration',

            href: '/register',
          },
        });

        return;
      }

      /* ------------------------------------------------------
         Normalize registration fields
         ------------------------------------------------------ */

      const firstName =
        typeof account.firstName ===
          'string'
          ? account.firstName.trim()
          : '';

      const lastName =
        typeof account.lastName ===
          'string'
          ? account.lastName.trim()
          : '';

      const email =
        typeof account.email ===
          'string'
          ? account.email
              .trim()
              .toLowerCase()
          : '';

      const businessName =
        typeof account.businessName ===
          'string'
          ? account.businessName.trim()
          : '';

      if (
        !firstName ||
        !lastName ||
        !email ||
        !businessName
      ) {
        setOverlay({
          type: 'error',

          title:
            'Account details incomplete',

          message:
            'Some required account information is missing. Return to Step 1 and review your details.',

          primaryAction: {
            label:
              'Review account',

            href: '/register',
          },
        });

        return;
      }

      /* ------------------------------------------------------
         Apps
         ------------------------------------------------------ */

      if (apps.length === 0) {
        setOverlay({
          type: 'warning',

          title:
            'No apps selected',

          message:
            'Choose at least one business app before creating your SaMi workspace.',

          primaryAction: {
            label:
              'Choose apps',

            href: '/select-apps',
          },
        });

        return;
      }

      /* ------------------------------------------------------
         Plan
         ------------------------------------------------------ */

      let finalPlan =
        effectivePlan;

      if (
        apps.length > 1 &&
        finalPlan === 'free'
      ) {
        finalPlan =
          'standard';
      }

      savePlan(
        finalPlan
      );

      setLoading(true);

      try {
        /*
         * IMPORTANT:
         *
         * Do NOT trust prices, user counts,
         * seat counts or AI quotas from
         * the browser.
         *
         * Client sends the selected plan.
         *
         * Backend determines:
         * - price per user
         * - billable users
         * - subscription total
         * - AI allowance per user
         * - entitlements
         * - payment required
         */
        const payload = {
          ...account,

          firstName,

          lastName,

          email,

          businessName,

          plan:
            finalPlan,

          selectedApps:
            apps,
        };

        const response =
          await fetch(
            REGISTER_ENDPOINT,
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
                JSON.stringify(
                  payload
                ),
            }
          );

        let data:
          | RegisterResponse
          | null = null;

        try {
          data =
            (await response.json()) as RegisterResponse;
        } catch {
          data = null;
        }

        /* ----------------------------------------------------
           Registration error
           ---------------------------------------------------- */

        if (!response.ok) {
          const code =
            data?.code;

          if (
            code ===
              'EMAIL_ALREADY_EXISTS' ||
            code ===
              'ACCOUNT_EXISTS'
          ) {
            setOverlay({
              type: 'warning',

              title:
                'Account already exists',

              message:
                data?.message ||
                data?.error ||
                'A SaMi account already exists for this email.',

              primaryAction: {
                label:
                  'Sign in',

                href:
                  `/login?email=${encodeURIComponent(
                    email
                  )}`,
              },

              secondaryAction: {
                label:
                  'Change email',

                href: '/register',
              },
            });

            return;
          }

          if (
            code ===
            'INVALID_PLAN'
          ) {
            setOverlay({
              type: 'error',

              title:
                'Plan unavailable',

              message:
                data?.message ||
                data?.error ||
                'This SaMi plan is not currently available.',
            });

            return;
          }

          if (
            code ===
              'RATE_LIMITED' ||
            code ===
              'REGISTRATION_RATE_LIMITED'
          ) {
            setOverlay({
              type: 'warning',

              title:
                'Too many attempts',

              message:
                data?.message ||
                data?.error ||
                'Please wait before trying to create the account again.',
            });

            return;
          }

          setOverlay({
            type: 'error',

            title:
              'Workspace could not be created',

            message:
              data?.error ||
              data?.message ||
              'SaMi could not create your workspace. Please try again.',
          });

          return;
        }

        /* ----------------------------------------------------
           PAYMENT
           ---------------------------------------------------- */

        if (
          data?.requiresPayment
        ) {
          const redirectUrl =
            data.pesapalOrder
              ?.redirectUrl;

          if (!redirectUrl) {
            setOverlay({
              type: 'error',

              title:
                'Payment could not start',

              message:
                'SaMi reached the payment step but did not receive a secure PesaPal payment link.',
            });

            return;
          }

          try {
            sessionStorage.setItem(
              VERIFICATION_EMAIL_STORAGE_KEY,
              email
            );
          } catch {
            // Server state remains authoritative.
          }

          setOverlay({
            type: 'info',

            title:
              'Continue to payment',

            message:
              data.message ||
              `Your ${currentPlan.name} subscription is billed per user. Continue to PesaPal to complete setup.`,

            primaryAction: {
              label:
                'Continue to PesaPal',

              onClick: () => {
                window.location.assign(
                  redirectUrl
                );
              },
            },

            secondaryAction: {
              label:
                'Not now',

              onClick: () =>
                setOverlay(null),
            },
          });

          return;
        }

        /* ----------------------------------------------------
           SUCCESS
           ---------------------------------------------------- */

        if (data?.success) {
          try {
            sessionStorage.setItem(
              VERIFICATION_EMAIL_STORAGE_KEY,
              data.email ||
                email
            );

            sessionStorage.removeItem(
              ACCOUNT_STORAGE_KEY
            );

            sessionStorage.removeItem(
              APPS_STORAGE_KEY
            );

            sessionStorage.removeItem(
              PLAN_STORAGE_KEY
            );
          } catch {
            // Verification can still continue.
          }

          if (
            data.verificationRequired !==
            false
          ) {
            setOverlay({
              type: 'success',

              title:
                'Workspace created',

              message:
                data.message ||
                `Your SaMi workspace has been created. Check ${email} to verify your email address.`,

              primaryAction: {
                label:
                  'Verify email',

                onClick: () => {
                  router.replace(
                    VERIFY_EMAIL_ROUTE
                  );
                },
              },
            });

            return;
          }

          const destination =
            safeNextPath(
              data.next
            );

          setOverlay({
            type: 'success',

            title:
              'Workspace ready',

            message:
              data.message ||
              'Your SaMi workspace is ready.',

            primaryAction: {
              label:
                'Open workspace',

              onClick: () => {
                router.replace(
                  destination
                );

                router.refresh();
              },
            },
          });

          return;
        }

        setOverlay({
          type: 'error',

          title:
            'Registration incomplete',

          message:
            data?.message ||
            'SaMi received an incomplete registration response. Please try again.',
        });
      } catch {
        setOverlay({
          type: 'error',

          title:
            'Could not reach SaMi',

          message:
            'Check your internet connection and try again.',
        });
      } finally {
        setLoading(false);
      }
    }, [
      loading,
      effectivePlan,
      currentPlan.name,
      router,
    ]);

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      {overlay && (
        <SaMiOverlay
          open
          type={overlay.type}
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

      <main className="min-h-screen bg-[#f6f8fb] text-slate-950 transition-colors dark:bg-[#070a10] dark:text-white lg:h-screen lg:overflow-hidden">

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
          className="fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400 dark:hover:text-white"
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

        <div className="mx-auto flex min-h-screen w-full max-w-[1450px] flex-col px-4 pb-24 pt-4 sm:px-6 lg:h-screen lg:min-h-0 lg:px-8 lg:pb-4">

          {/* ==================================================
              TOP
             ================================================== */}

          <div className="flex shrink-0 items-center justify-between pr-12">
            <Link
              href="/"
              aria-label="SaMi home"
              className="inline-block"
            >
              {/* FULL APPROVED LOGO */}
              <SaMiLogo
                size="md"
                className="max-w-full"
              />
            </Link>

            <div className="hidden items-center gap-2 text-[11px] font-bold text-slate-400 sm:flex">
              <ShieldCheck className="h-4 w-4" />

              Secure workspace setup
            </div>
          </div>

          {/* ==================================================
              PROGRESS
             ================================================== */}

          <div className="mt-3 flex shrink-0 items-center gap-3">
            <OnboardingStep
              number="1"
              label="Account"
              completed
            />

            <div className="h-px flex-1 bg-emerald-300 dark:bg-emerald-900" />

            <OnboardingStep
              number="2"
              label="Apps"
              completed
            />

            <div className="h-px flex-1 bg-blue-300 dark:bg-blue-900" />

            <OnboardingStep
              number="3"
              label="Plan"
              active
            />
          </div>

          {/* ==================================================
              MAIN
             ================================================== */}

          <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">

            {/* =================================================
                LEFT
               ================================================= */}

            <section className="flex min-h-0 flex-col">

              {/* Heading */}

              <div className="shrink-0">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                      Step 3 of 3
                    </p>

                    <h1 className="mt-1 text-[27px] font-black tracking-[-0.035em] sm:text-[32px]">
                      Choose your plan
                    </h1>

                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Pricing and SaMi AI
                      allowances are calculated
                      per workspace user.
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                    <Users className="h-3.5 w-3.5" />

                    Per-user billing
                  </div>
                </div>
              </div>

              {/* ===============================================
                  PLAN CARDS
                 =============================================== */}

              <div className="mt-4 grid gap-3 md:grid-cols-3 lg:min-h-0 lg:flex-1">

                {PLANS.map(
                  (plan) => {
                    const Icon =
                      plan.icon;

                    const disabled =
                      plan.key ===
                        'free' &&
                      multipleApps;

                    const selected =
                      effectivePlan ===
                      plan.key;

                    return (
                      <button
                        key={
                          plan.key
                        }
                        type="button"
                        onClick={() =>
                          selectPlan(
                            plan.key
                          )
                        }
                        disabled={
                          loading
                        }
                        aria-pressed={
                          selected
                        }
                        aria-disabled={
                          disabled
                        }
                        className={`
                          group relative
                          flex min-h-[250px]
                          flex-col
                          overflow-hidden
                          rounded-[22px]
                          border
                          bg-white
                          p-5
                          text-left
                          shadow-sm
                          transition
                          duration-200
                          hover:-translate-y-0.5
                          focus:outline-none
                          focus:ring-4
                          focus:ring-blue-500/10
                          disabled:cursor-wait
                          dark:bg-slate-900
                          ${
                            selected
                              ? `${plan.selectedClass} ring-2 shadow-[0_12px_32px_rgba(15,23,42,0.08)]`
                              : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                          }
                          ${
                            disabled
                              ? 'opacity-65'
                              : ''
                          }
                        `}
                      >
                        {/* Accent */}

                        <div
                          className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${plan.accent}`}
                        />

                        {/* Recommended */}

                        {plan.highlighted && (
                          <span className="absolute right-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-white">
                            Recommended
                          </span>
                        )}

                        {/* Icon */}

                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl ${plan.iconClass}`}
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </div>

                        {/* Plan */}

                        <div className="mt-4 flex items-center gap-2">
                          <h2 className="text-base font-black">
                            {
                              plan.name
                            }
                          </h2>

                          {selected && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          )}
                        </div>

                        <p className="mt-1 line-clamp-2 min-h-[32px] text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                          {
                            plan.description
                          }
                        </p>

                        {/* Price */}

                        <div className="mt-4">
                          <div className="text-[23px] font-black tracking-[-0.035em]">
                            {
                              plan.price
                            }
                          </div>

                          <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
                            {
                              plan.billingLabel
                            }
                          </div>
                        </div>

                        {/* Compact features */}

                        <div className="mt-4 space-y-2">
                          <PlanFeature
                            text={
                              plan.appAccess
                            }
                          />

                          <PlanFeature
                            text={
                              plan.aiAllowance
                            }
                            ai
                          />
                        </div>

                        <div className="mt-auto pt-4">
                          {disabled ? (
                            <div className="rounded-lg bg-amber-50 px-3 py-2 text-center text-[9px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                              Free supports one
                              app
                            </div>
                          ) : selected ? (
                            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-[9px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              Selected
                            </div>
                          ) : (
                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-center text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              Select{' '}
                              {plan.name}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </section>

            {/* =================================================
                RIGHT SUMMARY
               ================================================= */}

            <aside className="flex min-h-0 flex-col gap-3">

              {/* Workspace */}

              <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />

                    <h2 className="text-xs font-black">
                      Workspace
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={
                      handleBack
                    }
                    disabled={
                      loading
                    }
                    className="text-[10px] font-bold text-blue-600 dark:text-blue-400"
                  >
                    Change
                  </button>
                </div>

                <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                  <strong className="text-slate-950 dark:text-white">
                    {
                      selectedAppCount
                    }
                  </strong>{' '}
                  {selectedAppCount ===
                  1
                    ? 'app'
                    : 'apps'}{' '}
                  selected
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedAppDetails
                    .slice(0, 6)
                    .map(
                      (app) => (
                        <span
                          key={
                            app.key
                          }
                          className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {
                            app.name
                          }
                        </span>
                      )
                    )}

                  {selectedAppDetails.length >
                    6 && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      +
                      {selectedAppDetails.length -
                        6}
                    </span>
                  )}
                </div>
              </section>

              {/* Per user billing */}

              <section className="rounded-[22px] border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/25">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <Users className="h-4 w-4" />
                  </div>

                  <div>
                    <h2 className="text-xs font-black text-blue-900 dark:text-blue-200">
                      Billing per user
                    </h2>

                    <p className="mt-1 text-[10px] leading-4 text-blue-700 dark:text-blue-300">
                      The subscription is
                      calculated from the
                      number of billable users
                      in the workspace.
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl bg-white/70 px-3 py-2.5 dark:bg-white/[0.05]">
                  <p className="text-[10px] text-blue-700 dark:text-blue-300">
                    <strong>
                      {
                        currentPlan.price
                      }
                    </strong>{' '}
                    per user / month
                  </p>
                </div>
              </section>

              {/* AI */}

              <section className="rounded-[22px] border border-violet-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 dark:border-violet-900/60 dark:from-indigo-950/25 dark:to-violet-950/25">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white">
                    <Bot className="h-4 w-4" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs font-black">
                        SaMi AI
                      </h2>

                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[8px] font-black uppercase text-violet-700 dark:bg-white/10 dark:text-violet-300">
                        Per user
                      </span>
                    </div>

                    <p className="mt-1 text-[10px] leading-4 text-slate-600 dark:text-slate-300">
                      {
                        currentPlan.aiAllowance
                      }
                    </p>
                  </div>
                </div>
              </section>

              {/* Security */}

              <div className="mt-auto hidden items-center gap-2 rounded-xl px-2 py-1 text-[9px] text-slate-400 lg:flex">
                <LockKeyhole className="h-3.5 w-3.5" />

                Billing totals and AI limits
                are enforced by SaMi on the
                server.
              </div>
            </aside>
          </div>

          {/* ==================================================
              DESKTOP ACTION BAR
             ================================================== */}

          <div className="mt-4 hidden shrink-0 items-center gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex">

            <button
              type="button"
              onClick={
                handleBack
              }
              disabled={
                loading
              }
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />

              Back
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black">
                {
                  currentPlan.name
                }{' '}
                ·{' '}
                {
                  currentPlan.price
                }{' '}
                per user / month
              </p>

              <p className="mt-0.5 truncate text-[9px] text-slate-400">
                Subscription and AI usage
                scale with workspace users.
              </p>
            </div>

            <button
              type="button"
              onClick={
                handleCreateAccount
              }
              disabled={
                loading ||
                selectedAppCount ===
                  0
              }
              className="flex h-10 min-w-[190px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-black text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />

                  Creating...
                </>
              ) : (
                <>
                  {effectivePlan ===
                  'free'
                    ? 'Create Workspace'
                    : 'Create & Continue'}

                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {/* Small footer */}

          <div className="mt-2 hidden shrink-0 justify-end gap-4 text-[9px] text-slate-400 lg:flex">
            <Link
              href="/help"
              className="hover:text-slate-700 dark:hover:text-white"
            >
              Help
            </Link>

            <Link
              href="/terms"
              className="hover:text-slate-700 dark:hover:text-white"
            >
              Terms
            </Link>

            <Link
              href="/privacy"
              className="hover:text-slate-700 dark:hover:text-white"
            >
              Privacy
            </Link>
          </div>
        </div>

        {/* ====================================================
            MOBILE / TABLET FIXED ACTION BAR
           ==================================================== */}

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_35px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-[#0b0f18]/95 lg:hidden">
          <div className="mx-auto flex max-w-[1450px] items-center gap-3">

            <button
              type="button"
              onClick={
                handleBack
              }
              disabled={
                loading
              }
              aria-label="Back to app selection"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-black">
                {
                  currentPlan.name
                }{' '}
                ·{' '}
                {
                  currentPlan.price
                }
              </p>

              <p className="truncate text-[9px] text-slate-400">
                per user / month
              </p>
            </div>

            <button
              type="button"
              onClick={
                handleCreateAccount
              }
              disabled={
                loading ||
                selectedAppCount ===
                  0
              }
              className="flex h-11 min-w-[135px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white shadow-lg shadow-blue-500/20 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />

                  Creating
                </>
              ) : (
                <>
                  Continue

                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

/* ============================================================
   PLAN FEATURE
   ============================================================ */

function PlanFeature({
  text,
  ai = false,
}: {
  text: string;
  ai?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-[10px] leading-4 text-slate-600 dark:text-slate-300">
      <span
        className={`mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
          ai
            ? 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300'
            : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300'
        }`}
      >
        {ai ? (
          <Bot className="h-2.5 w-2.5" />
        ) : (
          <Check className="h-2.5 w-2.5" />
        )}
      </span>

      {text}
    </div>
  );
}

/* ============================================================
   ONBOARDING STEP
   ============================================================ */

function OnboardingStep({
  number,
  label,
  active = false,
  completed = false,
}: {
  number: string;
  label: string;
  active?: boolean;
  completed?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black ${
          completed
            ? 'bg-emerald-500 text-white'
            : active
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
              : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}
      >
        {completed ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          number
        )}
      </span>

      <span
        className={`hidden text-[10px] font-bold sm:block ${
          active
            ? 'text-slate-950 dark:text-white'
            : completed
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
}